import { chromium } from "playwright";
import assert from "node:assert/strict";
import { initial, apply, available, autoClear } from "../src/rules.js";
import { levels } from "../src/levels.js";
import { heapOf } from "../src/pile.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.env.GAME_URL || "http://localhost:5174");
await page.waitForFunction(() => window.gameTest);
await page.evaluate(() => {
  window.requestAnimationFrame = () => 0;
});
await page.waitForTimeout(150);
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms),
  snapshot = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
const click = (id) =>
  page.evaluate(
    (id) => document.querySelector(`[data-id="${id}"]`).click(),
    id,
  );
await page.evaluate(() => window.gameTest.start(0));
await advance(100);
// Ids come from the current level 1: two free heap bottles (A, B) and the
// two empty bottles in hand (E1, E2).
const L1 = levels[0],
  start0 = initial(L1),
  [E1, E2] = start0.slots,
  [A, B] = [...heapOf(L1, start0.pile).free];
const click2 = async (a, b) => {
  await click(a);
  await click(b);
};
const outlines = () =>
  page
    .locator(".bottle-slot")
    .evaluateAll((es) => es.map((e) => getComputedStyle(e).visibility));
await click(A);
await advance(500);
await click2(A, E1);
await click(B);
let s = await snapshot();
assert.equal(s.operations, 2);
assert.deepEqual(s.state.slots, [E1, E2, A, B, null]);
assert.deepEqual(await outlines(), [
  "hidden",
  "hidden",
  "hidden",
  "hidden",
  "visible",
]);
const before = structuredClone(s.state);
// A bottle mid-pour can be chosen (to book the next pour) without changing
// anything yet; choosing it again lets go.
await page.evaluate((id) => {
  void window.gameTest.clickBottle(id);
}, A);
assert.deepEqual((await snapshot()).state, before);
assert.equal((await snapshot()).selected, A);
await page.evaluate((id) => {
  void window.gameTest.clickBottle(id);
}, A);
assert.equal((await snapshot()).selected, null);
await advance(420);
s = await snapshot();
assert.equal(s.operations, 1);
assert.ok(!s.locked.includes(B) && !s.locked.includes(E2));
await click(B);
assert.equal((await snapshot()).selected, B);
await click(E2);
await advance(420);
s = await snapshot();
assert.equal(s.operations, 2);
assert.equal(s.streams, 2);
await page.screenshot({ path: "test-results/concurrent-pours.png" });
await advance(3000);
s = await snapshot();
assert.equal(s.operations, 0);
assert.deepEqual(s.locked, []);
assert.equal(s.streams, 0);
let expected = initial(levels[0]);
for (const id of [A, B]) expected = apply(expected, { type: "pick", id });
for (const m of [
  { type: "pour", a: A, b: E1 },
  { type: "pour", a: B, b: E2 },
])
  expected = apply(expected, m);
assert.deepEqual(s.state, expected);
// Selecting an unrelated bottle survives another pour finishing.
await page.evaluate(() => window.gameTest.start(0));
for (const id of [A, B]) await click(id);
await advance(500);
await click2(A, E1);
await click(B);
assert.equal((await snapshot()).selected, B);
await advance(2000);
assert.equal((await snapshot()).selected, B);
await click(E2);
await advance(2000);
assert.deepEqual((await snapshot()).state, expected);
// Start two more streams, then cancel both by returning home.
await page.evaluate(() => window.gameTest.start(0));
for (const id of [A, B]) await click(id);
await advance(500);
await click2(A, E1);
await click2(B, E2);
await advance(450);
assert.equal((await snapshot()).streams, 2);
await page.locator("#home").evaluate((e) => e.click());
await advance(2000);
s = await snapshot();
assert.equal(s.screen, "select");
assert.equal(s.operations, 0);
assert.equal(s.streams, 0);
assert.deepEqual(s.locked, []);
await page.locator('[data-level="2"]').evaluate((e) => e.click());
await advance(100);
assert.equal(
  (await snapshot()).state.pile.length,
  levels[2].bottles.filter((b) => !b.hand).length,
);
assert.deepEqual(await outlines(), [
  "hidden",
  "hidden",
  "visible",
  "visible",
  "visible",
]);
// Booking: while A pours into E1, choose B then E1; B pours right after.
await page.evaluate(() => window.gameTest.start(0));
await advance(100);
for (const id of [A, B]) {
  await click(id);
  await advance(500);
}
await click2(A, E1);
await advance(300);
await click2(B, E1);
s = await snapshot();
assert.equal(s.operations, 1, "booked pour waits");
assert.equal(s.selected, B, "the booked source stays chosen");
await advance(4000);
s = await snapshot();
let booked = initial(L1);
for (const m of [
  { type: "pick", id: A },
  { type: "pick", id: B },
  { type: "pour", a: A, b: E1 },
  { type: "pour", a: B, b: E1 },
])
  booked = apply(booked, m);
