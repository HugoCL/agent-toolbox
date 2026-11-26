import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { appUrl, hostPort, withBrowser } from "../browser.mjs";
import { readScenes } from "./scenes.mjs";

const [config, before, after, output, prepareModule] = process.argv.slice(2);
if (!config || !before || !after || !output) {
  throw new Error("Usage: node capture.mjs scenes.json BEFORE_URL AFTER_URL PAIR_DIR [prepare.mjs]");
}
const plan = await readScenes(config);
const targets = { before: appUrl(before), after: appUrl(after) };
const prepare = prepareModule && (await import(pathToFileURL(resolve(prepareModule)))).default;
if (prepareModule && typeof prepare !== "function") throw new Error("The prepare module must default-export a function.");
await mkdir(dirname(resolve(output)), { recursive: true });
const staging = await mkdtemp(resolve(output) + "-");

try {
  await withBrowser(async newContext => {
    for (const scene of plan.scenes) {
      for (const [side, baseUrl] of Object.entries(targets)) {
        const context = await newContext({
          viewport: scene.viewport, deviceScaleFactor: 2,
          colorScheme: scene.colorScheme ?? "light", reducedMotion: "reduce",
          locale: plan.locale ?? "en-US", timezoneId: plan.timezoneId ?? "UTC",
        });
        try {
          const page = await context.newPage();
          const url = appUrl(scene.path ? new URL(scene.path, baseUrl) : baseUrl);
          const response = await page.goto(url.href);
          if (!response?.ok()) throw new Error(`Scene ${scene.id} could not load ${side}.`);
          if (prepare) await prepare({ page, scene, side, baseUrl: baseUrl.href });
          if (scene.ready) await page.locator(scene.ready).waitFor();
          await page.evaluate(() => document.fonts.ready.then(() => {}));
          await page.screenshot({
            path: join(staging, `${scene.id}-${side}.png`), animations: "disabled",
          });
        } finally {
          await context.close();
        }
      }
    }
  }, plan.allowedHosts ?? Object.values(targets).map(hostPort));
  await mkdir(output, { recursive: true });
  for (const scene of plan.scenes) {
    for (const side of ["before", "after"]) {
      const name = `${scene.id}-${side}.png`;
      await rename(join(staging, name), join(output, name));
    }
  }
  console.log(`Captured ${plan.scenes.length} matched pairs in ${resolve(output)}`);
} finally {
  await rm(staging, { force: true, recursive: true });
}
