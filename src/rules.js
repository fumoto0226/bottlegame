import { heapOf } from "./pile.js";
export const complete = (a) => a.length === 4 && a.every((c) => c === a[0]);
export function amount(a, b) {
  // Any bottle with room accepts the top run, whatever colour it ends with.
  if (!a?.length || !b || b.length === 4) return 0;
  let n = 1;
  while (n < a.length && a[a.length - 1 - n] === a.at(-1)) n++;
  return Math.min(n, 4 - b.length);
}
export function initial(level) {
  const hand = level.bottles.filter((b) => b.hand).map((b) => b.id),
    slots = Array.from(
      { length: level.slots ?? 4 },
      (_, i) => hand[i] ?? null,
    );
  return {
    pile: level.bottles.filter((b) => !b.hand).map((b) => b.id),
    slots,
    water: Object.fromEntries(level.bottles.map((b) => [b.id, [...b.colors]])),
  };
}
// Heap levels: a bottle is free when it is visibly uncovered in the settled heap.
export function available(s, l, id) {
  if (!s.pile.includes(id)) return false;
  const b = l.bottles.find((x) => x.id === id);
  if (b.heap) return heapOf(l, s.pile).free.has(id);
  return !b.blockedBy.some((x) => s.pile.includes(x));
}
export function moves(s, l) {
  const out = [];
  if (s.slots.includes(null))
    for (const id of s.pile)
      if (available(s, l, id)) out.push({ type: "pick", id });
  for (const a of s.slots)
    for (const b of s.slots)
      if (a !== null && b !== null && a !== b && amount(s.water[a], s.water[b]))
        out.push({ type: "pour", a, b });
  return out;
}
// Unsettled actions let the UI reserve slots and commit disjoint animations.
export function transfer(s, m) {
  const n = structuredClone(s);
  if (m.type === "pick") {
    n.pile = n.pile.filter((x) => x !== m.id);
    n.slots[n.slots.indexOf(null)] = m.id;
  } else {
    const k = amount(n.water[m.a], n.water[m.b]);
    n.water[m.b].push(...n.water[m.a].splice(-k));
  }
  return n;
}
export function settle(s, ids = null, recycle = true) {
  const n = structuredClone(s);
  for (let i = 0; i < n.slots.length; i++) {
    const id = n.slots[i];
    if (
      id !== null &&
      (ids === null || ids.includes(id)) &&
      n.water[id] &&
      complete(n.water[id])
    ) {
      delete n.water[id];
      n.slots[i] = null;
    }
  }
  if (recycle && won(n)) n.slots = n.slots.map(() => null);
  return n;
}
export const apply = (s, m) => settle(transfer(s, m));
export const won = (s) =>
  !s.pile.length && s.slots.every((id) => id === null || !s.water[id].length);
// Out of room: every slot is taken and no colour in hand adds up to a full
// bottle, or nothing can be poured at all.
export function stranded(s) {
  const count = new Map();
  for (const id of s.slots)
    for (const c of id === null ? [] : s.water[id])
      count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.values()].every((n) => n < 4);
}
export const lost = (s, l) =>
  !won(s) &&
  !s.slots.includes(null) &&
  (stranded(s) || !moves(s, l).length);
// Move preference for the search: finish a bottle, merge same colours, pick,
// split onto an empty bottle, and only then stack mismatched colours.
function rank(s, m) {
  if (m.type === "pick") return 30;
  const a = s.water[m.a],
    b = s.water[m.b],
    n = amount(a, b);
  if (complete([...b, ...a.slice(-n)])) return 100;
  if (b.length && b.at(-1) === a.at(-1)) return 50;
  return b.length ? 0 : 10;
}
// A pour that only moves a single-colour bottle into an empty one changes nothing.
const pointless = (s, m) =>
  m.type === "pour" &&
  !s.water[m.b].length &&
  s.water[m.a].every((c) => c === s.water[m.a][0]);
