import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {dailyForDate} from '../src/daily.js';
import {initial,apply} from '../src/rules.js';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.GAME_URL||'http://127.0.0.1:5174');await page.waitForFunction(()=>window.gameTest);
await page.evaluate(()=>{window.requestAnimationFrame=()=>0;window.gameTest.setAuto(false);});await page.waitForTimeout(100);
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const choose=await page.locator('#choose').boundingBox(),daily=await page.locator('#daily').boundingBox();
assert.ok(Math.abs(choose.height-daily.height)<1);
assert.equal(await page.locator('#choose').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
assert.equal(await page.locator('#daily').evaluate(e=>getComputedStyle(e).color),'rgb(20, 92, 43)');
await page.screenshot({path:'test-results/daily-home.png'});
await page.locator('#daily').click();
assert.equal((await state()).screen,'select');
assert.equal(await page.locator('[data-daily-level]').count(),2);
await advance(0);await page.screenshot({path:'test-results/challenge-select.png'});
await page.locator('#select-back').click();await page.locator('#choose').click();
assert.equal(await page.locator('[data-level]').count(),6);
await page.locator('[data-level="0"]').click();assert.equal(await page.locator('#daily-note').isVisible(),false);
await page.locator('#home').click();await page.locator('#select-back').click();await page.locator('#daily').click();
// The first puzzle's unchanged witness is covered by verify. Exercise its
// final real action here to test the new next-challenge navigation directly.
await page.locator('[data-daily-level="0"]').click();
const firstPath=JSON.parse(fs.readFileSync('docs/daily-solution.json','utf8')).path;
const firstLevel=dailyForDate((await state()).dailyDate);
let nearWin=initial(firstLevel);
for(const m of firstPath.slice(0,-1))nearWin=apply(nearWin,m);
await page.evaluate(s=>window.gameTest.load(s),nearWin);
const finalMove=firstPath.at(-1);
assert.equal(finalMove.type,'pour');
await page.locator(`[data-id="${finalMove.a}"]`).click();
await page.locator(`[data-id="${finalMove.b}"]`).click();await advance(3600);
assert.equal((await state()).status,'won');
assert.equal(await page.locator('#again').textContent(),'下一关');
await page.locator('#again').click();assert.equal((await state()).challenge,2);
await page.locator('#home').click();
const only=process.env.CHALLENGE_TEST_LEVELS?.split(',').map(Number);
for(let challenge=0;challenge<2;challenge++){
 if(only&&!only.includes(challenge+1))continue;
 const suffix=challenge?'-2':'';
 const {path}=JSON.parse(fs.readFileSync(`docs/daily-solution${suffix}.json`,'utf8'));
 await page.locator(`[data-daily-level="${challenge}"]`).click();
 assert.equal((await state()).challenge,challenge+1);
 assert.equal((await state()).state.pile.length,120);
 assert.equal(await page.locator('#daily-note').isVisible(),true);
 const start=(await state()).state;
 await page.locator('#restart').click();assert.deepEqual((await state()).state,start);
 assert.equal((await state()).challenge,challenge+1);
 await advance(50);await page.screenshot({path:`test-results/challenge-${challenge+1}-start.png`});
 for(let i=0;i<path.length;i++){
  const m=path[i];
  if(m.type==='pick')await page.locator(`[data-id="${m.id}"]`).click();
  else{await page.locator(`[data-id="${m.a}"]`).click();await page.locator(`[data-id="${m.b}"]`).click();}
  await advance(m.type==='pick'?600:3600);
  const s=await state();assert.notEqual(s.status,'lost',`lost at ${i}`);assert.equal(s.busy,false);
  if(i%90===0)console.log('Challenge',challenge+1,i,'/',path.length,'remaining',s.state.pile.length);
  if(i===Math.floor(path.length/2))await page.screenshot({path:`test-results/challenge-${challenge+1}-middle.png`});
  if(process.env.DAILY_SMOKE==='1'&&i>=3)break;
 }
 if(process.env.DAILY_SMOKE!=='1'){
  assert.equal((await state()).status,'won');
  assert.deepEqual((await state()).progress,{done:120,total:120});
  assert.equal(await page.locator('#again').textContent(),challenge===0?'下一关':'再玩一次');
  await page.screenshot({path:`test-results/challenge-${challenge+1}-won.png`});
  await page.locator('#again').click();
  assert.equal((await state()).challenge,2);assert.equal((await state()).state.pile.length,120);
 }
 await page.locator('#home').click();assert.equal(await page.locator('[data-daily-level]').count(),2);
}
await page.setViewportSize({width:320,height:568});await page.waitForTimeout(100);await advance(50);
await page.screenshot({path:'test-results/challenge-select-small.png'});
await page.locator('[data-daily-level="1"]').click();await advance(50);
await page.screenshot({path:'test-results/challenge-2-small.png'});
await page.keyboard.press('Escape');assert.equal(await page.locator('[data-daily-level]').count(),2);
await page.keyboard.press('Escape');assert.equal((await state()).screen,'home');
assert.deepEqual(errors,[]);await browser.close();console.log('Challenge browser checks passed');
