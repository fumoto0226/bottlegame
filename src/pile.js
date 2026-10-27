import * as T from "three";
// Bottles lying in a heap. Each one is dropped straight down, in order, onto the
// ground and the bottles already there, and rests at the pitch that keeps its
// centre lowest. Removing a bottle re-drops the rest, so anything that leaned on
// it falls. A bottle can be picked when at least 90% of its visible surface is
// unobstructed from the heap camera. Bottles are two capsules (body + neck).
const CAPSULES = [
  { a: 0.48, b: 1.78, r: 0.5 },
  { a: 2.2, b: 2.62, r: 0.24 },
];
const ANCHOR = 1.3,
  REACH = 1.45,
  PITCHES = [];
for (let d = -24; d <= 24; d += 3) PITCHES.push((d * Math.PI) / 180);
/**
 * Shared with the view: 62° top-down camera looking at (0, 0, -0.3), placed so
 * one ground unit is `px` screen pixels. Smaller heaps get a closer camera.
 */
export function heapCamera(px = 34, tiltDeg = 62) {
  const tilt = (tiltDeg * Math.PI) / 180,
    distance = 780 / (2 * px * Math.tan((15 * Math.PI) / 180));
  return {
    tilt,
    distance,
    target: [0, 0, -0.3],
    position: [0, distance * Math.sin(tilt), -0.3 + distance * Math.cos(tilt)],
  };
}
const FREE_COVERAGE = 0.1;
const Y = new T.Vector3(0, 1, 0),
  Z = new T.Vector3(0, 0, 1);

// Squared distance between segments p1-q1 and p2-q2 (plain numbers, no allocation).
function segDist2(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x,
    d1y = q1y - p1y,
    d1z = q1z - p1z,
    d2x = q2x - p2x,
    d2y = q2y - p2y,
    d2z = q2z - p2z,
    rx = p1x - p2x,
    ry = p1y - p2y,
    rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z,
    e = d2x * d2x + d2y * d2y + d2z * d2z,
    f = d2x * rx + d2y * ry + d2z * rz,
    c = d1x * rx + d1y * ry + d1z * rz,
    b = d1x * d2x + d1y * d2y + d1z * d2z,
    den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }
  const x = rx + d1x * s - d2x * t,
    y = ry + d1y * s - d2y * t,
    z = rz + d1z * s - d2z * t;
  return x * x + y * y + z * z;
}
function capsulesAt(x, h, z, ax, ay, az) {
  return CAPSULES.map(({ a, b, r }) => [
    x + ax * (a - ANCHOR),
    h + ay * (a - ANCHOR),
    z + az * (a - ANCHOR),
    x + ax * (b - ANCHOR),
    h + ay * (b - ANCHOR),
    z + az * (b - ANCHOR),
    r,
  ]);
}
/**
 * Highest height offset at which capsule c (moved up by h) still touches o.
 * Distance under a translation is convex, so contact is a single interval.
 */
