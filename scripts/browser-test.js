import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { levels } from "../src/levels.js";
import { initial, apply, available, lost, amount } from "../src/rules.js";
fs.mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.env.GAME_URL || "http://localhost:5174");
await page.waitForFunction(() => window.gameTest);
// Drive every animation with advanceTime only: the free-running render loop
// in headless software WebGL would otherwise eat the CPU on big heaps.
await page.evaluate(() => {
  window.requestAnimationFrame = () => 0;
});
await page.waitForTimeout(150);
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
assert.equal((await state()).screen, "home");
await page.screenshot({ path: "test-results/home.png" });
// Home -> level list (title + numbered buttons) -> level.
const openLevel = async (i) => {
  const now = (await state()).screen;
  if (now === "playing") await page.locator("#home").click();
  if ((await state()).screen === "home") await page.locator("#choose").click();
  assert.equal((await state()).screen, "select");
  await page.locator(`[data-level="${i}"]`).click();
};
await page.locator("#choose").click();
assert.equal(await page.locator("[data-level]").count(), levels.length);
assert.equal(await page.locator('[data-level="0"]').textContent(), "001");
await page.screenshot({ path: "test-results/level-select.png" });
await page.locator("#select-back").click();
assert.equal((await state()).screen, "home");
assert.equal(
  await page.locator("#hint,#sound,#steps,#remaining,.tray").count(),
  0,
);
let capSeen = false;
const levelFilter=process.env.BOTTLE_TEST_LEVELS?.split(",").map(Number);
for (let level = 0; level < levels.length; level++) {
  if(levelFilter&&!levelFilter.includes(level+1))continue;
  await openLevel(level);
  assert.equal((await state()).level, level + 1);
  assert.equal(await page.locator(".bottle-slot svg").count(), 5);
  const path = await page.evaluate(() => window.gameTest.solve().path);
  assert.ok(path);
  await page.screenshot({ path: `test-results/level-${level + 1}-start.png` });
  let poured = false;
  for (const m of path) {
    if (m.type === "pick") {
      await page
        .locator(`[data-id="${m.id}"]`)
        .click();
      await advance(600);
    } else {
      await page.locator(`[data-id="${m.a}"]`).click();
      assert.equal((await state()).selected, m.a);
      await page.locator(`[data-id="${m.b}"]`).click();
      assert.equal((await state()).busy, true);
      // Clicking a bottle mid-pour starts nothing (it may only be chosen
      // to book the next pour); clicking it again lets go.
      const lock = await page.evaluate((id) => {
        const before = JSON.parse(window.render_game_to_text()).moves;
        void window.gameTest.clickBottle(id);
        void window.gameTest.clickBottle(id);
        const after = JSON.parse(window.render_game_to_text());
        return [before, after.moves, after.selected, after.operations];
      }, m.b);
      assert.equal(lock[0], lock[1]);
      assert.equal(lock[2], null);
      assert.equal(lock[3], 1);
      let advanced = 0;
      if (!poured) {
        await advance(450);
        advanced = 450;
        await page.screenshot({
          path: `test-results/level-${level + 1}-pour.png`,
        });
        poured = true;
      }
      await advance(1600 - advanced);
      const mid = await state();
      const capped = mid.bottles.filter((b) => b.capped);
      if (!capSeen && capped.length) {
        for (const b of capped)
          assert.equal(
            b.layers.length,
            1,
            "single color must be one continuous render layer",
          );
        await page.screenshot({ path: "test-results/cork-completion.png" });
        capSeen = true;
      }
      await advance(2000);
    }
  }
  assert.equal((await state()).status, "won");
  // Progress ends at one sorted bottle per filled bottle the level began with.
  const done = (await state()).progress;
  assert.equal(done.done, done.total);
  assert.equal(
    done.total,
    levels[level].bottles.filter((b) => !b.hand).length,
  );
  assert.equal(
    await page.locator("#progress").textContent(),
    `整理进度 ${done.total}/${done.total}`,
  );
  await page.screenshot({ path: `test-results/level-${level + 1}-won.png` });
  console.log(`UI Level ${level + 1}: ${path.length} moves passed`);
  await page.locator("#result-home").click();
  assert.equal((await state()).screen, "select");
}
assert.ok(
  capSeen,
  "completion must visibly seal with a cork before elimination",
);
// Level 3: full slots, full-target rejection, mismatched-colour pours and an
// instant loss. Bottle ids are derived from the current level data.
const L3 = levels[2];
// A sequence of n picks (each available when made) ending lost or not.
function picks(s, n, wantLost, path = []) {
  if (path.length === n) return lost(s, L3) === wantLost ? path : null;
  if (lost(s, L3)) return null;
  for (const id of s.pile)
    if (available(s, L3, id)) {
      const r = picks(apply(s, { type: "pick", id }), n, wantLost, [...path, id]);
      if (r) return r;
    }
  return null;
}
const start3 = initial(L3),
  [E1] = start3.slots,
  alive = picks(start3, 3, false),
  doomed = picks(start3, 3, true);
