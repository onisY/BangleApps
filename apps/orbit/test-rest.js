/* node apps/orbit/test-rest.js -- recorder, lifecycle and actual app rendering.
 * Synthetic accelerometer data tests the definition, not physiological accuracy.
 */
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const EventEmitter=require("events"),r=require("./rest.js"),S=r.constants.slotMs;
const base=Math.floor(Date.parse("2026-10-19T18:00:00Z")/S)*S;
const quiet={x:0,y:0,z:1,mag:1,diff:0.001};
const moving={x:0,y:0,z:1,mag:1,diff:0.1};
function feed(e,start,end,a=quiet,step=1000){for(let t=start;t<=end;t+=step)e.sample(a,t);}
const e=r.create();
feed(e,base,base+9000);assert(!e.getLive().quiet);assert.strictEqual(e.getLive().rest,0);
e.sample(quiet,base+10000);assert(e.getLive().quiet);assert.strictEqual(e.getLive().rest,0);
e.sample(quiet,base+11000);assert.strictEqual(e.getLive().rest,1000);
feed(e,base+12000,base+S);assert.strictEqual(e.level(base/S),5);
assert.strictEqual(e.snapshot().levels.length,288);
for(const [ms,expected] of [[0,1],[60000,1],[61000,2],[121000,3],[181000,4],[241000,5]])
  assert.strictEqual(r.levelFor(ms,S),expected);
assert.strictEqual(r.levelFor(0,269000),0);
const move=r.create();feed(move,base,base+S,moving);assert.strictEqual(move.level(base/S),1);
const gravity=r.create();feed(gravity,base,base+S,{diff:0,mag:0});assert.strictEqual(gravity.level(base/S),1);
// Equivalent result at normal and power-save sensor rates. No fixed sample count.
for(const step of [80,800]){
  const x=r.create();feed(x,base,base+S,quiet,step);x.sync(base+S);
  assert.strictEqual(x.level(base/S),5);
}
const gap=r.create();feed(gap,base,base+20000);gap.sample(quiet,base+S);
assert.strictEqual(gap.level(base/S),0);assert(!gap.getLive().quiet);
const invalid=r.create();feed(invalid,base,base+20000);invalid.sample({diff:NaN,mag:1},base+21000);
assert(!invalid.getLive().quiet);invalid.sample(quiet,base+22000);assert(!invalid.getLive().quiet);
const crossing=r.create();feed(crossing,base+S-5000,base+S+6000);
assert.strictEqual(crossing.getLive().rest,1000); // quiet confirmation survives bin boundary
// A reboot/app switch preserves current-bin totals, but requires fresh confirmation.
const partial=r.create();feed(partial,base,base+100000);
const resumed=r.create({saved:partial.snapshot(),nowMs:base+101000});
feed(resumed,base+101000,base+S);assert.strictEqual(resumed.level(base/S),5);
// Exactly one day of completed bins; the same ring slot is replaced after 24 h.
const ring=r.create();feed(ring,base,base+S*289);
assert.strictEqual(ring.level(base/S),0);assert.strictEqual(ring.level(base/S+288),5);
let visits=[];ring.visit(base+S*289,(b,l)=>visits.push([b,l]));assert.strictEqual(visits.length,288);
assert.strictEqual(visits[0][0],base/S+1);
let old=[];ring.visit(base+S*600,(b,l)=>old.push([b,l]));assert.strictEqual(old.length,0);
const saved=ring.snapshot(),restored=r.create({saved,nowMs:base+S*289});
assert.strictEqual(restored.level(base/S+288),5);
// Backward wall-clock correction cannot resurrect a future bin.
ring.sample(quiet,base+S*100);assert.strictEqual(ring.level(base/S+288),0);
// Radial geometry is outward, scales linearly and completes one turn per day.
const lines=[];r.draw({setColor:()=>{},drawLine:(...p)=>lines.push(p)},restored,
  {nowMs:base+S*289,radiusPx:70,maxHeightPx:10,cx:85,cy:90,south:false,currentAngleRad:0});
assert.strictEqual(lines.length,288);
for(const [x,y,u,v] of lines){
  assert(Math.abs(Math.hypot(x-85,y-90)-70)<0.71);
  assert(Math.abs(Math.hypot(u-85,v-90)-80)<0.71);
  assert(u>=0&&u<176&&v>=0&&v<176);
}
const one={visit:(ms,fn)=>fn(base/S,5)};
function single(now,south=false,height=10){const a=[];r.draw({setColor:()=>{},drawLine:(...p)=>a.push(p)},one,
  {nowMs:now,radiusPx:70,maxHeightPx:height,cx:85,cy:90,south,currentAngleRad:0});return a[0];}