function contactTop(c, o) {
  const R2 = (c[6] + o[6]) ** 2;
  // Moving c up or down never brings it closer than it is seen from above:
  // apart in plan means no contact at any height (same answer, much sooner).
  if (segDist2(c[0], 0, c[2], c[3], 0, c[5], o[0], 0, o[2], o[3], 0, o[5]) >= R2)
    return -Infinity;
  const [o0, o1, o2, o3, o4, o5] = o,
    f = (h) => segDist2(c[0], c[1] + h, c[2], c[3], c[4] + h, c[5], o0, o1, o2, o3, o4, o5);
  let lo = -8,
    hi = 30;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3,
      m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  let a = (lo + hi) / 2;
  if (f(a) >= R2) return -Infinity;
  let b = 30;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (f(m) < R2) a = m;
    else b = m;
  }
  return b;
}
function seeded(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/** entries: [{id, x, z, yaw (deg), order}] in ground units → id → pose */
// Lowest resting height and pitch for a bottle dropped at (x, z).
function rest(x, z, yaw, placed) {
  const near = placed.filter(
    (p) => Math.hypot(p.x - x, p.z - z) < 2 * REACH + 1.2,
  );
  let best = null;
  for (const p of PITCHES) {
    const ax = Math.cos(p) * Math.cos(yaw),
      ay = Math.sin(p),
      az = -Math.cos(p) * Math.sin(yaw);
    let h = 0;
    for (const c of CAPSULES)
      for (const t of [c.a, c.b]) h = Math.max(h, c.r - (t - ANCHOR) * ay);
    const caps = capsulesAt(x, 0, z, ax, ay, az);
    for (const other of near)
      for (const c of caps)
        for (const o of other.caps) h = Math.max(h, contactTop(c, o));
    const score = h + Math.abs(p) * 0.004;
    if (!best || score < best.score) best = { score, p, h, ax, ay, az, x, z };
  }
  return best;
}
/**
 * entries: [{id, x, z, yaw (deg), order}] in ground units → id → pose.
 * slide (decoration only): try spots up to that far around the drop point and
 * keep the lowest, as if the bottle rolled off whatever it landed on.
 */
export function settlePile(entries, slide = 0, restCache = null) {
  const placed = [],
    poses = new Map();
  const order = [...entries].sort((a, b) => a.order - b.order || a.id - b.id);
  let prefix = "";
  for (let e of order) {
    const yaw = (e.yaw * Math.PI) / 180;
    // Removing a top bottle leaves every unchanged lower prefix identical.
    // Cache only within one level's geometry, never across edited layouts.
    prefix += `${e.id},`;
    let best = restCache?.get(prefix);
    if (!best) {
      best = rest(e.x, e.z, yaw, placed);
      if (!slide) restCache?.set(prefix, best);
    }
    if (slide)
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + e.id,
          d = slide * (0.5 + 0.5 * (k % 2)),
          r = rest(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, yaw, placed);
        if (r.score < best.score - 0.05) best = r;
      }
    place(e, best, placed, poses);
  }
  return poses;
}
function place(e, best, placed, poses) {
  const yaw = (e.yaw * Math.PI) / 180,
    x = best.x,
    z = best.z,
    axis = new T.Vector3(best.ax, best.ay, best.az),
    anchor = new T.Vector3(x, best.h + 0.002, z);
  placed.push({
    id: e.id,
    x,
    z,
    caps: capsulesAt(x, anchor.y, z, best.ax, best.ay, best.az),
  });
  const roll = seeded(e.id + 1) * Math.PI * 2;
  // upright → lay along +x → pitch → yaw; roll spins it around its own axis
  const q = new T.Quaternion()
    .setFromAxisAngle(Y, yaw)
    .multiply(new T.Quaternion().setFromAxisAngle(Z, best.p - Math.PI / 2))
    .multiply(new T.Quaternion().setFromAxisAngle(Y, roll));
  poses.set(e.id, {
    base: anchor.clone().addScaledVector(axis, -ANCHOR),
    quat: q,
    axis,
    anchor,
    yaw,
    order: placed.length,
    caps: placed.at(-1).caps,
  });
}
const NEAR = 2 * REACH + 1.2;
/**
 * The same result as settlePile, worked out from the heap before some bottles
 * left: a bottle's resting pose only depends on the earlier bottles near it
 * (rest()), so it is recomputed only when one of those left or moved.
 * Returns the poses and the ids whose pose changed.
 */
