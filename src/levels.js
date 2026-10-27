import fixedLevels from "./level-data.js";
// Levels follow docs/level-rules.md — read it before adding or changing one.
// heap: [colors, x, z, yaw°] of each bottle on the ground, in drop order.
// Two empty bottles start in hand; which heap bottles can be picked follows
// from how the heap settles (see pile.js), not from a hand-written list.
export function level(heap, slots = 5, hand = 2) {
  const bottles = heap.map(([colors, x, z, yaw], id) => ({
    id,
    colors,
    order: id,
    heap: { x, z, yaw },
  }));
  for (let i = 0; i < hand; i++)
    bottles.push({ id: heap.length + i, colors: [], hand: true });
  // Heap camera zoom: a few bottles fill the view, thirty still fit.
  const heapPx = Math.min(60, 34 * Math.pow(30 / heap.length, 0.25));
  return { slots, bottles, heapPx };
}
function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
// How 4 units split between k distinct colours in one bottle.
const SPLITS = {
  2: [
    [3, 1],
    [2, 2],
  ],
  3: [[2, 1, 1]],
  4: [[1, 1, 1, 1]],
};
/**
 * Bottle contents for a level. totals[c] = units of colour c (each a multiple
 * of 4); mix[k] = weight of bottles holding k distinct colours (k = 2..4).
 */
function fill(rnd, totals, mix) {
  const count = totals.reduce((a, b) => a + b, 0) / 4,
    ks = Object.entries(mix).flatMap(([k, w]) => Array(w).fill(Number(k)));
  for (let attempt = 0; attempt < 2000; attempt++) {
    const left = [...totals],
      bottles = [];
    for (let i = 0; i < count; i++) {
      const avail = left.map((n, c) => [c, n]).filter(([, n]) => n > 0);
      const k = Math.min(ks[Math.floor(rnd() * ks.length)], avail.length),
        options = SPLITS[k];
      if (!options) break;
      const split = options[Math.floor(rnd() * options.length)];
      // Weighted draw of k colours; larger shares go to colours with more left.
      const chosen = [],
        pool = [...avail];
      while (chosen.length < k) {
        let r = rnd() * pool.reduce((a, [, n]) => a + n, 0);
        const j = Math.max(
          0,
          pool.findIndex(([, n]) => (r -= n) < 0),
        );
        chosen.push(pool.splice(j, 1)[0]);
      }
      chosen.sort((a, b) => b[1] - a[1]);
      if (chosen.some(([, n], j) => n < split[j])) break;
      const units = chosen.flatMap(([c], j) => Array(split[j]).fill(c));
      chosen.forEach(([c], j) => (left[c] -= split[j]));
      // Any order: RRRY, RYRR, YRYR, YRRY ... keeps bottles varied.
      for (let a = units.length - 1; a > 0; a--) {
        const b = Math.floor(rnd() * (a + 1));
        [units[a], units[b]] = [units[b], units[a]];
      }
      bottles.push(units);
    }
    if (bottles.length === count && left.every((n) => n === 0)) return bottles;
  }
  throw Error("could not fill level");
}
/** A messy mound; it spreads wider the more bottles it has. */
function heapLevel(seed, totals, mix) {
  const rnd = random(seed),
    sets = fill(rnd, totals, mix),
    spread = Math.sqrt(sets.length / 20),
    gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2;
  return sets.map((s) => [
    s,
    Math.max(-3.6, Math.min(3.6, gauss() * 1.9 * spread)),
    Math.max(-4.2, Math.min(3.6, gauss() * 1.8 * spread - 0.1)),
    Math.round(rnd() * 360),
  ]);
}
// Seeds are picked with scripts/pick-seeds.js (solvable, sensible start).
export const LEVEL_SPECS = [
  {
    difficulty: "很简单：3 瓶 3 色，每瓶 2 种颜色",
    seed: 1,
    totals: [4, 4, 4],
    mix: { 2: 1 },
  },
  {
    difficulty: "中等偏简单：6 瓶 4 色，多数每瓶 2 色",
    seed: 9,
    totals: [8, 8, 4, 4],
    mix: { 2: 7, 3: 3 },
  },
  {
    difficulty: "中等偏难：30 瓶 5 色，上层偏简单、下层偏复杂",
    dataKey: 3,
    seed: 8,
    totals: [24, 24, 24, 24, 24],
    mix: { 2: 4, 3: 5, 4: 1 },
  },
  {
    // 160 units cannot split evenly over 6 colours: 4×28 + 2×24.
    difficulty: "难：40 瓶 6 色，关内渐进",
    dataKey: 4,
    seed: 8,
    totals: [28, 28, 28, 28, 24, 24],
    mix: { 2: 3, 3: 5, 4: 2 },
  },
  {
    difficulty: "容错实验：50 瓶 6 色，拾取选择较宽",
    dataKey: 5, seed: 8,
    totals: [36,36,32,32,32,32], mix: {2:5,3:4,4:1},
  },
  {
    difficulty: "容错实验：50 瓶 6 色，拾取选择较窄",
    dataKey: 6, seed: 8,
    totals: [36,36,32,32,32,32], mix: {2:5,3:4,4:1},
  },
];
export const buildLevel = (spec) => {
  const fixed=spec.procedural?null:fixedLevels[spec.dataKey];
  return fixed ? level(fixed.heap,fixed.slots,fixed.hand) : level(heapLevel(spec.seed,spec.totals,spec.mix));
};
export const levels = LEVEL_SPECS.map(buildLevel);
// Same order as the render palette (vendor/water-sort/palette.ts).
export const colors = [
  "#e8384f",
  "#2d72f5",
  "#27b44f",
  "#ffcc1c",
  "#9147f0",
  "#ff7e21",
];
export const colorNames = ["红色", "蓝色", "绿色", "黄色", "紫色", "橙色"];
