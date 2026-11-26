import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const FPS = 30;

export function requireBinary(name) {
  const result = spawnSync(name, ["-version"], { stdio: "ignore" });
  if (result.error?.code === "ENOENT") throw new Error(`Install ${name === "magick" ? "ImageMagick (magick)" : name} and put it on PATH.`);
  if (result.error || result.status !== 0) throw new Error(`Could not run ${name} -version.`);
}

export function run(name, args, options = {}) {
  return execFileSync(name, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
}

export function mp4Options(crf) {
  return ["-an", "-c:v", "libx264", "-preset", "fast", "-crf", String(crf),
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
    "-color_trc", "bt709", "-movflags", "+faststart"];
}

export function dimensions(width, height, { even = true } = {}) {
  for (const value of [width, height]) {
    if (!Number.isSafeInteger(value) || value < 1 || (even && value % 2)) {
      throw new Error(`Width and height must be positive ${even ? "even " : ""}integers.`);
    }
  }
}

export async function writeMedia(output, generate) {
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), ".review-evidence-"));
  try {
    const file = join(staging, basename(output));
    const result = await generate(file);
    await rename(file, output);
    return result;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
