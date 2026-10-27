import {initial,apply,amount,lost,won,solve,moves} from '../../src/rules.js';
import {heapOf} from '../../src/pile.js';
export const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function replay(level,path,start=initial(level)){
 let s=start;
 for(const m of path){if(!moves(s,level).some(x=>JSON.stringify(x)===JSON.stringify(m)))throw Error('Illegal witness action');s=apply(s,m);if(lost(s,level)&&!won(s))throw Error('Witness entered a lost state');}
 if(!won(s))throw Error('Witness did not win');return s;
}
// Exact enumeration of the next batch of picks, with no intervening pours.
// This is an immediate-failure metric, NOT a count of solvable continuations.
export function opening(level,start=initial(level),depth=start.slots.filter(x=>x===null).length){
 let total=0,safe=0,probability=0;const first=new Map();
 function walk(s,left,p,firstId){
  if(!left||lost(s,level)){total++;const ok=!lost(s,level);if(ok){safe++;probability+=p;}const f=first.get(firstId)||{paths:0,safe:0};f.paths++;f.safe+=Number(ok);first.set(firstId,f);return;}
  const ids=[...heapOf(level,s.pile).free];
  if(!ids.length){total++;return;}
  for(const id of ids)walk(apply(s,{type:'pick',id}),left-1,p/ids.length,firstId??id);
 }
 walk(start,depth,1,null);return{depth,paths:total,safePaths:safe,safePathFraction:total?safe/total:0,uniformChoiceSurvival:probability,firstChoices:[...first].map(([id,r])=>({id,...r}))};
}
export function layers(level){
 const s=initial(level);let pile=[...s.pile];const rows=[],ranks=new Map();let wave=0;
 while(pile.length){const h=heapOf(level,pile),ids=[...h.free];if(!ids.length)throw Error('Geometry has no exposed bottle');ids.sort((a,b)=>h.poses.get(b).anchor.y-h.poses.get(a).anchor.y);for(const id of ids)ranks.set(id,{wave,index:ranks.size,height:h.poses.get(id).anchor.y});rows.push(ids);pile=pile.filter(id=>!h.free.has(id));wave++;}
 return{rows,ranks};
}
export function progression(level){const {ranks,rows}=layers(level);const ordered=[...ranks].sort((a,b)=>a[1].index-b[1].index).map(([id])=>id);const out=[];for(let i=0;i<3;i++){const ids=ordered.slice(Math.floor(i*ordered.length/3),Math.floor((i+1)*ordered.length/3));const kinds=ids.map(id=>new Set(level.bottles[id].colors).size),runs=ids.map(id=>level.bottles[id].colors.filter((c,j,a)=>!j||c!==a[j-1]).length);out.push({band:['upper','middle','lower'][i],bottles:ids.length,meanColors:kinds.reduce((a,b)=>a+b,0)/ids.length,meanRuns:runs.reduce((a,b)=>a+b,0)/ids.length,twoColor:kinds.filter(k=>k===2).length,fourColor:kinds.filter(k=>k===4).length});}return{peelWaves:rows.length,bands:out};}
export function sampleOrders(level,{samples=24,limit=8000,seed=9301,maxDepth=400}={}){
 const orders=new Map();let found=0,unknown=0,nodes=0;
 for(let i=0;i<samples;i++){const r=solve(initial(level),level,limit,maxDepth,{seed:seed+i*7919});nodes+=r.nodes;if(!r.path){unknown++;continue;}replay(level,r.path);found++;const order=r.path.filter(m=>m.type==='pick').map(m=>m.id);const key=order.join(',');if(!orders.has(key))orders.set(key,{order,path:r.path});}
 return{samples,solvedSearches:found,budgetUnknown:unknown,distinctVerifiedOrders:orders.size,nodes,witnesses:[...orders.values()]};
}
