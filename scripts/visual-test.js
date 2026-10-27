import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(process.env.GAME_URL||'http://localhost:5174');await page.waitForFunction(()=>window.gameTest);await page.waitForTimeout(200);
// Stop the automatic clock in this test page only. Advance every animation by
// its public deterministic hook so screenshots cannot race the cork shrinking.
await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(150);
await page.evaluate(()=>{window.gameTest.start(0);});await page.evaluate(()=>window.advanceTime(100));await page.screenshot({path:'test-results/minimal-board.png'});
const path=await page.evaluate(()=>window.gameTest.solve().path);let captured=false,pour=false;
for(const m of path){
 if(m.type==='pick'){await page.evaluate(id=>{void window.gameTest.clickBottle(id);},m.id);await page.evaluate(()=>window.advanceTime(600));}
 else{await page.evaluate(({a,b})=>{void window.gameTest.clickBottle(a);void window.gameTest.clickBottle(b);},m);await page.evaluate(()=>window.advanceTime(450));if(!pour){await page.screenshot({path:'test-results/reference-pour.png'});pour=true;}await page.evaluate(()=>window.advanceTime(1350));const s=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));const corked=s.bottles.filter(b=>b.capped);
  if(corked.length){assert.ok(corked.every(b=>b.layers.length===1&&Math.abs(b.layers[0].volume-4)<.001));await page.screenshot({path:'test-results/cork-closed.png'});captured=true;break;}await page.evaluate(()=>window.advanceTime(2000));}
}
assert.ok(captured);console.log('Fixed-time screenshots: original pour, sealed four-unit single-color bottle with one continuous layer passed');await browser.close();
