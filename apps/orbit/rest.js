(function(exports){
// All temperatures are case temperatures. A change may be positive or negative.
function temperatureTrend(minDelta) {
  var history=[], phase, last, slope, quietUntil=0, inspectUntil=0;
  function fit(points,origin) {
    var x=0,y=0,xx=0,xy=0,i,n=points.length;
    for(i=0;i<n;i++){
      var t=(points[i].ms-origin)/60000, v=points[i].c;
      x+=t;y+=v;xx+=t*t;xy+=t*v;
    }
    var div=n*xx-x*x, rate=div>0?(n*xy-x*y)/div:0;
    var intercept=n?(y-rate*x)/n:0, scatter=0;
    for(i=0;i<n;i++){
      var error=points[i].c-intercept-rate*(points[i].ms-origin)/60000;
      scatter+=error*error;
    }
    return {rate:rate,level:intercept,noise:n?Math.sqrt(scatter/n):0};
  }
  function start(kind,ms) {
    if(kind==="placement"&&ms<quietUntil)return;
    var past=history.filter(function(p){return ms-p.ms<=900000;});
    var base=fit(past,ms);
    // A baseline preceding the movement distinguishes a new trend from
    // ongoing heating/cooling. Short pairs are too noisy for extrapolation.
    var baseline=past.length>=2&&past[past.length-1].ms-past[0].ms>=60000;
    var anchor=baseline&&last&&ms>=last.ms&&ms-last.ms<=90000?last:undefined;
    phase={kind:kind,at:ms,fastUntil:ms+120000,points:anchor?[anchor]:[],anchor:!!anchor,
      expected:anchor?base.level:undefined,before:baseline?base.rate:0,
      gate:Math.max(minDelta,3*base.noise),sign:0,hits:0,ready:false,delta:0};
  }
  function add(c,ms) {
    if(typeof c!=="number"||!isFinite(c)||!isFinite(ms)||ms<quietUntil)return false;
    if(last&&ms<=last.ms)return false;
    var p={ms:ms,c:c}, sparse=last&&ms-last.ms>90000;
    // A slow background sample may reveal a late response on an insulating surface.
    // Without a movement episode this only requests more temperature observations.
    if(sparse&&Math.abs(c-last.c)>=minDelta)inspectUntil=ms+60000;
    if(last&&ms-last.ms<=900000)slope=(c-last.c)*60000/(ms-last.ms);
    else slope=undefined;
    last=p;history.push(p);if(history.length>16)history.shift();
    if(!phase||ms<phase.at||ms-phase.at>720000)return true;
    var a=phase.points;
    if(a.length>=18)a.splice(1,1); // Keep the actual first reading as the anchor.
    a.push(p);
    if(a.length<2)return true;
    var raw=c-a[0].c;
    slope=fit(a,a[0].ms).rate;
    // With a fresh pre-motion anchor, a step which has already levelled off at
    // the first burst sample is detectable. Without one, a three-point median
    // protects the reference from a single bad first reading.
    if(!phase.anchor){
      if(a.length<3)return true;
      if(phase.originC===undefined)phase.originC=a[0].c+a[1].c+a[2].c-
        Math.min(a[0].c,a[1].c,a[2].c)-Math.max(a[0].c,a[1].c,a[2].c);
      raw=c-phase.originC;
    }
    phase.delta=phase.expected===undefined?raw-phase.before*(ms-a[1].ms)/60000:
      c-(phase.expected+phase.before*(ms-phase.at)/60000);
    var dir=phase.delta>0?1:-1;
    var large=dir*raw>=phase.gate && dir*phase.delta>=phase.gate &&
      dir*slope>0 && dir*(slope-phase.before)>0;
    // A single spike is insufficient. Re-sample a slow change after the burst.
    phase.hits=large?(dir===phase.sign?phase.hits+1:1):0;
    phase.sign=large?dir:0;
    phase.ready=a.length>=(phase.anchor?5:4)&&ms-phase.at>=30000&&phase.hits>=2;
    if(large&&sparse)phase.fastUntil=ms+75000;
    return true;
  }
  return {start:start,add:add,
    active:function(ms){if(phase&&ms-phase.at>720000)phase=undefined;return phase;},
    cancel:function(){phase=undefined;},
    changed:function(){phase=undefined;history=last?[last]:[];inspectUntil=0;},
    reset:function(until){history=[];phase=last=slope=undefined;quietUntil=until||0;inspectUntil=0;},
    inspecting:function(ms){return ms<inspectUntil;},
    latest:function(){return last;},slope:function(){return slope;}};
}

function wearThresholds(profile) {
  profile=profile||{};
  function option(k,d,lo,hi){var v=profile[k];return typeof v==="number"&&isFinite(v)?Math.max(lo,Math.min(hi,v)):d;}
  return {noiseG:option("restWearNoiseG",0.030,0.001,1),driftG:option("restWearDriftG",0.025,0.001,1),
    confidence:option("restPulseConfidence",90,1,100),absentRatio:option("restAbsentRatio",0.1,0,0.5),
    tempDelta:option("restTempDeltaC",0.2,0.05,3),minSeconds:54,windowSeconds:60,
    hold:profile.restWearHold!==false,thermalVersion:1};
}
// A rolling 60-second window, plus the last 10 seconds of the same samples.
function wearTracker(profile,memory) {
  var cfg=wearThresholds(profile);
  var trend=temperatureTrend(cfg.tempDelta),stamps=new Uint32Array(60),data=new Float32Array(240),
    hrStamps=new Uint32Array(60),hrGood=new Uint8Array(60),sec=-1,n=0,sx,sy,sz,sq,first,last,
    charging=false,powerError=false,cached,at=-1,movingFrom=-1,lastMotion=-1,briefMotion=-1,settled=false,
    probeStart=-1,probeEnd=-1,known="",offReason="",seen=-1,ignoreUntil=0;
  if(memory&&memory.version===1) {
    if(memory.known==="worn"||memory.known==="off")known=memory.known;
    offReason=String(memory.offReason||"");seen=+memory.seen;ignoreUntil=+memory.ignoreUntil||0;charging=!!memory.charging;
    trend.reset(ignoreUntil);
  }
  function clearWindows(){
    stamps.fill(0);hrStamps.fill(0);sec=-1;n=0;cached=undefined;at=-1;
    movingFrom=lastMotion=briefMotion=probeStart=probeEnd=-1;settled=false;
  }
  function advance(ms){
    var next=Math.floor(ms/1000);
    if((sec>=0&&next<sec)||(sec>=0&&next-sec>10)){
      clearWindows();trend.reset(next*1000<seen?0:ignoreUntil);
    }
    if(seen>=0&&(ms<seen-1000||ms-seen>360000)){
      if(ms<seen-1000)ignoreUntil=0;
      known="";seen=-1;trend.reset(ignoreUntil);
    }
    if(next===sec)return;
    if(sec>=0&&n>=3&&last-first>=500){
      var i=sec%60,k=i*4,x=sx/n,y=sy/n,z=sz/n;
      // A short lift or flip can fall entirely between two ten-second checks.
      var prev=((sec+59)%60)*4;
      if(stamps[prev/4]===sec){
        var dx=x-data[prev],dy=y-data[prev+1],dz=z-data[prev+2];
        if(dx*dx+dy*dy+dz*dz>0.0225)briefMotion=sec*1000;
      }
      stamps[i]=sec+1;data[k]=x;data[k+1]=y;data[k+2]=z;
      data[k+3]=Math.sqrt(Math.max(0,sq/n-x*x-y*y-z*z));
    }
    sec=next;n=0;sx=sy=sz=sq=0;
  }
  function sample(a,ms){
    if(!a||!isFinite(a.x)||!isFinite(a.y)||!isFinite(a.z)||!isFinite(ms))return;
    advance(ms);seen=ms;if(!n)first=ms;
    last=ms;n++;sx+=a.x;sy+=a.y;sz+=a.z;sq+=a.x*a.x+a.y*a.y+a.z*a.z;
  }
  function hrm(h,ms){
    if(!h||!isFinite(h.bpm)||!isFinite(h.confidence)||!isFinite(ms))return;
    advance(ms);var i=sec%60;hrStamps[i]=sec+1;
    hrGood[i]=h.bpm>0&&h.confidence>cfg.confidence?1:0;
  }
  function pose(count,x,y,z,q){
    return count?Math.sqrt(Math.max(0,q/count-(x*x+y*y+z*z)/(count*count))):0;
  }
  function result(ms){
    if(sec>=0&&ms<sec*1000)ms=sec*1000;
    advance(ms);
    var tick=Math.floor(ms/10000);
    if(cached&&tick===at)return cached;
    at=tick;
    var noise=[],x=0,y=0,z=0,q=0,shortN=0,shortX=0,shortY=0,shortZ=0,shortQ=0,shortQuiet=0;
    var hr=0,good=0,recentGood=0,afterHR=0,afterGood=0;
    var phase=trend.active(ms),since=phase?phase.at:0;
    for(var i=0;i<60;i++){
      if(stamps[i]>sec-60&&stamps[i]<=sec&&stamps[i]){
        var k=i*4,a=data[k],b=data[k+1],c=data[k+2],mag=a*a+b*b+c*c;
        noise.push(data[k+3]);x+=a;y+=b;z+=c;q+=mag;
        if(stamps[i]>sec-10){
          shortN++;shortX+=a;shortY+=b;shortZ+=c;shortQ+=mag;
          if(data[k+3]<=cfg.noiseG)shortQuiet++;
        }
      }
      if(hrStamps[i]>sec-60&&hrStamps[i]<=sec&&hrStamps[i]){
        hr++;good+=hrGood[i];
        if(hrStamps[i]>sec-10)recentGood+=hrGood[i];
        if((hrStamps[i]-1)*1000>=since){afterHR++;afterGood+=hrGood[i];}
      }
    }
    noise.sort(function(a,b){return a-b;});
    var count=noise.length,rms=count?noise[Math.floor(count/2)]:0,drift=pose(count,x,y,z,q);
    var still=count>=54&&rms<=cfg.noiseG&&drift<=cfg.driftG;
    var shortValid=shortN>=9, shortStill=shortValid&&shortQuiet>=shortN*0.8&&
      pose(shortN,shortX,shortY,shortZ,shortQ)<=cfg.driftG;
    var pulse=afterGood>=10&&afterGood>=0.6*afterHR&&recentGood>0;
    var state="insufficient",reason="accel_missing",needsProbe=false, fast=false;
    if(charging){state="charging";reason="charging";}
    else {
      if(shortStill&&settled&&known!=="off"&&briefMotion>=0&&ms-briefMotion<=10000){
        lastMotion=movingFrom=briefMotion;
        settled=false;
      }
      briefMotion=-1;
      if(shortValid&&!shortStill){
        if(movingFrom<0)movingFrom=ms;
        lastMotion=ms;
        if(settled||!phase){
          trend.cancel();
          if(known==="off")trend.start("pickup",ms);
        }
        settled=false;
      }else if(shortStill&&!settled){
        if(lastMotion>=0&&ms-lastMotion<=20000){
          if(known==="off"&&ms-movingFrom>=40000)known=""; // sustained handling: reacquire.
          if(known!=="off"){trend.cancel();trend.start("placement",ms);}
          // After a brief flip (or fastening the band), positive HR can verify a pickup.
        }
        settled=true;movingFrom=-1;
      }else if(!shortValid){
        if(!phase||phase.kind!=="pickup"||ms-phase.at>20000)trend.cancel();
        movingFrom=lastMotion=-1;settled=false;
      }
      phase=trend.active(ms);
      // A pulse preceding a placement must not cancel the new episode.
      if(phase&&phase.at!==since)pulse=false;
      var hot=trend.latest(),fresh=phase&&hot&&ms-hot.ms<=30000;
      var responded=fresh&&phase.ready;
      var fullProbe=phase&&probeStart>=phase.at&&ms-probeEnd<=150000&&probeEnd>=0;
      if(pulse) {
        if(known==="worn")trend.cancel();else trend.changed();
        known="worn";phase=undefined;
        state=shortStill?"still_pulse":"motion";reason="sustained_pulse";
      }else if(phase&&phase.kind==="pickup"&&responded&&movingFrom>=0&&ms-movingFrom>=30000){
        known="worn";trend.changed();phase=undefined;state="motion";reason="thermal_pickup";
      }else if(phase&&phase.kind==="placement"&&still&&shortStill&&!powerError&&responded&&fullProbe&&
          (afterGood===0||(afterHR>=20&&afterGood<=cfg.absentRatio*afterHR))){
        known="off";state="off_candidate";offReason=reason=phase.sign>0?"thermal_warming":"thermal_cooling";
        trend.changed();phase=undefined;
      }else if(known==="off"&&(shortValid||ignoreUntil>ms&&ignoreUntil-ms>580000)&&(movingFrom<0||ms-movingFrom<30000)){
        state="off_candidate";reason="nonwear_held_window";
      }else if(!shortValid||count<54){state="insufficient";reason="accel_missing";}
      else if(!still||!shortStill){state="motion";reason="window_motion";}
      else if(powerError){state="hr_error";reason="hrm_power_error";}
      else if(known==="worn"&&cfg.hold){state="wear_held";reason="wear_history";}
      else {state="wear_uncertain";reason=phase?"thermal_pending":"wear_unconfirmed";}
      fast=!!phase&&ms<phase.fastUntil;
      needsProbe=!!((phase&&(phase.kind==="placement"&&shortStill||phase.kind==="pickup"&&(shortStill||movingFrom>=0&&ms-movingFrom>=20000))&&
        (!fullProbe&&(fast||responded)))||(shortStill&&still&&!known&&!phase));
    }
    var reading=trend.latest();
    cached={time:ms,start:(sec-60)*1000,state:state,reason:reason,seconds:count,noiseG:rms,driftG:drift,
      hrSeconds:hr,goodSeconds:good,ratio:hr?good/hr:-1,stationary:still,shortStill:shortStill,
      temperature:reading?reading.c:undefined,tempAt:reading?reading.ms:undefined,tempRate:trend.slope(),
      offReason:known==="off"?offReason:undefined,delta:phase?phase.delta:undefined,allowTemp:!charging&&ms>=ignoreUntil,motionEdge:movingFrom===ms,fastTemp:fast||trend.inspecting(ms),needsProbe:needsProbe,episode:phase?phase.at:-1};
    return cached;
  }
  return {sample:sample,hrm:hrm,result:result,config:cfg,
    temperature:function(c,ms){if(!charging&&trend.add(c,ms)){cached=undefined;return true;}return false;},
    probeDone:function(start,end){if(!charging&&start>=0&&end-start>=30000){probeStart=start;probeEnd=end;cached=undefined;}},
    setError:function(v){powerError=!!v;cached=undefined;},
    memory:function(){return {version:1,known:known,offReason:known==="off"?offReason:undefined,seen:seen,ignoreUntil:ignoreUntil,charging:charging};},
    setCharging:function(v,ms){
      v=!!v;if(charging===v)return;
      clearWindows();charging=v;powerError=false;known="off";offReason="charger_observed";seen=ms;
      ignoreUntil=v?0:ms+600000;trend.reset(ignoreUntil);
      if(!v)trend.start("pickup",ms);
    }};
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
  seconds:limit(s.restProbeSeconds,30,60,30),
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
      if(d.seconds>=54) {wearSeen+=dt;if(d.state==="off_candidate"){wearOff+=dt;if(!wearReason||d.reason!=="nonwear_held_window")wearReason=d.offReason||d.reason;}if(d.state==="hr_error")wearError+=dt;}
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
    if(old.active&&old.active.thermalVersion===1&&old.active.metric===4&&
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
  function setCharging(active,pct,ms){
    if(!!active!==charging){paused=false;resumeUntil=0;resetPeak();}
    tracker.setCharging(active,ms===undefined?(lastMs||options.nowMs||0):ms);
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
          levels[i]===NOT_WORN?wearReason:levels[i]===HRM_FAILED?"hrm_power_error":levels[i]===NO_DATA?"activity_partial":wearEnabled?closedWear.reason:"rest_activity"});
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
      active:{metric:4,thermalVersion:1,scale:activityScale,activityCovered:activityCovered,pausedMs:pausedMs,wearConfig:JSON.stringify(tracker.config),wearOff:wearOff,wearSeen:wearSeen,wearError:wearError,bucket:current,gate:threshold,cuts:cuts,
        covered:covered,activity:activity,peakCount:peakCount,
        charge:chargedThisBucket}};
  }
  return {sample:sample,sync:sync,setCharging:setCharging,
    hrm:function(h,ms){tracker.hrm(h,ms);if(h&&isFinite(h.confidence))pulseConfidence=Math.max(pulseConfidence,h.confidence);},getWear:tracker.result,
    temperature:tracker.temperature,probeDone:tracker.probeDone,
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
// Share a single native barometer conversion between the boot service and Rest Lab.
// A stalled native promise expires; late completions cannot clear its successor.
function caseTemperature(hardware,now) {
  var request=hardware.orbitTempRequest;
  if(request&&now>=request.at&&now-request.at<5000)return request.promise;
  if(typeof hardware.getPressure!=="function")return;
  var promise=hardware.getPressure();
  if(!promise||typeof promise.then!=="function")return;
  request={at:now,promise:promise};hardware.orbitTempRequest=request;
  function clear(){if(hardware.orbitTempRequest===request)delete hardware.orbitTempRequest;}
  promise.then(clear,clear);
  return promise;
}
function install(bangle,storage,events,clock,observe,hardware) {
  clock=clock||function(){return Date.now();};
  if(bangle.orbitRest)return bangle.orbitRest;
  var engine,enabled=false,settings,key,probe,timer,chargeTimer,nextProbeAt=0,
    nextBattery=0,nextSample=0,nextControl=0,failures=0,probeCount=0,lastStatus="Not started",lastAt=-1,
    charging=false,chargePercent=0;
  var HR_ID="orbitrest", generation=0, lastTempRequest=-Infinity, lastEpisode=-1, liveOff=false, lastEventTime=-1;
  hardware=hardware||bangle;
  function log(kind,value,ms){if(observe)observe(kind,value,ms);}
  function measureTemperature(now,d){
    if(!d.allowTemp||now-lastTempRequest<(d.fastTemp?9500:d.motionEdge?60000:299500))return;
    lastTempRequest=now;
    var ticket=generation;
    try{
      var p=caseTemperature(hardware,now);
      if(p)p.then(function(reading){
        var ms=clock();
        if(ticket===generation&&enabled&&!charging&&ms>=now&&ms-now<5000&&reading&&engine.temperature(reading.temperature,ms))
          log("temperature",reading.temperature,ms);
      },function(){});
    }catch(e){/* No usable temperature: retain the previous wear state. */}
  }
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
    else if(d.reason==="sustained_pulse")engine.detectedPulse(bucket);
    log("check",d.reason,now);
    var mark=settings.restWearEnabled&&d.state==="off_candidate";
    if(mark!==liveOff){
      liveOff=mark;
      if(bangle.emit)bangle.emit("orbitWear",mark);
    }
    return d;
  }
  function finishProbe() {
    var p=probe,now=clock();
    if(!p||!enabled)return;
    var powered=true;
    try{if(bangle.isHRMOn)powered=!!bangle.isHRMOn();}catch(e){powered=false;}
    stopProbe();
    if(powered&&now-p.at>=30000){
      engine.probeDone(p.at,now);log("probe",p.at,now);
    }else if(!powered){
      engine.setWearError(true);log("hr_error",1,now);
    }
    var d=verdict(now);
    lastAt=now;
    if(d.state==="off_candidate"||d.reason==="sustained_pulse"){
      failures=0;lastStatus=d.reason;nextProbeAt=now+900000;
    }else{
      failures++;lastStatus=!powered?"Power error":p.events?"HR inconclusive":"No HRM events";
      nextProbeAt=now+(failures===1?60000:900000);
    }
  }
  function beginProbe(now) {
    probe={at:now,ownsPower:true,events:0};probeCount++;lastAt=now;lastStatus="Measuring";
    // Reference-counted ID keeps the LED powered if another user finishes early.
    try{
      if(bangle.setHRMPower(1,HR_ID)===false)throw new Error("HRM unavailable");
      engine.setWearError(false);log("hr_error",0,now);
    }catch(e){
      stopProbe();engine.setWearError(true);log("hr_error",1,now);failures++;
      lastStatus="Power error";nextProbeAt=now+(failures===1?60000:900000);return;
    }
    timer=setTimeout(finishProbe,settings.restProbeSeconds*1000);
  }
  function onAccel(a) {
    if(!enabled||!engine)return;
    var now=clock();
    if(now+1000<lastEventTime){
      generation++;stopProbe();lastTempRequest=-Infinity;lastEpisode=-1;
      nextProbeAt=nextSample=nextControl=nextBattery=0;
    }
    lastEventTime=now;
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
    if(settings.restWearEnabled||observe)measureTemperature(now,d);
    if(!settings.restWearEnabled)return;
    if(d.episode!==lastEpisode){
      // A probe must cover the current placement, not a preceding movement.
      if(probe)stopProbe();
      if(d.episode>=0){nextProbeAt=now;failures=0;}
      lastEpisode=d.episode;
    }
    if(!d.needsProbe){
      if(probe){lastStatus=d.reason;stopProbe();}
      return;
    }
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
    chargePercent=battery();engine.setCharging(true,chargePercent,clock());engine.sync(clock());
    chargeTimer=setTimeout(chargeTick,60000);
  }
  function onCharging(v) {
    if(!enabled)return;
    var was=charging;
    engine.sync(clock());charging=!!v;stopProbe();stopCharge();
    generation++;lastTempRequest=-Infinity;lastEpisode=-1;liveOff=false;
    failures=0;nextProbeAt=clock();chargePercent=battery();
    engine.setCharging(charging,chargePercent,clock());
    if(charging)chargeTimer=setTimeout(chargeTick,60000);
    if(was||charging)persist();
  }
  function configure(input) {
    var original=storage.readJSON("orbit.json",1)||{};
    var s=migrateSettings(Object.assign({},original,input||{})),newKey=JSON.stringify(restProfile(s)),on=s.restEnabled!==false;
    if(original.restAlgorithmVersion!==4||original.restScaleVersion!==6||original.restPowerVersion!==1)try{storage.writeJSON("orbit.json",s);}catch(e){}
    if(enabled===on&&key===newKey)return;
    generation++;stopProbe();stopCharge();
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
    generation++;stopProbe();stopCharge();persist();enabled=false;
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
    var current=engine.getLive&&engine.getLive(map.nowMs);
    if(current&&(current.charging||(current.wear&&current.wear.state==="off_candidate")))bars++;
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
  if(originalOverride&&originalOverride.restEco===undefined)delete override.restEco;
  var s={},keys=["restThreshold","restActivityT1","restActivityT2","restActivityT3",
    "restActivityT4","restActivityT5","restWearEnabled","restWearHold","restWearThreshold",
    "restProbeSeconds","restPulseConfidence","restEco","restWearNoiseG","restWearDriftG","restTempDeltaC","restAbsentRatio"];
  keys.forEach(function(k){
    var x=override&&override[k];
    s[k]=typeof x==="boolean"&&/Enabled|Hold|Eco/.test(k)||typeof x==="number"&&isFinite(x)?x:base[k];
  });
  var wear=wearConfig(s);
  var cuts=activityThresholds([s.restActivityT1,s.restActivityT2,s.restActivityT3,s.restActivityT4,s.restActivityT5]);
  var result={restThreshold:thresholdG(s.restThreshold),restActivityT1:cuts[0],
    restActivityT2:cuts[1],restActivityT3:cuts[2],restActivityT4:cuts[3],restActivityT5:cuts[4],
    restWearEnabled:wear.enabled,restWearHold:wear.hold,restWearThreshold:wear.z,
    restProbeSeconds:wear.seconds,restPulseConfidence:wear.confidence,restEco:s.restEco!==false,restPowerVersion:1,restAlgorithmVersion:4,restScaleVersion:6};
  var wc=wearThresholds(s);
  result.restWearNoiseG=wc.noiseG;result.restWearDriftG=wc.driftG;result.restThermalVersion=1;result.restTempDeltaC=wc.tempDelta;result.restAbsentRatio=wc.absentRatio;
  return result;
}

exports.restProfile=restProfile;

}(typeof exports!=="undefined"?exports:(globalThis.TenkyuRest={})));
