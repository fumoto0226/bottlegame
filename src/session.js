import {
  initial,
  available,
  amount,
  complete,
  transfer,
  settle,
  won,
  lost,
} from "./rules.js";
// Each animation owns only its bottles. Slot reservations and liquid commits
// always use the latest shared state; no pre-animation snapshot is restored.
export class Session {
  constructor(level) {
    this.level = level;
    this.state = initial(level);
    this.locked = new Map();
    this.operations = new Set();
  }
  begin(move) {
    const ids = move.type === "pick" ? [move.id] : [move.a, move.b];
    if (ids.some((id) => this.locked.has(id))) return null;
    let count = 0;
    if (move.type === "pick") {
      if (
        !this.state.slots.includes(null) ||
        !available(this.state, this.level, move.id)
      )
        return null;
    } else {
      if (
        move.a === move.b ||
        !ids.every((id) => this.state.slots.includes(id))
      )
        return null;
      count = amount(this.state.water[move.a], this.state.water[move.b]);
      if (!count) return null;
    }
    const op = { move, ids, amount: count, committed: false, completed: [] };
    this.operations.add(op);
    ids.forEach((id) => this.locked.set(id, op));
    if (move.type === "pick") this.state = transfer(this.state, move);
    return op;
  }
  commit(op) {
    if (!this.operations.has(op)) return null;
    if (!op.committed) {
      if (op.move.type === "pour") this.state = transfer(this.state, op.move);
      op.committed = true;
      op.completed = op.ids.filter(
        (id) => this.state.water[id] && complete(this.state.water[id]),
      );
      // The source can be reused while a completed destination is being corked.
      for (const id of op.ids)
        if (!op.completed.includes(id) && this.locked.get(id) === op)
          this.locked.delete(id);
    }
    return op.completed;
  }
  finish(op) {
    if (!this.operations.has(op) || !op.committed) return null;
    const before = this.state.slots.filter((id) => id !== null);
    this.operations.delete(op);
    this.state = settle(this.state, op.completed, this.operations.size === 0);
    for (const id of op.ids)
      if (this.locked.get(id) === op) this.locked.delete(id);
    return before.filter((id) => !this.state.slots.includes(id));
  }
  cancel() {
    this.operations.clear();
    this.locked.clear();
  }
  get busy() {
    return this.operations.size > 0;
  }
  get status() {
    return this.busy
      ? "playing"
      : won(this.state)
        ? "won"
        : lost(this.state, this.level)
          ? "lost"
          : "playing";
  }
}
