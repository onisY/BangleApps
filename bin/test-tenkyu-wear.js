/* Run: node bin/test-tenkyu-wear.js [directory containing orbitlab-*-raw.csv] */
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {EventEmitter}=require('events');
const r=require('../apps/orbit/rest.js'),lab=require('../apps/orbitlab/rest.js');
assert.equal(r.wearTracker.toString(),lab.wearTracker.toString());
assert.equal(fs.readFileSync(path.join(__dirname,'../apps/orbit/rest.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../apps/orbitlab/rest.js'),'utf8'));
assert.deepEqual(r.activityDefaults,[.1,3,60,200,500]);
assert.equal(r.restProfile({}).restThreshold,.003);
assert.equal(r.migrateSettings({restActivityT1:.1,restActivityT2:3,restActivityT3:20,restActivityT4:200}).restActivityT3,60);
assert.equal(r.migrateSettings({restActivityT3:77}).restActivityT3,77);
assert.equal(r.migrateSettings({restAlgorithmVersion:4,restActivityT3:20}).restActivityT3,20);
const base=Date.parse('2026-11-17T23:15:00Z');
function feed(tracker,mode,step=80) {
  for(let dt=0;dt<70000;dt+=step){
    tracker.sample({x:mode==='moving'?.4*Math.sin(dt/1000):mode==='noisy'?.03*Math.sin(dt):0,y:0,z:1},base+dt);
    if(mode==='pulse'&&dt%1040===0)tracker.hrm({bpm:70,confidence:98},base+dt);
  }
  return tracker.result(base+70000);
}
for(const step of [80,200])assert.equal(feed(r.wearTracker({}),'quiet',step).state,'wear_uncertain');
assert.equal(feed(r.wearTracker({}),'moving').state,'motion');
assert.equal(feed(r.wearTracker({}) ,'noisy').state,'wear_uncertain');
let t=r.wearTracker({});assert.equal(feed(t,'pulse').state,'still_pulse');
for(let dt=70000;dt<150000;dt+=80)t.sample({x:0,y:0,z:1},base+dt);
assert.equal(t.result(base+150000).state,'wear_held','confirmed worn state survives HRM sleep');
assert.equal(t.result(base+300000).state,'insufficient','stale accel cannot hold a verdict');
t=r.wearTracker({});feed(t,'quiet');t.setError(true);assert.equal(t.result(base+70000).state,'hr_error');
t.setCharging(true);assert.equal(t.result(base+70000).state,'charging');t.setCharging(false);assert.equal(t.result(base+70000).state,'insufficient');

