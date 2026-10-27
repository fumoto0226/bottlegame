import test from "node:test";
import assert from "node:assert/strict";
import {
  amount,
  initial,
  available,
  apply,
  won,
  lost,
  solve,
  moves,
} from "../src/rules.js";
import { levels } from "../src/levels.js";
import { heapOf } from "../src/pile.js";
test("top contiguous run limited to free capacity", () => {
  assert.equal(amount([1, 0, 0], [0, 0, 0]), 1);
  assert.equal(amount([0, 1, 1], []), 2);
  assert.equal(amount([0], [1]), 1, "any colour with room accepts");
  assert.equal(amount([], [1]), 0);
  assert.equal(amount([0], [0, 0, 0, 0]), 0);
});
test("heap bottle becomes accessible once the bottles lying on it are picked", () => {
  for (const l of levels) {
    const s = initial(l),
      hand = l.bottles.filter((b) => b.hand).map((b) => b.id);
    assert.deepEqual(s.slots.slice(0, hand.length), hand);
    const heap = heapOf(l, s.pile),
      // a covered bottle whose coverers are all free right now
      target = s.pile.find(
        (id) =>
          !heap.free.has(id) &&
          heap.coveredBy.get(id).length &&
          heap.coveredBy.get(id).every((c) => heap.free.has(c)),
      );
    if (target === undefined) continue;
    assert.equal(available(s, l, target), false);
    let n = s;
    for (const c of heap.coveredBy.get(target))
      n = { ...n, pile: n.pile.filter((x) => x !== c) };
    assert.equal(available(n, l, target), true);
  }
});
test("full workbench only loses if no legal pour", () => {
  const s = {
    pile: [],
    slots: [0, 1, 2, 3],
    water: { 0: [0, 1], 1: [1, 0, 1, 0], 2: [2, 3, 2, 3], 3: [3, 2, 3, 2] },
  };
  assert.equal(lost(s, levels[0]), false);
  s.water[0] = [0, 1, 0, 1];
  assert.equal(lost(s, levels[0]), true);
});
test("hand full with no colour reaching four units is lost", () => {
  const s = {
    pile: [9],
    slots: [0, 1, 2, 3, 4],
    water: { 0: [0, 1], 1: [2, 3], 2: [4, 0], 3: [1, 2], 4: [], 9: [3, 3, 3, 3] },
  };
  assert.equal(lost(s, levels[2]), true);
  s.water[4] = [0, 0];
  assert.equal(lost(s, levels[2]), false, "four reds can still be gathered");
});
test("full uniform bottle removed, empty bottle retained until all liquid done", () => {
  const s = {
    pile: [4],
    slots: [0, 1, null, null],
    water: { 0: [1], 1: [1, 1, 1], 4: [] },
  };
  const n = apply(s, { type: "pour", a: 0, b: 1 });
  assert.deepEqual(n.slots, [0, null, null, null]);
  assert.deepEqual(n.water[0], []);
  assert.equal(won(n), false);
  assert.equal(won(apply(n, { type: "pick", id: 4 })), true);
});
for (const [i, l] of levels.entries())
  test(`level ${i + 1} has legal solution and conserved liquid`, () => {
    let s = initial(l);
    const solution = solve(s, l).path;
    assert.ok(solution);
    for (const m of solution) {
      assert.ok(
        moves(s, l).some((a) => JSON.stringify(a) === JSON.stringify(m)),
      );
      const before = Object.values(s.water).reduce((n, a) => n + a.length, 0);
      s = apply(s, m);
      const after = Object.values(s.water).reduce((n, a) => n + a.length, 0);
      assert.ok(before === after || before - after === 4);
    }
    assert.ok(won(s));
    assert.deepEqual(
      s.slots,
      Array.from({ length: l.slots }, () => null),
    );
  });
