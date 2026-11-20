/* node bin/test-thermal-wear.js — actual boot service, simulated sensor times and power. */
const assert = require("assert");
const fs = require("fs"), vm = require("vm"), path = require("path");
const {EventEmitter} = require("events");
const code = fs.readFileSync(path.join(__dirname,"../apps/orbit/rest.js"),"utf8");
const start = Date.parse("2026-11-20T03:00:00+09:00");
function device({origin=start, powerFails=false, noPressure=false, delay=500, profile={}, stored}={}) {
  let now=origin, clockId=0, charging=false, leases=new Set(), timers=new Map();
  let xyz=()=>({x:0,y:0,z:1}), caseC=()=>30, pulse=()=>false;
  const b=new EventEmitter(), events=new EventEmitter(), records=[], marks=[], reads=[], powers=[];
  const files={"orbit.json":profile,"orbit.rest.json":stored};
  const sec=()=>Math.round((now-origin)/1000);
  const timeout=(fn,ms)=>{timers.set(++clockId,{fn,at:now+ms});return clockId;};
  const stop=id=>timers.delete(id);
  const env={exports:{},setTimeout:timeout,clearTimeout:stop};
  vm.runInNewContext(code,env);
  b.isCharging=()=>charging;b.isHRMOn=()=>leases.size>0;
  b.setHRMPower=(v,id)=>{
    powers.push([sec(),v,id]);
    if(v&&powerFails)return false;
    if(v)leases.add(id);else leases.delete(id);
    return leases.size>0;
  };
  if(!noPressure)b.getPressure=()=>{
    reads.push(sec());
    const callbacks=[];
    timeout(()=>{const c=caseC(sec());callbacks.forEach(([ok,bad])=>Number.isFinite(c)?ok({temperature:c}):bad());},delay);
    return {then:(ok,bad)=>callbacks.push([ok,bad])};
  };
  events.getBattery=()=>65;
  b.on("orbitWear",off=>marks.push([sec(),off]));
  const service=env.exports.install(b,{readJSON:n=>files[n],writeJSON:(n,v)=>{files[n]=v;}},events,()=>now,
    (kind,value,t)=>records.push([Math.round((t-origin)/1000),kind,value]));
  function advance(target){
    for(;;){
      let next=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      timers.delete(next[0]);now=next[1].at;next[1].fn();
    }
    now=target;
  }
  let processed=-1;
  return {
    service,b,events,files,marks,reads,powers,records,
    signal(a,t,h){xyz=a;caseC=t;pulse=h;},
    run(end){
      const target=origin+end*1000;
      for(let t=processed+1;t<=end*5;t++){
        advance(origin+t*200);b.emit("accel",xyz(t/5));
        if(t%5===0&&pulse(t/5))b.emit("HRM",{bpm:70,confidence:99});
      }
      processed=end*5;advance(target);
      return service.getEngine().getWear(now);
    },
    charge(v){charging=v;b.emit("charging",v);},
    active:()=>leases.size, stop(){events.emit("kill");}, advance
  };
}
const moving=t=>({x:0.55*Math.sin(t*2),y:0.25*Math.sin(t/3),z:0.9});
const desk=()=>({x:0,y:0,z:1});
function scenario(sign,opts={},slope=0.008){
  const sim=device(opts);
  sim.signal(t=>t<140&&t>=60?moving(t):desk(),
    t=>30+sign*Math.min(3,Math.max(0,t-140)*slope),t=>t<=130);
  return sim;
}
for(const hour of [0,12])for(const sign of [-1,1]){
  const sim=scenario(sign,{origin:start+hour*3600000});
  let d=sim.run(300);
  assert.equal(d.state,"off_candidate",JSON.stringify({d,marks:sim.marks,records:sim.records}));
  const marked=sim.marks.find(m=>m[1]);
  assert(marked[0]-140>=50&&marked[0]-140<=120,"latency from put-down "+marked);
  assert(sim.records.some(r=>r[1]==="check"&&r[2]===(sign>0?"thermal_warming":"thermal_cooling")));
  assert(sim.records.some(r=>r[1]==="probe"&&r[0]>=170));
  assert.equal(sim.active(),0);
  console.log("Synthetic "+(sign>0?"warm":"cool")+" surface, "+hour+" h offset: "+(marked[0]-140)+" s");
  // Equilibrium and a brief flip after confirmation preserve the off state.
  sim.signal(t=>t>360&&t<366?moving(t):{x:0,y:0,z:t>=366?-1:1},()=>30+sign*3,()=>false);
  assert.equal(sim.run(500).state,"off_candidate");
  assert.equal(sim.marks.filter(m=>!m[1]).length,0);
}
// A small initial response can become measurable after the high-rate burst.
const slow=scenario(-1,{},0.0007);
assert.notEqual(slow.run(270).state,"off_candidate");
assert.equal(slow.run(850).state,"off_candidate");
const slopeOnly=device();
slopeOnly.signal(t=>t>=540&&t<690?moving(t):desk(),t=>27+t*0.003,t=>t<650);
assert.equal(slopeOnly.run(1050).state,"wear_held","a pre-existing ambient trend is not a removal");
const noisy=device();
noisy.signal(t=>t<140&&t>=60?moving(t):desk(),t=>t===171?28:30,t=>t<130);
assert.equal(noisy.run(450).state,"wear_held","a single temperature spike cannot mark a sleeper unworn");
const plateau=device();
plateau.signal(t=>t>=80&&t<140?moving(t):desk(),t=>t<140?30:32,t=>t<130);
assert.equal(plateau.run(265).state,"off_candidate","a fast metal-surface step can settle before the first post-placement reading");
const spike=device();
spike.signal(t=>t>=60&&t<140?moving(t):desk(),t=>t>=150&&t<155?32:30,t=>t<130);
assert.equal(spike.run(400).state,"wear_held","a bad first burst sample must not set a false baseline");
let d=scenario(0);assert.equal(d.run(1200).state,"wear_held");assert(!d.marks.some(m=>m[1]));
assert(d.reads.length<24,"fast measurements must stop while sleeping");
assert(d.powers.filter(p=>p[1]).length<=3,"HRM must not run repeatedly for the same quiet sleep episode");
const snapshot=d.service.getEngine().snapshot();
let restart=device({origin:start+1201000,stored:snapshot});assert.equal(restart.run(80).state,"wear_held");
assert.equal(restart.service.getEngine().getWear(start).state,"wear_held","older diagnostic cannot rewind");
restart=device({origin:start+3600000,stored:snapshot});assert.equal(restart.run(80).state,"wear_uncertain");
d=scenario(1,{powerFails:true});assert.equal(d.run(210).state,"hr_error");assert(!d.run(300).reason.startsWith("thermal_warm"));assert.deepEqual(d.marks,[]);
d=scenario(1,{noPressure:true});assert.equal(d.run(400).state,"wear_held");
d=scenario(1);d.signal(t=>t<140&&t>=60?moving(t):desk(),t=>30+.012*Math.max(0,t-140),()=>true);
assert.equal(d.run(300).state,"still_pulse");assert.deepEqual(d.marks,[]);
// Charging is conclusive. After unplug ignore the entire charging cooling transient.
d=device();d.charge(true);assert.equal(d.run(50).state,"charging");d.charge(false);
d.signal(desk,t=>35-.01*t,()=>false);assert.equal(d.run(210).state,"off_candidate");
assert.equal(d.reads.filter(t=>t>50).length,0);
d.signal(moving,t=>35-.01*t,()=>true);assert.equal(d.run(275).reason,"sustained_pulse");
assert.equal(d.active(),0);
// A short handling episode permits a measured pulse after re-fastening.
d=device();d.charge(true);d.run(5);d.charge(false);
assert.equal(d.service.getEngine().getWear(start+5000).state,"off_candidate");
d.signal(desk,()=>36,t=>t>8&&d.active()>0);assert.equal(d.run(100).state,"wear_held");
const pickup=scenario(-1);pickup.run(440);
pickup.signal(moving,t=>27+0.02*(t-440),()=>false);
assert(pickup.run(550).state==="motion");
assert(pickup.records.some(r=>r[2]==="thermal_pickup"),"sustained motion + thermal change can confirm re-wear");
pickup.signal(desk,()=>29,()=>false);assert.equal(pickup.run(650).state,"wear_held");
// The delayed native read from a previous service generation cannot contaminate a new session.
d=device({delay:2200});d.run(0);d.charge(true);d.run(8);
assert(!d.records.some(r=>r[1]==="temperature"));
d.stop();assert.equal(d.active(),0);assert.equal(d.b.listenerCount("HRM"),0);
console.log("Thermal wear, sleep/HR dropout, missing temperature, charger cooling, restarts and cleanup passed.");
