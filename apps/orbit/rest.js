/* tenkyu screen-normal (Z) acceleration peak-rest recorder; MIT.
 * For every observed 5-minute interval, bar height equals the percentage
 * of local |high-pass(Z)| peaks that do not exceed the selected threshold.
 * Non-wear still uses whole-bin Z range and a periodic HRM probe.
 */
var SLOT_MS=300000,COUNT=288,DAY_MS=SLOT_MS*COUNT;
var NOT_WORN=254,NO_DATA=255;
var MAX_GAP_MS=2500,MIN_COVERAGE_MS=270000;
var THRESHOLDS=[0.001,0.003,0.009,0.027,0.081,0.243,0.729];
function thresholdG(v){
  if(!isFinite(v)||v<=0)return 0.027;
  var best=0;
  for(var n=1;n<7;n++)if(Math.abs(Math.log(v/THRESHOLDS[n]))<Math.abs(Math.log(v/THRESHOLDS[best])))best=n;
  return THRESHOLDS[best];
}
function limit(v,lo,hi,def){return isFinite(v)?Math.max(lo,Math.min(hi,+v)):def;}
function wearConfig(s){return {enabled:s.restWearEnabled!==false,
  z:thresholdG(s.restWearThreshold===undefined?0.009:s.restWearThreshold),
  seconds:limit(s.restProbeSeconds,10,60,30),confidence:limit(s.restPulseConfidence,1,100,90),
  min:limit(s.restPulseMin,20,100,40),max:limit(s.restPulseMax,120,240,200)};}


/* Streamed five-minute Z-axis motion-peak ratio.
 * One local maximum of |high-pass(z)| counts as one peak; no arrays of samples.
 * Thresholds are in g, and history stores integer percentages (0..100).
 */
