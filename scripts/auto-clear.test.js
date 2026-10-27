import test from "node:test";
import assert from "node:assert/strict";
import { autoClear } from "../src/rules.js";
const hand = (water, pile = [9]) => ({
  pile,
  slots: Object.keys(water).map(Number),
  water: { ...water, 9: [0, 1, 2, 3] },
});
const inHand = (s) => s.slots.filter((id) => id !== null);
const units = (s) => inHand(s).reduce((n, id) => n + s.water[id].length, 0);
const tally = (s, c) =>
  inHand(s).reduce((n, id) => n + s.water[id].filter((x) => x === c).length, 0);
// Whatever the case: 4 units of the colour leave, one bottle leaves, nothing
// overflows and every other unit is still somewhere in hand.
function checkClear(s, r) {
  assert.equal(units(r.state), units(s) - 4);
  assert.equal(tally(r.state, r.color), tally(s, r.color) - 4);
  assert.equal(inHand(r.state).length, inHand(s).length - 1);
  assert.equal(r.state.slots.includes(r.elim), false);
  for (const id of inHand(r.state)) assert.ok(r.state.water[id].length <= 4);
  assert.equal(r.take.length + Math.min(4, s.water[r.elim].filter((c) => c === r.color).length), 4);
}
test("nothing to clear below four units of any colour", () => {
  assert.equal(autoClear(hand({ 0: [0, 1], 1: [0, 2], 2: [0, 3] })), null);
});
test("four units spread over bottles and depths gather and go", () => {
  const s = hand({ 0: [0, 1, 0], 1: [2, 0], 2: [0, 3, 3], 3: [], 4: [1] });
  const r = autoClear(s);
  assert.equal(r.color, 0);
  checkClear(s, r);
});
test("a bottle holding only that colour gathers it", () => {
  const s = hand({ 0: [1, 2], 1: [0, 0, 0], 2: [0, 3], 3: [] });
  const r = autoClear(s);
  assert.equal(r.elim, 1);
  assert.deepEqual(r.moveOut, []);
  assert.deepEqual(r.take, [{ id: 2, index: 0 }]);
  assert.ok(r.state.slots.includes(3), "the empty one stays");
  checkClear(s, r);
});
test("otherwise an empty bottle gathers it", () => {
  const s = hand({ 0: [1, 0], 1: [0, 2], 2: [0, 0, 3], 3: [] });
  const r = autoClear(s);
  assert.equal(r.elim, 3);
  assert.deepEqual(r.moveOut, []);
  assert.equal(r.take.length, 4);
  checkClear(s, r);
});
test("otherwise the bottle with least other liquid, which is emptied first", () => {
  const s = hand({
    0: [1, 1, 0],
    1: [2, 0, 3],
    2: [4, 0, 4],
    3: [5, 0, 5, 5],
    4: [2, 3, 4, 1],
  });
  const r = autoClear(s);
  assert.equal(r.color, 0);
  // 0, 1 and 2 each have two other units and one red: any of them
  assert.ok([0, 1, 2].includes(r.elim));
  assert.equal(r.moveOut.length, 2);
  checkClear(s, r);
});
test("a full hand of mixed bottles always has room for the move", () => {
  const s = hand({
    0: [0, 1, 2, 3],
    1: [1, 0, 3, 2],
    2: [2, 3, 0, 1],
    3: [3, 2, 1, 0],
    4: [4, 4, 5, 5],
  });
  const r = autoClear(s);
  assert.equal(r.moveOut.length, 3);
  checkClear(s, r);
});
test("random hands: always a clean clear", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let n = 0; n < 2000; n++) {
    const water = {};
    for (let id = 0; id < 5; id++)
      water[id] = Array.from({ length: Math.floor(rnd() * 5) }, () =>
        Math.floor(rnd() * 6),
      );
    const s = hand(water),
      r = autoClear(s);
    if (r) checkClear(s, r);
  }
});
