import data from './daily-data.json' with { type: 'json' };
import data2 from './daily-data-2.json' with { type: 'json' };
import { level } from './levels.js';

// All dates rename colours on the same immutable geometry; keep its cache.
const geometrySources = [{}, {}];
const datasets = [data, data2];
export const DAILY_CHALLENGES = [
  {title: '第一关', difficulty: '标准挑战'},
  {title: '第二关', difficulty: '进阶挑战'},
];

// Renaming colours preserves all rules, geometry and the certified solution.
// Use a fixed timezone so re-entering/restarting a day always gives one puzzle.
export function dailyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
export function dailyForDate(date = dailyDate(), challenge = 0) {
  const data = datasets[challenge];
  if (!data) throw new Error('Unknown challenge');
  const geometrySource = geometrySources[challenge];
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  if (!Number.isFinite(day)) throw new Error('Invalid daily date');
  let index = ((day % 720) + 720) % 720;
  const pool = [0, 1, 2, 3, 4, 5], palette = [];
  for (let remaining = 6; remaining > 0; remaining--) {
    palette.push(pool.splice(index % remaining, 1)[0]);
    index = Math.floor(index / remaining);
  }
  const result = level(data.heap.map(([colors, ...pose]) => [colors.map(c => palette[c]), ...pose]), data.slots, data.hand);
  return { ...result, heapPx: data.heapPx, preparedHeap: data.preparedHeap, geometrySource, date, challenge };
}
