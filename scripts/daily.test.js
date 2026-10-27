import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assertGeometryClose,assertPreparedHeapClose} from './lib/assert-geometry.js';
import {dailyForDate,dailyDate} from '../src/daily.js';
import {initial} from '../src/rules.js';
import {replay,progression,layers} from './lib/level-metrics.js';
import {heapOf,settlePile,prepareHeap} from '../src/pile.js';
const data=JSON.parse(fs.readFileSync('src/daily-data.json','utf8'));
const certificate=JSON.parse(fs.readFileSync('docs/daily-solution.json','utf8'));
const level=dailyForDate('2026-10-26');
test('daily has 120 mixed bottles, 6 colours, five slots and two empty helpers',()=>{
 assert.equal(initial(level).pile.length,120);assert.equal(level.slots,5);
 assert.equal(level.bottles.filter(b=>b.hand).length,2);
 const totals=Array(6).fill(0);
 for(const b of level.bottles.filter(b=>!b.hand)){
  assert.equal(b.colors.length,4);assert.ok(new Set(b.colors).size>=2);
  b.colors.forEach(c=>totals[c]++);
 }
 for(const n of totals){assert.ok(n>0);assert.equal(n%4,0);}
 assert.equal(totals.reduce((a,b)=>a+b),480);
});
test('daily certificate matches exact data and wins without any illegal or losing step',()=>{
 assert.equal(certificate.dataSha256,createHash('sha256').update(JSON.stringify(data)).digest('hex'));
 replay(level,certificate.path);
});
test('daily complexity rises by exposure, with mixed bottles retained in every sizeable wave',()=>{
 const p=progression(level).bands;
 assert.ok(p[0].meanColors<p[1].meanColors&&p[1].meanColors<p[2].meanColors);
 for(const band of p){assert.ok(band.twoColor>0);assert.ok(band.fourColor>0);}
 for(const wave of certificate.peelWaves){if(wave.ids.length>=2)assert.ok(new Set(wave.kinds).size>1);}
});
test('daily is stable on restart and switches colour labels at midnight Japan time',()=>{
 assert.deepEqual(dailyForDate('2026-10-26'),level);
 const tomorrow=dailyForDate('2026-10-27');
 assert.notDeepEqual(tomorrow.bottles,level.bottles);
 assert.deepEqual(tomorrow.bottles.map(b=>b.heap),level.bottles.map(b=>b.heap));
 const mapping=new Map();
 for(let i=0;i<120;i++)for(let j=0;j<4;j++){
  const a=level.bottles[i].colors[j],b=tomorrow.bottles[i].colors[j];
  if(mapping.has(a))assert.equal(mapping.get(a),b);else mapping.set(a,b);
 }
 assert.equal(new Set(mapping.values()).size,6);
 assert.equal(dailyDate(new Date('2026-10-26T14:59:59Z')),'2026-10-26');
 assert.equal(dailyDate(new Date('2026-10-26T15:00:00Z')),'2026-10-27');
});
test('cached settling agrees with uncached geometry after removing a bottle',()=>{
 let pile=initial(level).pile;heapOf(level,pile);
 pile=pile.filter(id=>id!==certificate.path.find(m=>m.type==='pick').id);
 const actual=heapOf(level,pile);
 const expected=settlePile(level.bottles.filter(b=>pile.includes(b.id)).map(b=>({id:b.id,order:b.order,...b.heap})));
 for(const [id,pose] of expected){assertGeometryClose(actual.poses.get(id).anchor.toArray(),pose.anchor.toArray());assertGeometryClose(actual.poses.get(id).quat.toArray(),pose.quat.toArray());}
});

test('prepared starting heap exactly matches live physics and is shared across daily colours',()=>{
 const raw={...level,preparedHeap:null,geometrySource:undefined};
 assertPreparedHeapClose(prepareHeap(raw),data.preparedHeap);
 const pile=initial(level).pile;
 assert.strictEqual(heapOf(level,pile),heapOf(dailyForDate('2026-10-27'),pile));
});
test('round mound has a raised centre and a broad shallow opening',()=>{
 const {poses}=heapOf(level,initial(level).pile);
 const inside=[...poses.values()].filter(p=>Math.hypot(p.anchor.x,p.anchor.z)<3);
 const outside=[...poses.values()].filter(p=>Math.hypot(p.anchor.x,p.anchor.z)>5);
 const mean=a=>a.reduce((s,p)=>s+p.anchor.y,0)/a.length;
 assert.ok(outside.length>=25);assert.ok(mean(inside)>mean(outside)+2);
 const {rows}=layers(level);
 assert.ok(rows[0].length>=18);assert.ok(rows.slice(0,3).flat().length>=45);
});


test('second challenge is independently certified and raises mixed-bottle difficulty with relief',()=>{
 const data2=JSON.parse(fs.readFileSync('src/daily-data-2.json','utf8'));
 const cert2=JSON.parse(fs.readFileSync('docs/daily-solution-2.json','utf8'));
 const second=dailyForDate('2026-10-26',1);
 assert.equal(cert2.dataSha256,createHash('sha256').update(JSON.stringify(data2)).digest('hex'));
 assert.equal(initial(second).pile.length,120);assert.equal(second.slots,5);
 assert.equal(second.bottles.filter(b=>b.hand).length,2);
 const totals=Array(6).fill(0);
 for(const b of second.bottles.filter(b=>!b.hand)){
  assert.equal(b.colors.length,4);assert.ok(new Set(b.colors).size>=2);
  b.colors.forEach(c=>totals[c]++);
 }
 assert.equal(totals.reduce((a,b)=>a+b),480);
 assert.ok(totals.every(n=>n>0&&n%4===0));
 assert.deepEqual(second.bottles.map(b=>b.heap),level.bottles.map(b=>b.heap));
 const a=progression(level).bands,b=progression(second).bands;
 for(let i=0;i<3;i++){
  assert.ok(b[i].meanColors>a[i].meanColors);
  assert.ok(b[i].meanColors-a[i].meanColors<.4);
  assert.ok(b[i].twoColor>0&&b[i].fourColor>0);
 }
 assert.ok(b.reduce((n,r)=>n+r.fourColor,0)>=37);
 assert.ok(b.reduce((n,r)=>n+r.twoColor,0)<=33);
 assert.ok(b[0].meanColors<b[1].meanColors&&b[1].meanColors<b[2].meanColors);
 for(const wave of cert2.peelWaves)if(wave.ids.length>=2)assert.ok(new Set(wave.kinds).size>1);
 assertPreparedHeapClose(prepareHeap({...second,preparedHeap:null,geometrySource:undefined}),data2.preparedHeap);
 replay(second,cert2.path);
 assert.deepEqual(dailyForDate('2026-10-26',1),second);
 assert.throws(()=>dailyForDate('2026-10-26',2));
});


test('geometry tolerance still rejects moved bottles and changed pickability',()=>{
 const same=structuredClone(data.preparedHeap);
 same.poses[0][1].anchor[0]+=Number.EPSILON;
 assertPreparedHeapClose(same,data.preparedHeap);
 const moved=structuredClone(data.preparedHeap);
 moved.poses[0][1].anchor[0]+=.00001;
 assert.throws(()=>assertPreparedHeapClose(moved,data.preparedHeap));
 const blocked=structuredClone(data.preparedHeap);
 blocked.free.pop();
 assert.throws(()=>assertPreparedHeapClose(blocked,data.preparedHeap));
});
