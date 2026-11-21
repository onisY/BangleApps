// Run with node bin/test-orbit-debug.js. All samples and timestamps are synthetic.
const assert = require("assert");
const {EventEmitter} = require("events");
const rest = require("../apps/orbit/rest.js");
const files = {}, csv = {};
const original = {v:5,end:100,levels:"64".repeat(288)};
let denyHistory = true, now = Date.UTC(2026,10,20,20), free = 500000;
const storage = {
  readJSON(name){return name==="orbit.rest.json"&&denyHistory?undefined:files[name];},
  writeJSON(name,data){files[name]=data;return true;},
  read(name){return files[name]&&"{";},
  open(name){return {getLength:()=>(csv[name]||"").length,
    write(line){csv[name]=(csv[name]||"")+line;},erase(){delete csv[name];}};},
  list(){return Object.keys(csv);},getFree(){return free;}
};
files["orbit.rest.json"]=original;
const b=new EventEmitter(), e=new EventEmitter();
b.isCharging=()=>false;b.setHRMPower=()=>true;
const service=rest.install(b,storage,e,()=>now);
const origin=now;
for(let i=0;i<=1500;i++){now=origin+i*200;b.emit("accel",{x:0,y:0,z:1});}
const name=Object.keys(csv)[0], rows=csv[name].trim().split("\n").map(x=>x.split(","));
const asObject = row=>Object.fromEntries(rows[0].map((col,i)=>[col,row[i]]));
const last=asObject(rows.at(-1));
assert.equal(last.event,"history_protected");assert.equal(last.coverage_s,300);
assert.equal(last.rest_level,5);assert.equal(last.T3,60);
assert(rows.slice(1).every(row=>row.length===rows[0].length));
assert.strictEqual(files["orbit.rest.json"],original);
const bytes=csv[name].length;
service.configure({restDebug:false});now+=300000;service.sync(now);assert.equal(csv[name].length,bytes);
service.configure({restDebug:true});
for(let i=0;i<4;i++){now+=86400000;service.sync(now);}
assert.equal(Object.keys(csv).length,3);
free=100;now+=300000;service.sync(now);assert.equal(service.getDiagnostics().debugStatus,"Low storage");
e.emit("kill");denyHistory=false;
const b2=new EventEmitter();b2.isCharging=()=>false;
const fresh=rest.install(b2,storage,new EventEmitter(),()=>now);
fresh.save();assert.notStrictEqual(files["orbit.rest.json"],original);
console.log("Independent CSV, thresholds, read protection, toggle, retention and low storage passed.");
