// Fixed-size 60-second sensor window: under 2 KiB of typed-array storage.
// Acceleration-only non-wear is a heuristic for exceptionally quiet placement.
function wearTracker(profile) {
  profile=profile||{};
  function option(k,d,lo,hi) { var v=profile[k];return typeof v==="number"&&isFinite(v)?Math.max(lo,Math.min(hi,v)):d; }
  var cfg={noiseG:option("restWearNoiseG",0.030,0.001,1),
    driftG:option("restWearDriftG",0.025,0.001,1),
    quietNoiseG:option("restQuietNoiseG",0.012,0.001,1),
    quietDriftG:option("restQuietDriftG",0.012,0.001,1),
    confidence:option("restPulseConfidence",90,1,100),
    absentRatio:option("restAbsentRatio",0.10,0,0.5),
    minHRSeconds:20,minSeconds:54,windowSeconds:60,
    hold:profile.restWearHold!==false};
  var stamps=new Uint32Array(60),data=new Float32Array(240),hrStamps=new Uint32Array(60),
    hrGood=new Uint8Array(60),sec=-1,n=0,sx=0,sy=0,sz=0,sq=0,first=0,last=0,
    charging=false,powerError=false,held="",cached,at=-1;
  function reset() {
    stamps.fill(0);hrStamps.fill(0);sec=-1;n=0;held="";cached=undefined;at=-1;
  }
  function advance(ms) {
    var next=Math.floor(ms/1000);
    if(next<sec)reset();
    if(next!==sec) {
      if(sec>=0&&n>=3&&last-first>=500) {
        var i=sec%60,k=i*4,x=sx/n,y=sy/n,z=sz/n;
        stamps[i]=sec+1;data[k]=x;data[k+1]=y;data[k+2]=z;
        data[k+3]=Math.sqrt(Math.max(0,sq/n-x*x-y*y-z*z));
      }
      sec=next;n=0;sx=0;sy=0;sz=0;sq=0;
    }
  }
  function sample(a,ms) {
    if(!a||!isFinite(a.x)||!isFinite(a.y)||!isFinite(a.z)||!isFinite(ms))return;
    advance(ms);
    if(!n)first=ms;
    last=ms;n++;sx+=a.x;sy+=a.y;sz+=a.z;sq+=a.x*a.x+a.y*a.y+a.z*a.z;
  }
  function hrm(h,ms) {
    if(!h||!isFinite(h.bpm)||!isFinite(h.confidence)||!isFinite(ms))return;
    advance(ms);
    var i=sec%60;hrStamps[i]=sec+1;
    hrGood[i]=h.bpm>0&&h.confidence>cfg.confidence?1:0;
  }
  function result(ms) {
    advance(ms);
    var now=Math.floor(ms/10000);
    if(cached&&now===at)return cached;
    at=now;
    var noise=[],x=0,y=0,z=0,q=0,hr=0,good=0;
    for(var i=0;i<60;i++) {
      if(stamps[i]>sec-60&&stamps[i]<=sec&&stamps[i]) {
        var k=i*4,a=data[k],b=data[k+1],c=data[k+2];
        x+=a;y+=b;z+=c;q+=a*a+b*b+c*c;noise.push(data[k+3]);
      }
      if(hrStamps[i]>sec-60&&hrStamps[i]<=sec&&hrStamps[i]) {hr++;good+=hrGood[i];}
    }
    var count=noise.length;
    noise.sort(function(a,b){return a-b;});
    var rms=count?noise[Math.floor(count/2)]:0;
    var drift=count?Math.sqrt(Math.max(0,q/count-(x*x+y*y+z*z)/(count*count))):0;
    var ratio=hr?good/hr:-1,state="insufficient",reason="accel_missing";
    var still=count>=cfg.minSeconds&&rms<=cfg.noiseG&&drift<=cfg.driftG;
    var quiet=still&&rms<=cfg.quietNoiseG&&drift<=cfg.quietDriftG;
    if(charging){state="charging";reason="charging";held="";}
    else if(count<cfg.minSeconds){held="";}
    else if(!still){state="motion";reason="window_motion";held="";}
    else if(powerError){state="hr_error";reason="hrm_power_error";held="";}
    else if(good>=10&&ratio>=0.6){state="still_pulse";reason="sustained_pulse";held="worn";}
    else if(cfg.hold&&held==="worn"){state="still_pulse";reason="pulse_held_still";}
    else if(quiet&&good<=2){state="off_candidate";reason=hr?"nonwear_quiet":"nonwear_quiet_no_hr";held="off";}
    else if(hr>=cfg.minHRSeconds&&ratio<=cfg.absentRatio){state="off_candidate";reason="nonwear_low_pulse_ratio";held="off";}
    else if(cfg.hold&&held==="off"){state="off_candidate";reason="nonwear_held_window";}
    else {state=hr<cfg.minHRSeconds?"hr_missing":"hr_uncertain";reason=state;}
    cached={time:ms,start:(sec-60)*1000,state:state,reason:reason,seconds:count,
      noiseG:rms,driftG:drift,hrSeconds:hr,goodSeconds:good,ratio:ratio,
      stationary:still,quiet:quiet};
    return cached;
  }
  return {sample:sample,hrm:hrm,result:result,config:cfg,
    setCharging:function(v){if(charging!==!!v)reset();charging=!!v;},
    setError:function(v){powerError=!!v;cached=undefined;}};
}

