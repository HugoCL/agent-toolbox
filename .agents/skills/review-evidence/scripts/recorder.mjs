import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { appUrl, hostPort, withBrowser } from "./browser.mjs";
import { dimensions, FPS, mp4Options, requireBinary, run, writeMedia } from "./media.mjs";

const SCALE = 2;
const STRIP = 64;
// A full-resolution grab took about 75 ms. Stretch the take and its animations,
// then compress the timestamps so the result plays at the intended pace.
const SLOWDOWN = 2.5;
const FULL_VIEW = { x: 0, y: 0, zoom: 1 };
const ease = t => t * t * (3 - 2 * t);

function installPointer() {
  if (window !== window.top) return;
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const shadow = root.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    svg, i { position:absolute; left:0; top:0; visibility:hidden }
    i { width:34px; height:34px; margin:-17px; border-radius:50%; background:#2563eb70; opacity:0 }
  </style><i></i><svg width="22" height="22" viewBox="0 0 22 22">
    <path d="M1 1v16l4-4 3 7 3-1-3-7h6Z" fill="#111827" stroke="white" stroke-width="1.4"/>
  </svg>`;
  document.addEventListener("DOMContentLoaded", () => document.documentElement.append(root), { once: true });
  const cursor = shadow.querySelector("svg");
  const ripple = shadow.querySelector("i");
  let animation;
  const move = event => {
    cursor.style.visibility = "visible";
    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  };
  // Native HTML drags stop dispatching mousemove.
  window.addEventListener("mousemove", move, true);
  window.addEventListener("dragover", move, true);
  window.addEventListener("mousedown", event => {
    move(event);
    ripple.style.visibility = "visible";
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    animation?.cancel();
    animation = ripple.animate([
      { opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.3)" },
    ], { duration: 450, easing: "ease-out" });
  }, true);
}

async function captionImages(newContext, viewport, captions, directory) {
  if (!captions.length) return;
  const context = await newContext({ viewport: { width: viewport.width, height: STRIP }, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  try {
    await page.setContent(`<style>body{margin:0}div{box-sizing:border-box;width:100vw;height:100vh;
      display:grid;place-content:center;padding:0 16px;text-align:center;background:#151823;color:#fff;
      font:600 20px/1.2 system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}</style><div></div>`);
    for (const [index, item] of captions.entries()) {
      const fits = await page.locator("div").evaluate((element, text) => {
        element.textContent = text;
        return element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth;
      }, item.text);
      if (!fits) throw new Error(`Caption ${index + 1} does not fit. Shorten it.`);
      await page.screenshot({ path: join(directory, `caption-${index}.png`) });
    }
  } finally {
    await context.close();
  }
}

async function capture(newContext, { baseUrl, viewport, auth, prepare, scenario }, directory) {
  const context = await newContext({ viewport, deviceScaleFactor: SCALE });
  await context.addInitScript(installPointer);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const now = () => performance.now() / 1000 / SLOWDOWN;
  const wait = ms => sleep(ms * SLOWDOWN);
  const frames = [];
  const captions = [];
  let loop;
  let captureError;
  let recording = false;
  let endedAt;
  let pointer = { x: viewport.width / 2, y: viewport.height / 2 };
  let camera = { from: FULL_VIEW, to: FULL_VIEW, at: 0, duration: 1 };

  const center = async locator => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("The target is not visible.");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  async function glide(target, ms) {
    const start = performance.now();
    let progress = 0;
    while (progress < 1) {
      progress = ms === 0 ? 1 : Math.min((performance.now() - start) / (ms * SLOWDOWN), 1);
      const fraction = ease(progress);
      await page.mouse.move(pointer.x + (target.x - pointer.x) * fraction, pointer.y + (target.y - pointer.y) * fraction);
      if (progress < 1) await sleep(16);
    }
    pointer = target;
  }

  async function clickOn(locator, travelMs = 650) {
    await locator.scrollIntoViewIfNeeded();
    await glide(await center(locator), travelMs);
    await wait(150);
    await page.mouse.down();
    await wait(80);
    await page.mouse.up();
  }

  async function dragTo(source, target, travelMs = 1100) {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const from = await center(source);
    const to = await center(target);
    if ([from, to].some(point => point.x < 0 || point.x >= viewport.width || point.y < 0 || point.y >= viewport.height)) {
      throw new Error("dragTo needs the source and target centers visible in the same viewport.");
    }
    await glide(from, 650);
    await wait(150);
    await page.mouse.down();
    try {
      await glide({ x: from.x + 12, y: from.y + 8 }, 120);
      await glide(to, travelMs);
      await wait(350);
    } finally {
      await page.mouse.up();
    }
  }

  function cameraAt(at) {
    const fraction = ease(Math.min(Math.max((at - camera.at) / camera.duration, 0), 1));
    const mix = key => camera.from[key] + (camera.to[key] - camera.from[key]) * fraction;
    return { x: mix("x"), y: mix("y"), zoom: mix("zoom") };
  }

  async function zoomOn(locator, zoom = 1.35, travelMs = 900) {
    if (!Number.isFinite(zoom) || zoom < 1 || !Number.isFinite(travelMs) || travelMs <= 0) {
      throw new Error("zoomOn expects a zoom factor of at least 1 and a positive travel time.");
    }
    let to = FULL_VIEW;
    if (locator) {
      await locator.scrollIntoViewIfNeeded();
      const target = await center(locator);
      const corner = (point, size) => Math.max(0, Math.min(point - size / zoom / 2, size - size / zoom));
      to = { x: corner(target.x, viewport.width), y: corner(target.y, viewport.height), zoom };
    }
    const at = now();
    camera = { from: cameraAt(at), to, at, duration: travelMs / 1000 };
  }

  function caption(text) {
    const at = now();
    const previous = captions.at(-1);
    if (previous && previous.end === undefined) previous.end = at;
    if (text) captions.push({ text, start: at });
  }

  async function grab(at) {
    const view = cameraAt(at);
    const { cssVisualViewport } = await cdp.send("Page.getLayoutMetrics");
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "jpeg", quality: 93, optimizeForSpeed: true, captureBeyondViewport: true,
      clip: { x: cssVisualViewport.pageX + view.x, y: cssVisualViewport.pageY + view.y,
        width: viewport.width / view.zoom, height: viewport.height / view.zoom, scale: view.zoom },
    });
    return Buffer.from(data, "base64");
  }

  async function startCapture() {
    if (loop) throw new Error("startCapture can be called once per take.");
    await page.mouse.move(pointer.x, pointer.y);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / SLOWDOWN });
    await grab(now());
    recording = true;
    loop = (async () => {
      while (recording) {
        const at = now();
        const file = `frame-${frames.length}.jpg`;
        await writeFile(join(directory, file), await grab(at));
        frames.push({ at, file });
      }
    })().catch(error => { captureError = error; });
  }

  try {
    await page.goto(baseUrl);
    const setup = { page, baseUrl };
    await auth?.(setup);
    await prepare?.(setup);
    await scenario({ ...setup, clickOn, dragTo, zoomOn, caption, wait, startCapture });
  } finally {
    recording = false;
    endedAt = now();
    caption("");
    await loop;
    await context.close();
  }
  if (captureError) throw captureError;
  if (!frames.length) throw new Error("No frames captured. Call and await startCapture(), then hold the result with wait().");
  const startedAt = frames[0].at;
  if (endedAt - startedAt < 1 / FPS) throw new Error("The take is too short to encode.");
  const visible = captions.filter(item => item.end > startedAt);
  await captionImages(newContext, viewport, visible, directory);
  return { frames, captions: visible, startedAt, endedAt };
}

async function encode({ frames, captions, startedAt, endedAt }, viewport, output, directory) {
  const width = viewport.width * SCALE;
  const height = viewport.height * SCALE;
  const total = endedAt - startedAt;
  const count = Math.max(1, Math.round(total * FPS));
  const gaps = frames.map((frame, index) => (frames[index + 1]?.at ?? endedAt) - frame.at);
  const concat = ["ffconcat version 1.0"];
  frames.forEach(({ file }, index) => {
    concat.push(`file ${file}`, "option framerate 1000", `duration ${gaps[index].toFixed(6)}`);
  });
  concat.push(`file ${frames.at(-1).file}`, "option framerate 1000");
  // CDP clips can round differently during zoom. Normalize size without
  // reinitializing the graph and losing the frames of the camera move.
  const args = ["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", "frames.ffconcat"];
  const filters = [`[0:v]scale=${width}:${height}:in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=0.1,pad=${width}:${height + STRIP * SCALE}:0:0:color=0x151823[v0]`];
  captions.forEach(({ start, end }, index) => {
    args.push("-i", `caption-${index}.png`);
    const from = Math.max(start - startedAt, 0).toFixed(4);
    const to = (end - startedAt).toFixed(4);
    filters.push(`[v${index}][${index + 1}:v]overlay=0:${height}:enable='gte(t,${from})*lt(t,${to})'[v${index + 1}]`);
  });
  await writeFile(join(directory, "frames.ffconcat"), concat.join("\n") + "\n");
  await writeMedia(output, file => {
    run("ffmpeg", ["-y", "-v", "error", ...args, "-filter_complex", filters.join(";"), "-map",
      `[v${captions.length}]`, "-frames:v", String(count), ...mp4Options(26), file],
      { cwd: directory, stdio: "inherit" });
  });
  console.log(`${output} · ${(count / FPS).toFixed(2)} s · ${frames.length} captured / ${count} encoded frames · max capture gap ${(1000 * Math.max(...gaps)).toFixed(1)} ms`);
}

export async function record({
  baseUrl, output, viewport = { width: 864, height: 540 },
  allowedHosts, auth, prepare, scenario,
}) {
  const app = appUrl(baseUrl);
  baseUrl = app.href;
  if (typeof output !== "string" || !output.toLowerCase().endsWith(".mp4")) throw new Error("Set output to an .mp4 path.");
  if (typeof scenario !== "function") throw new Error("Provide a scenario callback.");
  dimensions(viewport.width, viewport.height, { even: false });
  requireBinary("ffmpeg");
  output = resolve(output);
  const directory = await mkdtemp(join(tmpdir(), "review-evidence-"));
  try {
    const take = await withBrowser(newContext => capture(newContext, { baseUrl, viewport, auth, prepare, scenario }, directory), allowedHosts ?? [hostPort(app)]);
    await encode(take, viewport, output, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
