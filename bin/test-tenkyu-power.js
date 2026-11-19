/* Run: node bin/test-tenkyu-power.js */
const assert=require('assert'),r=require('../apps/orbit/rest.js'),p=require('../apps/orbit/powerdraw.js');
const base=Date.parse('2026-11-17T23:15:00Z');
assert.equal(r.restProfile({}).restEco,true);
assert.equal(r.migrateSettings({restEco:false}).restEco,true);
assert.equal(r.migrateSettings({restEco:false,restPowerVersion:1}).restEco,false);
const e=r.create({wearEnabled:true,wearProfile:{restEco:true,restSleepGuard:false},nowMs:base});
for(let t=base;t<base+120000;t+=200)e.sample({x:0,y:0,z:1},t);
let d=e.getDiagnostics();assert(d.paused);const oldOps=d.peakOps;
for(let t=base+120000;t<base+180000;t+=200)e.sample({x:0,y:0,z:1},t);
assert.equal(e.getDiagnostics().peakOps,oldOps,'no peak filter work in stable non-wear');
assert(e.getDiagnostics().pausedSec>=110);
e.sample({x:.8,y:0,z:.6},base+180000);
assert(!e.getDiagnostics().paused,'wake on first large-motion sample');
assert.equal(e.getDiagnostics().peakOps,oldOps+1);
assert.equal(e.getDiagnostics().wakes,1);
for(let t=base+180200;t<=base+300000;t+=200)e.sample({x:.8,y:.05*Math.sin(t/1000),z:.6},t);
assert.equal(e.getDiagnostics().recent.at(-1).result,255,'short resumed observation is not extrapolated');
assert.equal(e.getDiagnostics().recent.at(-1).reason,'activity_partial');

// Small software raster: a cropped restore + changing bar/text must equal a full redraw.
const W=40,H=40;
function raster(){
 const pixels=new Uint16Array(W*H);let clip=[0,0,W-1,H-1];
 const g={pixels,getWidth:()=>W,getHeight:()=>H,reset:()=>g,
   setClipRect:(...v)=>{clip=v;return g;},flip:()=>{},
   put:(x,y,v)=>{if(x>=clip[0]&&x<=clip[2]&&y>=clip[1]&&y<=clip[3]&&x>=0&&x<W&&y>=0&&y<H)pixels[y*W+x]=v;},
   asImage:({x,y,w,h})=>{let a=new Uint16Array(w*h);for(let j=0;j<h;j++)for(let i=0;i<w;i++)a[j*w+i]=pixels[(y+j)*W+x+i];return {width:w,height:h,bpp:16,buffer:a};},
   drawImage:(im,x,y)=>{for(let j=0;j<im.height;j++)for(let i=0;i<im.width;i++)g.put(x+i,y+j,im.buffer[j*im.width+i]);},
   clip:()=>clip};return g;
}
const original=raster();for(let i=0;i<W*H;i++)original.pixels[i]=i%8;
const args={cx:20,cy:20,radius:10,height:5,angle:0,south:false,bucket:1};
assert.equal(p.capture(original,args,'2v25'),undefined);
const patch=p.capture(original,args,'2v26');assert(patch);assert(patch.w*patch.h<2048);
const background=original.pixels.slice();
function bar(g,len){for(let x=30;x<=30+len;x++)g.put(x,20,0xf800);g.put(35,20,0xffff);g.put(35,21,0xffff);}
bar(original,5);
for(const len of [3,5,0,4]){
 const expected=raster();expected.pixels.set(background);bar(expected,len);expected.put(32,20,0x07e0);
 assert(p.draw(original,patch,()=>bar(original,len),()=>original.put(32,20,0x07e0),()=>{}));
 assert.deepEqual(original.pixels,expected.pixels,'cropped redraw exactly restores growing/shrinking bar and overlapping text');
}
assert(!p.draw(original,patch,()=>{throw Error('test');},()=>{},()=>{}));
assert.deepEqual(original.clip(),[0,0,W-1,H-1]);
const legacy=raster();legacy.asImage=()=>({width:40,height:40,buffer:new Uint16Array(1600)});
assert.equal(p.capture(legacy,args,'2v26'),undefined,'reject unsupported whole-screen returns');
console.log('Power: defaults, pause, first-motion wake, partial coverage, pixel-identical cropped updates and firmware fallback passed.');

// Optional drawing-module failures must leave full rendering available.
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../apps/orbit/app.js'),'utf8');
const fn=src.slice(src.indexOf('  function rememberChargeBackground('),src.indexOf('  function drawChargeOnly('));
const sandbox={REST_ENABLED:true,selectedDayOffset:0,Bangle:{isCharging:()=>true},Storage:{read:()=>'{ bad syntax'},powerDraw:undefined,chargePatch:undefined};
vm.createContext(sandbox);vm.runInContext(fn,sandbox);
assert.doesNotThrow(()=>sandbox.rememberChargeBackground({},{}));
assert.equal(sandbox.powerDraw,undefined);
