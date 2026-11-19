// Fixed-size 60-second sensor window: under 2 KiB of typed-array storage.
// Acceleration-only non-wear is a heuristic for exceptionally quiet placement.
function wearTracker(profile,memory) {
  profile=profile||{};
  function option(k,d,lo,hi) { var v=profile[k];return typeof v==="number"&&isFinite(v)?Math.max(lo,Math.min(hi,v)):d; }
  var cfg={noiseG:option("restWearNoiseG",0.030,0.001,1),
    driftG:option("restWearDriftG",0.025,0.001,1),
    quietNoiseG:option("restQuietNoiseG",0.012,0.001,1),
    quietDriftG:option("restQuietDriftG",0.012,0.001,1),
    confidence:option("restPulseConfidence",90,1,100),
    absentRatio:option("restAbsentRatio",0.10,0,0.5),
    minHRSeconds:20,minSeconds:54,windowSeconds:60,
    hold:profile.restWearHold!==false,sleepGuard:profile.restSleepGuard!==false,
    sleepStart:option("restSleepStart",22,0,23),sleepEnd:option("restSleepEnd",8,0,23)};
  var stamps=new Uint32Array(60),data=new Float32Array(240),hrStamps=new Uint32Array(60),
    hrGood=new Uint8Array(60),sec=-1,n=0,sx=0,sy=0,sz=0,sq=0,first=0,last=0,
    charging=false,powerError=false,held="",cached,at=-1;
  var lastConfirmed=memory&&isFinite(memory.lastConfirmed)?Math.max(0,memory.lastConfirmed):0;
  function sleepTime(ms){
    var offset=isFinite(profile.restSleepUtcOffset)?profile.restSleepUtcOffset:profile.tzBase;
    var hour=isFinite(offset)?new Date(ms+offset*60000).getUTCHours():new Date(ms).getHours();
    return cfg.sleepGuard&&(cfg.sleepStart===cfg.sleepEnd||
      (cfg.sleepStart<cfg.sleepEnd?hour>=cfg.sleepStart&&hour<cfg.sleepEnd:hour>=cfg.sleepStart||hour<cfg.sleepEnd));
  }
  function reset() {
    stamps.fill(0);hrStamps.fill(0);sec=-1;n=0;held="";cached=undefined;at=-1;
  }
  function advance(ms) {
    var next=Math.floor(ms/1000);
    if(next<sec){reset();lastConfirmed=0;}
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
    // Diagnostics may ask for the last sample after a newer timer read.
    // A read must never rewind sensor state or erase confirmed wear.
    if(sec>=0&&ms<sec*1000)ms=sec*1000;
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
    var pulseConfirmed=good>=10&&ratio>=0.6;
    if(pulseConfirmed&&!charging)lastConfirmed=ms;
    var recentWear=lastConfirmed>0&&ms>=lastConfirmed&&ms-lastConfirmed<=86400000;
    var protect=sleepTime(ms)&&(held!=="off"||recentWear);
    if(charging){state="charging";reason="charging";held="";}
    else if(count<cfg.minSeconds){held="";}
    else if(!still){state="motion";reason="window_motion";held="";}
    else if(powerError){state="hr_error";reason="hrm_power_error";held="";}
    else if(pulseConfirmed){state="still_pulse";reason="sustained_pulse";held="worn";}
    else if(cfg.hold&&held==="worn"){state="still_pulse";reason="pulse_held_still";}
    else if(protect){state=recentWear?"wear_held":"wear_uncertain";reason=recentWear?"sleep_wear_history":"sleep_nonwear_deferred";}
    else if(quiet&&good<=2){state="off_candidate";reason=hr?"nonwear_quiet":"nonwear_quiet_no_hr";held="off";}
    else if(hr>=cfg.minHRSeconds&&ratio<=cfg.absentRatio){state="off_candidate";reason="nonwear_low_pulse_ratio";held="off";}
    else if(cfg.hold&&held==="off"){state="off_candidate";reason="nonwear_held_window";}
    else {state=hr<cfg.minHRSeconds?"hr_missing":"hr_uncertain";reason=state;}
    cached={time:ms,start:(sec-60)*1000,state:state,reason:reason,seconds:count,
      noiseG:rms,driftG:drift,hrSeconds:hr,goodSeconds:good,ratio:ratio,
      stationary:still,quiet:quiet,sleepProtected:protect,confirmedWear:recentWear};
    return cached;
  }
  return {sample:sample,hrm:hrm,result:result,config:cfg,
    memory:function(){return {lastConfirmed:lastConfirmed};},
    setCharging:function(v){if(charging!==!!v)reset();charging=!!v;if(charging)lastConfirmed=0;},
    setError:function(v){powerError=!!v;cached=undefined;}};
}

