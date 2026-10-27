import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.STATIC_URL || "http://localhost:4174");
await page.waitForFunction(() => window.render_game_to_text);
assert.equal(await page.evaluate(() => typeof window.gameTest), "undefined");
await page.locator("#choose").click();
await page.locator('[data-level="0"]').click();
// Pick whichever heap bottle is free in the current level 1.
const free = await page.evaluate(() => {
  const s = JSON.parse(window.render_game_to_text());
  return s.bottles.find((b) => b.available && s.state.pile.includes(b.id)).id;
});
await page.locator(`[data-id="${free}"]`).click();
await page.evaluate(() => window.advanceTime(1000));
assert.equal(
  await page.evaluate(
    () => JSON.parse(window.render_game_to_text()).state.slots[2],
  ),
  free,
);
await page.screenshot({ path: "test-results/static-build.png" });
assert.deepEqual(errors, []);
console.log(
  "Static production build: WebGL startup, pickup, no development test API passed",
);
await browser.close();