assert.deepStrictEqual(single(base+S),single(base+S+86400000));
assert(Math.hypot(single(base+S,false,14)[2]-85,single(base+S,false,14)[3]-90)>83);
// The exact interval end controls color, including the sunrise boundary.
const colors=[],times=[];
r.draw({setColor:c=>colors.push(c),drawLine:()=>{}},
  {visit:(ms,fn)=>{fn(base/S-1,5);fn(base/S,5);}},
  {nowMs:base+S,radiusPx:70,maxHeightPx:10,cx:85,cy:90,
    currentAngleRad:0,isDayAt:ms=>{times.push(ms);return ms>=base+S;}});
assert.deepStrictEqual(times,[base,base+S]);
assert.deepStrictEqual(colors,[0xffe0,0x07e0]);

function environment(start,config={},data){
  let now=start,color=0,serial=0,writes=0;
  const log=[],timers=new Map(),store=data||{};
  const cfg=Object.assign({eclipseEnabled:false,restEnabled:true,restBarHeight:10,
    restWearEnabled:false,coordVersion:2,locationSource:"manual",manualLat:25.3,manualLon:-104.1},config);
  const modules={"orbit.rest":"rest.js","orbit.eclipse":"eclipse.js","orbit.ecldraw":"eclipse-render.js",
    "orbit.ecldata":"eclipse-terms.js","orbit.eclsun":"eclipse-sun-terms.js"};
  const storage={readJSON:n=>n==="orbit.json"?cfg:n==="setting.json"?{timeout:0}:store[n],
    writeJSON:(n,v)=>{writes++;store[n]=JSON.parse(JSON.stringify(v));},
    read:n=>modules[n]?fs.readFileSync(path.join(__dirname,modules[n]),"utf8"):undefined};
  const g=new Proxy({getWidth:()=>176,getHeight:()=>176,stringWidth:s=>s.length*8,theme:{bg:0,fg:0xffff}},
    {get:(o,k)=>k in o?o[k]:k==="transformVertices"?undefined:(...args)=>{
      if(k==="setColor")color=args[0];log.push({op:k,args,color});return g;}});
  const b=new EventEmitter(),events=new EventEmitter();
  for(const n of ["setGPSPower","setUI","loadWidgets","drawWidgets","setLocked","setBacklight","showLauncher"])
    b[n]=()=>{};
  const power=[];b.setHRMPower=(on,id)=>{power.push([now,on,id]);return !!on;};
  b.isLCDOn=()=>true;
  class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
  const context={Date:Clock,g,Bangle:b,E:events,require:n=>{assert.strictEqual(n,"Storage");return storage;},
    setTimeout:(f,ms)=>{timers.set(++serial,{f,ms,at:now+ms});return serial;},clearTimeout:id=>timers.delete(id),load:()=>{}};
  function execute(file){return vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),"utf8"),context);}
  function advance(t){
    for(;;){const due=[...timers].filter(([id,x])=>x.at<=t).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].f();}
    now=t;
  }
  return {b,events,log,timers,cfg,store,storage,execute,power,advance,writes:()=>writes,setNow:t=>now=t,
    feed:(end,a=quiet)=>{for(let t=now;t<=end;t+=800){now=t;b.emit("accel",a);}now=end;}};
}
const app=environment(base);app.execute("boot.js");assert.strictEqual(app.b.listenerCount("accel"),1);
app.execute("app.js");assert.strictEqual(app.b.listenerCount("accel"),1); // no duplicated engine/table
const initialWrites=app.writes();
app.feed(base+S);app.b.orbitRest.sync(base+S);assert.strictEqual(app.writes()-initialWrites,1);
app.log.length=0;app.b.emit("lcdPower",true);
const graph=app.log.findIndex(x=>x.op==="drawLine"&&x.color===0x07e0);
const observer=app.log.findIndex(x=>x.op==="fillCircle"&&x.color===0xf800&&x.args[2]===2);
assert(graph>=0&&observer>graph);
const bar=app.log[graph].args;assert(Math.hypot(bar[2]-bar[0],bar[3]-bar[1])>=9);
app.b.emit("lcdPower",false);assert.strictEqual(app.timers.size,0);
app.feed(base+S*2);assert.strictEqual(app.b.orbitRest.getEngine().level(base/S+1),5);
app.events.emit("kill"); // persistence before another app/boot; recorder never draws itself
const other=environment(base+S*2+1000,{},app.store);other.execute("boot.js");
assert.strictEqual(other.b.orbitRest.getEngine().level(base/S+1),5);
assert.strictEqual(other.log.length,0);assert.strictEqual(other.timers.size,0);
const count=other.writes();other.feed(base+S*3);assert(other.writes()<=count+1);
other.b.orbitRest.configure({restEnabled:false});assert.strictEqual(other.b.listenerCount("accel"),0);
other.b.orbitRest.configure({restEnabled:true,restThreshold:0.02});assert.strictEqual(other.b.listenerCount("accel"),1);
const off=environment(base,{restEnabled:false});off.execute("boot.js");off.execute("app.js");
assert.strictEqual(off.b.listenerCount("accel"),0);
// Real settings callbacks save the maximum height and switch the live service.
const menus=[];app.events.showMenu=m=>menus.push(m);
app.execute("settings.js")(()=>{});menus.at(-1)["Rest graph"]();
assert.strictEqual(menus.at(-1)["Level 5 height"].max,14);
menus.at(-1)["Level 5 height"].onchange(14);assert.strictEqual(app.cfg.restBarHeight,14);
menus.at(-1)["Enabled"].onchange(false);assert.strictEqual(app.b.listenerCount("accel"),0);
menus.at(-1)["Enabled"].onchange(true);assert.strictEqual(app.b.listenerCount("accel"),1);
menus.at(-1)["Quiet threshold"].onchange(5);assert.strictEqual(app.cfg.restThreshold,0.243);
assert.strictEqual(app.b.listenerCount("accel"),1);
// Existing geometric sunrise/sunset criterion: green day, yellow night.
// Full-day history must retain both colors, independent of the current time.
for(const [iso,expected] of [["2026-10-19T18:00:00Z",0x07e0],["2026-10-19T06:00:00Z",0xffe0]]){
  const now=Date.parse(iso),end=Math.floor(now/S);
  const h=environment(now,{}, {"orbit.rest.json":{v:1,end:end-1,
    levels:"5".repeat(288),active:{bucket:end,covered:0,rest:0}}});
  h.execute("boot.js");h.execute("app.js");
  const bars=h.log.filter(x=>x.op==="drawLine"&&(x.color===0x07e0||x.color===0xffe0));
  assert.strictEqual(bars.length,288);
  assert(bars.some(x=>x.color===0x07e0)&&bars.some(x=>x.color===0xffe0));
  assert.strictEqual(bars.at(-1).color,expected);
}
for(const [iso,color] of [["2026-10-19T18:00:00Z",0x07e0],["2026-10-19T06:00:00Z",0xffe0]]){
  const h=environment(Date.parse(iso),{restEnabled:false});h.execute("app.js");
  const index=h.log.findIndex(x=>x.op==="fillCircle"&&x.color===0xf800&&x.args[2]===2);
  assert(h.log.slice(0,index).some(x=>x.op==="fillPoly"&&x.color===color));
}
console.log("PASS: 10 s confirmation, gravity/diff, five levels, missing data, 80/800 ms rates,");
console.log("24 h overwrite/restart, outward height/period, boot/off/LCD lifecycle, layers and day/night.");
if(process.argv[2]==="--preview"){
  // Synthetic, explicitly labelled samples for reviewing the radial display.
  const end=base/S,levels=Array.from({length:288},(_,i)=>1+Math.floor((Math.sin(i/35)+1)*2.49)).join("");
  const data={"orbit.rest.json":{v:1,end:end-1,levels,active:{bucket:end,covered:0,rest:0}}};
  const h=environment(base,{restBarHeight:14},data);h.execute("boot.js");h.execute("app.js");
  fs.writeFileSync(process.argv[3],JSON.stringify(h.log));
}