assert.ok(alive && doomed, "level 3 needs both a safe and a losing opening");
let after = start3;
for (const id of alive) after = apply(after, { type: "pick", id });
// Two picked bottles whose tops differ, both poured into the empty E1.
const [first, second] = alive
  .flatMap((a) => alive.map((c) => [a, c]))
  .find(([a, c]) => {
    if (a === c) return false;
    const one = apply(after, { type: "pour", a, b: E1 });
    return (
      one.water[c].at(-1) !== one.water[E1].at(-1) &&
      amount(one.water[c], one.water[E1]) > 0
    );
  });
await openLevel(2);
const play = async (m) => {
  if (m.type === "pick") {
    await page.locator(`[data-id="${m.id}"]`).click();
    await advance(600);
  } else {
    await page.locator(`[data-id="${m.a}"]`).click();
    await page.locator(`[data-id="${m.b}"]`).click();
    await advance(2400);
  }
};
for (const id of alive) await play({ type: "pick", id });
const full = (await state()).state;
assert.ok(!full.slots.includes(null));
// Slots full: a free heap bottle cannot be picked.
const freeInHeap = (await state()).bottles.find(
  (b) => b.available && full.pile.includes(b.id),
);
await page.locator(`[data-id="${freeInHeap.id}"]`).click();
assert.deepEqual((await state()).state, full);
// A full target refuses liquid.
await page.locator(`[data-id="${alive[0]}"]`).click();
await page.locator(`[data-id="${alive[1]}"]`).click();
assert.deepEqual((await state()).state, full);
await page.locator(`[data-id="${alive[0]}"]`).click();
assert.equal((await state()).selected, null);
// Any target with room accepts, whatever colour is on top.
await play({ type: "pour", a: first, b: E1 });
await play({ type: "pour", a: second, b: E1 });
const mixed = (await state()).state;
assert.ok(new Set(mixed.water[E1]).size > 1);
assert.equal((await state()).status, "playing");
await page.screenshot({ path: "test-results/mixed-pour.png" });
await page.locator("#restart").click();
assert.equal((await state()).moves, 0);
// Hand full and no colour adds up to a bottle: the game is lost at once.
for (const id of doomed.slice(0, -1)) await play({ type: "pick", id });
assert.equal((await state()).status, "playing");
await play({ type: "pick", id: doomed.at(-1) });
assert.equal((await state()).status, "lost");
await page.screenshot({ path: "test-results/failure.png" });
// Undo steps back to before the losing pick, which can then be made again.
const lostState = (await state()).state;
await page.locator("#undo").click();
let back = await state();
assert.equal(back.status, "playing");
assert.ok(back.state.pile.includes(doomed.at(-1)));
assert.equal(back.state.slots.filter((x) => x !== null).length, 4);
await page.screenshot({ path: "test-results/undo.png" });
await play({ type: "pick", id: doomed.at(-1) });
assert.deepEqual((await state()).state, lostState);
assert.equal((await state()).status, "lost");
await page.locator("#again").click();
assert.equal((await state()).moves, 0);
// Going back during an animation cancels it without an old state commit.
await page.locator(`[data-id="${alive[0]}"]`).click();
await page.locator("#home").click();
await advance(1500);
assert.equal((await state()).screen, "select", "back from a level → level list");
await openLevel(2);
assert.equal(
  (await state()).state.pile.length,
  L3.bottles.filter((b) => !b.hand).length,
);
await page.locator("#restart").click();
assert.equal((await state()).moves, 0);
await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(100);
await page.screenshot({ path: "test-results/desktop.png" });
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForFunction(
  () =>
    document.querySelector(".game").getBoundingClientRect().bottom <=
    innerHeight,
);
await page.screenshot({ path: "test-results/small-phone.png" });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
assert.deepEqual(errors, []);
console.log(
  "Home level selection, cork, continuous layers, cancellation, failure, restart, input lock, mobile and console passed",
);
await browser.close();
