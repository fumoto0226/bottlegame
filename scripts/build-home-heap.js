// Precompute the decorative heap on the home screen: settling it takes too
// long to do on a phone at startup.
// usage: node scripts/build-home-heap.js [count] [seed]
import fs from "node:fs";
import { settlePile } from "../src/pile.js";
const count = Number(process.argv[2] ?? 45),
  rnd = (() => {
    let s = Number(process.argv[3] ?? 11);
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  })();
// A rounded mound: each layer is dropped over a narrower patch than the one
// below, and each bottle rolls to the lowest spot nearby (slide), so it reads
// as a natural heap that is low at the sides and high in the middle.
const LAYERS = [0.3, 0.25, 0.2, 0.14, 0.08, 0.03],
  entries = [];
LAYERS.forEach((share, layer) => {
  const n =
      layer === LAYERS.length - 1
        ? count - entries.length
        : Math.round(count * share),
    rx = 3.6 * (1 - layer * 0.15),
    rz = 1.9 * (1 - layer * 0.15);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rnd()),
      a = rnd() * Math.PI * 2;
    entries.push({
      id: entries.length,
      order: entries.length,
      x: r * Math.cos(a) * rx,
      z: r * Math.sin(a) * rz,
      // mostly side-on to the viewer, so the colour bands show
      yaw: Math.round((rnd() < 0.7 ? 0 : 90) + (rnd() - 0.5) * 70),
    });
  }
});
// Calm colours: one main colour per bottle with a single accent (3:1), now and
// then an even 2:2; main colours dealt round-robin so the heap stays balanced.
const deck = [...Array(count)].map((_, i) => i % 5);
for (let i = deck.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [deck[i], deck[j]] = [deck[j], deck[i]];
}
const colors = deck.map((main) => {
  const accent = (main + 1 + Math.floor(rnd() * 4)) % 5;
  if (rnd() < 0.25) return rnd() < 0.5 ? [main, main, accent, accent] : [main, accent, accent, main];
  const units = [main, main, main, main];
  units[Math.floor(rnd() * 4)] = accent;
  return units;
});
const poses = settlePile(entries, 1.4),
  round = (v) => Math.round(v * 1e4) / 1e4,
  out = entries.map((e) => {
    const p = poses.get(e.id);
    return {
      colors: colors[e.id],
      base: p.base.toArray().map(round),
      anchor: p.anchor.toArray().map(round),
      axis: p.axis.toArray().map(round),
      quat: p.quat.toArray().map(round),
      yaw: round(p.yaw),
      order: p.order,
    };
  });
fs.writeFileSync("src/home-heap.json", JSON.stringify(out));
const top = Math.max(...out.map((b) => b.anchor[1]));
console.log(`${count} bottles, top ${top.toFixed(1)} → src/home-heap.json`);
