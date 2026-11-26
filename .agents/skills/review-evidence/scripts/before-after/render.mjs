import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { withBrowser } from "../browser.mjs";
import { FPS, mp4Options, requireBinary, writeMedia } from "../media.mjs";
import { readScenes } from "./scenes.mjs";

const [config, pairs, filename, time = "0"] = process.argv.slice(2);
if (!config || !pairs || !filename || !/\.(mp4|png)$/i.test(filename)) {
  throw new Error("Usage: node render.mjs scenes.json PAIR_DIR OUTPUT.mp4|OUTPUT.png [STILL_TIME_SECONDS]");
}
const plan = await readScenes(config);
const output = resolve(filename);
const still = /\.png$/i.test(output);
if (!still) requireBinary("ffmpeg");
const stillFrame = Math.floor(Number(time) * FPS);
const total = plan.scenes.reduce((sum, scene) => sum + Math.round(scene.seconds * FPS), 0);
if (still && (!Number.isFinite(stillFrame) || stillFrame < 0 || stillFrame >= total)) {
  throw new Error("Pick a still time within the comparison.");
}
const html = await readFile(new URL("./compose.html", import.meta.url), "utf8");
await writeMedia(output, file => withBrowser(async newContext => {
  const context = await newContext({ viewport: { width: plan.width, height: plan.height } });
  const page = await context.newPage();
  await page.setContent(html);
  const ffmpeg = still ? null : spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS),
    "-c:v", "png", "-i", "-", "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709", ...mp4Options(plan.crf ?? 15), file], { stdio: ["pipe", "inherit", "inherit"] });
  const encoded = ffmpeg && new Promise((done, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("close", code => code === 0 ? done() : reject(new Error(`ffmpeg exited with status ${code}`)));
  });
  encoded?.catch(() => {});
  const inputDone = ffmpeg && finished(ffmpeg.stdin);
  inputDone?.catch(() => {});
  try {
    let offset = 0;
    for (const scene of plan.scenes) {
      const count = Math.round(scene.seconds * FPS);
      const start = offset;
      offset += count;
      if (still && (stillFrame < start || stillFrame >= offset)) continue;
      const image = async side => `data:image/png;base64,${(await readFile(join(pairs, `${scene.id}-${side}.png`))).toString("base64")}`;
      await page.evaluate(scene => window.loadScene(scene), {
        ...scene, before: await image("before"), after: await image("after"),
        labels: { before: "Before", after: "After", ...plan.labels },
      });
      if (still) {
        await page.evaluate(progress => window.setTime(progress), (stillFrame - start) / (count - 1));
        await page.screenshot({ path: file });
        break;
      }
      for (let frame = 0; frame < count; frame++) {
        await page.evaluate(progress => window.setTime(progress), frame / (count - 1));
        const png = await page.screenshot({ type: "png" });
        await new Promise((done, reject) => ffmpeg.stdin.write(png, error => error ? reject(error) : done()));
      }
    }
    if (ffmpeg) {
      ffmpeg.stdin.end();
      await inputDone;
      await encoded;
    }
  } finally {
    if (ffmpeg && ffmpeg.exitCode === null) {
      ffmpeg.kill();
      await encoded.catch(() => {});
    }
  }
}, []));
console.log(still ? output : `${output} · ${(total / FPS).toFixed(2)} s · ${total} frames`);
