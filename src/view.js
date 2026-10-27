import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { VesselView, LIFT } from "./vendor/water-sort/render/vessel.ts";
import { Particles, Stream } from "./vendor/water-sort/render/fx.ts";
import { levelFor, spillAngle } from "./vendor/water-sort/render/shapes.ts";
import {
  hexToVec3,
  makeShadowTexture,
  SUN,
} from "./vendor/water-sort/render/materials.ts";
import { PALETTE } from "./vendor/water-sort/palette.ts";
import { heapCamera } from "./pile.js";
const TILT = (8 * Math.PI) / 180;
// Perspective camera whose look-at point lands on screen row `screenY` (lens shift),
// so a strip of the screen can be viewed straight on instead of from above.
function aimCamera(camera, target, tilt, distance, screenY) {
  camera.position
    .copy(target)
    .add(
      new T.Vector3(0, distance * Math.sin(tilt), distance * Math.cos(tilt)),
    );
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = screenY / 390 - 1;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
// A small, rounded four-point twinkle with a faint halo, drawn once.
let starTexture = null;
function makeStarTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"),
    halo = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  halo.addColorStop(0, "rgba(255,250,235,0.55)");
  halo.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, 128, 128);
  // Points joined by inward curves: soft tips, no hard spikes.
  const tip = 50,
    pull = 9;
  g.fillStyle = "#fffdf4";
  g.beginPath();
  g.moveTo(64, 64 - tip);
  g.quadraticCurveTo(64 + pull, 64 - pull, 64 + tip, 64);
  g.quadraticCurveTo(64 + pull, 64 + pull, 64, 64 + tip);
  g.quadraticCurveTo(64 - pull, 64 + pull, 64 - tip, 64);
  g.quadraticCurveTo(64 - pull, 64 - pull, 64, 64 - tip);
  g.fill();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
// Outline for pickable heap bottles: the glass's outer profile pushed out by
// a hair and drawn back-face only, so just a thin line shows at the edge.
const HALO_GAP = 0.028,
  HALO_ALPHA = 0.55;