// Seven exact settings, migration of legacy thresholds, and configurable confirmation.
assert.deepStrictEqual(r.thresholds,[.001,.003,.009,.027,.081,.243,.729]);
assert.strictEqual(r.thresholdG(.03),.027);
for(const t of r.thresholds){
  const x=r.create({thresholdG:t});feed(x,base,base+S,{z:1,mag:1,diff:t});
  assert.strictEqual(x.level(base/S),5);
}
const fast=r.create({confirmSeconds:2});feed(fast,base,base+3000);
assert.strictEqual(fast.getLive().rest,1000);
function nonWearSeries(zAt,opts={}){
  const x=r.create({wearThresholdG:.009});
  for(let t=0;t<S;t+=1000){if(opts.gap&&t===100000) t+=5000;
    x.sample({z:zAt(t),mag:1,diff:0},base+t);}
  if(!opts.noProbe)x.absentPulse(base/S);
  x.sync(base+S);return x;
}
const absent=nonWearSeries(()=>1);assert.strictEqual(absent.level(base/S),0);
assert.strictEqual(r.create({saved:absent.snapshot(),nowMs:base+S}).level(base/S),0);
assert.strictEqual(nonWearSeries(()=>1,{noProbe:true}).level(base/S),5);
assert.strictEqual(nonWearSeries(t=>1+t/S*.02).level(base/S),5); // slow drift
assert.strictEqual(nonWearSeries(t=>t===100000?1.1:1).level(base/S),5); // brief movement
assert.strictEqual(nonWearSeries(()=>1,{gap:true}).level(base/S),5);
assert.strictEqual(nonWearSeries(()=>NaN).level(base/S),5);
const late=nonWearSeries(()=>1,{noProbe:true});late.absentPulse(base/S);
assert.strictEqual(late.level(base/S),0); // timer/accel callback order at boundary
const interrupted=r.create({saved:partial.snapshot(),nowMs:base+101000});
feed(interrupted,base+101000,base+S-1000);interrupted.absentPulse(base/S);interrupted.sync(base+S);
assert.strictEqual(interrupted.level(base/S),5); // restart cannot prove all-five-minute stillness
let absentLines=0;r.draw({setColor:()=>{},drawLine:()=>absentLines++},absent,
 {nowMs:base+S,radiusPx:60,maxHeightPx:10,cx:88,cy:88,currentAngleRad:0});
