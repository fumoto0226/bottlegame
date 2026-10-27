import {layers,rng} from './level-metrics.js';
export function progressive(base,style,seed){
 const rnd=rng(seed),{ranks}=layers(base),N=ranks.size;
 const order=[...ranks].sort((a,b)=>a[1].index-b[1].index).map(([id])=>id);
 const bottleColors=base.bottles.filter(b=>!b.hand).map(b=>[...b.colors]);
 const runs=a=>a.filter((c,i)=>!i||c!==a[i-1]).length;
 const ranked=bottleColors.map(a=>({a,k:new Set(a).size,r:runs(a),j:rnd()})).sort((a,b)=>a.k-b.k||a.r-b.r||a.j-b.j);
 // A trend, not a partition: place a few 4-colour surprises near the surface,
 // exchanging their easy bottles into the lower band.
 const slots=ranked.map(x=>({k:x.k,r:x.r}));
 const fours=ranked.filter(x=>x.k===4).length;
 const targets=fours>=8?[.08,.28,.46,.58]:fours>=4?[.08,.5]:fours>=2?[.08]:[];
 for(const target of targets.map(x=>Math.floor(N*x))){
  let hard=slots.findLastIndex((s,i)=>i>N*.6&&s.k===4);
  if(hard>=0&&slots[target].k<4)[slots[target],slots[hard]]=[slots[hard],slots[target]];
 }
 const groups=new Map();for(const a of bottleColors){const key=`${new Set(a).size}/${runs(a)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 const chosen=new Map(),waveCounts=new Map();
 for(let j=0;j<N;j++){
  const id=order[j],slot=slots[j],key=`${slot.k}/${slot.r}`,pool=groups.get(key),wave=ranks.get(id).wave;
  const counts=waveCounts.get(wave)||Array(6).fill(0),focus=[[0,1,2],[2,3,4],[3,4,5]][Math.min(2,Math.floor(j/N*3))];
  let best=-Infinity,index=0;
  for(let i=0;i<pool.length;i++){
   const hist=Array(6).fill(0);pool[i].forEach(c=>hist[c]++);
   const score=(style==='wide'?hist.reduce((n,v,c)=>n+v*(focus.includes(c)?3:0)+v*counts[c]*.3,0):style==='narrow'?-hist.reduce((n,v,c)=>n+(v+counts[c])**2,0):0)+rnd()*.5;
   if(score>best){best=score;index=i;}
  }
  const a=pool.splice(index,1)[0];chosen.set(id,a);a.forEach(c=>counts[c]++);waveCounts.set(wave,counts);
 }
 return{...base,geometrySource:base,bottles:base.bottles.map(b=>({...b,colors:b.hand?[]:chosen.get(b.id)}))};
}