function resettle(entries, prev) {
  const order = [...entries].sort((a, b) => a.order - b.order || a.id - b.id),
    keep = new Set(entries.map((e) => e.id)),
    gone = [...prev.entries]
      .filter((e) => !keep.has(e.id))
      .map((e) => ({ ...e, x: prev.poses.get(e.id).anchor.x, z: prev.poses.get(e.id).anchor.z })),
    moved = new Set(),
    placed = [],
    poses = new Map();
  for (const e of order) {
    const old = prev.poses.get(e.id),
      near = (p) => Math.hypot(p.x - e.x, p.z - e.z) < NEAR,
      earlier = (g) => g.order < e.order || (g.order === e.order && g.id < e.id),
      dirty =
        gone.some((g) => earlier(g) && near(g)) ||
        placed.some((p) => moved.has(p.id) && near(p));
    if (!dirty) {
      placed.push({ id: e.id, x: old.anchor.x, z: old.anchor.z, caps: old.caps });
      poses.set(e.id, { ...old, order: placed.length });
      continue;
    }
    place(e, rest(e.x, e.z, (e.yaw * Math.PI) / 180, placed), placed, poses);
    const now = poses.get(e.id);
    if (
      now.anchor.distanceToSquared(old.anchor) > 0 ||
      now.quat.angleTo(old.quat) > 0
    )
      moved.add(e.id);
  }
  return { poses, moved, gone: gone.map((g) => g.id) };
}
// Squared distance from a point-to-camera segment to one capsule's axis.
const capDist2 = (px, py, pz, cx, cy, cz, c) =>
  segDist2(px, py, pz, cx, cy, cz, c[0], c[1], c[2], c[3], c[4], c[5]);
// Every surface sample of a bottle lies within this of its anchor, so any
// bottle that can hide part of it comes this close (plus its own radius) to
// the segment from the anchor to the camera.
const REACH_OUT = 1.45 + 0.5 + 0.01;
function mayHide(caps, anchor, cam) {
  return caps.some(
    (c) =>
      capDist2(anchor.x, anchor.y, anchor.z, cam[0], cam[1], cam[2], c) <
      (REACH_OUT + c[6]) ** 2,
  );
}
/**
 * Share of each bottle's camera-facing surface hidden behind other bottles,
 * and which bottles do the hiding (by share). With `prev` (the result for the
 * heap before some bottles left or moved) and `changed` (their caps, old and
 * new), a bottle no changed capsule could hide keeps its previous result.
 */
