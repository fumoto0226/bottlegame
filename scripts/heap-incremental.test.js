import test from "node:test";
import assert from "node:assert/strict";
import { levels } from "../src/levels.js";
import { dailyForDate } from "../src/daily.js";
import { heapOf, settlePile, coverage, heapCamera } from "../src/pile.js";
import { initial, available } from "../src/rules.js";
// Picking reworks only the part of the heap a bottle's absence can touch.
// It must give exactly what settling and checking the whole heap gives.
function full(level, pile) {
  const poses = settlePile(
    level.bottles
      .filter((b) => pile.includes(b.id))
      .map((b) => ({ id: b.id, order: b.order, ...b.heap })),
  );
  return { poses, ...coverage(poses, heapCamera(level.heapPx)) };
}
function same(level, pile) {
  const a = heapOf(level, pile),
    b = full(level, pile);
  assert.deepEqual([...a.poses.keys()], [...b.poses.keys()]);
  for (const [id, p] of b.poses) {
    const q = a.poses.get(id);
    assert.deepEqual(q.anchor.toArray(), p.anchor.toArray(), `anchor ${id}`);
    assert.deepEqual(q.quat.toArray(), p.quat.toArray(), `quat ${id}`);
    assert.equal(q.order, p.order, `order ${id}`);
    assert.equal(a.cover.get(id), b.cover.get(id), `cover ${id}`);
    assert.deepEqual(a.coveredBy.get(id), b.by.get(id), `coveredBy ${id}`);
  }
}
const cases = [
  ["daily", dailyForDate("2026-10-26"), 20],
  ...levels.slice(2).map((l, i) => [`level ${i + 3}`, l, 12]),
];
for (const [name, level, steps] of cases)
  test(`${name}: incremental heap equals full recompute`, () => {
    let seed = 11,
      s = initial(level);
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < steps && s.pile.length; i++) {
      const free = s.pile.filter((id) => available(s, level, id));
      // mix low (early-dropped) and high bottles: low ones disturb the most
      const id = free[Math.floor(rnd() * free.length)];
      s = { ...s, pile: s.pile.filter((x) => x !== id) };
      same(level, s.pile);
    }
  });
