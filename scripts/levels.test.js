import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{levels}from'../src/levels.js';import{initial}from'../src/rules.js';import{progression}from'./lib/level-metrics.js';
const report=JSON.parse(fs.readFileSync(new URL('../docs/level-generation.json',import.meta.url),'utf8'));
test('005/006 controlled pair: same 50 bottles, six colours, helpers, contents and geometry',()=>{
 const a=levels[4],b=levels[5];for(const l of[a,b]){assert.equal(initial(l).pile.length,50);assert.equal(l.slots,5);assert.equal(l.bottles.filter(b=>b.hand).length,2);const totals=Array(6).fill(0);for(const bottle of l.bottles)for(const c of bottle.colors)totals[c]++;assert.deepEqual(totals,[36,36,32,32,32,32]);}
 assert.deepEqual(a.bottles.map(x=>x.heap),b.bottles.map(x=>x.heap));
 assert.deepEqual(a.bottles.map(x=>x.colors.join(',')).sort(),b.bottles.map(x=>x.colors.join(',')).sort());
 const counts=l=>l.bottles.filter(b=>!b.hand).reduce((o,b)=>{const k=new Set(b.colors).size;o[k]=(o[k]??0)+1;return o;},{});
 assert.deepEqual(counts(a),{2:25,3:20,4:5});assert.deepEqual(counts(a),counts(b));
 for(let i=0;i<50;i++){assert.equal(new Set(a.bottles[i].colors).size,new Set(b.bottles[i].colors).size);const runs=x=>x.filter((c,j)=>!j||c!==x[j-1]).length;assert.equal(runs(a.bottles[i].colors),runs(b.bottles[i].colors));}
});
test('large levels have a measured easy-to-hard exposure trend with crossover',()=>{for(const l of levels.slice(2)){const p=progression(l).bands;assert.ok(p[0].meanColors<p[2].meanColors);assert.ok(p[0].meanRuns<p[2].meanRuns);assert.ok(p[0].fourColor>=1,'hard surprise near the surface');assert.ok(p[2].fourColor>=1,'hard bottles remain deeper');assert.ok(p[2].twoColor>=1,'easy bottle remains deeper');}});
test('controlled opening safety differs by at least 15 percentage points',()=>{assert.ok(report[5].opening.uniformChoiceSurvival-report[6].opening.uniformChoiceSurvival>.15);assert.equal(report[5].opening.paths,report[6].opening.paths);assert.ok(report[5].opening.safePaths>report[6].opening.safePaths);});

test('analysis artifacts describe the current level contents and geometry',async()=>{
 const {createHash}=await import('node:crypto');const analysis=JSON.parse(fs.readFileSync(new URL('../docs/difficulty-analysis.json',import.meta.url),'utf8'));
 for(const row of analysis.levels)assert.equal(row.dataSha256,createHash('sha256').update(JSON.stringify(levels[row.level-1].bottles)).digest('hex'));
 const current=JSON.parse(fs.readFileSync(new URL('../docs/004-current-analysis.json',import.meta.url),'utf8'));assert.equal(current.dataSha256,createHash('sha256').update(JSON.stringify(levels[3].bottles)).digest('hex'));assert.equal(current.orderSampling.distinctVerifiedOrders,24);
});
