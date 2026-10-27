import "./style.css";
import { View } from "./view.js";
import { Session } from "./session.js";
import { levels, colorNames } from "./levels.js";
import { dailyForDate, DAILY_CHALLENGES } from "./daily.js";
import { heapOf, poseFromData } from "./pile.js";
import homeHeap from "./home-heap.json";
import {
  initial,
  available,
  amount,
  apply,
  complete,
  won,
  lost,
  solve,
  autoClear,
} from "./rules.js";
const $ = (s) => document.querySelector(s),
  app = $("#app");
const outline =
  '<svg viewBox="0 0 64 130" aria-hidden="true"><path d="M24 5H40V20Q40 24 46 29L53 35Q55 37 55 43V116Q55 123 48 123H16Q9 123 9 116V43Q9 37 11 35L18 29Q24 25 24 20Z"/></svg>';
app.innerHTML = `<main class="game"><div class="backdrop"></div><div id="scene"></div>
<section id="home-screen"><h1 class="home-title" aria-label="瓶子堆整理大师"><span class="big">瓶子堆</span><span class="small">整理大师</span></h1><button id="choose" class="gbtn purple big home-choose">关卡模式</button><button id="daily" class="gbtn green big home-daily"><span>羊了个羊模式</span><small>（高难度挑战）</small></button></section>
<section id="select-screen" hidden><button id="select-back" class="gbtn glass round" aria-label="返回主页面">‹</button><h2>关卡模式</h2><div class="level-grid">${levels.map((_, i) => `<button class="level-number" data-level="${i}">${String(i + 1).padStart(3, "0")}</button>`).join("")}</div></section>
<header id="game-header" hidden><button id="home" class="gbtn glass round" aria-label="返回关卡模式">‹</button><div class="plate"><strong id="level"></strong></div><button id="restart" class="gbtn glass round" aria-label="重新开始">↻</button></header>
<div id="progress" hidden>整理进度 <b id="progress-done">0</b>/<span id="progress-total">0</span></div><div id="daily-note" hidden>本关已验证有解 · 放心挑战</div>
<div id="targets" hidden></div><div id="slots" hidden aria-label="五个瓶子位置">${[0, 1, 2, 3, 4].map((i) => `<div class="bottle-slot" style="left:${29 + i * 70}px">${outline}</div>`).join("")}</div><button id="auto" hidden role="switch" aria-checked="false"><i aria-hidden="true"></i>自动消除<small>手里凑满 4 份同色就消掉</small></button><div id="message" hidden role="status" aria-live="polite"></div><div id="modal" hidden></div></main>`;
const game = $(".game");
let view;
try {
  view = new View($("#scene"));
} catch {
  $("#home-screen").innerHTML =
    "<p>无法启动 3D，请开启浏览器硬件加速后刷新。</p>";
  throw Error("WebGL unavailable");
}
let screen = "home",
  levelIndex = 0,
  session = new Session(levels[0]),
  selected = null,
  epoch = 0,
  jobs = [],
  movesMade = 0,
  history = [];
let dailyLevel, dailyIndex = 0;
const currentLevel = () => levelIndex === -1 ? dailyLevel : levels[levelIndex];
const backFromGame = () => levelIndex === -1 ? select("daily") : select();
const buttons = new Map(),
  slotX = (i) => 55 + i * 70,
  TRAY_PX = 36;
