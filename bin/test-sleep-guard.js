/* Run: node bin/test-sleep-guard.js */
const assert=require('assert'),r=require('../apps/orbit/rest.js');
const start=Date.parse('2026-11-19T21:58:00+09:00');
const cfg={tzBase:540};
const t=r.wearTracker(cfg);
function segment(tracker,from,to,mode,hr){
 for(let ms=from;ms<to;ms+=200){
  const v=mode==='turn'?Math.sin(ms/1000):mode==='noise'?.03*Math.sin(ms):0;
  tracker.sample({x:v,y:0,z:1},ms);
  if(hr&&ms%1000===0)tracker.hrm({bpm:70,confidence:98},ms);
  if(ms%10000===0)tracker.result(ms);
 }
 return tracker.result(to);
}
segment(t,start,start+120000,'still',true);
segment(t,start+120000,start+180000,'turn',false);
let d=segment(t,start+180000,start+1200000,'still',false);
assert.equal(d.state,'wear_held','turning and HR loss must not turn confirmed nighttime wear into non-wear');
assert.equal(d.reason,'sleep_wear_history');
let restored=r.wearTracker(cfg,t.memory());
d=segment(restored,start+1200000,start+1500000,'still',false);
assert.equal(d.state,'wear_held','confirmed wear survives app restart');
const night=Date.parse('2026-11-20T02:00:00+09:00');
const unconfirmed=r.wearTracker(cfg);
assert.equal(segment(unconfirmed,night,night+600000,'still',false).state,'wear_uncertain','unknown night placement is deferred');
const table=r.wearTracker(cfg),day=Date.parse('2026-11-20T14:00:00+09:00');
assert.equal(segment(table,day,day+180000,'still',false).state,'off_candidate');
const existingOff=r.wearTracker(cfg);
segment(existingOff,start,start+120000,'still',false);
assert.equal(segment(existingOff,start+120000,start+1200000,'still',false).state,'off_candidate','known static non-wear continues into the guard period');
const disabled=r.wearTracker({tzBase:540,restSleepGuard:false});
assert.equal(segment(disabled,night,night+180000,'still',false).state,'off_candidate');
restored.setCharging(true);assert.equal(restored.result(start+1500000).state,'charging');
assert.equal(restored.memory().lastConfirmed,0);
// A valid HR run while moving can confirm wear before sleep.
const active=r.wearTracker(cfg);segment(active,start,start+120000,'turn',true);
assert(active.memory().lastConfirmed>0);
assert.equal(segment(active,start+120000,start+1200000,'noise',false).state,'wear_held');
// Sleep protection keeps peak processing on rather than freezing it as non-wear.
const p=r.restProfile({tzBase:540});const e=r.create({wearEnabled:true,wearProfile:p,nowMs:night});
for(let ms=night;ms<=night+300000;ms+=200)e.sample({x:0,y:0,z:1},ms);
assert.notEqual(e.snapshot().levels.slice(-2),'fe');assert(!e.getDiagnostics().paused);
const saved=e.snapshot();assert(saved.wearMemory);
console.log('Sleep guard: turns, HR dropout, restart memory, unknown nights, daytime table, charging and continuous peak recording passed.');

const prior=r.wearTracker(cfg,{lastConfirmed:start-600000});
assert.equal(segment(prior,start,start+600000,'still',false).state,'wear_held','guard overrides an earlier off verdict when wear was recently confirmed');
assert.equal(t.result(start+1800000).state,'insufficient');
assert.equal(segment(t,start+1800000,start+2100000,'still',false).state,'wear_held','sensor gaps do not erase confirmed wear history');

const readHistory=t.memory().lastConfirmed;t.result(start+1800000);
assert.equal(t.memory().lastConfirmed,readHistory,'older diagnostics reads never erase confirmed wear');
