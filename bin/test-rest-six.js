/* Run: node bin/test-rest-six.js */
const assert=require('assert'),r=require('../apps/orbit/rest.js');
const base=Date.parse('2026-11-17T23:15:00Z'),slot=300000;
assert.deepEqual(r.activityDefaults,[.1,3,60,200,500]);
assert.deepEqual([0,.099,.1,2.999,3,59.999,60,199.999,200,499.999,500,900]
  .map(x=>r.stageFor(r.activityLevel(x,r.activityDefaults))),[5,5,4,4,3,3,2,2,1,1,0,0]);
assert.equal(r.restProfile({}).restScaleVersion,6);
assert.equal(r.restProfile({}).restActivityT5,500);
assert.equal(r.restProfile({restActivityT4:700,restActivityT5:900},{restQuietNoiseG:.01}).restActivityT5,900);
const codes=[0,20,40,60,100,253,254,255,151];
const hex=values=>values.map(x=>x.toString(16).padStart(2,'0')).join('');
const end=base/slot;
function restore(version,values){
 const e=r.create({nowMs:base+slot,saved:{v:version,end,levels:'ff'.repeat(288-values.length)+hex(values),
   diag:[{bucket:end,result:values.at(-1)}]}});
 e.sync(base+slot);return e;
}
let e=restore(4,codes);
assert.equal(e.snapshot().v,5);
assert.equal(e.snapshot().levels.slice(-18),hex([20,40,60,80,100,253,254,255,151]));
assert.equal(restore(5,[0]).snapshot().levels.slice(-2),'00','new running level 0 remains valid');
assert.equal(restore(2,[0]).snapshot().levels.slice(-2),'ff','old missing code remains missing');
assert.equal(restore(4,[20]).getDiagnostics().recent[0].result,40);
for(let stage=0;stage<=5;stage++){
 const lines=[],g={setColor:()=>{},drawLine:(...xy)=>lines.push(xy)};
 r.draw(g,{visit:(ms,fn)=>fn(end,stage*20)},
   {nowMs:base+slot,radiusPx:70,maxHeightPx:10,cx:80,cy:80,currentAngleRad:0,dayBuckets:{polar:1}});
 assert.equal(lines.length,1);
 const [x,y,u,v]=lines[0];
 assert(Math.abs(Math.hypot(u-80,v-80)-Math.hypot(x-80,y-80)-stage*2)<1.1);
}
console.log('Six-stage boundaries, zero-length level 0, profile merging and v2-v5 history migration passed.');
// Exercise the watch's settings menus, including the new fifth boundary.
const fs=require('fs'),vm=require('vm'),path=require('path');
let menu;const cfg={restEnabled:false,coordVersion:2,locationSource:'manual',manualLat:35,manualLon:139};
const storage={readJSON:n=>n==='orbit.json'?cfg:{},writeJSON:(n,s)=>Object.assign(cfg,s),read:()=>undefined};
const ctx={require:n=>n==='Storage'?storage:undefined,Bangle:{setGPSPower:()=>{}},
 E:{showMenu:m=>{menu=m;},on:()=>{}},setTimeout:fn=>{fn();return 0;},clearTimeout:()=>{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../apps/orbit/settings.js'),'utf8'),ctx)(()=>{});
menu['Rest graph']();menu['Stage boundaries']();
assert.equal(Object.keys(menu).filter(x=>/^L\d\/\d/.test(x)).length,5);
assert(Object.keys(menu).some(x=>x.startsWith('L1/0')));
menu['< Back']();menu['Level guide']();
assert.equal(Object.keys(menu).filter(x=>/^Level \d$/.test(x)).length,6);
console.log('All six guide labels and five configurable boundaries are present.');