function resize() {
  const s = Math.min((innerWidth - 12) / 390, (innerHeight - 12) / 780, 1);
  game.style.width = `${390 * s}px`;
  game.style.height = `${780 * s}px`;
  game.style.setProperty("--scale", s);
  view.dirty = true;
}
addEventListener("resize", resize);
resize();
function cancel() {
  epoch++;
  pending = null;
  session.cancel();
  for (const j of jobs)
    j.reject(new DOMException("Animation cancelled", "AbortError"));
  jobs = [];
  view.stopStream();
}
function tween(ms, fn) {
  view.dirty = true;
  return new Promise((resolve, reject) =>
    jobs.push({ ms, t: 0, fn, resolve, reject }),
  );
}
function tick(dt, draw = true) {
  for (const j of [...jobs]) {
    j.t = Math.min(j.ms, j.t + dt);
    j.fn(j.t / j.ms);
    if (j.t === j.ms) {
      jobs = jobs.filter((x) => x !== j);
      j.resolve();
    }
  }
  view.render(dt, draw);
}
let last = performance.now();
function frame(now) {
  const dt = now - last;
  if (jobs.length || view.active || dt >= 33) {
    tick(Math.min(dt, 100));
    last = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.advanceTime = async (ms) => {
  for (let n = 0; n < ms; n += 16) {
    tick(Math.min(16, ms - n), false);
    await Promise.resolve();
  }
  view.render(0);
};
function message(text = "") {
  $("#message").textContent = text;
}
function showScreen(play, page = "home") {
  $("#home-screen").hidden = play || page !== "home";
  $("#select-screen").hidden = play || page !== "select";
  $("#game-header").hidden = !play;
  $("#daily-note").hidden = !play || levelIndex !== -1;
  $("#progress").hidden = !play;
  $("#targets").hidden = !play;
  $("#slots").hidden = !play;
  $("#message").hidden = !play;
  $("#auto").hidden = !play;
  $("#modal").hidden = true;
}
// Bottles sorted so far: every completed bottle takes 4 units away, and the
// level ends with exactly one completed bottle per filled bottle it started with.
function progress(l = currentLevel(), state = session.state) {
  const units = (water) =>
    Object.values(water).reduce((n, a) => n + a.length, 0);
  const start = l.bottles.reduce((n, b) => n + b.colors.length, 0);
  return {
    done: (start - units(state.water)) / 4,
    total: l.bottles.filter((b) => !b.hand).length,
  };
}
function sync() {
  const l = currentLevel();
  const p = progress(l);
  $("#progress-done").textContent = p.done;
  $("#progress-total").textContent = p.total;
  $("#level").textContent = levelIndex === -1 ? `挑战 ${dailyIndex + 1}` : `Level ${levelIndex + 1}`;
  $("#home").setAttribute("aria-label", levelIndex === -1 ? "返回挑战选关" : "返回关卡模式");
  game.style.setProperty("--hue", [205, 222, 258][Math.max(0, levelIndex) % 3]);
  const ids = [
    ...session.state.pile,
    ...session.state.slots.filter((id) => id !== null),
  ];
  for (const [id, btn] of buttons)
    if (!ids.includes(id)) {
      btn.remove();
      buttons.delete(id);
    }
  for (const id of ids) {
    const b = l.bottles[id],
      v = view.items.get(id),
      inPile = session.state.pile.includes(id),
      ok = !inPile || available(session.state, l, id);
    // A chosen bottle that is still animating lifts once it is free.
    v.selected = selected === id && !session.locked.has(id);
    v.free = inPile && ok;
    let btn = buttons.get(id);
    if (!btn) {
      btn = document.createElement("button");
      btn.dataset.id = id;
      btn.className = "bottle-target";
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.preventDefault();
        void clickBottle(id);
      });
      btn.addEventListener("click", (e) => {
        if (e.detail === 0) void clickBottle(id);
      });
      buttons.set(id, btn);
      $("#targets").append(btn);
    }
    btn.classList.toggle("blocked", !ok);
    // Busy tray bottles stay clickable so the next pour can be booked.
    btn.disabled = inPile ? session.locked.has(id) : finishing(session, id);
    btn.classList.toggle("selected", selected === id);
    const events = `pointer-events:${btn.disabled ? "none" : "auto"}`;
    if (v.pile) {
      // Rotated hit box along the lying bottle; higher bottles sit on top.
      const r = view.pileRect(id);
      btn.style.cssText = `left:${r.x - r.length / 2}px;top:${r.y - r.thick / 2}px;width:${r.length}px;height:${r.thick}px;border-radius:${r.thick / 2}px;transform:rotate(${r.angle}deg);z-index:${(inPile && ok ? 10000 : 0) + v.pile.order};${events}`;
    } else
      btn.style.cssText = `left:${v.x - 26}px;top:${v.y - 104}px;width:52px;height:110px;z-index:40;${events}`;
    btn.setAttribute(
      "aria-label",
      `${inPile ? "拾取" : "操作"}瓶 ${id + 1}：${session.state.water[id].map((c) => colorNames[c]).join("、") || "空瓶"}${ok ? "" : "，被遮挡"}`,
    );
  }
  document
    .querySelectorAll(".bottle-slot")
    .forEach((el, i) =>
      el.classList.toggle("occupied", session.state.slots[i] !== null),
    );
  $("#restart").disabled = false;
  view.dirty = true;
}
function leave() {
  cancel();
  selected = null;
  buttons.clear();
  $("#targets").replaceChildren();
  view.reset();
}
/** Level list: just a title and numbered buttons. */
function select(mode = "levels") {
  leave();
  screen = "select";
  showScreen(false, "select");
  const daily = mode === "daily";
  $("#select-screen").classList.toggle("daily-select", daily);
  $("#select-screen h2").textContent = daily ? "羊了个羊模式" : "关卡模式";
  $(".level-grid").innerHTML = daily
    ? DAILY_CHALLENGES.map((c,i) => `<button class="gbtn green challenge-choice" data-daily-level="${i}"><strong>${c.title}</strong><small>${c.difficulty} · 120 瓶 · 6 色</small></button>`).join("")
    : levels.map((_,i) => `<button class="level-number" data-level="${i}">${String(i+1).padStart(3,"0")}</button>`).join("");
  game.style.setProperty("--hue", daily ? 155 : 205);
}
function home() {
  leave();
  screen = "home";
  showScreen(false);
  game.style.setProperty("--hue", 205);
  // A heap of bottles, settled ahead of time (scripts/build-home-heap.js),
  // seen from lower than in play so its mound shape reads.
  view.aimHeap(32, 422, 26);
  homeHeap.forEach((b, i) => {
    view.create(-1 - i, poseFromData(b));
    view.water(-1 - i, b.colors);
  });
}
function start(i = levelIndex, challenge = dailyIndex) {
  levelIndex = i;
  if (i === -1) { dailyIndex = challenge; dailyLevel = dailyForDate(undefined, dailyIndex); }
  movesMade = 0;
  build(new Session(currentLevel()));
  // Settled states, newest last; undo steps back to the one before.
  history = [structuredClone(session.state)];
}
/** Lay out a session's current state from scratch (start, undo). */
function build(next) {
  const l = currentLevel();
  cancel();
  screen = "playing";
  session = next;
  selected = null;
  buttons.clear();
  $("#targets").replaceChildren();
  view.reset();
  showScreen(true);
  view.focus(585, TRAY_PX);
  view.aimHeap(l.heapPx, levelIndex === -1 ? 350 : 340);
  const heap = heapOf(l, session.state.pile);
  const { pile, slots } = session.state;
  for (const b of l.bottles) {
    // Finished bottles are gone; the rest are in the heap or in hand.
    if (!pile.includes(b.id) && !slots.includes(b.id)) continue;
    const v = view.create(b.id, heap.poses.get(b.id) ?? null);
    if (v.pile) {
      const r = view.pileRect(b.id);
      Object.assign(v, { x: r.x, y: r.y, z: 400 });
    } else
      Object.assign(v, {
        x: slotX(session.state.slots.indexOf(b.id)),
        y: 635,
        z: 400,
      });
    view.water(b.id, session.state.water[b.id]);
  }
  sync();
  message();
}
/** Back to the last settled state before the current one. */
function undo() {
  if (history.length < 2) return;
  history.pop();
  const back = new Session(currentLevel());
  back.state = structuredClone(history.at(-1));
  movesMade = Math.max(0, movesMade - 1);
  build(back);
}
async function clearCompleted(ids) {
  if (!ids.length) return;
  // Cork drops in, light sweeps up the glass, stars twinkle at its shoulder,
  // then it is gone at full size in a burst of streamers.
  for (const id of ids) view.seal(id, true);
  await tween(300, () => {});
  for (const id of ids) view.shine(id);
  // stars start while the light is still near the top of the glass
  await tween(500, () => {});
  for (const id of ids) view.sparkle(id);
  await tween(280, () => {});
  for (const id of ids) view.burst(id);
  for (const id of ids) {
    const v = view.items.get(id);
    v.g.visible = false;
    v.native.shadow.visible = false;
  }
}
async function finishOperation(run, op) {
  if (run !== session) return;
  const ids = run.commit(op);
  if (ids === null) return;
  sync();
  tryPending(run);
  await clearCompleted(ids);
  if (run !== session) return;
  const removed = run.finish(op);
  if (removed === null) return;
  tryPending(run);
  for (const id of removed) {
    const v = view.items.get(id);
    v.g.visible = false;
    v.native.shadow.visible = false;
  }
  sync();
  if (!run.busy) await runAutoClear(run);
  if (run !== session) return;
  if (!run.busy) history.push(structuredClone(run.state));
  settleResult(run);
}
function settleResult(run) {
  if (run.busy || autoBusy) return;
  if (run.status === "won") result(true);
  else if (run.status === "lost") result(false);
}
// Auto-clear assist (rules.autoClear): when on, four units of a colour in hand
// vanish wherever they sit, and one bottle in hand goes with them.
// Off whenever the game opens; the player turns it on for a session.
let autoOn = false,
  autoBusy = false;
