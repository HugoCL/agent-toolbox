import { readFile } from "node:fs/promises";
import { dimensions } from "../media.mjs";

export async function readScenes(file) {
  if (!file) throw new Error("Provide a JSON scene list.");
  const plan = JSON.parse(await readFile(file, "utf8"));
  dimensions(plan.width, plan.height);
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) throw new Error("Provide at least one scene.");
  const ids = new Set();
  for (const scene of plan.scenes) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(scene.id ?? "") || ids.has(scene.id)) {
      throw new Error("Each scene needs a unique lowercase ID with letters, digits, or hyphens.");
    }
    ids.add(scene.id);
    scene.viewport ??= plan.viewport;
    dimensions(scene.viewport?.width, scene.viewport?.height, { even: false });
    scene.mode ??= "wipe";
    if (!["wipe", "side-by-side"].includes(scene.mode)) throw new Error(`Unknown scene mode: ${scene.mode}`);
    scene.seconds ??= 4;
    if (!Number.isFinite(scene.seconds) || scene.seconds < 2) throw new Error(`Scene ${scene.id} needs at least 2 seconds.`);
    if (scene.path && (!scene.path.startsWith("/") || scene.path.startsWith("//"))) {
      throw new Error(`Scene ${scene.id} needs an absolute app path beginning with one '/' or no path.`);
    }
  }
  return plan;
}