assert.deepEqual(s.state, booked);
assert.equal(s.operations, 0);
assert.equal(s.selected, null);
// Auto-clear: with the switch on, four units of a colour in hand vanish and
// one bottle in hand goes. Find three picks in level 3 that set it off.
{
  const L3 = levels[2];
  const find = (st, path) => {
    if (path.length === 3) return autoClear(st) ? path : null;
    for (const id of st.pile)
      if (available(st, L3, id)) {
        const r = find(apply(st, { type: "pick", id }), [...path, id]);
        if (r) return r;
      }
    return null;
  };
  const seq = find(initial(L3), []);
  assert.ok(seq, "level 3 has an opening that triggers auto-clear");
  let expect = initial(L3);
  for (const id of seq) expect = apply(expect, { type: "pick", id });
  expect = autoClear(expect).state;
  await page.evaluate(() => window.gameTest.start(2));
  await advance(100);
  await page.locator("#auto").evaluate((e) => e.click());
  assert.equal((await snapshot()).autoClear, true);
  for (const id of seq) {
    await click(id);
    await advance(600);
  }
  await advance(2500);
  s = await snapshot();
  assert.equal(s.autoBusy, false);
  assert.deepEqual(s.state, expect);
  assert.equal(s.progress.done, 1);
  assert.equal(s.state.slots.filter((x) => x !== null).length, 4);
  // The three kinds of gathering bottle, each played out on screen: one that
  // held only the cleared colour, an empty one, and one whose other liquid
  // first moves into the other bottles.
  const pile = expect.pile;
  const cases = [
    { 30: [0, 1], 31: [], 7: [1, 1, 1], 12: [2, 1], 17: [3] },
    { 30: [1, 0], 31: [], 7: [0, 2], 12: [0, 0, 3], 17: [4] },
    { 30: [1, 1, 0], 31: [2, 0, 3], 7: [4, 0, 4], 12: [5, 0, 5, 5], 17: [2, 3, 4, 1] },
  ];
  for (const water of cases) {
    const st = {
      pile,
      slots: [30, 31, 7, 12, 17],
      water: { ...Object.fromEntries(pile.map((id) => [id, initial(L3).water[id]])), ...water },
    };
    const want = autoClear(st);
    await page.evaluate((st) => window.gameTest.load(st), st);
    await advance(100);
    // Toggling on with four of a colour in hand clears at once.
    await page.evaluate(() => window.gameTest.setAuto(false));
    await page.evaluate(() => window.gameTest.setAuto(true));
    await advance(4000);
    s = await snapshot();
    assert.equal(s.autoBusy, false);
    assert.deepEqual(s.state, want.state, `auto-clear gathers in ${want.elim}`);
    const shown = await page.evaluate(() =>
      [...window.gameTest.view.items.values()]
        .filter((v) => v.g.visible && !v.pile && v.id >= 0)
        .map((v) => [v.id, v.water.map((w) => w.color)]),
    );
    assert.deepEqual(
      Object.fromEntries(shown),
      Object.fromEntries(
        want.state.slots.filter((x) => x !== null).map((id) => [id, want.state.water[id]]),
      ),
      "what is drawn matches the state",
    );
  }
  await page.locator("#auto").evaluate((e) => e.click());
  assert.equal((await snapshot()).autoClear, false);
}
assert.deepEqual(errors, []);
console.log(
  "Concurrent pickup, booked pour, auto-clear, two independent streams, reserved slots, occupied outline hiding, latest-state commits and multi-animation cancellation passed",
);
await browser.close();