function percentFor(quietPeaks,peakCount,coveredMs){
  if(coveredMs<MIN_COVERAGE_MS)return 0; // missing coverage
  if(peakCount===0)return 100; // no movement peaks in an observed, worn interval
  return Math.max(0,Math.min(100,Math.round(100*quietPeaks/peakCount)));
}
function create(options){
  options=options||{};
  var levels=new Uint8Array(COUNT),stamps=new Uint32Array(COUNT);
  var threshold=thresholdG(options.thresholdG),save=options.onCommit;
  var wearG=thresholdG(options.wearThresholdG===undefined?0.009:options.wearThresholdG);
  var zMin=Infinity,zMax=-Infinity,zFirst,zLast,zBad=false,noPulse=false;
  var closedBucket=-1,closedStill=false;
  var current=-1,covered=0,peaks=0,quietPeaks=0,lastMs,lastValid=false;
  var zBase,ampOlder,ampPrevious;
  var old=options.saved,i,b,v;
  if(old&&(old.v===2||old.v===3)&&isFinite(old.end)&&typeof old.levels==="string"&&old.levels.length===COUNT*2){
    for(i=0;i<COUNT;i++){
      b=old.end-COUNT+1+i;v=parseInt(old.levels.substr(2*i,2),16);
      if(b>=0&&isFinite(v)&&v>=0&&v<=255){
        stamps[b%COUNT]=b;
        levels[b%COUNT]=old.v===2&&v===0?NO_DATA:v;
      }
    }
    if(old.active&&old.active.bucket===Math.floor(options.nowMs/SLOT_MS)){
      current=old.active.bucket;
      covered=Math.max(0,Math.min(SLOT_MS,+old.active.covered||0));
      peaks=Math.max(0,+old.active.peaks||0);
      quietPeaks=Math.max(0,Math.min(peaks,+old.active.quietPeaks||0));
    }
  }
  function resetPeak(){zBase=undefined;ampOlder=undefined;ampPrevious=undefined;}
  function roll(ms){
    var target=Math.floor(ms/SLOT_MS),changed=false;
    if(target===current)return false;
    if(current>=0&&target>current){
      closedBucket=current;
      closedStill=!zBad&&zFirst!==undefined&&zFirst-current*SLOT_MS<=MAX_GAP_MS&&
        (current+1)*SLOT_MS-zLast<=MAX_GAP_MS&&zMax-zMin<=wearG;
      i=current%COUNT;stamps[i]=current;
      levels[i]=covered<MIN_COVERAGE_MS?NO_DATA:
        (noPulse&&closedStill?NOT_WORN:percentFor(quietPeaks,peaks,covered));changed=true;
    }else if(current>=0&&target<current){
      for(i=0;i<COUNT;i++)if(stamps[i]>=target){stamps[i]=0;levels[i]=0;}
      closedBucket=-1;changed=true;
    }
    current=target;covered=0;peaks=0;quietPeaks=0;resetPeak();
    zMin=Infinity;zMax=-Infinity;zFirst=undefined;zLast=undefined;zBad=false;noPulse=false;
    if(changed&&save)save();
    return changed;
  }
  function detectPeak(z,dt){
    // IIR removes gravity and changes of orientation without extra sensor reads.
    if(zBase===undefined)zBase=z;
    else zBase+=(dt/(2000+dt))*(z-zBase);
    var amp=Math.abs(z-zBase);
    // Detect a positive local maximum. Flat tops count once, negative Z included.
    if(ampOlder!==undefined&&ampPrevious!==undefined&&
       ampPrevious>ampOlder&&ampPrevious>=amp&&ampPrevious>0){
      peaks++;
      if(ampPrevious<=threshold)quietPeaks++;
    }
    ampOlder=ampPrevious;ampPrevious=amp;
  }
  function sample(a,ms){
    if(!isFinite(ms)||ms<0)return;
    var z=a&&a.z,valid=isFinite(z),dt=lastMs===undefined?0:ms-lastMs;
    var continuous=lastValid&&valid&&dt>0&&dt<=MAX_GAP_MS;
    var target=Math.floor(ms/SLOT_MS);
    if(!continuous){
      if(target!==current)roll(ms);
      resetPeak();
    }else if(target===current){
      covered+=dt; // Common case: no rollover or extra loop per sensor event.
    }else{
      // A valid interval can cross only one 5-minute boundary (dt<=2.5 s).
      var boundary=target*SLOT_MS;
      if(current>=0&&target===current+1)covered+=boundary-lastMs;
      roll(ms);
      covered+=ms-boundary;
    }
    if(!valid)zBad=true;
    else{
      if(zFirst===undefined)zFirst=ms;
      if(zLast!==undefined&&(ms-zLast>MAX_GAP_MS||ms<=zLast))zBad=true;
      zLast=ms;zMin=z<zMin?z:zMin;zMax=z>zMax?z:zMax;
      detectPeak(z,continuous?dt:0);
    }
    lastMs=ms;lastValid=!!valid;
  }
  function sync(ms){
    if(Math.floor(ms/SLOT_MS)!==current){
      roll(ms);lastMs=ms;lastValid=false;
    }
  }
  function absentPulse(bucket){
    if(bucket===current){noPulse=true;return;}
    if(bucket===closedBucket&&closedStill&&stamps[bucket%COUNT]===bucket){
      levels[bucket%COUNT]=NOT_WORN;if(save)save();
    }
  }
  function level(bucket){return stamps[bucket%COUNT]===bucket?
    (levels[bucket%COUNT]>100?0:levels[bucket%COUNT]):0;}
  function visit(ms,fn){
    var end=Math.floor(ms/SLOT_MS)-1,b,v;
    for(b=end-COUNT+1;b<=end;b++)if(b>=0&&stamps[b%COUNT]===b){
      v=levels[b%COUNT];
      if(v<=100)fn(b,v); // 0%-quiet is a visible stage-1 bar.
    }
  }
  function snapshot(){
    var end=current-1,out="",b,v;
    for(b=end-COUNT+1;b<=end;b++){
      v=b>=0?level(b):0;
      if(stamps[b%COUNT]!==b)v=NO_DATA;
      else v=levels[b%COUNT];
      out+=("0"+v.toString(16)).slice(-2);
    }
    return {v:3,end:end,levels:out,
      active:{bucket:current,covered:covered,peaks:peaks,quietPeaks:quietPeaks}};
  }
  return {sample:sample,sync:sync,absentPulse:absentPulse,visit:visit,snapshot:snapshot,level:level,
    getLive:function(){return {bucket:current,covered:covered,peaks:peaks,
      quietPeaks:quietPeaks,rate:percentFor(quietPeaks,peaks,covered)};}};
}
function install(bangle,storage,events,clock){
  clock=clock||function(){return Date.now();};
  if(bangle.orbitRest)return bangle.orbitRest;
  var engine,enabled=false,configKey,api,wear,probe,timer;
  var HR_ID="orbitrest";
  function persist(){if(engine)try{storage.writeJSON("orbit.rest.json",engine.snapshot());}catch(e){}}
  function onAccel(a){engine.sample(a,clock());}
  function onHRM(h){
    if(probe&&h&&isFinite(h.bpm)&&h.bpm>=wear.min&&h.bpm<=wear.max&&
      isFinite(h.confidence)&&h.confidence>=wear.confidence){
      probe.pulse=true;
      // Enough evidence of wear: turn the optical LED off immediately.
      stopProbe();scheduleProbe();
    }
  }
  function stopProbe(){
    if(timer!==undefined){clearTimeout(timer);timer=undefined;}
    if(probe){bangle.removeListener("HRM",onHRM);
      try{bangle.setHRMPower(0,HR_ID);}catch(e){}probe=undefined;}
  }
  function scheduleProbe(){
    if(!enabled||!wear.enabled||typeof bangle.setHRMPower!=="function")return;
    var now=clock(),bucket=Math.floor(now/SLOT_MS),start=(bucket+1)*SLOT_MS-wear.seconds*1000;
    // Never infer absence from a shortened probe after an app reload.
    if(start<now){bucket++;start+=SLOT_MS;}
    timer=setTimeout(function(){
      timer=undefined;
      var begin=clock(),end=(bucket+1)*SLOT_MS;
      if(begin<start||begin-start>MAX_GAP_MS){scheduleProbe();return;}
      probe={bucket:bucket,start:begin,end:end,pulse:false};
      bangle.on("HRM",onHRM);
      try{
        if(bangle.setHRMPower(1,HR_ID)===false)throw new Error("HRM unavailable");
      }catch(e){stopProbe();timer=setTimeout(scheduleProbe,SLOT_MS);return;}
      timer=setTimeout(function(){
        timer=undefined;
        var p=probe,now=clock();stopProbe();
        if(p&&now>=p.end&&now-p.end<=MAX_GAP_MS&&!p.pulse){
          engine.absentPulse(p.bucket);engine.sync(now);
        }
        scheduleProbe();
      },Math.max(1,end-clock()));
    },Math.max(1,start-now));
  }
  function configure(s){
    var on=s.restEnabled!==false,t=thresholdG(s.restThreshold),w=wearConfig(s);
    var key=JSON.stringify([t,w]);
    if(on===enabled&&(!on||key===configKey))return;
    stopProbe();
    if(enabled){bangle.removeListener("accel",onAccel);persist();}
    enabled=on;configKey=key;wear=w;
    if(on){
      engine=create({thresholdG:t,wearThresholdG:w.z,
        nowMs:clock(),saved:storage.readJSON("orbit.rest.json",1),onCommit:persist});
      bangle.on("accel",onAccel);scheduleProbe();
    }else engine=undefined;
  }
  api={configure:configure,save:persist,isEnabled:function(){return enabled;},
    draw:function(graphics,map){draw(graphics,engine,map);},
    getEngine:function(){return engine;},sync:function(ms){if(engine)engine.sync(ms);}};
  bangle.orbitRest=api;
  if(events)events.on("kill",function(){stopProbe();persist();});
  configure(storage.readJSON("orbit.json",1)||{});
  return api;
}
function stageFor(percent){
  // Five visible lengths for worn records. No-data / non-wear are not visited.
  return Math.max(1,Math.min(5,1+Math.floor(Math.min(99,percent)/20)));
}
function draw(graphics,engine,map){
  if(!engine)return;
  // The selected maximum is now the stage-5 height.
  var r=map.radiusPx,height=Math.max(1,Math.min(map.maxHeightPx,14));
  var dir=map.south?1:-1,now=map.nowMs;
  engine.visit(now,function(bucket,value){
    // Plot at the interval END: a completed bar expires exactly 24 h later.
    var endMs=(bucket+1)*SLOT_MS,age=now-endMs;
    var a=map.currentAngleRad-dir*age*2*Math.PI/DAY_MS;
    var ca=Math.cos(a),sa=Math.sin(a),outer=r+height*stageFor(value)/5;
    // Match the observer ray's geometric sunrise/sunset at this bar's time.
    graphics.setColor(map.isDayAt&&map.isDayAt(endMs)?0x07E0:0xFFE0);
    graphics.drawLine(Math.round(map.cx+r*ca),Math.round(map.cy+r*sa),
      Math.round(map.cx+outer*ca),Math.round(map.cy+outer*sa));
  });
}
exports.create=create;
exports.install=install;
exports.draw=draw;
exports.percentFor=percentFor;
exports.stageFor=stageFor;
exports.constants={slotMs:SLOT_MS,count:COUNT,maxGapMs:MAX_GAP_MS,minCoverageMs:MIN_COVERAGE_MS};


exports.thresholdG=thresholdG;
exports.thresholds=THRESHOLDS;