async function runAutoClear(run) {
  if (!autoOn || autoBusy) return;
  autoBusy = true;
  try {
    let r;
    while (autoOn && run === session && !run.busy && (r = autoClear(run.state))) {
      selected = pending = null;
      sync();
      // All at once: other colours drain out of the gathering bottle and rise
      // on top of the others, the cleared colour drains out of the others and
      // rises in the gathering bottle until it is full (both ends move with the
      // same easing, so no bottle ever holds more than 4). Then that bottle
      // flashes white and is gone. No bottle moves.
      const taken = new Set(r.take.map((t) => `${t.id}:${t.index}`)),
        plans = new Map();
      for (const id of run.state.slots.filter((x) => x !== null)) {
        const w = run.state.water[id];
        if (id === r.elim)
          plans.set(id, [
            ...w.map((color) => ({
              color,
              from: 1,
              to: color === r.color ? 1 : 0,
              phase: 0,
            })),
            ...r.take.map(() => ({ color: r.color, from: 0, to: 1, phase: 0 })),
          ]);
        else
          plans.set(id, [
            ...w.map((color, i) => ({
              color,
              from: 1,
              to: taken.has(`${id}:${i}`) ? 0 : 1,
              phase: 0,
            })),
            ...r.moveOut
              .filter((m) => m.to === id)
              .map((m) => ({ color: m.color, from: 0, to: 1, phase: 0 })),
          ]);
      }
      const moving = [...plans].filter(([, units]) =>
        units.some((u) => u.from !== u.to),
      );
      for (const [id, units] of moving) view.morph(id, units);
      await tween(360, (k) => {
        for (const [id] of moving) view.morphStep(id, k);
      });
      if (run !== session) return;
      for (const [id] of moving)
        if (id !== r.elim) view.morphEnd(id, r.state.water[id]);
      const full = [r.color, r.color, r.color, r.color];
      view.morphEnd(r.elim, full);
      view.flashUnits(r.elim, full, [0, 1, 2, 3]);
      await tween(150, (k) => view.flashStep(r.elim, k * 0.45));
      if (run !== session) return;
      const gone = view.items.get(r.elim);
      view.burst(r.elim, r.color);
      await tween(200, (k) => {
        gone.scale = 1 - k * k;
      });
      if (run !== session) return;
      view.flashEnd(r.elim, full);
      gone.g.visible = false;
      gone.native.shadow.visible = false;
      run.state = r.state;
      sync();
    }
  } catch (e) {
    if (e.name === "AbortError") return;
    // Never leave the picture out of step with the rules: redraw from state.
    console.error(e);
    autoBusy = false;
    if (run === session) build(run);
  } finally {
    autoBusy = false;
  }
}
function setAuto(on) {
  autoOn = on;
  $("#auto").classList.toggle("on", on);
  $("#auto").setAttribute("aria-checked", String(on));
  // Switching it on with four of a colour already in hand clears them now.
  if (on && screen === "playing" && !session.busy) {
    const run = session;
    void runAutoClear(run).then(() => {
      if (run !== session || run.busy) return;
      history[history.length - 1] = structuredClone(run.state);
      settleResult(run);
    });
  }
}
// A bottle sealed and about to vanish takes no more clicks.
function finishing(run, id) {
  const op = run.locked.get(id);
  return !!op && op.committed && op.completed.includes(id);
}
// One pour waiting for a bottle that is still busy animating.
let pending = null;
function tryPending(run) {
  if (!pending || run !== session) return;
  const { a, b } = pending;
  if (![a, b].every((id) => run.state.slots.includes(id))) {
    // One of them was finished and removed: the booking lapses.
    pending = null;
    if (!run.state.slots.includes(selected)) selected = null;
    sync();
    return;
  }
  if (run.locked.has(a) || run.locked.has(b)) return;
  pending = null;
  void pour(run, a, b);
}
async function pour(run, source, id) {
  try {
    const op = run.begin({ type: "pour", a: source, b: id });
    if (!op) {
      message(
        run.state.water[source]?.length
          ? "目标瓶已经装满了。"
          : "这个瓶子是空的。",
      );
      sync();
      return;
    }
    const color = run.state.water[source].at(-1);
    // The source is put down only once its pour really starts; a refused
    // pour leaves it chosen.
    if (selected === source) selected = null;
    sync();
    await view.pour(source, id, op.amount, color, tween);
    if (run !== session) return;
    movesMade++;
    const completed = run.commit(op);
    if (completed === null) return;
    for (const bid of [source, id])
      if (!completed.includes(bid)) view.water(bid, run.state.water[bid]);
    await finishOperation(run, op);
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
}
async function clickBottle(id) {
  if (screen !== "playing" || !$("#modal").hidden || autoBusy) return;
  const run = session;
  const inPile = run.state.pile.includes(id);
  if ((inPile && run.locked.has(id)) || finishing(run, id)) return;
  const v = view.items.get(id);
  if (!v) return;
  try {
    message();
    if (inPile) {
      if (!available(run.state, currentLevel(), id)) {
        message("先移开压在它上面的瓶子。");
        // It tugs; the bottles lying on it get dragged along a little.
        view.jiggle(id, 1);
        for (const other of heapOf(currentLevel(), run.state.pile)
          .coveredBy.get(id) ?? [])
          view.jiggle(other, 0.45, 0.05);
        return;
      }
      const slot = run.state.slots.indexOf(null);
      if (slot < 0) {
        message("手里的位置满了，先倒水凑满一瓶。");
        return;
      }
      const op = run.begin({ type: "pick", id });
      if (!op) return;
      // Reserve the destination immediately, including while the bottle flies,
      // and let whatever leaned on the picked bottle fall into place.
      const heap = heapOf(currentLevel(), run.state.pile);
      for (const [pid, pose] of heap.poses)
        view.settle(pid, pose);
      sync();
      // It flies (in the heap's own 3D view) to where its slot is on screen,
      // turning upright on the way, then hands over to the tray and lands.
      view.flyStart(id, slotX(slot), 635 - 1.3 * TRAY_PX, TRAY_PX);
      await tween(340, (k) => {
        v.fly.k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        view.dirty = true;
      });
      if (run !== session) return;
      view.toTray(id);
      Object.assign(v, { x: slotX(slot), y: 635, z: 400 });
      v.native.hopBy(-0.9);
      v.native.kick(0, 1.2);
      movesMade++;
      view.set(v, 0);
      await finishOperation(run, op);
      return;
    }
    if (selected === id) {
      selected = null;
      pending = null;
      sync();
      return;
    }
    if (pending) {
      // A booking is waiting: choosing another bottle starts over from it.
      pending = null;
      selected = run.state.water[id].length || run.locked.has(id) ? id : null;
      sync();
      return;
    }
    if (selected === null) {
      // A bottle still being poured into may be chosen as the next source.
      if (!run.state.water[id].length && !run.locked.has(id)) return;
      selected = id;
      sync();
      return;
    }
    const source = selected;
    if (run.locked.has(source) || run.locked.has(id)) {
      // Book it: it pours as soon as both bottles are free. The source stays
      // chosen (lifted) while it waits.
      pending = { a: source, b: id };
      sync();
      return;
    }
    await pour(run, source, id);
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
}
function result(win) {
  $("#modal").hidden = false;
  // A loss keeps the tray in plain view: the card sits over the heap only,
  // so the player can see the bottles that left no way out.
  $("#modal").classList.toggle("lost", !win);
  $("#modal").innerHTML = win
    ? `<div class="dialog"><div class="dialog-star">★</div><h2>归色完成！</h2><p>所有颜色都找到了自己的位置。</p><button id="again" class="gbtn purple big">${(levelIndex === -1 ? dailyIndex < DAILY_CHALLENGES.length - 1 : levelIndex < levels.length - 1) ? "下一关" : "再玩一次"}</button><button id="result-home" class="text-button">${levelIndex === -1 ? "选择挑战关卡" : "选择其他关卡"}</button></div>`
    : `<div class="dialog"><h2>再试一次</h2><p>手里的位置满了，没有颜色能凑满一瓶。</p><div class="dialog-row"><button id="undo" class="gbtn glass big">撤销上一步</button><button id="again" class="gbtn purple big">重新开始</button></div><button id="result-home" class="text-button">${levelIndex === -1 ? "选择挑战关卡" : "选择其他关卡"}</button></div>`;
  $("#again").onclick = () => {
    if (levelIndex === -1) start(-1, win && dailyIndex < DAILY_CHALLENGES.length - 1 ? dailyIndex + 1 : dailyIndex);
    else start(win ? (levelIndex + 1) % levels.length : levelIndex);
  };
  if (!win) $("#undo").onclick = undo;
  $("#result-home").onclick = backFromGame;
}
// Each mode returns to its own entry screen.
$("#home").onclick = backFromGame;
$("#choose").onclick = () => select();
$("#auto").onclick = () => setAuto(!autoOn);
setAuto(autoOn);
$("#daily").onclick = () => select("daily");
$("#select-back").onclick = home;
$("#restart").onclick = () => start();
$("#select-screen").addEventListener("click", e => {
  const button = e.target.closest("[data-level], [data-daily-level]");
  if (!button) return;
  if (button.dataset.dailyLevel !== undefined) start(-1, Number(button.dataset.dailyLevel));
  else start(Number(button.dataset.level));
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.fullscreenElement)
    screen === "playing" ? backFromGame() : home();
  if (e.key === "f")
    document.fullscreenElement
      ? document.exitFullscreen()
      : game.requestFullscreen?.();
});
window.render_game_to_text = () =>
  JSON.stringify({
    screen,
    level: levelIndex + 1,
    mode: levelIndex === -1 ? "daily" : "levels",
    progress: screen === "playing" ? progress() : null,
    autoClear: autoOn,
    autoBusy,
    challenge: levelIndex === -1 ? dailyIndex + 1 : null,
    dailyDate: levelIndex === -1 ? dailyLevel.date : null,
    state: session.state,
    selected,
    busy: session.busy,
    locked: [...session.locked.keys()],
    operations: session.operations.size,
    streams: view.streams.filter((s) => s.mesh.visible).length,
    moves: movesMade,
    status: screen === "playing" ? session.status : screen,
    coordinates: "390x780; origin top-left; x right, y down",
    bottles: [...view.items.values()]
      .filter((v) => v.g.visible)
      .map((v) => ({
        id: v.id,
        x: v.x,
        y: v.y - 60,
        capped: v.capped,
        layers: v.native.layers.map((l) => ({ color: l.color, volume: l.vol })),
        available:
          screen === "playing"
            ? !session.state.pile.includes(v.id) ||
              available(session.state, currentLevel(), v.id)
            : false,
      })),
  });
if (import.meta.env.DEV)
  window.gameTest = {
    start,
    home,
    select,
    clickBottle,
    view,
    setAuto,
    // Lay out a given state of the current level (tests only).
    load: (state) => {
      const next = new Session(currentLevel());
      next.state = structuredClone(state);
      build(next);
    },
    getState: () => structuredClone(session.state),
    solve: () => solve(session.state, currentLevel()),
    metrics: () => ({
      ...view.stats,
      cpuAvg: view.stats.cpuTotal / Math.max(1, view.stats.frames),
    }),
  };
home();
