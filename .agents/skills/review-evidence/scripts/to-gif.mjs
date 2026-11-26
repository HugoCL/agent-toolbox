import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { requireBinary, run, writeMedia } from "./media.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "640" },
    fps: { type: "string", default: "12" },
    "max-mib": { type: "string", default: "5" },
  },
});
const [input, filename] = positionals;
if (!input || !filename || positionals.length !== 2 || !/\.gif$/i.test(filename)) {
  throw new Error("Usage: node to-gif.mjs INPUT.mp4 OUTPUT.gif [--width 640] [--fps 12] [--max-mib 5]");
}
const width = Number(values.width);
const fps = Number(values.fps);
const budget = Number(values["max-mib"]) * 1024 * 1024;
if (!Number.isSafeInteger(width) || width < 2 || !Number.isFinite(fps) || fps <= 0 ||
    !Number.isFinite(budget) || budget <= 0) throw new Error("Supply a positive width, fps, and size budget.");

requireBinary("ffmpeg");
const output = resolve(filename);
if (resolve(input) === output) throw new Error("Use distinct input and output files.");
const size = await writeMedia(output, async gif => {
  const filters = `fps=${fps},scale=w='min(iw,${width})':h=-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`;
  run("ffmpeg", ["-v", "error", "-i", resolve(input), "-filter_complex", filters, "-loop", "0", gif]);
  const { size } = await stat(gif);
  if (size > budget) {
    throw new Error(`GIF is ${(size / 1024 ** 2).toFixed(2)} MiB, above the ${values["max-mib"]} MiB budget. Trim the clip, lower --width or --fps, or share the MP4.`);
  }
  return size;
});
console.log(`${output} · ${size} bytes · ${fps} fps`);