/* tenkyu 3-axis high-pass peak-excess rest recorder; MIT.
 * Each valid 5-minute bin sums (|3D HPF peak| - noise threshold) for
 * suprathreshold local maxima, then maps that sum into five rest stages.
 * Non-wear retains 1-second XYZ mean-vector drift and periodic HRM probing.
 */
var SLOT_MS=300000,COUNT=288,DAY_MS=SLOT_MS*COUNT;
var HRM_FAILED=253,NOT_WORN=254,NO_DATA=255;
var CHARGE_BASE=101,CHARGE_END=201; // Battery percentage 0..100%.
function batteryPercent(v){return isFinite(v)?Math.round(Math.max(0,Math.min(100,+v))):0;}
function chargingCode(v){return CHARGE_BASE+batteryPercent(v);}
var HR_PENDING=0,HR_FOUND=1,HR_ABSENT=2,HR_FAILED=3;
var MAX_GAP_MS=2500,MIN_COVERAGE_MS=270000;
var THRESHOLDS=[0.001,0.003,0.009,0.027,0.081,0.243,0.729];
var ACTIVITY_DEFAULTS=[0.1,3,60,200],HP_TAU_MS=1600; // ~0.1Hz at 12.5Hz
function activityThresholds(v){
  var a=[],prev=0;
  for(var i=0;i<4;i++){
    var n=v&&v[i];
    if(!isFinite(n)||n<=prev)n=ACTIVITY_DEFAULTS[i];
    if(n<=prev)n=prev+0.1;
    a.push(n);prev=n;
  }
  return a;
}
function activityLevel(sum,cuts){
  return sum>=cuts[3]?0:sum>=cuts[2]?20:
    sum>=cuts[1]?40:sum>=cuts[0]?60:100;
}
// Extrapolate a valid >=270s observation to one full five-minute window.
// Lower coverage is UNKNOWN, never a reliable extrapolation.
function activity300(sum,coveredMs){
  return coveredMs>=MIN_COVERAGE_MS&&coveredMs<SLOT_MS?
    sum*SLOT_MS/coveredMs:sum;
}
function thresholdG(v){
  if(!isFinite(v)||v<=0)return 0.003;
  var best=0;
  for(var n=1;n<7;n++)if(Math.abs(Math.log(v/THRESHOLDS[n]))<Math.abs(Math.log(v/THRESHOLDS[best])))best=n;
  return THRESHOLDS[best];
}
function limit(v,lo,hi,def){return isFinite(v)?Math.max(lo,Math.min(hi,+v)):def;}
function wearConfig(s){return {enabled:s.restWearEnabled!==false,
  z:thresholdG(s.restWearThreshold===undefined?0.009:s.restWearThreshold),
  seconds:limit(s.restProbeSeconds,10,60,30),
  hold:s.restWearHold!==false,
  confidence:limit(s.restPulseConfidence,1,100,90)};}


/* Rest history retains 0..100 presentation codes for v2/v3 compatibility.
 * New results are quantized into 0,20,40,60,100 (stages 1..5).
 * 101..201=charging (red 0..100% radial bar).
 * 253=HRM failed (white arc); 254=unworn (white marker); 255=missing XYZ (blank).
 * Old percentages keep their displayed stages.
 */
