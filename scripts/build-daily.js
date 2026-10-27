// Construct content around a genuine geometric removal path, then certify the
// complete game. Small balanced puzzles are an offline construction technique;
// nothing in the runtime restricts players to those groups or that path.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {level} from '../src/levels.js';
import {heapOf,prepareHeap} from '../src/pile.js';
import {initial,solve,apply,moves,lost,won} from '../src/rules.js';
import {rng,layers,progression,replay} from './lib/level-metrics.js';
const second = process.argv.includes('--second');
const rnd=rng(second ? 261027 : 261026);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
// A circular mound: wide base, progressively smaller crowns, plus loose
// peripheral pockets that expose over the first few real geometric waves.
const heap=[];
for(const [layer,[count,radius]] of [[24,5.05],[22,4.6],[18,4.05],[15,3.35],[11,2.6]].entries()){
 for(let j=0;j<count;j++){
  const angle=j*2.3999632297+layer*.83+(rnd()-.5)*.22;
  const r=radius*Math.sqrt((j+.5)/count);
  heap.push([[0,0,1,1],Math.cos(angle)*r,Math.sin(angle)*r,(rnd()*360)|0]);
 }
}
for(let tier=0;tier<3;tier++)for(let j=0;j<10;j++){
 const angle=j*Math.PI/5+tier*.13+(rnd()-.5)*.12;
 const r=7.0-tier*.5+(rnd()-.5)*.3;
 heap.push([[0,0,1,1],Math.cos(angle)*r,Math.sin(angle)*r,Math.round(-angle*180/Math.PI+75+(rnd()-.5)*65)]);
}
const source=second ? JSON.parse(fs.readFileSync('src/daily-data.json','utf8')) : null;
const l=level(source ? source.heap : heap);l.heapPx=source?.heapPx ?? 20;
const {ranks,rows}=layers(l);
console.log('Peel waves',rows.map(a=>a.length));
let remaining=initial(l).pile,order=[],frontiers=[];
while(remaining.length){
 const h=heapOf(l,remaining);
 const ids=[...h.free].sort((a,b)=>ranks.get(a).wave-ranks.get(b).wave||h.poses.get(b).anchor.y-h.poses.get(a).anchor.y);
 if(!ids.length)throw Error('No legal geometric pick');
 order.push(ids[0]);frontiers.push(ids.length);remaining=remaining.filter(id=>id!==ids[0]);
}
console.log('Removal path ready',frontiers.filter((_,i)=>i%10===0));
// Target distributions interleave relief and spikes throughout each band.
const patterns=second ? [
 [[2,2,3,4],[2,2,3,4],[2,2,3,3]],
 [[3,3,3,4],[2,3,3,4],[2,3,3,4]],
 [[3,3,4,4],[2,2,4,4],[3,3,4,4]],
] : [
 [[2,2,2,3],[2,2,3,3],[2,2,2,4]],
 [[2,3,3,4],[2,2,3,4],[2,3,3,3]],
 [[2,2,4,4],[2,3,3,4],[3,3,4,4]],
];
let state=initial(l),path=[];
const assigned=new Set();
for(let group=0;group<30;group++){
 const ids=order.slice(group*4,group*4+4),band=Math.floor(group/10);
 const target=[...patterns[band][group%3]].sort();
 let found;
 for(let attempt=0;attempt<20000;attempt++){
  const units=shuffle(Array.from({length:16},(_,i)=>i%4));
  const sets=Array.from({length:4},(_,i)=>units.slice(i*4,i*4+4));
  if(sets.map(a=>new Set(a).size).sort().join()!==target.join())continue;
  const kind=new Map(ids.map((id,i)=>[id,new Set(sets[i]).size]));
  if(rows.some(row=>row.length>=2&&row.every(id=>assigned.has(id)||kind.has(id))&&new Set(row.map(id=>kind.get(id)??new Set(l.bottles[id].colors).size)).size===1))continue;
  const helpers=state.slots.filter(id=>id!==null);
  const palette=shuffle([0,1,2,3,4,5]).slice(0,4);
  const bottles=ids.map((id,i)=>({id,colors:sets[i].map(c=>palette[c]),blockedBy:ids.slice(0,i)}));
  const local={slots:5,bottles:[...bottles,...helpers.map(id=>({id,colors:[],hand:true}))]};
  const r=solve(initial(local),local,1500,80);
  if(!r.path)continue;
  found={bottles,path:r.path};break;
 }
 if(!found)throw Error(`No local puzzle ${group}`);
 for(const b of found.bottles){assigned.add(b.id);l.bottles[b.id].colors=b.colors;state.water[b.id]=[...b.colors];}
 for(const m of found.path){
  if(!moves(state,l).some(x=>JSON.stringify(x)===JSON.stringify(m)))throw Error('Illegal global action');
  state=apply(state,m);if(lost(state,l))throw Error('Lost globally');path.push(m);
 }
 console.log('Certified group',group+1,'steps',found.path.length,'distribution',target.join('/'));
}
replay(l,path);
const data={version:2,preparedHeap:prepareHeap(l),heapPx:l.heapPx,slots:5,hand:2,heap:l.bottles.filter(b=>!b.hand).map(b=>[b.colors,b.heap.x,b.heap.z,b.heap.yaw])};
fs.writeFileSync(second ? 'src/daily-data-2.json' : 'src/daily-data.json',JSON.stringify(data));
fs.writeFileSync(second ? 'docs/daily-solution-2.json' : 'docs/daily-solution.json',JSON.stringify({dataSha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),path,progression:progression(l),frontiers,peelWaves:rows.map(ids=>({ids,kinds:ids.map(id=>new Set(l.bottles[id].colors).size)}))},null,2));
console.log('Saved',path.length,'moves',JSON.stringify(progression(l)));
