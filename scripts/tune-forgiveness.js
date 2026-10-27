import fs from 'node:fs';import data from '../src/level-data.js';import{heapOf}from'../src/pile.js';import{initial,solve}from'../src/rules.js';import{opening,progression,replay,rng}from'./lib/level-metrics.js';
function unpack(d){const b=d.heap.map(([colors,x,z,yaw],id)=>({id,colors,order:id,heap:{x,z,yaw}}));for(let i=0;i<d.hand;i++)b.push({id:b.length,colors:[],hand:true});return{slots:d.slots,bottles:b,heapPx:Math.min(60,34*Math.pow(30/d.heap.length,.25))};}
const full=fs.existsSync('docs/level-generation.json')?JSON.parse(fs.readFileSync('docs/level-generation.json','utf8')):data;
const base=unpack(full[5]),pile=initial(base).pile,plans=new Map(),first=[...heapOf(base,pile).free];let total=0;
for(const a of first){const p1=pile.filter(i=>i!==a),second=[...heapOf(base,p1).free];for(const b of second){const p2=p1.filter(i=>i!==b),third=[...heapOf(base,p2).free];for(const c of third){const ids=[a,b,c].sort((x,y)=>x-y),key=ids.join(',');let p=plans.get(key);if(!p)plans.set(key,p={ids,n:0,weight:0});p.n++;p.weight+=1/first.length/second.length/third.length;total++;}}}
const table=[...plans.values()];
function score(arr){let prob=0,n=0;for(const p of table){const count=new Uint8Array(6);for(const id of p.ids)for(const c of arr[id])count[c]++;if(count.some(x=>x>=4)){prob+=p.weight;n+=p.n;}}return{prob,n,total};}
const runs=a=>a.filter((c,i)=>!i||c!==a[i-1]).length;
for(const [key,dir]of[[5,1],[6,-1]]){
 const original=full[key],start=original.heap.map(x=>x[0]),groups=new Map();
 start.forEach((a,i)=>{const k=`${new Set(a).size}/${runs(a)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});const pools=[...groups.values()].filter(a=>a.length>1),rnd=rng(9100+key);
 let current=start.map(a=>[...a]),value=score(current).prob,best=value;const candidates=[];
 for(let i=0;i<4000;i++){
  const pool=pools[Math.floor(rnd()*pools.length)],a=pool[Math.floor(rnd()*pool.length)],b=pool[Math.floor(rnd()*pool.length)];if(a===b)continue;
  [current[a],current[b]]=[current[b],current[a]];const next=score(current).prob;
  if((next-value)*dir>=0||rnd()<.002){value=next;if((value-best)*dir>.00001){best=value;candidates.push({arr:current.map(a=>[...a]),value});}}
  else [current[a],current[b]]=[current[b],current[a]];
 }
 console.log(`Tune ${key}: ${score(start).prob.toFixed(4)} -> ${best.toFixed(4)}, ${candidates.length} improvements`);
 let chosen=null;
 const sorted=candidates.sort((a,b)=>(b.value-a.value)*dir);
 // Try increasingly less extreme candidates if the strongest is hard to certify.
 for(const candidate of sorted.filter((_,i)=>i<8||i%5===0)){
  const l={...base,geometrySource:base,bottles:base.bottles.map(b=>({...b,colors:b.hand?[]:candidate.arr[b.id]}))};
  const r=solve(initial(l),l,18000,500);console.log(` certify ${key}: ${candidate.value.toFixed(4)} ${r.path?.length??'unknown'} / ${r.nodes}`);
  if(r.path){replay(l,r.path);chosen={...original,heap:original.heap.map((h,i)=>[candidate.arr[i],...h.slice(1)]),solution:r.path,searchNodes:r.nodes,opening:opening(l),progression:progression(l)};break;}
 }
 if(chosen)full[key]=chosen;
}
fs.writeFileSync('docs/level-generation.json',JSON.stringify(full,null,2));
const runtime=Object.fromEntries(Object.entries(full).map(([k,d])=>[k,{slots:d.slots,hand:d.hand,heap:d.heap}]));fs.writeFileSync('src/level-data.js','// Certified fixed data; see docs/level-generation.json and generation scripts.\nexport default '+JSON.stringify(runtime,null,2)+';\n');
console.log('Pair opening final:',full[5].opening.uniformChoiceSurvival,full[6].opening.uniformChoiceSurvival);