function create(options){
  options=options||{};
  var levels=new Uint8Array(COUNT),stamps=new Uint32Array(COUNT);
  var threshold=thresholdG(options.thresholdG),threshold2=threshold*threshold;
  var cuts=activityThresholds(options.activityThresholds),save=options.onCommit;
  var wearG=thresholdG(options.wearThresholdG===undefined?0.009:options.wearThresholdG);
  var vecMotionRun=0,vecWornMotion=false;
  var vecSX=0,vecSY=0,vecSZ=0,vecCount=0,vecSecond=-1;
  var vecRefX,vecRefY,vecRefZ,vecMaxD2=0;
  var closedBucket=-1,closedStill=false,closedVectorOK=false,
    closedPercent=0,closedPulse=HR_PENDING,closedMotion=false,closedCharge=-1;
  var charging=false,chargePercent=0,chargedThisBucket=-1;
  var current=-1,covered=0,activity=0,peakCount=0,lastMs,lastValid=false;
  var wearEnabled=!!options.wearEnabled,holdEnabled=!!options.holdEnabled,pulseState=HR_PENDING;
  var holdPulse=HR_PENDING,holdX,holdY,holdZ,lastX,lastY,lastZ,holdRun=0;
  var pulseConfidence=-1,closedConfidence=-1;
  var diag=options.saved&&options.saved.diag instanceof Array?
    options.saved.diag.slice(-12):[];
  var lpX,lpY,lpZ,qOld,qPrev;
  var tracker=wearTracker(Object.assign({},options.wearProfile||{},{restWearHold:options.holdEnabled!==false})),wearOff=0,wearSeen=0,wearError=0,wearAt=-1,wearReason="",closedWear;
  function updateWear(ms) {
    var d=tracker.result(ms),tick=Math.floor(ms/10000);
    if(tick!==wearAt) {
      var dt=wearAt>=0?Math.max(0,Math.min(10000,(tick-wearAt)*10000)):0;
      if(d.seconds>=54) {wearSeen+=dt;if(d.state==="off_candidate"){wearOff+=dt;wearReason=d.reason;}if(d.state==="hr_error")wearError+=dt;}
      wearAt=tick;
    }
    return d;
  }
  function wearLevel(ok,percent) {
    if(!ok)return NO_DATA;
    if(!wearEnabled)return percent;
    if(wearOff>=60000&&wearOff>=covered/2)return NOT_WORN;
    if(wearError>=60000&&wearError>=covered/2)return HRM_FAILED;
    return percent;
  }
  var old=options.saved,i,b,v;
  if(old&&(old.v===2||old.v===3||old.v===4)&&isFinite(old.end)&&typeof old.levels==="string"&&old.levels.length===COUNT*2){
    for(i=0;i<COUNT;i++){
      b=old.end-COUNT+1+i;v=parseInt(old.levels.substr(2*i,2),16);
      if(b>=0&&isFinite(v)&&v>=0&&v<=255){
        stamps[b%COUNT]=b;
        levels[b%COUNT]=old.v===2&&v===0?NO_DATA:v;
      }
    }
    if(old.active&&old.active.metric===3&&
       old.active.bucket===Math.floor(options.nowMs/SLOT_MS)&&
       old.active.gate===threshold&&
       JSON.stringify(old.active.cuts)===JSON.stringify(cuts)){
      current=old.active.bucket;
      if(old.active.wearConfig===JSON.stringify(tracker.config)){
        wearOff=+old.active.wearOff||0;wearSeen=+old.active.wearSeen||0;wearError=+old.active.wearError||0;
      }
      covered=Math.max(0,Math.min(SLOT_MS,+old.active.covered||0));
      activity=Math.max(0,+old.active.activity||0);
      peakCount=Math.max(0,+old.active.peakCount||0);
      if(isFinite(old.active.charge)&&old.active.charge>=0&&
         old.active.charge<=100)
        chargedThisBucket=batteryPercent(old.active.charge);
    }
  }
  function resetPeak(){
    lpX=undefined;lpY=undefined;lpZ=undefined;qOld=undefined;qPrev=undefined;
  }
  function clearHold(){holdPulse=HR_PENDING;holdX=undefined;holdRun=0;}
  function establishHold(hr){
    if(!wearEnabled||!holdEnabled||lastX===undefined)return;
    if(hr!==HR_FOUND&&hr!==HR_ABSENT&&hr!==HR_FAILED)return;
    holdPulse=hr;holdX=lastX;holdY=lastY;holdZ=lastZ;holdRun=0;
  }
  function checkHeldMotion(x,y,z){
    if(holdPulse===HR_PENDING)return;
    var dx=x-holdX,dy=y-holdY,dz=z-holdZ;
    var d2=dx*dx+dy*dy+dz*dz,z2=wearG*wearG;
    if(d2>z2)holdRun++;else holdRun=0;
    if(holdRun>=2||d2>9*z2){clearHold();vecWornMotion=true;}
  }
  function flushVector(){
    if(!vecCount)return;
    var x=vecSX/vecCount,y=vecSY/vecCount,z=vecSZ/vecCount;
    if(vecRefX===undefined){vecRefX=x;vecRefY=y;vecRefZ=z;}
    else{
      // Full 3D deviation from the starting acceleration vector in g.
      // At ~1g, direction change theta gives 2*sin(theta/2) g deviation.
      // Unlike unit-vector direction alone, translational motion counts too.
      var dx=x-vecRefX,dy=y-vecRefY,dz=z-vecRefZ;
      var d2=dx*dx+dy*dy+dz*dz;
      if(d2>vecMaxD2)vecMaxD2=d2;
      // Reject isolated noise in a motionless watch. Any large deviation
      // (>3x) or two consecutive above-threshold seconds proves motion.
      if(d2>wearG*wearG)vecMotionRun++;
      else vecMotionRun=0;
      if(vecMotionRun>=2||d2>9*wearG*wearG)vecWornMotion=true;
    }
    checkHeldMotion(x,y,z);
    lastX=x;lastY=y;lastZ=z;
    vecSX=0;vecSY=0;vecSZ=0;vecCount=0;
  }
  function resetVector(){
    vecSX=0;vecSY=0;vecSZ=0;vecCount=0;vecSecond=-1;
    vecRefX=undefined;vecRefY=undefined;vecRefZ=undefined;vecMaxD2=0;
    vecMotionRun=0;vecWornMotion=false;
  }
  function addVector(a,ms){
    var second=Math.floor(ms/1000);
    if(second!==vecSecond){flushVector();vecSecond=second;}
    vecSX+=a.x;vecSY+=a.y;vecSZ+=a.z;vecCount++;
  }
  // Retained API name for diagnostics; eligibility is now independent of rest stage.
  function isStage5Candidate(bucket){
    return wearEnabled&&!charging&&bucket===current&&tracker.result(lastMs||0).stationary;
  }
  function setCharging(active,pct){
    if(!!active!==charging)clearHold();
    tracker.setCharging(active);
    charging=!!active;
    if(charging){
      chargePercent=batteryPercent(pct);
      chargedThisBucket=chargePercent;
    }
  }
  function updateClosed() {}
  function markProbe(bucket,status,confidence){
    if(bucket===current){
      pulseState=status;
      if(status===HR_FAILED&&!vecWornMotion&&covered>=MIN_COVERAGE_MS)
        establishHold(HR_FAILED);
      if(isFinite(confidence)&&confidence>=0)pulseConfidence=confidence;
    }else if(bucket===closedBucket){
      closedPulse=status;
      if(isFinite(confidence)&&confidence>=0)closedConfidence=confidence;
      updateClosed();
    }
  }
  function roll(ms){
    var target=Math.floor(ms/SLOT_MS),changed=false;
    if(target===current)return false;
    if(current>=0&&target>current){
      flushVector();
      closedBucket=current;
      // One skipped accelerometer event must not invalidate 270+ seconds
      // of observed data. Missing major portions still yield NO_DATA.
      closedVectorOK=vecRefX!==undefined&&covered>=MIN_COVERAGE_MS;
      closedMotion=closedVectorOK&&vecWornMotion;
      closedStill=closedVectorOK&&!closedMotion;
      var corrected=closedVectorOK?activity300(activity,covered):undefined;
      closedPercent=activityLevel(corrected===undefined?activity:corrected,cuts);
      closedPulse=pulseState;closedConfidence=pulseConfidence;
      closedCharge=chargedThisBucket;
      i=current%COUNT;stamps[i]=current;
      levels[i]=closedCharge>=0?chargingCode(closedCharge):wearLevel(closedVectorOK,closedPercent);
      closedWear=tracker.result(ms);
      diag.push({bucket:current,coverageSec:Math.round(covered/1000),
        driftG:Math.round(Math.sqrt(vecMaxD2)*10000)/10000,
        motion:closedMotion,
        activity:Math.round(activity*1000)/1000,
        activity300:corrected===undefined?null:Math.round(corrected*1000)/1000,
        peaks:peakCount,valid:closedVectorOK,pulse:closedPulse,confidence:closedConfidence,
        result:levels[i],
        wearSeconds:Math.round(wearOff/1000),window:closedWear,
        reason:closedCharge>=0?"charging":!closedVectorOK?"accel_missing":
          levels[i]===NOT_WORN?wearReason:levels[i]===HRM_FAILED?"hrm_power_error":"rest_activity"});
      if(diag.length>12)diag.shift();
      if(closedPercent!==100)clearHold();
      if(closedCharge<0&&closedPercent===100&&closedVectorOK&&closedStill&&closedPulse!==HR_PENDING)
        establishHold(closedPulse);
      changed=true;
    }else if(current>=0&&target<current){
      for(i=0;i<COUNT;i++)if(stamps[i]>=target){stamps[i]=0;levels[i]=0;}
      clearHold();closedBucket=-1;changed=true;
    }
    current=target;covered=0;activity=0;peakCount=0;resetPeak();resetVector();
    wearOff=0;wearSeen=0;wearError=0;wearAt=-1;
    chargedThisBucket=charging?chargePercent:-1;
    // No persistent gap-failure flag: covered duration is authoritative.
    pulseState=HR_PENDING;pulseConfidence=-1;
    if(changed&&save)save();
    return changed;
  }
  function detectPeak(a,dt){
    // Three 1st-order HPFs, streaming; one adaptive coefficient per XYZ event.
    if(lpX===undefined){
      lpX=a.x;lpY=a.y;lpZ=a.z;qOld=undefined;qPrev=undefined;
      return;
    }
    var alpha=dt/(HP_TAU_MS+dt);
    lpX+=alpha*(a.x-lpX);lpY+=alpha*(a.y-lpY);lpZ+=alpha*(a.z-lpZ);
    var x=a.x-lpX,y=a.y-lpY,z=a.z-lpZ,q=x*x+y*y+z*z;
    // Detect brief displacements even if the one-second mean returns to rest.
    if(holdPulse!==HR_PENDING&&q>9*wearG*wearG){
      clearHold();vecWornMotion=true;
    }
    // Gate on squared threshold BEFORE looking for a local maximum.
    // Only accepted peaks compute sqrt; subthreshold peaks never do.
    if(qOld!==undefined&&qPrev>=threshold2&&qPrev>qOld&&qPrev>=q){
      activity+=Math.sqrt(qPrev)-threshold;peakCount++;
      if(activity>=cuts[0]&&holdPulse!==HR_PENDING)clearHold();
    }
    qOld=qPrev;qPrev=q;
  }
  function sample(a,ms){
    if(!isFinite(ms)||ms<0)return;
    var z=a&&a.z,valid=!!a&&isFinite(a.x)&&isFinite(a.y)&&isFinite(z),
      dt=lastMs===undefined?0:ms-lastMs;
    var continuous=lastValid&&valid&&dt>0&&dt<=MAX_GAP_MS;
    var target=Math.floor(ms/SLOT_MS);
    if(!continuous){
      // Equal timestamps are possible when a boundary timer and accelerometer
      // event coincide; only a genuine gap/rewind invalidates the held state.
      if(lastMs!==undefined&&(!valid||dt>MAX_GAP_MS||dt<0))clearHold();
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
    if(valid){
      tracker.sample(a,ms);updateWear(ms);
      addVector(a,ms);
      detectPeak(a,continuous?dt:0);
    }
    lastMs=ms;lastValid=!!valid;
  }
  function sync(ms){
    if(Math.floor(ms/SLOT_MS)!==current){
      roll(ms);lastMs=ms;lastValid=false;
    }
  }
  function absentPulse(bucket,confidence){markProbe(bucket,HR_ABSENT,confidence);}
  function detectedPulse(bucket,confidence){markProbe(bucket,HR_FOUND,confidence);}
  function failedProbe(bucket){markProbe(bucket,HR_FAILED);}
  function level(bucket){return stamps[bucket%COUNT]===bucket?
    (levels[bucket%COUNT]>100?0:levels[bucket%COUNT]):0;}
  function visit(ms,fn,onNonWear,onFailure,onCharging){
    var end=Math.floor(ms/SLOT_MS)-1,b,v;
    for(b=end-COUNT+1;b<=end;b++)if(b>=0&&stamps[b%COUNT]===b){
      v=levels[b%COUNT];
      if(v<=100)fn(b,v);
      else if(v===NOT_WORN&&onNonWear)onNonWear(b);
      else if(v===HRM_FAILED&&onFailure)onFailure(b);
      else if(v>=CHARGE_BASE&&v<=CHARGE_END&&onCharging)
        onCharging(b,v-CHARGE_BASE);
      // Missing XYZ coverage (255) is always transparent.
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
    return {v:4,end:end,levels:out,diag:diag,
      active:{metric:3,wearConfig:JSON.stringify(tracker.config),wearOff:wearOff,wearSeen:wearSeen,wearError:wearError,bucket:current,gate:threshold,cuts:cuts,
        covered:covered,activity:activity,peakCount:peakCount,
        charge:chargedThisBucket}};
  }
  return {sample:sample,sync:sync,setCharging:setCharging,
    hrm:function(h,ms){tracker.hrm(h,ms);if(h&&isFinite(h.confidence))pulseConfidence=Math.max(pulseConfidence,h.confidence);},getWear:function(ms){return tracker.result(ms);},
    setWearError:function(v){tracker.setError(v);},
    absentPulse:absentPulse,detectedPulse:detectedPulse,
    failedProbe:failedProbe,visit:visit,snapshot:snapshot,level:level,
    getDiagnostics:function(){return {window:tracker.result(lastMs||0),bucket:current,coverageSec:Math.round(covered/1000),
      driftG:Math.round(Math.sqrt(vecMaxD2)*10000)/10000,
      motion:vecWornMotion,vectorValid:vecRefX!==undefined,
      pulse:pulseState,confidence:pulseConfidence,holdState:tracker.result(lastMs||0).state==="off_candidate"?HR_ABSENT:tracker.result(lastMs||0).state==="still_pulse"?HR_FOUND:tracker.result(lastMs||0).state==="hr_error"?HR_FAILED:HR_PENDING,
      probeStatus:"0=pending,1=detected,2=absent,3=failed",
      recent:diag.slice()};},
    hasMotion:function(bucket){return bucket===current&&vecWornMotion;},
    hasPulse:function(bucket){return bucket===current&&pulseState===HR_FOUND;},
    hasRecentAccel:function(ms){return lastValid&&lastMs!==undefined&&
      ms>=lastMs&&ms-lastMs<=MAX_GAP_MS;},
    getWearHold:function(){return holdPulse;},
    isStage5Candidate:isStage5Candidate,
    getLive:function(ms){return {wear:wearEnabled?tracker.result(ms===undefined?lastMs||0:ms):undefined,bucket:current,covered:covered,peaks:peakCount,
      activity:activity,level:activityLevel(activity,cuts),
       charging:charging,chargePercent:chargePercent};}};
}
function migrateSettings(settings) {
  var s=Object.assign({},settings||{});
  if(s.restAlgorithmVersion!==4) {
    var cuts=[s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4];
    if(JSON.stringify(cuts)==="[0.1,3,20,200]"||JSON.stringify(cuts)==="[0.5,2,6,18]"||JSON.stringify(cuts)==="[1,2,6,18]")
      ACTIVITY_DEFAULTS.forEach(function(v,i){s["restActivityT"+(i+1)]=v;});
    if(s.restProbeSeconds===15)s.restProbeSeconds=30;
    s.restAlgorithmVersion=4;
  }
  return s;
}
function install(bangle,storage,events,clock) {
  clock=clock||function(){return Date.now();};
  if(bangle.orbitRest)return bangle.orbitRest;
  var engine,enabled=false,settings,key,probe,timer,chargeTimer,nextProbeAt=0,
    nextBattery=0,nextSample=0,failures=0,probeCount=0,lastStatus="Not started",lastAt=-1,
    charging=false,chargePercent=0;
  var HR_ID="orbitrest";
  function persist(){if(engine)try{storage.writeJSON("orbit.rest.json",engine.snapshot());}catch(e){}}
  function battery(){try{return batteryPercent(events&&events.getBattery?events.getBattery():chargePercent);}catch(e){return 0;}}
  function isCharging(){try{return !!bangle.isCharging();}catch(e){return false;}}
  function stopProbe() {
    if(timer!==undefined){clearTimeout(timer);timer=undefined;}
    if(probe&&probe.ownsPower)try{bangle.setHRMPower(0,HR_ID);}catch(e){}
    probe=undefined;
  }
  function stopCharge(){if(chargeTimer!==undefined){clearTimeout(chargeTimer);chargeTimer=undefined;}}
  function verdict(now) {
    var d=engine.getWear(now),bucket=Math.floor(now/SLOT_MS);
    if(d.state==="off_candidate")engine.absentPulse(bucket);
    else if(d.state==="still_pulse")engine.detectedPulse(bucket);
    return d;
  }
  function finishProbe() {
    var p=probe,now=clock();stopProbe();
    if(!p||!enabled)return;
    var d=verdict(now);
    lastAt=now;
    if(d.state==="off_candidate"||d.state==="still_pulse") {
      failures=0;lastStatus=d.reason;nextProbeAt=now+900000;
    }else {
      failures++;lastStatus=p.events?"HR inconclusive":"No HRM events";
      nextProbeAt=now+(failures===1?60000:900000);
    }
  }
  function beginProbe(now) {
    probe={ownsPower:false,events:0};probeCount++;lastAt=now;lastStatus="Measuring";
    try {
      if(!bangle.isHRMOn||!bangle.isHRMOn()) {
        probe.ownsPower=true;
        if(bangle.setHRMPower(1,HR_ID)===false)throw new Error("HRM unavailable");
      }
      engine.setWearError(false);
    }catch(e) {
      stopProbe();engine.setWearError(true);failures++;
      lastStatus="Power error";nextProbeAt=now+(failures===1?60000:900000);return;
    }
    timer=setTimeout(finishProbe,settings.restProbeSeconds*1000);
  }
  function onAccel(a) {
    if(!enabled||!engine)return;
    var now=clock();
    if(settings.restEco){
      if(now<nextSample)return;
      nextSample=nextSample&&now-nextSample<=200?nextSample+200:now+200;
    }
    if(now>=nextBattery){nextBattery=now+60000;if(isCharging()!==charging)onCharging(isCharging());}
    if(charging){engine.sync(now);return;}
    engine.sample(a,now);
    var d=verdict(now);
    if(!settings.restWearEnabled)return;
    if(!d.stationary) {
      if(probe){lastStatus="Interrupted by motion";stopProbe();}
      failures=0;nextProbeAt=Math.min(nextProbeAt,now+10000);return;
    }
    // Reuse a resolved still-window verdict until genuine window motion.
    if(d.state==="off_candidate"||d.state==="still_pulse"){if(probe)finishProbe();return;}
    if(!probe&&now>=nextProbeAt)beginProbe(now);
  }
  function onHRM(h) {
    if(!enabled||charging||!settings.restWearEnabled)return;
    engine.hrm(h,clock());
    if(probe&&h&&isFinite(h.bpm)&&isFinite(h.confidence))probe.events++;
  }
  function chargeTick() {
    chargeTimer=undefined;
    if(!enabled||!charging)return;
    if(!isCharging()){onCharging(false);return;}
    chargePercent=battery();engine.setCharging(true,chargePercent);engine.sync(clock());
    chargeTimer=setTimeout(chargeTick,60000);
  }
  function onCharging(v) {
    if(!enabled)return;
    var was=charging;
    engine.sync(clock());charging=!!v;stopProbe();stopCharge();
    failures=0;nextProbeAt=clock();chargePercent=battery();
    engine.setCharging(charging,chargePercent);
    if(charging)chargeTimer=setTimeout(chargeTick,60000);
    if(was||charging)persist();
  }
  function configure(input) {
    var original=storage.readJSON("orbit.json",1)||{};
    var s=migrateSettings(Object.assign({},original,input||{})),newKey=JSON.stringify(restProfile(s)),on=s.restEnabled!==false;
    if(original.restAlgorithmVersion!==4)try{storage.writeJSON("orbit.json",s);}catch(e){}
    if(enabled===on&&key===newKey)return;
    stopProbe();stopCharge();
    if(enabled){bangle.removeListener("accel",onAccel);bangle.removeListener("HRM",onHRM);bangle.removeListener("charging",onCharging);persist();}
    enabled=on;key=newKey;settings=s;
    settings.restWearEnabled=s.restWearEnabled!==false;
    settings.restProbeSeconds=limit(s.restProbeSeconds,30,60,30);
    nextProbeAt=clock();nextBattery=0;nextSample=0;failures=0;charging=false;
    if(enabled) {
      engine=create({thresholdG:s.restThreshold,
        activityThresholds:[s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4],
        wearThresholdG:s.restWearThreshold,wearEnabled:s.restWearEnabled,
        holdEnabled:s.restWearHold!==false,wearProfile:s,nowMs:clock(),
        saved:storage.readJSON("orbit.rest.json",1),onCommit:persist});
      bangle.on("accel",onAccel);bangle.on("HRM",onHRM);bangle.on("charging",onCharging);
      onCharging(isCharging());
    }else engine=undefined;
  }
  var api={configure:configure,save:persist,isEnabled:function(){return enabled;},
    draw:function(g,map){draw(g,engine,map);},getEngine:function(){return engine;},
    isProbing:function(){return !!probe;},sync:function(ms){if(engine)engine.sync(ms);},
    getDiagnostics:function(){
      var d=engine?engine.getDiagnostics():{disabled:true};
      if(engine)d.window=engine.getWear(clock());
      d.charging=charging;d.chargePercent=chargePercent;d.probeCount=probeCount;
      d.lastProbeStatus=lastStatus;d.lastProbeAt=lastAt;d.sharedPulseCount=0;return d;
    }};
  bangle.orbitRest=api;
  if(events)events.on("kill",function(){
    stopProbe();stopCharge();persist();
    bangle.removeListener("accel",onAccel);bangle.removeListener("HRM",onHRM);bangle.removeListener("charging",onCharging);
  });
  configure(storage.readJSON("orbit.json",1)||{});
  return api;
}
function stageFor(percent){
  // Five visible lengths for worn records. No-data / non-wear are not visited.
  return Math.max(1,Math.min(5,1+Math.floor(Math.min(99,percent)/20)));
}
function draw(graphics,engine,map){
  if(!engine)return;
  // Diagnostic stages: 0=visit, 1=classify, 2=geometry,
  // 3=geometry+day, 4=no-op graphics, 5=real graphics.
  var mode=map.diagnosticStage===undefined?5:map.diagnosticStage;
  var perf=map.perf,bars=0;
  if(mode===0){
    engine.visit(map.nowMs,function(){bars++;},
      function(){bars++;},function(){bars++;},function(){bars++;});
    if(engine.getLive&&engine.getLive().charging)bars++;
    if(live&&!live.charging&&live.wear&&live.wear.state==="off_candidate"&&
     live.bucket===Math.floor(now/SLOT_MS)&&mode>=2){
    bars++;drawWearMarker(Math.cos(map.currentAngleRad),Math.sin(map.currentAngleRad));
  }
  if(perf)perf.bars=bars;
    return;
  }
  var r=map.radiusPx,height=Math.max(1,Math.min(map.maxHeightPx,14));
  var dir=map.south?1:-1,now=map.nowMs,scale=2*Math.PI/DAY_MS;
  var step=dir*2*Math.PI/COUNT,cs=Math.cos(step),ss=Math.sin(step);
  var lastBucket=-2,ca=0,sa=0;
  function pointAt(bucket){
    if(bucket===lastBucket+1){
      var nc=ca*cs-sa*ss;sa=sa*cs+ca*ss;ca=nc;
    }else if(bucket!==lastBucket){
      var a=map.currentAngleRad-dir*(now-(bucket+1)*SLOT_MS)*scale;
      ca=Math.cos(a);sa=Math.sin(a);
    }
    lastBucket=bucket;
  }
  function drawArc(bucket,color){
    bars++;
    if(mode===1)return;
    pointAt(bucket);
    var x1=Math.round(map.cx+r*(ca*cs+sa*ss));
    var y1=Math.round(map.cy+r*(sa*cs-ca*ss));
    var x2=Math.round(map.cx+r*ca),y2=Math.round(map.cy+r*sa);
    if(mode>=4){graphics.setColor(color);graphics.drawLine(x1,y1,x2,y2);}
  }
  function drawWearMarker(cc,ss){
    var outer=r+height;
    var x=Math.round(map.cx+outer*cc),y=Math.round(map.cy+outer*ss);
    if(mode<4)return;
    graphics.setColor(0xFFFF);
    graphics.setPixel(x,y);
    // Place the adjacent pixel along the orbit, keeping the marker at the tip.
    if(Math.abs(cc)>=Math.abs(ss))graphics.setPixel(x,y+(cc>=0?1:-1));
    else graphics.setPixel(x+(ss>=0?-1:1),y);
  }
  function drawCharging(cc,ss,pct){
    var outer=r+height*pct/100;
    var x1=Math.round(map.cx+r*cc),y1=Math.round(map.cy+r*ss);
    var x2=Math.round(map.cx+outer*cc),y2=Math.round(map.cy+outer*ss);
    if(mode>=4){graphics.setColor(0xF800);graphics.drawLine(x1,y1,x2,y2);}
    drawWearMarker(cc,ss);
  }
  engine.visit(now,function(bucket,value){
    bars++;
    var stage=stageFor(value);
    if(mode===1)return;
    pointAt(bucket);
    var outer=r+height*stage/5;
    var x1=Math.round(map.cx+r*ca),y1=Math.round(map.cy+r*sa);
    var x2=Math.round(map.cx+outer*ca),y2=Math.round(map.cy+outer*sa);
    if(mode===2)return;
    // Compare bucket indices only. The 24-hour history may cross midnight.
    var sun=map.dayBuckets,day=false;
    if(sun){
      if(sun.polar)day=sun.polar>0;
      else day=(bucket>=sun.first&&bucket<sun.last)||
        (bucket>=sun.first-COUNT&&bucket<sun.last-COUNT);
    }
    if(mode>=4){graphics.setColor(day?0x07E0:0xFFE0);
      graphics.drawLine(x1,y1,x2,y2);}
  },function(bucket){
    bars++;
    if(mode===1)return;
    pointAt(bucket);
    drawWearMarker(ca,sa);
  },function(bucket){drawArc(bucket,0xFFFF);},
    function(bucket,pct){
      bars++;
      if(mode===1)return;
      pointAt(bucket);
      drawCharging(ca,sa,pct);
    });
  // Show the active charging window immediately, without waiting five minutes.
  var live=engine.getLive&&engine.getLive(now);
  if(live&&live.charging&&live.bucket===Math.floor(now/SLOT_MS)){
    bars++;
    if(mode>=2){
      var a=map.currentAngleRad;
      drawCharging(Math.cos(a),Math.sin(a),live.chargePercent);
    }
  }
  if(live&&!live.charging&&live.wear&&live.wear.state==="off_candidate"&&
     live.bucket===Math.floor(now/SLOT_MS)&&mode>=2){
    bars++;drawWearMarker(Math.cos(map.currentAngleRad),Math.sin(map.currentAngleRad));
  }
  if(perf)perf.bars=bars;
}
exports.create=create;
exports.install=install;
exports.draw=draw;
exports.activityLevel=activityLevel;
exports.activity300=activity300;
exports.activityThresholds=activityThresholds;
exports.stageFor=stageFor;
exports.constants={slotMs:SLOT_MS,count:COUNT,maxGapMs:MAX_GAP_MS,minCoverageMs:MIN_COVERAGE_MS,
  hrmFailed:HRM_FAILED,unworn:NOT_WORN,noData:NO_DATA,
  chargeBase:CHARGE_BASE,chargeEnd:CHARGE_END};


exports.thresholdG=thresholdG;
exports.thresholds=THRESHOLDS;
exports.activityDefaults=ACTIVITY_DEFAULTS;

exports.wearTracker=wearTracker;
exports.migrateSettings=migrateSettings;

function restProfile(base,override){
  base=migrateSettings(base||{});override=override?migrateSettings(override):override;
  var s={},keys=["restThreshold","restActivityT1","restActivityT2","restActivityT3",
    "restActivityT4","restWearEnabled","restWearHold","restWearThreshold",
    "restProbeSeconds","restPulseConfidence","restEco","restWearNoiseG","restWearDriftG","restQuietNoiseG","restQuietDriftG","restAbsentRatio"];
  keys.forEach(function(k){
    var x=override&&override[k];
    s[k]=typeof x==="boolean"&&/Enabled|Hold|Eco/.test(k)||typeof x==="number"&&isFinite(x)?x:base[k];
  });
  var wear=wearConfig(s);
  var cuts=activityThresholds([s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4]);
  var result={restThreshold:thresholdG(s.restThreshold),restActivityT1:cuts[0],
    restActivityT2:cuts[1],restActivityT3:cuts[2],restActivityT4:cuts[3],
    restWearEnabled:wear.enabled,restWearHold:wear.hold,restWearThreshold:wear.z,
    restProbeSeconds:wear.seconds,restPulseConfidence:wear.confidence,restEco:s.restEco===true,restAlgorithmVersion:4};
  var wc=wearTracker(s).config;
  result.restWearNoiseG=wc.noiseG;result.restWearDriftG=wc.driftG;result.restQuietNoiseG=wc.quietNoiseG;result.restQuietDriftG=wc.quietDriftG;result.restAbsentRatio=wc.absentRatio;
  return result;
}

exports.restProfile=restProfile;