/* tenkyu 3-axis high-pass peak-excess rest recorder; MIT.
 * Each valid 5-minute bin sums (|3D HPF peak| - noise threshold) for
 * suprathreshold local maxima, then maps that sum into six rest stages.
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
var ACTIVITY_DEFAULTS=[0.1,3,60,200,500],HP_TAU_MS=1600; // ~0.1Hz at 12.5Hz
function activityThresholds(v){
  var a=[],prev=0;
  for(var i=0;i<5;i++){
    var n=v&&v[i];
    if(!isFinite(n)||n<=prev)n=ACTIVITY_DEFAULTS[i];
    if(n<=prev)n=prev+0.1;
    a.push(n);prev=n;
  }
  return a;
}
function activityLevel(sum,cuts){
  return sum>=cuts[4]?0:sum>=cuts[3]?20:sum>=cuts[2]?40:
    sum>=cuts[1]?60:sum>=cuts[0]?80:100;
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
 * New results are quantized into 0,20,40,60,80,100 (stages 0..5).
 * 101..201=charging (red 0..100% radial bar).
 * 253=HRM failed (white arc); 254=unworn (white marker); 255=missing XYZ (blank).
 * v2-v4 percentages are migrated once to preserve their previous displayed stages.
 */
function create(options){
  options=options||{};
  var levels=new Uint8Array(COUNT),stamps=new Uint32Array(COUNT);
  var threshold=thresholdG(options.thresholdG),threshold2=threshold*threshold;
  var cuts=activityThresholds(options.activityThresholds),save=options.onCommit;
  var activityScale=options.activityScale||(options.wearProfile&&options.wearProfile.restEco?1.65:1);
  var charging=false,chargePercent=0,chargedThisBucket=-1;
  var current=-1,covered=0,activity=0,peakCount=0,lastMs,lastValid=false;
  var wearEnabled=!!options.wearEnabled,pulseState=HR_PENDING,pulseConfidence=-1;
  var activityCovered=0,pausedMs=0,paused=false,resumeUntil=0,px,py,pz,peakOps=0,wakes=0,anchorX,anchorY,anchorZ;
  var lastWindow;
  var diag=options.saved&&options.saved.diag instanceof Array?
    options.saved.diag.slice(-12):[];
  var lpX,lpY,lpZ,qOld,qPrev;
  var tracker=wearTracker(Object.assign({},options.wearProfile||{},{restWearHold:options.holdEnabled!==false}),options.saved&&options.saved.wearMemory),wearOff=0,wearSeen=0,wearError=0,wearAt=-1,wearReason="";
  var wakeG2=Math.pow(Math.max(0.15,5*tracker.config.noiseG),2);
  function updateWear(ms) {
    var tick=Math.floor(ms/10000);
    if(lastWindow&&tick===wearAt)return lastWindow;
    var d=tracker.result(ms);lastWindow=d;
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
    return activityCovered>=MIN_COVERAGE_MS?percent:NO_DATA;
  }
  var old=options.saved,i,b,v;
  if(old&&old.v<5)diag=diag.map(function(d){
    var copy=Object.assign({},d);if(old.v===2&&copy.result===0)copy.result=NO_DATA;else if(copy.result<=100)copy.result=Math.min(5,1+Math.floor(Math.min(99,copy.result)/20))*20;return copy;
  });
  if(old&&(old.v===2||old.v===3||old.v===4||old.v===5)&&isFinite(old.end)&&typeof old.levels==="string"&&old.levels.length===COUNT*2){
    for(i=0;i<COUNT;i++){
      b=old.end-COUNT+1+i;v=parseInt(old.levels.substr(2*i,2),16);
      if(b>=0&&isFinite(v)&&v>=0&&v<=255){
        stamps[b%COUNT]=b;
        levels[b%COUNT]=old.v===2&&v===0?NO_DATA:old.v<5&&v<=100?
          Math.min(5,1+Math.floor(Math.min(99,v)/20))*20:v;
      }
    }
    if(old.active&&old.active.metric===4&&
       old.active.bucket===Math.floor(options.nowMs/SLOT_MS)&&
       old.active.gate===threshold&&old.active.scale===activityScale&&
       JSON.stringify(old.active.cuts)===JSON.stringify(cuts)){
      current=old.active.bucket;
      if(old.active.wearConfig===JSON.stringify(tracker.config)){
        wearOff=+old.active.wearOff||0;wearSeen=+old.active.wearSeen||0;wearError=+old.active.wearError||0;
      }
      covered=Math.max(0,Math.min(SLOT_MS,+old.active.covered||0));
      activityCovered=Math.max(0,+old.active.activityCovered||0);pausedMs=Math.max(0,+old.active.pausedMs||0);
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
  // Retained API name for diagnostics; eligibility is now independent of rest stage.
  function isStage5Candidate(bucket){
    return wearEnabled&&!charging&&bucket===current&&tracker.result(lastMs||0).stationary;
  }
  function setCharging(active,pct){
    if(!!active!==charging){paused=false;resumeUntil=0;resetPeak();}
    tracker.setCharging(active);
    charging=!!active;
    if(charging){
      chargePercent=batteryPercent(pct);
      chargedThisBucket=chargePercent;
    }
  }
  function markProbe(bucket,status,confidence){
    if(bucket!==current)return;
    pulseState=status;
    if(isFinite(confidence)&&confidence>=0)pulseConfidence=confidence;
  }
  function roll(ms){
    var target=Math.floor(ms/SLOT_MS),changed=false;
    if(target===current)return false;
    if(current>=0&&target>current){

      // One skipped accelerometer event must not invalidate 270+ seconds
      // of observed data. Missing major portions still yield NO_DATA.
      var closedVectorOK=covered>=MIN_COVERAGE_MS;
      var corrected=activityCovered>=MIN_COVERAGE_MS?activity300(activity,activityCovered)*activityScale:undefined;
      var closedPercent=activityLevel(corrected===undefined?activity:corrected,cuts);
      var closedWear=tracker.result(ms);
      i=current%COUNT;stamps[i]=current;
      levels[i]=chargedThisBucket>=0?chargingCode(chargedThisBucket):wearLevel(closedVectorOK,closedPercent);
      diag.push({bucket:current,coverageSec:Math.round(covered/1000),
        driftG:Math.round(closedWear.driftG*10000)/10000,
        motion:closedWear.state==="motion",
        activity:Math.round(activity*1000)/1000,
        activity300:corrected===undefined?null:Math.round(corrected*1000)/1000,
        peaks:peakCount,valid:closedVectorOK,pulse:pulseState,confidence:pulseConfidence,
        result:levels[i],
        wearSeconds:Math.round(wearOff/1000),window:closedWear,
        activityCoverageSec:Math.round(activityCovered/1000),pausedSec:Math.round(pausedMs/1000),peakOps:peakOps,
        reason:chargedThisBucket>=0?"charging":!closedVectorOK?"accel_missing":
          levels[i]===NOT_WORN?wearReason:levels[i]===HRM_FAILED?"hrm_power_error":levels[i]===NO_DATA?"activity_partial":closedWear.sleepProtected&&
          (closedWear.state==="wear_held"||closedWear.state==="wear_uncertain")?closedWear.reason:"rest_activity"});
      if(diag.length>12)diag.shift();
      changed=true;
    }else if(current>=0&&target<current){
      for(i=0;i<COUNT;i++)if(stamps[i]>=target){stamps[i]=0;levels[i]=0;}
      paused=false;resumeUntil=0;changed=true;
    }
    current=target;covered=0;activity=0;peakCount=0;resetPeak();
    activityCovered=0;pausedMs=0;peakOps=0;
    wearOff=0;wearSeen=0;wearError=0;wearAt=-1;lastWindow=undefined;
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
    // Gate on squared threshold BEFORE looking for a local maximum.
    // Only accepted peaks compute sqrt; subthreshold peaks never do.
    if(qOld!==undefined&&qPrev>=threshold2&&qPrev>qOld&&qPrev>=q){
      activity+=Math.sqrt(qPrev)-threshold;peakCount++;

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
      if(lastMs!==undefined&&(!valid||dt>MAX_GAP_MS||dt<0)){paused=false;resumeUntil=ms+10000;}
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
      tracker.sample(a,ms);var window=updateWear(ms),wasPaused=paused;
      var dx=paused?a.x-anchorX:0,dy=paused?a.y-anchorY:0,dz=paused?a.z-anchorZ:0;
      if(paused&&(window.state!=="off_candidate"||dx*dx+dy*dy+dz*dz>wakeG2)){
        paused=false;resumeUntil=ms+10000;wakes++;resetPeak();
        if(continuous&&px!==undefined){lpX=px;lpY=py;lpZ=pz;qOld=0;qPrev=0;}
      }
      if(!paused&&wearEnabled&&window.state==="off_candidate"&&ms>=resumeUntil){paused=true;anchorX=a.x;anchorY=a.y;anchorZ=a.z;resetPeak();}
      if(paused){if(continuous)pausedMs+=Math.min(dt,ms-current*SLOT_MS);}
      else{
        if(continuous&&!wasPaused)activityCovered+=Math.min(dt,ms-current*SLOT_MS);
        peakOps++;detectPeak(a,continuous?dt:0);
      }
      px=a.x;py=a.y;pz=a.z;
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
    return {v:5,end:end,levels:out,diag:diag,wearMemory:tracker.memory(),
      active:{metric:4,scale:activityScale,activityCovered:activityCovered,pausedMs:pausedMs,wearConfig:JSON.stringify(tracker.config),wearOff:wearOff,wearSeen:wearSeen,wearError:wearError,bucket:current,gate:threshold,cuts:cuts,
        covered:covered,activity:activity,peakCount:peakCount,
        charge:chargedThisBucket}};
  }
  return {sample:sample,sync:sync,setCharging:setCharging,
    hrm:function(h,ms){tracker.hrm(h,ms);if(h&&isFinite(h.confidence))pulseConfidence=Math.max(pulseConfidence,h.confidence);},getWear:function(ms){return lastWindow&&Math.floor(ms/10000)===Math.floor(lastWindow.time/10000)?lastWindow:tracker.result(ms);},
    setWearError:function(v){tracker.setError(v);},
    absentPulse:absentPulse,detectedPulse:detectedPulse,
    failedProbe:failedProbe,visit:visit,snapshot:snapshot,level:level,
    getDiagnostics:function(){return {window:tracker.result(lastMs||0),bucket:current,coverageSec:Math.round(covered/1000),
      driftG:tracker.result(lastMs||0).driftG,
      motion:tracker.result(lastMs||0).state==="motion",vectorValid:covered>0,
      activityCoverageSec:Math.round(activityCovered/1000),pausedSec:Math.round(pausedMs/1000),peakOps:peakOps,wakes:wakes,paused:paused,
      pulse:pulseState,confidence:pulseConfidence,holdState:tracker.result(lastMs||0).state==="off_candidate"?HR_ABSENT:tracker.result(lastMs||0).state==="still_pulse"?HR_FOUND:tracker.result(lastMs||0).state==="hr_error"?HR_FAILED:HR_PENDING,
      probeStatus:"0=pending,1=detected,2=absent,3=failed",
      recent:diag.slice()};},
    hasMotion:function(bucket){return bucket===current&&tracker.result(lastMs||0).state==="motion";},
    hasPulse:function(bucket){return bucket===current&&pulseState===HR_FOUND;},
    hasRecentAccel:function(ms){return lastValid&&lastMs!==undefined&&
      ms>=lastMs&&ms-lastMs<=MAX_GAP_MS;},
    getWearHold:function(){var d=tracker.result(lastMs||0);return d.state==="off_candidate"?HR_ABSENT:d.state==="still_pulse"?HR_FOUND:HR_PENDING;},
    isStage5Candidate:isStage5Candidate,
    getLive:function(ms){return {wear:wearEnabled?tracker.result(ms===undefined?lastMs||0:ms):undefined,bucket:current,covered:covered,peaks:peakCount,
      activity:activity,activityCovered:activityCovered,pausedMs:pausedMs,paused:paused,level:activityCovered>=MIN_COVERAGE_MS?activityLevel(activity300(activity,activityCovered)*activityScale,cuts):NO_DATA,
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
  if(!isFinite(s.restActivityT5))s.restActivityT5=Math.max(500,(+s.restActivityT4||200)+1);
  if(s.restPowerVersion!==1){s.restEco=true;s.restPowerVersion=1;}
  s.restScaleVersion=6;
  return s;
}
function install(bangle,storage,events,clock) {
  clock=clock||function(){return Date.now();};
  if(bangle.orbitRest)return bangle.orbitRest;
  var engine,enabled=false,settings,key,probe,timer,chargeTimer,nextProbeAt=0,
    nextBattery=0,nextSample=0,nextControl=0,failures=0,probeCount=0,lastStatus="Not started",lastAt=-1,
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
    if(d.state==="off_candidate"||d.state==="still_pulse"||d.state==="wear_held") {
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
    if(now<nextControl)return;
    nextControl=(Math.floor(now/10000)+1)*10000;
    var d=verdict(now);
    if(!settings.restWearEnabled)return;
    if(!d.stationary) {
      if(probe){lastStatus="Interrupted by motion";stopProbe();}
      failures=0;nextProbeAt=Math.min(nextProbeAt,now+10000);return;
    }
    // Reuse a resolved still-window verdict until genuine window motion.
    if(d.state==="off_candidate"||d.state==="still_pulse"||d.state==="wear_held"){if(probe)finishProbe();return;}
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
    if(original.restAlgorithmVersion!==4||original.restScaleVersion!==6||original.restPowerVersion!==1)try{storage.writeJSON("orbit.json",s);}catch(e){}
    if(enabled===on&&key===newKey)return;
    stopProbe();stopCharge();
    if(enabled){bangle.removeListener("accel",onAccel);bangle.removeListener("HRM",onHRM);bangle.removeListener("charging",onCharging);persist();}
    enabled=on;key=newKey;settings=s;
    settings.restWearEnabled=s.restWearEnabled!==false;
    settings.restProbeSeconds=limit(s.restProbeSeconds,30,60,30);
    nextProbeAt=clock();nextBattery=0;nextSample=0;nextControl=0;failures=0;charging=false;
    if(enabled) {
      engine=create({thresholdG:s.restThreshold,
        activityThresholds:[s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4,s.restActivityT5],
        activityScale:s.restEco?1.65:1,wearThresholdG:s.restWearThreshold,wearEnabled:s.restWearEnabled,
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
  // Six levels: level 0 has zero radial length; level 5 is full scale.
  return Math.max(0,Math.min(5,Math.round(percent/20)));
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
  base=migrateSettings(base||{});
  var originalOverride=override;override=override?migrateSettings(override):override;
  if(originalOverride&&originalOverride.restActivityT5===undefined&&originalOverride.restActivityT4===undefined)delete override.restActivityT5;
  var s={},keys=["restThreshold","restActivityT1","restActivityT2","restActivityT3",
    "restActivityT4","restActivityT5","restWearEnabled","restWearHold","restWearThreshold",
    "restProbeSeconds","restPulseConfidence","restEco","restSleepGuard","restSleepStart","restSleepEnd","restSleepUtcOffset","restWearNoiseG","restWearDriftG","restQuietNoiseG","restQuietDriftG","restAbsentRatio"];
  keys.forEach(function(k){
    var x=override&&override[k];
    s[k]=typeof x==="boolean"&&/Enabled|Hold|Eco|Guard/.test(k)||typeof x==="number"&&isFinite(x)?x:base[k];
  });
  var wear=wearConfig(s);
  var cuts=activityThresholds([s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4,s.restActivityT5]);
  var result={restThreshold:thresholdG(s.restThreshold),restActivityT1:cuts[0],
    restActivityT2:cuts[1],restActivityT3:cuts[2],restActivityT4:cuts[3],restActivityT5:cuts[4],
    restWearEnabled:wear.enabled,restWearHold:wear.hold,restWearThreshold:wear.z,
    restProbeSeconds:wear.seconds,restPulseConfidence:wear.confidence,restEco:s.restEco!==false,restPowerVersion:1,restAlgorithmVersion:4,restScaleVersion:6};
  result.restSleepGuard=s.restSleepGuard!==false;
  result.restSleepStart=limit(s.restSleepStart,0,23,22);result.restSleepEnd=limit(s.restSleepEnd,0,23,8);
  if(isFinite(s.restSleepUtcOffset))result.restSleepUtcOffset=s.restSleepUtcOffset;
  else if(isFinite(base.tzBase))result.restSleepUtcOffset=base.tzBase;
  var wc=wearTracker(s).config;
  result.restWearNoiseG=wc.noiseG;result.restWearDriftG=wc.driftG;result.restQuietNoiseG=wc.quietNoiseG;result.restQuietDriftG=wc.quietDriftG;result.restAbsentRatio=wc.absentRatio;
  return result;
}

exports.restProfile=restProfile;
