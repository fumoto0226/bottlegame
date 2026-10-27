// Geometric exposure stress samples only: these are NOT playthroughs or win rates.
import fs from 'node:fs';
import {dailyForDate} from '../src/daily.js';
import {heapOf} from '../src/pile.js';
import {initial} from '../src/rules.js';
import {layers} from './lib/level-metrics.js';
const level=dailyForDate('2026-10-26'),{ranks}=layers(level),samples=[];
for(const direction of [-1,1]){
 let pile=initial(level).pile,trace=[];
 while(pile.length){
  const ids=[...heapOf(level,pile).free];
  // Deliberately work one side deeply while leaving the other side untouched.
  ids.sort((a,b)=>direction*(level.bottles[a].heap.x-level.bottles[b].heap.x));
  const id=ids[0];if(id===undefined)throw Error('Geometric dead end');
  trace.push({id,choices:ids.length,colors:new Set(level.bottles[id].colors).size,wave:ranks.get(id).wave,
   exposedWaveSpread:Math.max(...ids.map(i=>ranks.get(i).wave))-Math.min(...ids.map(i=>ranks.get(i).wave))});
  pile=pile.filter(i=>i!==id);
 }
 const bands=[0,1,2].map(i=>{const rows=trace.slice(i*40,i*40+40);return{meanColors:rows.reduce((s,r)=>s+r.colors,0)/40,meanChoices:rows.reduce((s,r)=>s+r.choices,0)/40};});
 samples.push({strategy:direction===-1?'right-first':'left-first',bands,maxSimultaneousWaveSpread:Math.max(...trace.map(r=>r.exposedWaveSpread)),trace});
 console.log(samples.at(-1).strategy,JSON.stringify(bands),'wave spread',samples.at(-1).maxSimultaneousWaveSpread);
}
fs.writeFileSync('docs/daily-exposure-analysis.json',JSON.stringify({scope:'Geometry-only local digging; not legal liquid playthroughs or win-rate estimates',samples},null,2));