assert.strictEqual(absentLines,0);
// Full periodic probe, confidence, no-pulse, motion and power cleanup.
function runWear(pulse,zAt=()=>1,cfg={}){
 const h=environment(base,Object.assign({restWearEnabled:true},cfg));h.execute("boot.js");
 for(let t=0;t<=S;t+=1000){h.advance(base+t);
   h.b.emit("accel",{z:zAt(t),mag:1,diff:0});
   if(t===280000&&pulse)h.b.emit("HRM",pulse);
 }
 return h;
}
const nw=runWear();assert.strictEqual(nw.b.orbitRest.getEngine().level(base/S),0);
assert.deepStrictEqual(nw.power,[[base+270000,1,"orbitrest"],[base+S,0,"orbitrest"]]);
assert.strictEqual(nw.b.listenerCount("HRM"),0);assert.strictEqual(nw.timers.size,1);
assert.strictEqual(runWear({bpm:60,confidence:90}).b.orbitRest.getEngine().level(base/S),5);
assert.strictEqual(runWear({bpm:60,confidence:89}).b.orbitRest.getEngine().level(base/S),0);
assert.strictEqual(runWear({bpm:60,confidence:80},()=>1,{restPulseConfidence:80}).b.orbitRest.getEngine().level(base/S),5);
assert.strictEqual(runWear({bpm:30,confidence:100}).b.orbitRest.getEngine().level(base/S),0);
assert.strictEqual(runWear(null,t=>1+t/S*.02).b.orbitRest.getEngine().level(base/S),5);
const killing=environment(base,{restWearEnabled:true});killing.execute("boot.js");
killing.advance(base+270000);assert.strictEqual(killing.b.listenerCount("HRM"),1);
killing.events.emit("kill");assert.strictEqual(killing.b.listenerCount("HRM"),0);
assert.strictEqual(killing.timers.size,0);assert.strictEqual(killing.power.at(-1)[1],0);
const disable=environment(base,{restWearEnabled:true});disable.execute("boot.js");disable.advance(base+270000);
disable.b.orbitRest.configure({restEnabled:false});assert.strictEqual(disable.timers.size,0);
assert.strictEqual(disable.b.listenerCount("HRM"),0);assert.strictEqual(disable.power.at(-1)[1],0);
const menuEnv=environment(base);const wm=[];menuEnv.events.showMenu=m=>wm.push(m);
menuEnv.execute("settings.js")(()=>{});wm.at(-1)["Rest graph"]();
const q=wm.at(-1)["Quiet threshold"];assert.strictEqual(q.max,6);
for(let i=0;i<7;i++){q.onchange(i);assert.strictEqual(menuEnv.cfg.restThreshold,r.thresholds[i]);}
wm.at(-1)["Non-wear"]();wm.at(-1)["Z range"].onchange(0);
assert.strictEqual(menuEnv.cfg.restWearThreshold,.001);
wm.at(-1)["Probe seconds"].onchange(60);assert.strictEqual(menuEnv.cfg.restProbeSeconds,60);
console.log("PASS: seven thresholds, whole-bin Z range, missing/restarted data, periodic HRM, confidence, power cleanup, non-wear bars and settings.");
