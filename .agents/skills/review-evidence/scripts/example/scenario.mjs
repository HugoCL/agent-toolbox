import { record } from "../recorder.mjs";

const [output, baseUrl = "http://127.0.0.1:4173/after"] = process.argv.slice(2);

await record({
  baseUrl,
  output,
  async prepare({ page }) {
    await page.getByText("Queue saved.").waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => {}));
  },
  async scenario({ page, clickOn, dragTo, zoomOn, caption, wait, startCapture }) {
    const edit = page.getByRole("button", { name: "Edit queue" });
    const save = page.getByRole("button", { name: "Save queue" });
    const ready = page.getByRole("region", { name: "Ready" });
    const invite = page.getByText("Invitation flow", { exact: true });

    caption("The queue opens in its saved state.");
    await startCapture();
    await wait(2900);
    await clickOn(edit);
    await save.waitFor();
    caption("Edit the queue to move a card.");
    await wait(2300);
    await zoomOn(page.locator(".board"), 1.1);
    await wait(950);
    caption("Drag Invitation flow into Ready.");
    await dragTo(invite, ready);
    await ready.getByText("Invitation flow", { exact: true }).waitFor();
    await zoomOn(ready);
    await wait(2000);
    await zoomOn();
    await wait(950);
    await clickOn(save);
    await page.getByText("Queue saved.").waitFor();
    caption("The card is ready for review.");
    await wait(3600);
  },
});