export function solve(start, level, limit = 180000, maxDepth = 400, options = {}) {
  let seed=options.seed;
  const rnd=seed===undefined?null:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Mismatched stacking blows up the search, so first look for a solution
  // without it; that solution is just as legal under the full rules.
  const tidy = search(start, level, limit, maxDepth, true, rnd);
  if (tidy.path) return tidy;
  const full = search(start, level, limit, maxDepth, false, rnd);
  return { ...full, nodes: tidy.nodes + full.nodes };
}
function search(start, level, limit, maxDepth, tidy, rnd) {
  const seen = new Set();
  let nodes = 0;
  const key = (s) =>
    s.pile.join(",") +
    "|" +
    s.slots
      .filter((x) => x !== null)
      .map((id) => s.water[id].join(""))
      .sort()
      .join("/");
  function dfs(s, path) {
    if (won(s)) return path;
    if (lost(s, level)) return null;
    if (++nodes > limit || path.length >= maxDepth) return null;
    const k = key(s);
    if (seen.has(k)) return null;
    seen.add(k);
    const ms = moves(s, level)
      .filter((m) => !pointless(s, m))
      .map((m) => [rank(s, m), m, rnd ? rnd() : 0])
      .filter(([r]) => !tidy || r > 0)
      .sort((x, y) => y[0] - x[0] || x[2]-y[2]);
    for (const [, m] of ms) {
      if(nodes>limit)break;
      const r = dfs(apply(s, m), [...path, m]);
      if (r) return r;
    }
    return null;
  }
  return { path: dfs(start, []), nodes, exhausted: nodes > limit };
}
/**
 * Auto-clear assist: when the bottles in hand hold 4 units of one colour in
 * total (anywhere, not only on top), they gather in one bottle in hand, which
 * then goes. That bottle is one holding only that colour, else an empty one,
 * else the one with the least other liquid; its other liquid moves on top of
 * the other bottles (there is always room: 4 units leave the others at the
 * same time). Returns the plan for the view, or null when nothing qualifies:
 *   take    – units of the colour leaving the other bottles ({id, index})
 *   moveOut – other units leaving the gathering bottle ({index, to})
 */
export function autoClear(s) {
  const ids = s.slots.filter((id) => id !== null),
    count = new Map();
  for (const id of ids)
    for (const c of s.water[id]) count.set(c, (count.get(c) ?? 0) + 1);
  const color = [...count].find(([, n]) => n >= 4)?.[0];
  if (color === undefined) return null;
  const mine = (id) => s.water[id].filter((c) => c === color).length,
    others = (id) => s.water[id].length - mine(id),
    elim = [...ids].sort(
      (a, b) => others(a) - others(b) || mine(b) - mine(a) || b - a,
    )[0],
    next = structuredClone(s),
    take = [];
  // The rest of the colour comes from the other bottles, highest units first,
  // from the bottles with the least other liquid first.
  let need = 4 - Math.min(4, mine(elim));
  for (const id of ids
    .filter((id) => id !== elim && mine(id))
    .sort((a, b) => others(a) - others(b) || b - a)) {
    const w = s.water[id];
    for (let i = w.length - 1; i >= 0 && need > 0; i--)
      if (w[i] === color) {
        take.push({ id, index: i });
        need--;
      }
    if (!need) break;
  }
  for (const { id, index } of [...take].sort((a, b) => b.index - a.index))
    next.water[id].splice(index, 1);
  // Its other liquid goes on top of the others, top unit first.
  const moveOut = [];
  s.water[elim].forEach((c, index) => {
    if (c !== color) moveOut.unshift({ index, color: c });
  });
  for (const m of moveOut) {
    const top = (id) => next.water[id].at(-1);
    m.to = ids
      .filter((id) => id !== elim && next.water[id].length < 4)
      .sort(
        (a, b) =>
          (top(b) === m.color) - (top(a) === m.color) ||
          next.water[a].length - next.water[b].length,
      )[0];
    next.water[m.to].push(m.color);
  }
  delete next.water[elim];
  next.slots[next.slots.indexOf(elim)] = null;
  return { color, elim, take, moveOut, state: next };
}
