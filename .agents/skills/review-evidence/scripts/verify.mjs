import { mkdtemp, mkdir, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { dimensions, FPS, requireBinary, run } from "./media.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string" }, height: { type: "string" }, fps: { type: "string", default: String(FPS) },
    "strip-height": { type: "string", default: "0" }, sheet: { type: "string" },
  },
});
const [input] = positionals;
if (!input || positionals.length !== 1 || !values.width || !values.height) {
  throw new Error("Usage: node verify.mjs INPUT.mp4 --width WIDTH --height HEIGHT [--fps 30] [--strip-height 128] [--sheet PATH]");
}
const width = Number(values.width);
const height = Number(values.height);
const fps = Number(values.fps);
const strip = Number(values["strip-height"]);
dimensions(width, height);
if (!Number.isFinite(fps) || fps <= 0 || !Number.isSafeInteger(strip) || strip < 0 || strip >= height || strip % 2) {
  throw new Error("Set a positive FPS and an even strip height smaller than the video height.");
}

async function fastStart(file) {
  const handle = await open(file);
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(16);
    for (let offset = 0; offset + 8 <= size;) {
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      let length = header.readUInt32BE(0);
      const type = header.toString("ascii", 4, 8);
      let headerSize = 8;
      if (length === 1) {
        if (bytesRead < 16) return false;
        length = Number(header.readBigUInt64BE(8));
        headerSize = 16;
      }
      if (length === 0) length = size - offset;
      if (length < headerSize || offset + length > size) return false;
      if (type === "moov") return true;
      if (type === "mdat") return false;
      offset += length;
    }
    return false;
  } finally {
    await handle.close();
  }
}

for (const name of ["ffmpeg", "ffprobe", "magick"]) requireBinary(name);
const source = resolve(input);
const sheet = resolve(values.sheet ?? source.replace(/(?:\.mp4)?$/i, "-contact.png"));
if (source === sheet) throw new Error("Choose a contact-sheet path different from the input.");
const data = JSON.parse(run("ffprobe", [
  "-v", "error", "-select_streams", "v:0", "-show_format", "-show_streams", "-show_frames", "-show_entries",
  "stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration:frame=best_effort_timestamp_time",
  "-of", "json", source,
]));
const video = data.streams?.[0];
const times = (data.frames ?? []).map(frame => Number(frame.best_effort_timestamp_time));
if (!video || !times.length) throw new Error("ffprobe found no video frames.");
const fail = [];
const [numerator, denominator] = video.avg_frame_rate.split("/").map(Number);
const actualFps = numerator / denominator;
const duration = Number(data.format?.duration);
const size = (await stat(source)).size;
if (video.codec_name !== "h264" || video.pix_fmt !== "yuv420p") fail.push("Expected H.264 with yuv420p.");
if (video.width !== width || video.height !== height) fail.push(`Expected ${width}×${height}.`);
if (!(Math.abs(actualFps - fps) < .02)) fail.push(`Expected ${fps} fps.`);
if (!await fastStart(source)) fail.push("MP4 metadata must precede media data (+faststart).");
const deltas = times.slice(1).map((time, index) => time - times[index]);
const maxGap = Math.max(0, ...deltas);
const gapLimit = fps >= 25 ? .04 : 1.2 / fps;
if (!times.every(Number.isFinite) || deltas.some(gap => gap <= 0 || gap > gapLimit + .000001)) {
  fail.push(`Frame timestamps must increase with no gap above ${(gapLimit * 1000).toFixed(1)} ms.`);
}

const scratch = await mkdtemp(join(tmpdir(), "review-evidence-verify-"));
let emptyCount = 0;
try {
  const crop = strip > 0 ? `crop=iw:ih-${strip}:0:0,` : "";
  for (const [label, filter] of [["black", ""], ["white", "negate,"]]) {
    const stderr = await open(join(scratch, `${label}.log`), "w");
    try {
      run("ffmpeg", ["-hide_banner", "-nostats", "-v", "info", "-xerror", "-i", source, "-an", "-vf",
        `${crop}${filter}blackframe=amount=99:threshold=32`, "-f", "null", "-"],
        { stdio: ["ignore", "ignore", stderr.fd] });
    } finally {
      await stderr.close();
    }
    const log = await open(join(scratch, `${label}.log`));
    try {
      const frames = [...(await log.readFile("utf8")).matchAll(/frame:(\d+) pblack:/g)].map(match => match[1]);
      emptyCount += frames.length;
      if (frames.length) fail.push(`${frames.length} near-${label} frame(s), starting at frame ${frames[0]}. Inspect and re-record if unintended.`);
    } finally {
      await log.close();
    }
  }

  const samples = [...new Set(Array.from({ length: 8 }, (_, i) => Math.round(i * (times.length - 1) / 7)))];
  const expression = samples.map(index => `eq(n\\,${index})`).join("+");
  run("ffmpeg", ["-v", "error", "-xerror", "-i", source, "-vf", `select=${expression}`,
    "-fps_mode", "vfr", join(scratch, "sample-%02d.png")]);
  await mkdir(dirname(sheet), { recursive: true });
  run("magick", ["montage", ...samples.map((_, index) => join(scratch, `sample-${String(index + 1).padStart(2, "0")}.png`)),
    "-tile", "2x4", "-geometry", "960x540+4+4", "-background", "#151823", sheet]);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log(`${video.codec_name} / ${video.pix_fmt} · ${video.width}×${video.height} · ${actualFps} fps · ${duration.toFixed(2)} s · ${size} bytes`);
console.log(`${times.length} frames · max timestamp gap ${(maxGap * 1000).toFixed(2)} ms · ${emptyCount} near-black or near-white frames`);
console.log(`Contact sheet: ${sheet}`);
if (fail.length) {
  for (const message of fail) console.error(message);
  process.exitCode = 1;
} else {
  console.log("PASS: codec, size, fps, faststart, timestamps, and blank-frame scan. Open the sheet and inspect a 100% crop before sharing.");
}
