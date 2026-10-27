import { levels } from "../src/levels.js";
import { initial, solve, apply, won, moves } from "../src/rules.js";
import fs from "node:fs";
const reports = levels.map((l, i) => {
  const r = solve(initial(l), l);
  if (!r.path) throw Error(`Level ${i + 1} unsolved`);
  let s = initial(l);
  for (const m of r.path) {
    if (!moves(s, l).some((x) => JSON.stringify(x) === JSON.stringify(m)))
      throw Error("illegal");
    s = apply(s, m);
  }
  if (!won(s)) throw Error("not won");
  console.log(`Level ${i + 1}: ${r.path.length} moves, ${r.nodes} nodes`);
  return { level: i + 1, ...r };
});
fs.writeFileSync("docs/solutions.json", JSON.stringify(reports, null, 2));

// The daily challenge is constructed offline and carries a full witness. A
// 120-bottle solve exceeds the small-level default depth; replay the witness
// against the real geometry and loss rules instead of trusting its existence.
const {dailyForDate} = await import('../src/daily.js');
const {replay} = await import('./lib/level-metrics.js');
for (let challenge = 0; challenge < 2; challenge++) {
  const suffix = challenge ? '-2' : '';
  const daily = JSON.parse(fs.readFileSync(`docs/daily-solution${suffix}.json`, 'utf8'));
  replay(dailyForDate('2026-10-26', challenge), daily.path);
  console.log(`Challenge ${challenge + 1}: ${daily.path.length} legal moves, won`);
}