function environment({error=false,shared=false}={}) {
 let now=base,id=0;const timers=new Map(),files={'orbit.json':{tzBase:540}},power=[];
 const b=new EventEmitter(),events=new EventEmitter();
 let owned=false;b.isCharging=()=>false;b.isHRMOn=()=>shared||owned;
 b.setHRMPower=(v,owner)=>{power.push([now,v,owner]);owned=!error&&!!v;return error?false:shared||owned;};
 events.getBattery=()=>80;
 const context={exports:{},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../apps/orbit/rest.js'),'utf8'),context);
 const service=context.exports.install(b,{readJSON:n=>files[n],writeJSON:(n,v)=>{files[n]=JSON.parse(JSON.stringify(v));}},events,()=>now);
 function advance(ms){for(;;){let due=[...timers].filter(([,v])=>v.at<=ms).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}now=ms;}
 function run(ms,mode='noisy',hr=false){
   for(let n=now;n<ms;n+=80){advance(n);b.emit('accel',{x:mode==='quiet'?0:.03*Math.sin(n),y:0,z:1});
     if(hr&&n%1040===0&&(shared||service.isProbing()))b.emit('HRM',{bpm:70,confidence:0});}
   advance(ms);service.sync(ms);
 }
 return {b,events,service,files,power,timers,run,advance};
}
let env=environment();env.run(base+300000,'quiet');
assert.equal(env.service.getEngine().snapshot().levels.slice(-2),'64');
assert(env.power.some(p=>p[1]),'unknown static watch receives a limited probe');
assert.equal(env.files['orbit.json'].restAlgorithmVersion,4);
env=environment();env.run(base+200000,'noisy',true);
assert(env.power.some(x=>x[1]===1));assert.equal(env.power.at(-1)[1],0,'own probe request released');
assert.equal(env.service.getEngine().getWear(base+200000).state,'wear_uncertain');
env=environment({shared:true});env.run(base+100000,'noisy',true);assert(env.b.isHRMOn(),'external HRM owner remains active after a probe');
assert(env.power.every(p=>p[2]==='orbitrest'));
env.events.emit('kill');assert.equal(env.timers.size,0);assert.equal(env.b.listenerCount('accel'),0);
env=environment();env.run(base+65000,"noisy");assert(env.service.isProbing());
env.b.emit("charging",true);assert(!env.service.isProbing());assert.equal(env.power.at(-1)[1],0);
env.events.emit("kill");assert.equal(env.timers.size,0);
env=environment({error:true});env.run(base+300000,'noisy');
assert.equal(env.service.getEngine().snapshot().levels.slice(-2),'fd','power failures are distinct from unworn');
env.service.configure({restEnabled:false});assert.equal(env.b.listenerCount('HRM'),0);assert.equal(env.timers.size,0);
assert.equal(env.files['orbit.json'].restAlgorithmVersion,4,'runtime disable preserves persisted config');
env=environment();env.run(base+300000,'noisy');
assert.notEqual(env.service.getEngine().snapshot().levels.slice(-2),'fe','no HR alone is insufficient');
assert(env.power.filter(x=>x[1]===1).length<=2,'retry uses backoff');
env.service.configure({restEnabled:false});

const stale=r.create({wearEnabled:true,nowMs:base});
for(let ms=base;ms<base+70000;ms+=80)stale.sample({x:0,y:0,z:1},ms);
assert.equal(stale.getLive(base+180000).wear.state,"insufficient","live markers expire when accel stops");

// Preserve old history codes and the charging/non-wear marker rendering.
let e=r.create({wearEnabled:true,nowMs:base});
e.setCharging(true,50);for(let ms=base;ms<=base+300000;ms+=80)e.sample({x:0,y:0,z:1},ms);
assert.equal(parseInt(e.snapshot().levels.slice(-2),16),151);
let restored=r.create({saved:{v:3,end:base/300000,levels:'ff'.repeat(287)+'fe'},nowMs:base+300000});
const draw=[];const g=new Proxy({},{get:(_,op)=>(...args)=>{draw.push([op,...args]);return g;}});
r.draw(g,restored,{nowMs:base+300000,radiusPx:70,maxHeightPx:10,cx:85,cy:90,currentAngleRad:0,mode:4});
assert(draw.length>0,'old non-wear history still renders');

if(process.argv[2]){
 const expectations={'mwlb8z8j.yxecdi':{off:true},'mwlcdxjp.1qncdi':{worn:true},'mwkucmpc.0qw7b9':{mixed:true}};
 for(const [id,expected] of Object.entries(expectations)){
  const file=path.join(process.argv[2],'orbitlab-'+id+'-raw.csv');
  const rows=fs.readFileSync(file,'utf8').trim().split('\n').slice(1).map(x=>x.split(','));
  const p=r.restProfile(Object.assign({},JSON.parse(decodeURIComponent(rows.find(x=>x[1]==='profile')[2]))));
  const data=rows.filter(x=>['accel','hrm'].includes(x[1])).sort((a,b)=>+a[0]-b[0]);
  const e=r.create({nowMs:+data[0][0],wearEnabled:true,holdEnabled:true,wearProfile:p,thresholdG:p.restThreshold,
    activityThresholds:[p.restActivityT1,p.restActivityT2,p.restActivityT3,p.restActivityT4,p.restActivityT5]});
  let nextAccel=0;
  let offWindows=0,workOff=0,next=Math.ceil(+data[0][0]/10000)*10000;
  for(const x of data){
   while(next<=+x[0]){const d=e.getWear(next);if(d.state==='off_candidate'){offWindows++;if(next<Date.parse('2026-11-17T16:01:00Z'))workOff++;}next+=10000;}
   if(x[1]==='accel'){if(!p.restEco||+x[0]>=nextAccel){nextAccel=nextAccel&&+x[0]-nextAccel<=200?nextAccel+200:+x[0]+200;e.sample({x:+x[2],y:+x[3],z:+x[4]},+x[0]);}}else e.hrm({bpm:+x[5],confidence:+x[6]},+x[0]);
  }
  const d=e.getDiagnostics().recent;
  if(expected.off){assert.equal(offWindows,0,'already stationary table without temperature or previous state is uncertain');assert.equal(e.getLive().wear.state,'wear_uncertain');}
  if(expected.worn){assert.equal(offWindows,0);assert(d.filter(x=>x.valid).every(x=>x.result<=60));assert.deepEqual([20,40,60].map(v=>d.filter(x=>x.valid&&x.result===v).length),[1,3,7]);}
  if(expected.mixed){assert.equal(workOff,0);assert.notEqual(e.getLive().wear.state,'off_candidate','archived recording contains no temperatures');}
  console.log(id,JSON.stringify({windowsOff:offWindows,bins:d.map(x=>[x.result,x.wearSeconds]),final:e.getLive().wear.state}));
 }
}
console.log('Wear v4: thresholds, state retention, sparse HR, power/error cleanup, backoff, charging, history and replay passed.');