let haloGeometry = null;
function makeHaloGeometry(shape) {
  const outer = [];
  for (const p of shape.glass) {
    outer.push(p);
    if (p.y >= shape.yTop - 1e-6) break;
  }
  const pts = outer.map((p) => new T.Vector2(p.x + HALO_GAP, p.y));
  pts.unshift(new T.Vector2(0, -HALO_GAP));
  return new T.LatheGeometry(pts, 48);
}
function addLights(scene, environment) {
  scene.environment = environment;
  scene.add(new T.HemisphereLight(0xdfe8ff, 0x1a1f2e, 1.6));
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  scene.add(key);
}
const rgb = PALETTE.map((c) => hexToVec3(c.hex)),
  WHITE = new T.Vector3(1, 1, 1);
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
};
// Adapter and choreography based on the authorized upstream Stage implementation.
export class View {
  constructor(host) {
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(24, 0.5, 0.1, 200);
    this.focus(390);
    // The heap has its own scene and a top-down camera, independent of the tray.
    this.pileScene = new T.Scene();
    this.pileCamera = new T.PerspectiveCamera(30, 0.5, 0.1, 200);
    this.aimHeap();
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.setSize(390, 780);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.autoClear = false;
    host.append(this.renderer.domElement);
    const pmrem = new T.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    addLights(this.scene, this.environment.texture);
    addLights(this.pileScene, this.environment.texture);
    this.shadowTex = makeShadowTexture();
    this.items = new Map();
    this.particles = new Particles(this.scene);
    this.streams = [];
    this.freeStreams = [];
    this.streamGeneration = 0;
    this.stars = [];
    this.time = 0;
    this.dt = 1 / 60;
    this.dirty = true;
    this.raycaster = new T.Raycaster();
    this.stats = { frames: 0, cpuTotal: 0, cpuMax: 0, layerBuilds: 0 };
  }
  /** Point the heap camera for a level (same camera the pick rule uses). */
  aimHeap(px, screenY = 340, tiltDeg = 62) {
    const c = heapCamera(px, tiltDeg);
    aimCamera(
      this.pileCamera,
      new T.Vector3(...c.target),
      c.tilt,
      c.distance,
      screenY,
    );
    this.dirty = true;
  }
  /** Centre the upright view on screen row y, seen from a slight 8° angle. */
  focus(y, px = 44) {
    const target = new T.Vector3(195 / px, (780 - y) / px, 0),
      distance = 780 / (2 * px * Math.tan((12 * Math.PI) / 180));
    aimCamera(this.camera, target, TILT, distance, y);
    this.dirty = true;
  }
  world(x, y, z = 0) {
    this.raycaster.setFromCamera(
      new T.Vector2(x / 195 - 1, 1 - y / 390),
      this.camera,
    );
    const r = this.raycaster.ray,
      depth = z / 480;
    return r.at((depth - r.origin.z) / r.direction.z, new T.Vector3());
  }
  create(id, pile = null) {
    const native = new VesselView("bottle", 4, 48, this.shadowTex);
    native.corkable = true;
    (pile ? this.pileScene : this.scene).add(native.group, native.shadow);
    const v = {
      id,
      native,
      g: native.group,
      x: 0,
      y: 0,
      z: 0,
      angle: 0,
      scale: 1,
      selected: false,
      water: [],
      lastWater: null,
      motion: false,
      poseDriven: false,
      capped: false,
      pile,
    };
    this.items.set(id, v);
    this.dirty = true;
    return v;
  }
  water(id, arr) {
    this.items.get(id).water = arr.map((color) => ({ color, volume: 1 }));
    this.dirty = true;
  }
  syncWater(v) {
    if (v.morph) {
      // Liquid drains or rises in place, unit by unit; phase 0 then phase 1.
      const t = v.morph.t,
        ease = (k) => k * k * (3 - 2 * k);
      v.native.layers = v.morph.units.map((u) => {
        const k = ease(Math.min(1, Math.max(0, t - u.phase)));
        return {
          color: u.color,
          rgb: rgb[u.color],
          vol: Math.max(0.0001, u.from + (u.to - u.from) * k),
          hidden: 0,
        };
      });
      v.lastWater = null;
      return;
    }
    if (v.flash) {
      // Units being cleared get layers of their own: they whiten, then shrink
      // away while the rest settles down over them.
      const { idx, k } = v.flash,
        white = Math.min(1, k / 0.45),
        gone = k < 0.5 ? 0 : (k - 0.5) / 0.5,
        layers = v.flash.colors.map((color, i) => {
          if (!idx.has(i)) return { color, rgb: rgb[color], vol: 1, hidden: 0 };
          return {
            color: -1 - i,
            rgb: rgb[color].clone().lerp(WHITE, white * 0.9),
            vol: Math.max(0.0001, 1 - gone * gone * (3 - 2 * gone)),
            hidden: 0,
          };
        });
      v.native.layers = layers;
      v.lastWater = null;
      return;
    }
    if (v.lastWater === v.water) return;
    const layers = [];
    for (const a of v.water) {
      if (a.volume <= 0.00001) continue;
      const last = layers.at(-1);
      if (last?.color === a.color) last.vol += a.volume;
      else
        layers.push({
          color: a.color,
          rgb: rgb[a.color],
          vol: a.volume,
          hidden: 0,
        });
    }
    v.native.layers = layers;
    v.lastWater = v.water;
    this.stats.layerBuilds++;
  }
  /**
   * Let a bottle's liquid change in place: units = [{color, from, to, phase}]
   * bottom-up, volumes in units. morphStep(t) runs phase 0 over t 0..1 and
   * phase 1 over t 1..2.
   */
  morph(id, units) {
    this.items.get(id).morph = { units, t: 0 };
    this.dirty = true;
  }
  morphStep(id, t) {
    const v = this.items.get(id);
    if (v?.morph) v.morph.t = t;
    this.dirty = true;
  }
  morphEnd(id, water) {
    const v = this.items.get(id);
    if (!v) return;
    v.morph = null;
    this.water(id, water);
    this.syncWater(v);
  }
  /** Start whitening the given units (indices from the bottom) of a bottle. */
  flashUnits(id, colors, indices) {
    const v = this.items.get(id);
    v.flash = { colors, idx: new Set(indices), k: 0, sparked: false };
    this.dirty = true;
  }
  flashStep(id, k) {
    const v = this.items.get(id);
    if (!v?.flash) return;
    v.flash.k = k;
    v.native.glow = Math.max(v.native.glow, 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.3)));
    if (k >= 0.5 && !v.flash.sparked) {
      // a pop of light where the units were
      v.flash.sparked = true;
      const n = v.native,
        mid =
          [...v.flash.idx].reduce((a, i) => a + i, 0) / v.flash.idx.size,
        y = n.pos.y + n.shape.yFloor + (mid + 0.5) * (n.shape.yFull - n.shape.yFloor) / 4,
        c = rgb[v.flash.colors[[...v.flash.idx][0]]];
      this.particles.burst(n.pos.x, y, n.pos.z + 0.3, [new T.Color(1, 1, 1), new T.Color(c.x, c.y, c.z)], 16, 0.55);
    }
    this.dirty = true;
  }
  /** Stop the whitening and show the bottle's liquid as it now is. */
  flashEnd(id, water) {
    const v = this.items.get(id);
    if (!v) return;
    v.flash = null;
    this.water(id, water);
    this.syncWater(v);
  }
  /** Screen rectangle (390x780 space) of a bottle lying in the heap. */
  pileRect(id) {
    const v = this.items.get(id),
      { base, axis } = v.pile;
    const toScreen = (p) => {
      const c = p.clone().project(this.pileCamera);
      return { x: (c.x + 1) * 195, y: (1 - c.y) * 390 };
    };
    const a = toScreen(base),
      b = toScreen(base.clone().addScaledVector(axis, 2.7)),
      mid = base.clone().addScaledVector(axis, 1.2),
      side = new T.Vector3()
        .setFromMatrixColumn(this.pileCamera.matrixWorld, 0)
        .multiplyScalar(0.5),
      m = toScreen(mid),
      thick = 2 * Math.hypot(
        toScreen(mid.clone().add(side)).x - m.x,
        toScreen(mid.clone().add(side)).y - m.y,
      );
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      length: Math.hypot(b.x - a.x, b.y - a.y) + thick * 0.2,
      thick,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }
  /** Let a heap bottle fall to its newly settled pose. */
  settle(id, pose) {
    const v = this.items.get(id);
    if (!v?.pile) return;
    const now = v.pileNow ?? v.pile;
    if (
      !v.pileFrom &&
      now.anchor.distanceTo(pose.anchor) < 1e-3 &&
      now.quat.angleTo(pose.quat) < 1e-3
    ) {
      v.pile = pose;
      return;
    }
    const drop = Math.max(0.05, now.anchor.y - pose.anchor.y);
    v.pileFrom = now;
    v.pile = pose;
    v.pileT = 0;
    v.pileDur = Math.min(0.5, Math.sqrt((2 * drop) / 26) + 0.06);
    this.dirty = true;
  }
  /**
   * Start flying a heap bottle toward its tray slot, still in the heap scene:
   * it ends standing upright, facing the heap camera, where the tray bottle
   * will appear (screen point sx, sy = middle of the slot bottle) at the
   * tray's size (trayPx screen pixels per unit).
   */
  flyStart(id, sx, sy, trayPx) {
    const v = this.items.get(id);
    if (!v?.pile) return;
    const cam = this.pileCamera,
      forward = cam.getWorldDirection(new T.Vector3());
    this.raycaster.setFromCamera(new T.Vector2(sx / 195 - 1, 1 - sy / 390), cam);
    const ray = this.raycaster.ray,
      depth = 780 / (2 * trayPx * Math.tan((cam.fov / 2) * (Math.PI / 180))),
      anchor = ray.at(depth / ray.direction.dot(forward), new T.Vector3()),
      up = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    v.fly = {
      from: v.pileNow ?? v.pile,
      to: { anchor, axis: up, quat: cam.quaternion.clone() },
      up,
      k: 0,
    };
    v.pileFrom = v.pileNow = v.jig = null;
    // Fly over everything else in the heap.
    v.native.liquid.renderOrder = 4001;
    v.native.liquidFringe.renderOrder = 4002;
    v.native.glass.renderOrder = 4003;
    this.dirty = true;
  }
  /** Take a bottle out of the heap and stand it up in the tray scene. */
  toTray(id) {
    const v = this.items.get(id);
    if (!v.pile) return;
    this.pileScene.remove(v.g, v.native.shadow);
    this.scene.add(v.g, v.native.shadow);
    v.pile = v.pileFrom = v.pileNow = v.jig = v.fly = null;
    v.free = false;
    if (v.halo) {
      v.g.remove(v.halo);
      v.halo.material.dispose();
      v.halo = null;
    }
    v.g.rotation.set(0, 0, 0);
    v.native.shadow.rotation.set(-Math.PI / 2, 0, 0);
    v.native.rot = 0;
    v.native.liquid.renderOrder = 1;
    v.native.liquidFringe.renderOrder = 2;
    v.native.glass.renderOrder = 3;
    v.native.glassMat.uniforms.uTintAmt.value = 0.04;
    v.initialized = false;
    this.dirty = true;
  }
  setPile(v, dt) {
    const n = v.native;
    let p = v.pile;
    if (v.pileFrom) {
      // Falls with gravity (ease-in) and turns into its new resting pitch.
      v.pileT = Math.min(1, v.pileT + dt / v.pileDur);
      const k = v.pileT,
        g = k * k,
        a = v.pileFrom;
      p = {
        ...v.pile,
        base: a.base.clone().lerp(v.pile.base, g),
        anchor: a.anchor.clone().lerp(v.pile.anchor, g),
        axis: a.axis.clone().lerp(v.pile.axis, g).normalize(),
        quat: a.quat.clone().slerp(v.pile.quat, g),
      };
      v.pileNow = p;
      if (k >= 1) v.pileFrom = v.pileNow = null;
    }
    if (v.jig) {
      // Two short tugs: lift a little and twist about its middle, settle back.
      v.jig.t += dt;
      const k = Math.max(0, v.jig.t / 0.42);
      if (k >= 1) v.jig = null;
      else {
        const fade = 1 - k,
          lift = 0.22 * v.jig.amp * Math.abs(Math.sin(2 * Math.PI * k)) * fade,
          twist = new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            0.1 * v.jig.amp * Math.sin(4 * Math.PI * k) * fade,
          ),
          up = new T.Vector3(0, lift, 0),
          anchor = p.anchor.clone().add(up);
        p = {
          ...p,
          anchor,
          base: p.base
            .clone()
            .sub(p.anchor)
            .applyQuaternion(twist)
            .add(anchor),
          quat: twist.clone().multiply(p.quat),
        };
      }
    }
    if (v.fly) {
      // Lifts off in an arc toward the slot while turning upright.
      const { from: a, to: b, up, k } = v.fly,
        anchor = a.anchor
          .clone()
          .lerp(b.anchor, k)
          .addScaledVector(up, 0.9 * Math.sin(Math.PI * k)),
        axis = a.axis.clone().lerp(b.axis, k).normalize(),
        quat = a.quat.clone().slerp(b.quat, k);
      p = {
        ...p,
        anchor,
        axis,
        quat,
        base: anchor.clone().addScaledVector(axis, -1.3),
        flying: k,
      };
    }
    n.animated = true;
    n.pos.copy(p.base);
    n.rot = 0;
    if (!v.initialized && !v.fly) {
      n.resetMotion();
      // Draw the heap bottom-up and frost the glass a little, so a bottle
      // lying on top still reads as covering the ones below, even when empty.
      n.liquid.renderOrder = p.order * 4 + 1;
      n.liquidFringe.renderOrder = p.order * 4 + 2;
      n.glass.renderOrder = p.order * 4 + 3;
      n.glassMat.uniforms.uTintAmt.value = 0.16;
      v.initialized = true;
    }
    n.group.scale.setScalar(Math.max(0.0001, v.scale));
    n.dim = n.dimTarget = 1;
    n.glow = n.glowTarget = 0;
    if (!v.halo) {
      haloGeometry ??= makeHaloGeometry(n.shape);
      v.halo = new T.Mesh(
        haloGeometry,
        new T.MeshBasicMaterial({
          color: 0xa8dcff,
          transparent: true,
          opacity: 0,
          side: T.BackSide,
          blending: T.AdditiveBlending,
          depthWrite: false,
        }),
      );
      // after the liquid, so the shell's far side is hidden behind it
      v.halo.renderOrder = v.pile.order * 4 + 3;
      n.group.add(v.halo);
      v.haloA = v.free ? 1 : 0;
    }
    // A bottle that becomes free lights up gently instead of at once.
    const want = v.free ? 1 : 0;
    v.haloA += Math.sign(want - v.haloA) * Math.min(Math.abs(want - v.haloA), dt / 0.4);
    v.halo.material.opacity = HALO_ALPHA * v.haloA;
    v.halo.visible = v.haloA > 0.001;
    this.syncWater(v);
    n.setSun(SUN.value, this.time);
    n.update(dt, this.time);
    // Lying down: the liquid stays frozen in bands along the bottle.
    n.group.quaternion.copy(p.quat);
    n.group.updateMatrixWorld();
    const u = n.liquidMat.uniforms;
    u.uO.value.setFromMatrixPosition(n.group.matrixWorld);
    u.uInvModel.value.copy(n.group.matrixWorld).invert();
    u.uN.value.copy(p.axis);
    const s = n.shadow;
    s.position.set(p.anchor.x, 0.004, p.anchor.z);
    s.rotation.set(-Math.PI / 2, 0, p.yaw);
    s.scale.set(3.2 * v.scale, 1.25 * v.scale, 1);
    s.material.opacity = Math.max(0.12, 0.55 - p.anchor.y * 0.2) * v.scale;
    // A bottle on its way to the tray has left the ground: no shadow.
    s.visible = v.g.visible && v.scale > 0.05 && !v.fly;
  }
  set(v, dt = this.dt) {
    if (v.pile) return this.setPile(v, dt);
    const n = v.native;
    if (!v.poseDriven) {
      n.base.copy(this.world(v.x, v.y, v.z));
      if (!v.initialized) {
        n.pos.copy(n.base);
        n.rot = v.angle;
        n.resetMotion();
        v.initialized = true;
      }
      n.animated = v.motion;
      if (v.motion) {
        n.pos.copy(n.base);
        n.rot = v.angle;
      }
      n.liftTarget = v.selected ? LIFT : 0;
    }
    n.group.scale.setScalar(Math.max(0.0001, v.scale));
    n.dim = n.dimTarget = 1;
    n.glowTarget = v.selected ? 0.55 : 0;
    this.syncWater(v);
    n.setSun(SUN.value, this.time);
    n.update(dt, this.time);
    n.shadow.visible = v.g.visible && v.scale > 0.05;
  }
  get active() {
    return (
      this.dirty ||
      this.particles.alive ||
      this.stars.length > 0 ||
      [...this.items.values()].some(
        (v) =>
          v.g.visible &&
          // A resting heap bottle is drawn with a fixed pose and needs no frames.
          (v.pile
            ? !!(v.pileFrom || v.jig) ||
              (v.halo && v.haloA !== (v.free ? 1 : 0))
            : v.motion || v.poseDriven || v.native.active),
      )
    );
  }
  render(dt = 16.667, draw = true) {
    const begin = performance.now();
    this.dt = Math.min(dt / 1000, 0.05);
    this.time += this.dt;
    SUN.value =
      0.55 * Math.sin(this.time * 0.12) +
      0.22 * Math.sin(this.time * 0.29 + 1.3);
    for (const v of this.items.values()) if (v.g.visible) this.set(v);
    for (const stream of this.streams)
      stream.mat.uniforms.uTime.value = this.time;
    this.particles.update(this.dt);
    this.updateStars();
    if (draw) {
      this.renderer.clear();
      this.renderer.render(this.pileScene, this.pileCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
      const cpu = performance.now() - begin;
      this.stats.frames++;
      this.stats.cpuTotal += cpu;
      this.stats.cpuMax = Math.max(this.stats.cpuMax, cpu);
    }
    this.dirty = false;
  }
  reset() {
    for (const v of this.items.values()) {
      (v.pile ? this.pileScene : this.scene).remove(v.g, v.native.shadow);
      v.native.dispose();
    }
    this.items.clear();
    this.particles.clear();
    for (const s of this.stars) this.scene.remove(s.sprite);
    this.stars = [];
    this.stopStream();
    this.dirty = true;
  }
  seal(id, animate = true) {
    const v = this.items.get(id);
    this.syncWater(v);
    v.capped = true;
    v.native.complete = true;
    v.native.showCork(animate);
    v.native.glow = 1;
    this.dirty = true;
  }
  /** A band of light sweeps up the sealed bottle, bottom to top. */
  shine(id) {
    const n = this.items.get(id).native;
    n.stopGlint();
    n.glint();
    n.glow = 1;
    this.dirty = true;
  }
  /** A few small stars twinkle, one after another, at the bottle's upper right. */
  sparkle(id) {
    const n = this.items.get(id).native;
    starTexture ??= makeStarTexture();
    for (const [dx, dy, size, delay] of [
      [0.42, 0.98, 0.62, 0],
      [0.72, 0.8, 0.42, 0.07],
      [0.3, 0.72, 0.34, 0.13],
    ]) {
      const star = new T.Sprite(
        new T.SpriteMaterial({
          map: starTexture,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: T.AdditiveBlending,
          opacity: 0,
        }),
      );
      star.position.set(
        n.pos.x + dx,
        n.pos.y + n.height * dy,
        n.pos.z + 0.6,
      );
      star.scale.setScalar(0.0001);
      star.renderOrder = 20;
      this.scene.add(star);
      this.stars.push({ sprite: star, t: -delay / 0.34, size });
    }
    this.dirty = true;
  }
  updateStars() {
    for (const s of this.stars) {
      s.t = Math.min(1, s.t + this.dt / 0.34);
      if (s.t < 0) continue;
      // Quick twinkle: opens, turns a touch, closes.
      const grow = Math.sin(Math.PI * s.t),
        size = s.size * grow;
      s.sprite.scale.set(size, size, 1);
      s.sprite.material.rotation = s.t * 0.5;
      s.sprite.material.opacity = Math.min(1, grow * 1.5);
    }
    for (const s of this.stars.filter((s) => s.t >= 1)) {
      this.scene.remove(s.sprite);
      s.sprite.material.dispose();
    }
    this.stars = this.stars.filter((s) => s.t < 1);
  }
  /**
   * Streamers fly up out of the finished bottle, mostly in its own colour
   * (or the colour given, e.g. the one auto-clear just took out of it).
   */
  burst(id, color) {
    const v = this.items.get(id),
      n = v.native,
      own =
        rgb[color ?? n.layers.find((l) => l.color >= 0)?.color ?? 0] ?? rgb[0],
      palette = rgb.map((c) => new T.Color(c.x, c.y, c.z)),
      mine = new T.Color(own.x, own.y, own.z),
      y = n.pos.y + n.height * 0.8;
    for (let i = 0; i < 60; i++) {
      const a = (Math.random() - 0.5) * 2.2,
        sp = 3 + Math.random() * 2.6;
      this.particles.confetti.add({
        x: n.pos.x + (Math.random() - 0.5) * 0.4,
        y,
        z: n.pos.z + 0.5,
        vx: Math.sin(a) * sp * 0.75,
        vy: Math.cos(a) * sp,
        vz: (Math.random() - 0.5) * 1.2,
        life: 0,
        max: 1.1 + Math.random() * 0.6,
        size: 0.15 + Math.random() * 0.11,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: 5 + Math.random() * 8,
        color: i % 2 ? mine : palette[i % palette.length],
      });
    }
    this.particles.burst(n.pos.x, y, n.pos.z, [mine], 14, 0.7);
  }
  /** A heap bottle tugs against whatever lies on it (amp 1), or is nudged (smaller). */
  jiggle(id, amp = 1, delay = 0) {
    const v = this.items.get(id);
    if (!v?.pile) return;
    v.jig = { t: -delay, amp };
    this.dirty = true;
  }
  stopStream() {
    this.streamGeneration++;
    for (const stream of this.streams) stream.hide();
    this.freeStreams = [...this.streams];
    this.dirty = true;
  }
  acquireStream() {
    let stream = this.freeStreams.pop();
    if (!stream) {
      stream = new Stream(this.scene);
      this.streams.push(stream);
    }
    return { stream, generation: this.streamGeneration };
  }
  releaseStream(lease) {
    if (lease.generation !== this.streamGeneration) return;
    lease.stream.hide();
    if (!this.freeStreams.includes(lease.stream))
      this.freeStreams.push(lease.stream);
  }
  async pour(from, to, amount, color, tween) {
    const lease = this.acquireStream(),
      stream = lease.stream;
    try {
      const a = this.items.get(from),
        b = this.items.get(to);
      this.set(a, 0);
      this.set(b, 0);
      const src = a.native,
        dst = b.native,
        shape = src.shape;
      a.selected = false;
      a.poseDriven = true;
      src.animated = true;
      src.glowTarget = 0;
      const dstVol0 = dst.totalVolume,
        v0 = src.totalVolume,
        dir = dst.base.x > src.base.x ? 1 : -1;
      const mouth = new T.Vector3(
        dst.base.x,
        dst.base.y + dst.height + 0.3,
        dst.base.z,
      );
      // Project the target mouth to the upstream foreground plane.
      const ray = mouth.clone().sub(this.camera.position).normalize();
      const L = this.camera.position
        .clone()
        .addScaledVector(ray, (1.25 - this.camera.position.z) / ray.z);
      const lip = new T.Vector3(
        dir * shape.rLipOuter * 0.92,
        shape.yTop - 0.005,
        0,
      );
      const poseFor = (phi, out) => {
        const rot = -dir * phi,
          c = Math.cos(rot),
          s = Math.sin(rot);
        out.set(
          L.x - (lip.x * c - lip.y * s),
          L.y - (lip.x * s + lip.y * c),
          L.z,
        );
        return rot;
      };
      const start = src.pos.clone(),
        startRot = src.rot,
        approach = new T.Vector3();
      const approachRot = poseFor(spillAngle(shape, v0) - 0.02, approach);
      const lead = 0.3 + Math.min(0.12, start.distanceTo(approach) * 0.012),
        duration = 0.26 + 0.13 * amount,
        travel = 0.07;
      await tween(lead * 1000, (k) => {
        const e = ease.inOut(k);
        src.pos.lerpVectors(start, approach, e);
        src.pos.y += Math.sin(Math.PI * k) * 0.25;
        src.rot =
          startRot +
          (approachRot - startRot) * ease.inOut(Math.min(1, k * 1.08));
      });
      const topLayer = src.layers.at(-1),
        topVol = topLayer.vol;
      let dstLayer = null,
        dstLayerVol = 0;
      const top = new T.Vector3(),
        bottom = new T.Vector3();
      let splash = 0;
      await tween((duration + travel) * 1000, (k) => {
        const t = k * (duration + travel),
          pk = Math.min(1, t / duration),
          flowed = amount * ease.inOut(pk);
        topLayer.vol = Math.max(0, topVol - flowed);
        src.rot = poseFor(
          spillAngle(shape, Math.max(v0 - flowed, 0.2)) +
            0.05 +
            0.04 * Math.sin(Math.PI * pk),
          src.pos,
        );
        src.update(0, this.time);
        top.copy(lip).applyMatrix4(src.group.matrixWorld);
        const arrived = Math.max(0, Math.min(1, (t - travel) / duration)),
          inDst = amount * ease.inOut(arrived);
        if (t >= travel && !dstLayer) {
          dstLayer = dst.ensureTopLayer(color);
          dstLayerVol = dstLayer.vol;
        }
        if (dstLayer) dstLayer.vol = dstLayerVol + inDst;
        bottom.copy(dst.pos);
        bottom.y += levelFor(dst.shape, dstVol0 + inDst, 1, 0);
        const head = Math.min(1, t / travel),
          tail = Math.max(0, (t - duration) / travel);
        stream.set(
          new T.Vector3().lerpVectors(top, bottom, tail),
          new T.Vector3().lerpVectors(top, bottom, head),
          0.055 * (1 - tail * 0.5) * Math.min(1, head * 3),
          rgb[color],
        );
        if (head >= 1 && tail < 1 && ++splash % 2 === 0) {
          this.particles.splash(
            bottom.x,
            bottom.y + 0.01,
            bottom.z,
            new T.Color(PALETTE[color].hex),
            2,
          );
          dst.agit = Math.min(0.05, dst.agit + 0.004);
          if (splash % 6 === 0)
            this.particles.bubble(
              dst.pos.x + (Math.random() - 0.5) * 0.4,
              dst.pos.y + 0.1,
              dst.pos.z + 0.25,
              bottom.y - 0.03,
            );
        }
      });
      stream.hide();
      if (topLayer.vol <= 0.001) src.layers.pop();
      dst.kick((Math.random() - 0.5) * 2, 1.5);
      const retRot = src.rot,
        half = shape.yTop * 0.5;
      const midFrom = new T.Vector3(
        src.pos.x - half * Math.sin(retRot),
        src.pos.y + half * Math.cos(retRot),
        src.pos.z,
      );
      const home = this.world(a.x, a.y, a.z),
        midTo = home.clone().add(new T.Vector3(0, half, 0)),
        mid = new T.Vector3();
      src.lift = 0;
      src.liftTarget = 0;
      await tween(360, (k) => {
        src.rot = retRot * (1 - ease.out(Math.min(1, k * 1.15)));
        mid.lerpVectors(midFrom, midTo, ease.inOut(k));
        mid.y += Math.sin(Math.PI * k) * 0.12;
        src.pos.set(
          mid.x + half * Math.sin(src.rot),
          mid.y - half * Math.cos(src.rot),
          mid.z,
        );
      });
      a.poseDriven = false;
      src.animated = false;
      src.rot = 0;
      src.kick(-dir * 1.2, 0.3);
      this.dirty = true;
    } finally {
      this.releaseStream(lease);
    }
  }
}
