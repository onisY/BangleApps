(() => {
  if (global.LIFEMON && global.LIFEMON.version==="0.002") { global.LIFEMON.reloadSettings(); return; }
  const S=require("Storage"), ID="lifemon", SF="lifemon.json", STF="lifemon.state.json", LF="lifemon.log";
  const DEF={
    stillG:.020,moveG:.035,baroSlowSec:15,baroFastStillSec:2,hrmStillSec:10,tempStillSec:15,tempIntervalSec:3,
    wearTempC:28,placedZMin:.85,placedStillSec:60,stairDispM:.30,integDeadband:.12,baroStableDeltaM:.20,
    stairStableSec:5,elevatorStableSec:15,fastMaxSec:120,minHeightM:.40,hrmSampleSec:10,hrmBlockMin:5,
    hrmConfidence:90,batteryTargetPct:10,batteryWarnHours:3,batteryWindowHours:6,
    featureWindowSec:5,featureUpdateSec:1,dispRangeM:.55,accStdG:.070,periodicityMin:.45,altRateMps:.12,elevatorRateMps:.55
  };
  let cfg=Object.assign({},DEF,S.readJSON(SF,1)||{}), ps=S.readJSON(STF,1)||{}, sum=ps.summary||{}, bat=ps.battery||[];
  let la,still=false,stillSince=0,fastStarted=false,tempStarted=false,tempDone=false;
  let grav,vel=0,disp=0,lastInt=0,stairCooldown=0;
  let pVel={x:0,y:0,z:0},pPos={x:0,y:0,z:0},feat=[],nextFeature=0;
  let feature={dispRange:0,accStd:0,periodicity:0,altRate:0},featureFlags=[false,false,false,false];
  let activity="desk",activityIdx=0;
  let lastP=null,lastT=null,fast=null,pwin=[],fastTO,slowTimer,batTimer,altHist=[];
  let tempActive=false,tempSamples=[],tempTimers=[];
  let hrmOn=false,hrmLast=null,hrmTimer,hrmStart=0,hrmSum=0,hrmN=0,hrmMin=999,hrmMax=0;
  let batSamples=[],batHours=null,batWarn=false,batSave=0,logN=0;

  function day(){let d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).substr(-2)+"-"+("0"+d.getDate()).substr(-2);}
  function ensureDay(){
    let d=day(); if(sum.day===d)return;
    sum={day:d,stairsUp:0,stairsDown:0,elevatorUp:0,elevatorDown:0,lastHR:null,lastHRTime:0,wear:sum.wear||ps.wear||"unknown",lastTemp:sum.lastTemp===undefined?ps.lastTemp:sum.lastTemp,lastEvent:"",lastEventTime:0,activity:activity};
  }
  function compactBat(){
    let cut=Date.now()-cfg.batteryWindowHours*3600000,o=[];
    for(let i=0;i<batSamples.length;i++){let p=batSamples[i];if(p[0]>=cut&&(!o.length||p[0]-o[o.length-1][0]>=600000))o.push(p);}
    if(o.length>48)o=o.slice(-48);return o;
  }
  function save(){
    ensureDay(); ps={version:"0.002",summary:sum,wear:sum.wear||"unknown",lastTemp:sum.lastTemp,battery:compactBat(),batteryEstimateHours:batHours,batteryWarning:batWarn,batteryPct:E.getBattery()};
    S.writeJSON(STF,ps);
  }
  function log(t,a,b,c){
    S.open(LF,"a").write([Date.now(),t,a===undefined?"":a,b===undefined?"":b,c===undefined?"":c].join(",")+"\n");
    if((++logN%80)===0){let x=S.read(LF);if(x&&x.length>65536){let k=x.indexOf("\n",x.length-32768);S.write(LF,x.substr(k<0?x.length-32768:k+1));}}
  }
  function event(s){ensureDay();sum.lastEvent=s;sum.lastEventTime=Date.now();}
  function drawWidget(){if(typeof WIDGETS!=="undefined"&&WIDGETS.lifemon&&WIDGETS.lifemon.draw)WIDGETS.lifemon.draw();}
  function diff(a){if(a.diff!==undefined&&isFinite(a.diff))return Math.abs(a.diff);if(!la)return 0;let x=a.x-la.x,y=a.y-la.y,z=a.z-la.z;return Math.sqrt(x*x+y*y+z*z);}
  function resetInt(){vel=0;disp=0;pVel.x=pVel.y=pVel.z=0;lastInt=Date.now();}
  function integrate(a,now,moving){
    if(!grav)grav={x:a.x,y:a.y,z:a.z}; if(!lastInt)lastInt=now;
    let dt=(now-lastInt)/1000; lastInt=now;
    if(dt<=0||dt>.35){grav.x=a.x;grav.y=a.y;grav.z=a.z;if(!moving)resetInt();return;}
    let q=Math.exp(-dt/.8); grav.x=q*grav.x+(1-q)*a.x;grav.y=q*grav.y+(1-q)*a.y;grav.z=q*grav.z+(1-q)*a.z;
    let gm=Math.sqrt(grav.x*grav.x+grav.y*grav.y+grav.z*grav.z);if(gm<.4)return;
    let dx=(a.x-grav.x)*9.80665,dy=(a.y-grav.y)*9.80665,dz=(a.z-grav.z)*9.80665;
    if(Math.abs(dx)<cfg.integDeadband)dx=0;if(Math.abs(dy)<cfg.integDeadband)dy=0;if(Math.abs(dz)<cfg.integDeadband)dz=0;
    let lin=(dx*grav.x+dy*grav.y+dz*grav.z)/gm;
    if(!moving){vel=0;pVel.x=pVel.y=pVel.z=0;if(Math.abs(disp)<cfg.stairDispM*.5)disp=0;return;}
    vel+=lin*dt;if(vel>2.5)vel=2.5;if(vel<-2.5)vel=-2.5;disp+=vel*dt;
    pVel.x+=dx*dt;pVel.y+=dy*dt;pVel.z+=dz*dt;
    if(pVel.x>2.5)pVel.x=2.5;if(pVel.x<-2.5)pVel.x=-2.5;
    if(pVel.y>2.5)pVel.y=2.5;if(pVel.y<-2.5)pVel.y=-2.5;
    if(pVel.z>2.5)pVel.z=2.5;if(pVel.z<-2.5)pVel.z=-2.5;
    pPos.x+=pVel.x*dt;pPos.y+=pVel.y*dt;pPos.z+=pVel.z*dt;
    if(Math.abs(pPos.x)>20||Math.abs(pPos.y)>20||Math.abs(pPos.z)>20){pPos={x:0,y:0,z:0};feat=[];}
    if(now>=stairCooldown&&Math.abs(disp)>=cfg.stairDispM){startFast(2);disp=0;vel=0;stairCooldown=now+4000;}
  }
  function addFeatureSample(a,now){
    let m=Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z);
    feat.push([now,m,pPos.x,pPos.y,pPos.z]);
    let cut=now-(cfg.featureWindowSec+1)*1000;while(feat.length&&feat[0][0]<cut)feat.shift();
  }
  function calcPeriodicity(a,mean,v){
    let n=a.length;if(n<12||v<.000001)return 0;
    let dt=(a[n-1][0]-a[0][0])/(n-1)/1000;if(dt<=0)return 0;
    let minL=Math.max(2,Math.round(.40/dt)),maxL=Math.min((n/2)|0,Math.round(1.25/dt)),best=0;
    for(let l=minL;l<=maxL;l++){let s=0,k=0;for(let i=l;i<n;i++){s+=(a[i][1]-mean)*(a[i-l][1]-mean);k++;}if(k){let r=s/(v*k);if(r>best)best=r;}}
    if(best<0)best=0;if(best>1)best=1;return best;
  }
  function calcAltRate(now){
    let cut=now-12000;while(altHist.length&&altHist[0][0]<cut)altHist.shift();
    if(altHist.length<3)return 0;let a=altHist[0],b=altHist[altHist.length-1],dt=(b[0]-a[0])/1000;if(dt<2)return 0;
    return dh(a[1],b[1])/dt;
  }
  function setActivity(name,idx){
    if(activity!==name){activity=name;activityIdx=idx;ensureDay();sum.activity=name;log("A",name,feature.dispRange.toFixed(2),feature.accStd.toFixed(3)+"|"+feature.periodicity.toFixed(2)+"|"+feature.altRate.toFixed(2));event("activity "+name);}
    else activityIdx=idx;
  }
  function classify(now){
    let cut=now-cfg.featureWindowSec*1000,a=[];for(let i=0;i<feat.length;i++)if(feat[i][0]>=cut)a.push(feat[i]);
    if(a.length<5){drawWidget();return;}
    let n=a.length,sm=0;for(let i=0;i<n;i++)sm+=a[i][1];let mean=sm/n,v=0;
    let minx=a[0][2],maxx=minx,miny=a[0][3],maxy=miny,minz=a[0][4],maxz=minz;
    for(let i=0;i<n;i++){let z=a[i][1]-mean;v+=z*z;let x=a[i][2],y=a[i][3],zz=a[i][4];if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;if(zz<minz)minz=zz;if(zz>maxz)maxz=zz;}
    v/=n;let rx=maxx-minx,ry=maxy-miny,rz=maxz-minz;
    feature.dispRange=Math.sqrt(rx*rx+ry*ry+rz*rz);feature.accStd=Math.sqrt(v);feature.periodicity=calcPeriodicity(a,mean,v);feature.altRate=calcAltRate(now);
    featureFlags[0]=feature.dispRange>=cfg.dispRangeM;featureFlags[1]=feature.accStd>=cfg.accStdG;featureFlags[2]=feature.periodicity>=cfg.periodicityMin;featureFlags[3]=Math.abs(feature.altRate)>=cfg.altRateMps;
    let up=feature.altRate>0,vertical=featureFlags[3],periodic=featureFlags[2],motion=featureFlags[0]||featureFlags[1]||periodic,fastMotion=featureFlags[0]&&featureFlags[1];
    if(motion&&!fast)startFast(4);
    if(fast&&fast.reason===4&&!motion&&still)stopFast();
    if(vertical){
      if(periodic||fastMotion){if(up)setActivity("stairsUp",2);else setActivity("stairsDown",3);}
      else if(Math.abs(feature.altRate)>=cfg.elevatorRateMps){if(up)setActivity("elevatorUp",6);else setActivity("elevatorDown",7);}
      else {if(up)setActivity("escalatorUp",4);else setActivity("escalatorDown",5);}
    } else {
      if((periodic&&(featureFlags[0]||featureFlags[1]))||(featureFlags[0]&&featureFlags[1]))setActivity("walk",1);
      else setActivity("desk",0);
    }
    drawWidget();
  }
  function dh(p0,p1){return (!p0||!p1)?0:44330*(1-Math.pow(p1/p0,.190294957));}
  function addAlt(p,now){if(!p||!isFinite(p))return;altHist.push([now,p]);let cut=now-12000;while(altHist.length&&altHist[0][0]<cut)altHist.shift();}
  function pavg(){if(!pwin.length)return null;let s=0;for(let i=0;i<pwin.length;i++)s+=pwin[i];return s/pwin.length;}
  function startFast(reason){
    if(!Bangle.setBarometerPower)return;
    if(fast){fast.reason|=reason;return;}
    let n=Date.now();pwin=[];fast={reason:reason,start:n,baseP:lastP,baseReady:!!lastP,lastRef:0,lastChange:n,maxAbs:0,had:false,ready:false,lastP:lastP};
    Bangle.setBarometerPower(1,ID+".fast");if(fastTO)clearTimeout(fastTO);fastTO=setTimeout(()=>stopFast(),cfg.fastMaxSec*1000);
  }
  function stopFast(){if(!fast)return;fast=null;pwin=[];if(fastTO)clearTimeout(fastTO);fastTO=undefined;if(Bangle.setBarometerPower)Bangle.setBarometerPower(0,ID+".fast");}
  function record(kind,h){
    if(!isFinite(h)||Math.abs(h)<cfg.minHeightM)return;ensureDay();let v=Math.round(Math.abs(h)*10)/10,h1=Math.round(h*10)/10;
    if(kind==="stairs"){if(h>0)sum.stairsUp=Math.round((sum.stairsUp+v)*10)/10;else sum.stairsDown=Math.round((sum.stairsDown+v)*10)/10;log("S",h1,sum.stairsUp,sum.stairsDown);event("stairs "+(h>0?"+":"")+h1+"m");}
    else {if(h>0)sum.elevatorUp=Math.round((sum.elevatorUp+v)*10)/10;else sum.elevatorDown=Math.round((sum.elevatorDown+v)*10)/10;log("E",h1,sum.elevatorUp,sum.elevatorDown);event("elevator "+(h>0?"+":"")+h1+"m");}
    save();
  }
  function finishFast(kind){if(!fast)return;let p=pavg()||fast.lastP||lastP,h=dh(fast.baseP,p);stopFast();record(kind,h);stairCooldown=Date.now()+8000;}
  function fastPressure(p){
    if(!fast||!p)return;pwin.push(p);if(pwin.length>5)pwin.shift();let fp=pavg();
    if(!fast.baseReady){if(pwin.length>=3){fast.baseP=fp;fast.baseReady=true;fast.lastP=fp;fast.lastChange=Date.now();}return;}
    fast.lastP=fp;let h=dh(fast.baseP,fp),ah=Math.abs(h);if(ah>fast.maxAbs)fast.maxAbs=ah;if(fast.maxAbs>=cfg.minHeightM)fast.had=true;
    if(Math.abs(h-fast.lastRef)>=cfg.baroStableDeltaM){fast.lastRef=h;fast.lastChange=Date.now();fast.ready=false;}
    if(fast.had){let s=(Date.now()-fast.lastChange)/1000;if((fast.reason&2)&&s>=cfg.stairStableSec){finishFast("stairs");return;}if((fast.reason&1)&&s>=cfg.elevatorStableSec)fast.ready=true;}
  }
  function onPressure(e){if(!e)return;let now=Date.now();if(e.pressure){lastP=e.pressure;addAlt(e.pressure,now);}if(e.temperature!==undefined)lastT=e.temperature;if(fast&&e.pressure)fastPressure(e.pressure);}
  function slowBaro(){if(fast||tempActive||!Bangle.getPressure)return;Bangle.getPressure().then(e=>{if(e){let now=Date.now();if(e.pressure){lastP=e.pressure;addAlt(e.pressure,now);}if(e.temperature!==undefined)lastT=e.temperature;}}).catch(()=>{});}
  function stopTemp(){tempActive=false;tempTimers.forEach(clearTimeout);tempTimers=[];if(Bangle.setBarometerPower)Bangle.setBarometerPower(0,ID+".temp");}
  function classifyTemp(t){
    ensureDay();let sec=still&&stillSince?(Date.now()-stillSince)/1000:0,z=la?Math.abs(la.z):0,w=t>=cfg.wearTempC?"worn":(z>=cfg.placedZMin||sec>=cfg.placedStillSec?"placed":"off");
    let ch=sum.wear!==w;sum.wear=w;sum.lastTemp=Math.round(t*10)/10;if(ch){log("W",w,sum.lastTemp,"");event("wear "+w);}if(w!=="worn"&&hrmOn)stopHR();save();
  }
  function tempSample(){
    if(!tempActive||!Bangle.getPressure)return;Bangle.getPressure().then(e=>{if(!tempActive||!e||e.temperature===undefined)return;tempSamples.push(e.temperature);if(e.pressure){lastP=e.pressure;addAlt(e.pressure,Date.now());}lastT=e.temperature;
      if(tempSamples.length>=3){let s=0;for(let i=0;i<tempSamples.length;i++)s+=tempSamples[i];tempDone=true;stopTemp();classifyTemp(s/tempSamples.length);}}).catch(()=>{});
  }
  function startTemp(){
    if(tempActive||tempDone||!Bangle.getPressure)return;tempStarted=true;tempActive=true;tempSamples=[];if(Bangle.setBarometerPower)Bangle.setBarometerPower(1,ID+".temp");
    tempSample();tempTimers.push(setTimeout(tempSample,cfg.tempIntervalSec*1000));tempTimers.push(setTimeout(tempSample,cfg.tempIntervalSec*2000));
    tempTimers.push(setTimeout(()=>{if(!tempActive)return;if(tempSamples.length){let s=0;tempSamples.forEach(x=>s+=x);tempDone=true;stopTemp();classifyTemp(s/tempSamples.length);}else stopTemp();},cfg.tempIntervalSec*3000+3000));
  }
  function resetHR(){hrmStart=Date.now();hrmSum=0;hrmN=0;hrmMin=999;hrmMax=0;}
  function finishHR(){if(!hrmN){resetHR();return;}let a=Math.round(hrmSum/hrmN*10)/10;ensureDay();sum.lastHR=a;sum.lastHRTime=Date.now();log("H",a,hrmN,hrmMin+"/"+hrmMax);event("HR "+a);save();resetHR();}
  function sampleHR(){if(!hrmOn)return;let n=Date.now();if(hrmLast&&hrmLast.bpm>0&&hrmLast.conf>=cfg.hrmConfidence&&n-hrmLast.t<cfg.hrmSampleSec*1500){let b=hrmLast.bpm;hrmSum+=b;hrmN++;if(b<hrmMin)hrmMin=b;if(b>hrmMax)hrmMax=b;}if(n-hrmStart>=cfg.hrmBlockMin*60000)finishHR();}
  function onHRM(h){if(hrmOn&&h)hrmLast={bpm:h.bpm,conf:h.confidence||0,t:Date.now()};}
  function startHR(){if(hrmOn||sum.wear==="placed"||sum.wear==="off")return;hrmOn=true;hrmLast=null;resetHR();Bangle.setHRMPower(1,ID);hrmTimer=setInterval(sampleHR,cfg.hrmSampleSec*1000);}
  function stopHR(){if(!hrmOn)return;hrmOn=false;if(hrmTimer)clearInterval(hrmTimer);hrmTimer=undefined;Bangle.setHRMPower(0,ID);resetHR();}
  function onAccel(a){
    let now=Date.now(),d=diff(a),moving=still?d>=cfg.moveG:d>cfg.stillG;integrate(a,now,moving);addFeatureSample(a,now);
    if(now>=nextFeature){nextFeature=now+cfg.featureUpdateSec*1000;classify(now);}
    if(moving){
      if(still){still=false;stillSince=0;fastStarted=false;tempStarted=false;tempDone=false;}
      if(sum.wear==="placed"&&sum.lastTemp!==undefined&&sum.lastTemp<cfg.wearTempC)sum.wear="off";
      if(hrmOn)stopHR();if(tempActive)stopTemp();
      if(fast&&(fast.reason&1)){if(fast.ready&&fast.had)finishFast("elevator");else if(!fast.had&&now-fast.start>6000&&!(fast.reason&2))stopFast();}
    } else {
      if(!still){still=true;stillSince=now;fastStarted=false;tempStarted=false;tempDone=false;resetInt();}
      let sec=(now-stillSince)/1000;
      if(!fastStarted&&sec>=cfg.baroFastStillSec){fastStarted=true;startFast(1);}
      if(!hrmOn&&sec>=cfg.hrmStillSec)startHR();
      if(!tempStarted&&sec>=cfg.tempStillSec)startTemp();
      if(tempDone&&sum.lastTemp!==undefined&&sum.lastTemp<cfg.wearTempC&&sec>=cfg.placedStillSec&&sum.wear!=="placed"){sum.wear="placed";log("W","placed",sum.lastTemp,"");event("wear placed");save();}
    }
    la=a;
  }
  function addBat(n,p){batSamples.push([n,p]);let c=n-cfg.batteryWindowHours*3600000;while(batSamples.length&&batSamples[0][0]<c)batSamples.shift();}
  function estimateBat(){
    let n=Date.now(),p=E.getBattery();if(Bangle.isCharging&&Bangle.isCharging()){batSamples=[];batHours=null;batWarn=false;drawWidget();return;}addBat(n,p);
    if(p<=cfg.batteryTargetPct){batHours=0;batWarn=true;drawWidget();save();return;}
    if(batSamples.length<20||batSamples[0][1]-batSamples[batSamples.length-1][1]<1){batHours=null;batWarn=false;drawWidget();return;}
    let t0=batSamples[0][0],sx=0,sy=0,sxx=0,sxy=0,N=batSamples.length;
    for(let i=0;i<N;i++){let x=(batSamples[i][0]-t0)/3600000,y=batSamples[i][1];sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
    let den=N*sxx-sx*sx,sl=den?(N*sxy-sx*sy)/den:0;batHours=sl<-.05?(p-cfg.batteryTargetPct)/(-sl):null;batWarn=batHours!==null&&batHours<=cfg.batteryWarnHours;drawWidget();if((++batSave%10)===0||batWarn)save();
  }
  function indicators(){
    let a=[false,false,false,false,false,false,false,false];a[activityIdx]=true;
    return a.concat(featureFlags.slice());
  }
  function timers(){if(slowTimer)clearInterval(slowTimer);if(batTimer)clearInterval(batTimer);slowTimer=setInterval(slowBaro,Math.max(5,cfg.baroSlowSec)*1000);batTimer=setInterval(estimateBat,60000);}
  function reload(){cfg=Object.assign({},DEF,S.readJSON(SF,1)||{});feat=[];altHist=[];timers();drawWidget();}
  let cut=Date.now()-cfg.batteryWindowHours*3600000;if(Array.isArray(bat))for(let i=0;i<bat.length;i++)if(bat[i][0]>=cut)batSamples.push(bat[i]);
  ensureDay();Bangle.on("accel",onAccel);Bangle.on("pressure",onPressure);Bangle.on("HRM",onHRM);timers();slowBaro();estimateBat();
  global.LIFEMON={
    version:"0.002",reloadSettings:reload,isBatteryWarning:()=>batWarn,getIndicators:indicators,
    getState:()=>({still:still,wear:sum.wear||"unknown",temperature:sum.lastTemp,hrmActive:hrmOn,hrmPartial:hrmN?Math.round(hrmSum/hrmN*10)/10:null,
      fastBarometer:!!fast,batteryPct:E.getBattery(),batteryEstimateHours:batHours,batteryWarning:batWarn,summary:sum,activity:activity,
      features:{dispRange:feature.dispRange,accStd:feature.accStd,periodicity:feature.periodicity,altRate:feature.altRate},featureFlags:featureFlags.slice()})
  };
  drawWidget();
})();