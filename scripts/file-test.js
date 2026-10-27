import { chromium } from "playwright";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
fs.mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const external = [];
page.on("request", (r) => {
  if (/^https?:/.test(r.url())) external.push(r.url());
});
await page.goto(pathToFileURL(path.resolve("dist/index.html")).href);
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
await page.screenshot({ path: "test-results/file-offline.png" });
await page.locator('#home').click();
await page.locator('#select-back').click();
await page.locator('#daily').click();
assert.equal(await page.locator('[data-daily-level]').count(),2);
await page.locator('[data-daily-level="1"]').click();
assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).state.pile.length), 120);
assert.equal(await page.locator('#daily-note').isVisible(), true);
assert.deepEqual(errors, []);
assert.deepEqual(external, []);
await page.goto(pathToFileURL(path.resolve("index.html")).href);
await page.waitForFunction(() => window.render_game_to_text);
assert.ok(page.url().endsWith("/dist/index.html"));
console.log(
  "Double-click dist/index.html and source index.html: game loaded, pickup passed, zero network dependencies",
);
await browser.close();
