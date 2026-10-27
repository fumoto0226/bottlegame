// Scan seeds for each level spec and report candidates: solvable (the solver
// never passes through a lost state), how many heap bottles start pickable,
// how tall the heap gets and the colour mix per bottle.
// usage: node scripts/pick-seeds.js [levelIndex] [maxSeed]
import { LEVEL_SPECS, buildLevel } from "../src/levels.js";
import { heapOf } from "../src/pile.js";
import { initial, solve } from "../src/rules.js";
const only = process.argv[2] === undefined ? null : Number(process.argv[2]),
  max = Number(process.argv[3] ?? 30);
for (const [i, spec] of LEVEL_SPECS.entries()) {
  if (only !== null && only !== i) continue;
  console.log(`Level ${i + 1}: ${spec.difficulty}`);
  for (let seed = 1; seed <= max; seed++) {
    let l;
    try {
      l = buildLevel({ ...spec, seed, procedural: true });
    } catch {
      continue;
    }
    const s = initial(l),
      heap = heapOf(l, s.pile),
      top = Math.max(...[...heap.poses.values()].map((p) => p.anchor.y)),
      kinds = l.bottles
        .filter((b) => !b.hand)
        .map((b) => new Set(b.colors).size)
        .join(""),
      r = solve(s, l, 60000);
    console.log(
      `  seed ${seed}: free ${heap.free.size}, top ${top.toFixed(1)}, ` +
        `solution ${r.path?.length ?? "none"} (${r.nodes} nodes), colours/bottle ${kinds}`,
    );
  }
}