export function coverage(poses, camera = heapCamera(), prev = null, changed = null) {
  const cam = camera.position,
    [cx, cy, cz] = cam,
    out = new Map(),
    by = new Map(),
    all = [...poses.entries()];
  const u = new T.Vector3(),
    w = new T.Vector3(),
    n = new T.Vector3();
  for (const [id, pose] of all) {
    const { base, axis, anchor } = pose;
    if (
      prev?.cover.has(id) &&
      !changed.ids.has(id) &&
      !changed.caps.some((caps) => mayHide(caps, anchor, cam))
    ) {
      out.set(id, prev.cover.get(id));
      by.set(id, prev.by.get(id));
      continue;
    }
    // Only bottles near the line of sight can hide any of it (same order).
    const candidates = all.filter(
      ([oid, o]) => oid !== id && mayHide(o.caps, anchor, cam),
    );
    u.set(0, 1, 0).cross(axis);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    w.crossVectors(axis, u).normalize();
    let seen = 0,
      hidden = 0;
    const blockers = new Map();
    for (let t = 0.25; t < 2.65; t += 0.24) {
      const r = t < 2.05 ? 0.5 : 0.22;
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * Math.PI * 2;
        n.copy(u)
          .multiplyScalar(Math.cos(th))
          .addScaledVector(w, Math.sin(th));
        const px = base.x + axis.x * t + n.x * (r + 0.01),
          py = base.y + axis.y * t + n.y * (r + 0.01),
          pz = base.z + axis.z * t + n.z * (r + 0.01);
        if (n.x * (cx - px) + n.y * (cy - py) + n.z * (cz - pz) <= 0) continue;
        seen++;
        let blocker = null;
        for (const [oid, o] of candidates) {
          for (const c of o.caps)
            if (capDist2(px, py, pz, cx, cy, cz, c) < c[6] * c[6]) {
              blocker = oid;
              break;
            }
          if (blocker !== null) break;
        }
        if (blocker !== null) {
          hidden++;
          blockers.set(blocker, (blockers.get(blocker) ?? 0) + 1);
        }
      }
    }
    out.set(id, seen ? hidden / seen : 1);
    by.set(
      id,
      [...blockers]
        .filter(([, n]) => n / Math.max(1, seen) >= 0.03)
        .sort((a, b) => b[1] - a[1])
        .map(([oid]) => oid),
    );
  }
  return { cover: out, by };
}
/** A pose saved by scripts/build-home-heap.js, back as vectors. */
export function poseFromData(d) {
  return {
    base: new T.Vector3(...d.base),
    anchor: new T.Vector3(...d.anchor),
    axis: new T.Vector3(...d.axis),
    quat: new T.Quaternion(...d.quat),
    yaw: d.yaw,
    order: d.order,
    caps: d.caps,
  };
}
const caches = new WeakMap();
const restCaches = new WeakMap();
/** Bake the certified starting geometry, including reusable lower prefixes. */
export function prepareHeap(level) {
  const pile = level.bottles.filter(b => !b.hand).map(b => b.id);
  const heap = heapOf(level, pile);
  const owner = level.geometrySource ?? level;
  const rests = restCaches.get(owner);
  let prefix = "";
  return {
    key: [...pile].sort((a, b) => a - b).join(","),
    poses: [...heap.poses].map(([id, p]) => [id, {
      base: p.base.toArray(), anchor: p.anchor.toArray(), axis: p.axis.toArray(),
      quat: p.quat.toArray(), yaw: p.yaw, order: p.order, caps: p.caps,
    }]),
    cover: [...heap.cover], coveredBy: [...heap.coveredBy], free: [...heap.free],
    rests: level.bottles.filter(b => !b.hand).sort((a,b) => a.order-b.order || a.id-b.id)
      .map(b => { prefix += `${b.id},`; return [prefix, rests.get(prefix)]; }),
  };
}
/** The settled heap for the bottles still in the pile, with pickable ones. */
export function heapOf(level, pile) {
  // Offline colour-only variants may explicitly share an identical geometry.
  const owner = level.geometrySource ?? level;
  let cache = caches.get(owner);
  if (!cache) caches.set(owner, (cache = new Map()));
  const key = [...pile].sort((a, b) => a - b).join(",");
  let heap = cache.get(key);
  const prepared = level.preparedHeap;
  if (!heap && prepared?.key === key) {
    heap = {
      entries: level.bottles
        .filter((b) => !b.hand)
        .map((b) => ({ id: b.id, order: b.order, ...b.heap })),
      poses: new Map(prepared.poses.map(([id, pose]) => [id, poseFromData(pose)])),
      cover: new Map(prepared.cover), coveredBy: new Map(prepared.coveredBy),
      free: new Set(prepared.free),
    };
    restCaches.set(owner, new Map(prepared.rests));
    cache.set(key, heap);
  }
  if (!heap) {
    const entries = level.bottles
        .filter((b) => pile.includes(b.id))
        .map((b) => ({ id: b.id, order: b.order, ...b.heap })),
      camera = heapCamera(level.heapPx),
      // the smallest heap already worked out that still holds all of these
      parent = [...cache.values()]
        .filter((h) => h.entries && h.entries.length > entries.length &&
          entries.every((e) => h.poses.has(e.id)))
        .sort((a, b) => a.entries.length - b.entries.length)[0];
    let poses, cover, by;
    if (parent) {
      // Picking a bottle only disturbs what lay near it: rework just that.
      const r = resettle(entries, parent);
      const changed = {
        ids: r.moved,
        caps: [
          ...r.gone.map((id) => parent.poses.get(id).caps),
          ...[...r.moved].flatMap((id) => [parent.poses.get(id).caps, r.poses.get(id).caps]),
        ],
      };
      poses = r.poses;
      ({ cover, by } = coverage(poses, camera, { cover: parent.cover, by: parent.coveredBy }, changed));
    } else {
      let restCache = restCaches.get(owner);
      if (!restCache) restCaches.set(owner, (restCache = new Map()));
      if (restCache.size > 20000) restCache.clear();
      poses = settlePile(entries, 0, restCache);
      ({ cover, by } = coverage(poses, camera));
    }
    heap = {
      entries,
      poses,
      cover,
      coveredBy: by,
      free: new Set(
        [...cover].filter(([, c]) => c < FREE_COVERAGE).map(([id]) => id),
      ),
    };
    if (cache.size > 400) cache.clear();
    cache.set(key, heap);
  }
  return heap;
}
