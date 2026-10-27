import test from "node:test";
import assert from "node:assert/strict";
import { Session } from "../src/session.js";
import { apply, initial } from "../src/rules.js";
function finish(s, op) {
  assert.ok(op);
  s.commit(op);
  assert.ok(s.finish(op));
}
// Fixtures independent of the shipped levels (which are regenerated).
// SMALL: heap bottles 0 and 1 free, empty bottles 2 and 3 in hand.
// LAYERED: 2 lies on 0, 3 lies on 1; empty bottles 4 and 5 in hand.
const bottle = (id, colors, blockedBy = [], hand = false) => ({
  id,
  colors,
  blockedBy,
  hand,
});
const SMALL = {
  slots: 5,
  bottles: [
    bottle(0, [0, 1, 0, 1]),
    bottle(1, [1, 0, 1, 0]),
    bottle(2, [], [], true),
    bottle(3, [], [], true),
  ],
};
const LAYERED = {
  slots: 5,
  bottles: [
    bottle(0, [0, 1, 0, 1], [2]),
    bottle(1, [1, 0, 1, 0], [3]),
    bottle(2, [2, 3, 2, 3]),
    bottle(3, [3, 2, 3, 2]),
    bottle(4, [], [], true),
    bottle(5, [], [], true),
  ],
};
function four() {
  const s = new Session(SMALL);
  for (const id of [0, 1]) finish(s, s.begin({ type: "pick", id }));
  return s;
}
test("pickup reserves a unique slot and reveals the next layer immediately", () => {
  const s = new Session(LAYERED);
  const ops = [2, 3, 0].map((id) => s.begin({ type: "pick", id }));
  assert.ok(ops.every(Boolean));
  assert.equal(new Set(s.state.slots).size, 5);
  assert.equal(s.begin({ type: "pick", id: 1 }), null);
  for (const op of ops.reverse()) finish(s, op);
  assert.deepEqual(s.state.slots, [4, 5, 2, 3, 0]);
});
test("new pickups survive a pour committed after them", () => {
  const s = new Session(SMALL);
  finish(s, s.begin({ type: "pick", id: 0 }));
  const pour = s.begin({ type: "pour", a: 0, b: 2 });
  const p1 = s.begin({ type: "pick", id: 1 });
  finish(s, p1);
  finish(s, pour);
  assert.deepEqual(s.state.slots, [2, 3, 0, 1, null]);
  assert.deepEqual(s.state.pile, []);
  assert.deepEqual(s.state.water[2], [1]);
  assert.deepEqual(s.state.water[1], [1, 0, 1, 0]);
});
test("disjoint pours finish in either order without stale state", () => {
  for (const reverse of [false, true]) {
    const s = four(),
      a = s.begin({ type: "pour", a: 0, b: 2 }),
      b = s.begin({ type: "pour", a: 1, b: 3 });
    assert.ok(a && b);
    assert.equal(s.begin({ type: "pour", a: 0, b: 3 }), null);
    for (const op of reverse ? [b, a] : [a, b]) finish(s, op);
    let expected = initial(SMALL);
    for (const id of [0, 1]) expected = apply(expected, { type: "pick", id });
    for (const m of [
      { type: "pour", a: 0, b: 2 },
      { type: "pour", a: 1, b: 3 },
    ])
      expected = apply(expected, m);
    assert.deepEqual(s.state, expected);
    assert.equal(s.locked.size, 0);
  }
});
test("corking only holds the completed destination; old task cannot unlock a new source owner", () => {
  const s = new Session({ bottles: [] });
  s.state = {
    pile: [],
    slots: [0, 1, 2, 3],
    water: { 0: [0], 1: [0, 0, 0], 2: [1], 3: [] },
  };
  const a = s.begin({ type: "pour", a: 0, b: 1 });
  assert.deepEqual(s.commit(a), [1]);
  assert.equal(s.locked.has(0), false);
  assert.equal(s.locked.has(1), true);
  const b = s.begin({ type: "pour", a: 2, b: 0 });
  assert.ok(b);
  s.finish(a);
  assert.equal(s.locked.get(0), b);
  assert.equal(s.state.slots[1], null);
  finish(s, b);
  assert.deepEqual(s.state.water[0], [1]);
});
test("settling one animation must not remove another full pickup still in flight", () => {
  const s = new Session({ bottles: [{ id: 4, colors: [], blockedBy: [] }] });
  s.state = {
    pile: [4],
    slots: [0, 1, 2, null],
    water: { 0: [0], 1: [0, 0, 0], 2: [1, 2], 4: [3, 3, 3, 3] },
  };
  const a = s.begin({ type: "pour", a: 0, b: 1 }),
    b = s.begin({ type: "pick", id: 4 });
  finish(s, a);
  assert.ok(s.state.slots.includes(4));
  assert.ok(s.locked.has(4));
  finish(s, b);
  assert.equal(s.state.slots.includes(4), false);
});
test("failure is deferred until pending animation commits and finishes", () => {
  const s = new Session({ bottles: [{ id: 3, colors: [], blockedBy: [] }] });
  s.state = {
    pile: [3],
    slots: [0, 1, 2, null],
    water: { 0: [0, 1, 0, 1], 1: [1, 0, 1, 0], 2: [2, 3, 2, 3], 3: [3, 2, 3, 2] },
  };
  const op = s.begin({ type: "pick", id: 3 });
  s.commit(op);
  assert.equal(s.status, "playing");
  s.finish(op);
  assert.equal(s.status, "lost");
});
test("cancelled work cannot commit or finish", () => {
  const s = four(),
    op = s.begin({ type: "pour", a: 0, b: 2 });
  const before = structuredClone(s.state);
  s.cancel();
  assert.equal(s.commit(op), null);
  assert.equal(s.finish(op), null);
  assert.deepEqual(s.state, before);
  assert.equal(s.locked.size, 0);
});
