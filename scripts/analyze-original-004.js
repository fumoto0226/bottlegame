import fs from 'node:fs';import{opening,sampleOrders,progression}from'./lib/level-metrics.js';
const original=JSON.parse(fs.readFileSync('docs/004-original-analysis.json','utf8')),l=original.levelData;
const t=performance.now();const start=opening(l);console.log('Original 004 opening:',JSON.stringify(start));const samples=sampleOrders(l,{samples:24,limit:8000});
Object.assign(original,{opening:start,orderSampling:samples,progression:progression(l),analysisMs:performance.now()-t,meaning:'Verified order count is a lower bound; opening survival is immediate safety, not solvability.'});fs.writeFileSync('docs/004-original-analysis.json',JSON.stringify(original,null,2));console.log(JSON.stringify({...samples,witnesses:undefined,elapsedMs:original.analysisMs}));
