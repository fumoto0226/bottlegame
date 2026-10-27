import fs from'node:fs';import{createHash}from'node:crypto';import{levels}from'../src/levels.js';import{initial,solve}from'../src/rules.js';import{opening,progression,replay}from'./lib/level-metrics.js';
const generation=JSON.parse(fs.readFileSync('docs/level-generation.json','utf8'));
// Only contents differ; this explicit identity avoids recomputing identical geometry.
levels[5].geometrySource=levels[4];
const report={method:{opening:'Exact legal next-three-pick sequences with no intervening pours; survival means not immediately lost, not necessarily solvable.',probability:'Uniform choice among currently visible/pickable bottles at each pick.',orders:'Different complete pickup-id orders found by seeded searches; lower bounds only. No path is declared unsolvable when the search budget runs out.',progression:'Remove all currently exposed bottles wave by wave; split that exposure order into thirds. Geometry is re-settled at every wave.'},levels:[]};
for(let i=2;i<6;i++){
 const l=levels[i],r=solve(initial(l),l);if(!r.path)throw Error(`Unverified ${i+1}`);replay(l,r.path);
 const count={};for(const b of l.bottles.filter(b=>!b.hand)){const k=new Set(b.colors).size;count[k]=(count[k]??0)+1;}
 const row={dataSha256:createHash('sha256').update(JSON.stringify(l.bottles)).digest('hex'),level:i+1,heapBottles:l.bottles.filter(b=>!b.hand).length,emptyHelpers:2,colors:new Set(l.bottles.flatMap(b=>b.colors)).size,contentHistogram:count,solutionSteps:r.path.length,searchNodes:r.nodes,opening:opening(l),progression:progression(l)};
 report.levels.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync('docs/difficulty-analysis.json',JSON.stringify(report,null,2));
