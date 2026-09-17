/* Orbit unified runtime wrapper: Orbit + integrated 5wCal */
(function(){
  var Storage=require("Storage");
  var originalLauncher=Bangle.showLauncher;
  var originalFillCircle=g.fillCircle;
  var calSource=Storage.read("orbit.cal.js");
  if(!calSource)throw new Error("orbit.cal.js missing");
  var calModule=eval(calSource);
  calSource=undefined;
  if(!calModule||typeof calModule.create!=="function")throw new Error("invalid Orbit calendar module");
  var calendar=calModule.create();

  var mode="orbit";
  var state={dayOffset:0,hasSelection:false};
  var tapTimer,tapCount=0;
  var blinkTimer,blinkOn=true;
  var resetOnWake=false;
  var settingsShowMenuOriginal;
  var buttonWatch;
  var cleanupDone=false,leaving=false;

  function dayNumber(d){return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);}
  function sceneDate(){
    var d=new Date();
    if(state.dayOffset)d.setDate(d.getDate()+state.dayOffset);
    return d;
  }
  Bangle._orbitSceneDate=sceneDate;

  function useOrbitFillCircle(){
    g.fillCircle=function(x,y,r){if(x===74&&y===101&&r===2)return this;return originalFillCircle.apply(this,arguments);};
  }
  function restoreFillCircle(){g.fillCircle=originalFillCircle;}

  function headerBlink(on){if(Bangle._orbitDevHeaderBlink)Bangle._orbitDevHeaderBlink(on);}
  function headerCharge(on){if(Bangle._orbitDevHeaderCharge)Bangle._orbitDevHeaderCharge(on);}
  function stopBlink(){if(blinkTimer){clearTimeout(blinkTimer);blinkTimer=undefined;}}
  function blinkTick(){
    blinkTimer=undefined;
    if(mode!=="orbit"||!Bangle.isLCDOn())return;
    blinkOn=!blinkOn;headerBlink(blinkOn);
    blinkTimer=setTimeout(blinkTick,1000);
  }
  function startBlink(){
    stopBlink();if(mode!=="orbit")return;
    blinkOn=true;headerBlink(true);
    blinkTimer=setTimeout(blinkTick,1000);
  }
  function stopTapTimer(){if(tapTimer){clearTimeout(tapTimer);tapTimer=undefined;}tapCount=0;}
  function showTransition(){
    if(!Bangle.isLCDOn())return;
    try{
      g.reset().setBgColor(0x0010).setColor(0x0010).clear();
      if(g.flip)g.flip();
    }catch(e){}
  }

  function buildCore(){
    var core=Storage.read("orbit.core.js");
    if(!core)throw new Error("orbit.core.js missing");
    core=core.replace(/orbit_dev/g,"orbit").replace(/Orbit Dev/g,"Orbit");
    var oldHeader='function headerText(d){return f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" ."+batteryPct;}';
    var newHeader='function headerText(d){return f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" "+batteryPct+"%";}';
    if(core.indexOf(oldHeader)<0)throw new Error("Orbit headerText patch mismatch");
    core=core.replace(oldHeader,newHeader);
    if(core.indexOf('if(now-batterySampleAt>=600000)')<0)throw new Error("Orbit battery interval patch mismatch");
    core=core.replace('if(now-batterySampleAt>=600000)','if(now-batterySampleAt>=300000)');

    var hs=core.indexOf('function sceneDate(){return new Date();}function drawHeader(date,force)');
    var he=core.indexOf('function drawSun()',hs);
    if(hs<0||he<0)throw new Error("Orbit header renderer patch mismatch");
    var headerCore='function sceneDate(){return Bangle._orbitSceneDate?Bangle._orbitSceneDate():new Date();}'+
      'var headerBlinkOn=true,headerCharging=false;try{headerCharging=Bangle.isCharging();}catch(e){}'+
      'function headerLayout(){var t=headerText(sceneDate()),gw=9,a=t.length>1?(W-2-gw)/(t.length-1):0;return{text:t,gw:gw,adv:a,mode:interactive?2:1};}'+
      'function headerFg(m){return m===1?C.fg:C.bg;}'+
      'function paintHeaderColon(){if(!Bangle.isLCDOn())return;var h=headerLayout(),bx=1+Math.round(8*h.adv);fillHeaderCharBg(bx,bx+h.gw-1,1,h.mode);if(headerBlinkOn)drawTallBoldChar(":",bx,1,headerFg(h.mode));}'+
      'function paintHeaderBattery(){if(!Bangle.isLCDOn())return;var h=headerLayout(),fg=batteryPct<=20?"#f00":headerFg(h.mode),show=!headerCharging||headerBlinkOn;for(var i=12;i<h.text.length;i++){var bx=1+Math.round(i*h.adv);fillHeaderCharBg(bx,bx+h.gw-1,1,h.mode);if(show)drawTallBoldChar(h.text[i],bx,1,fg);}}'+
      'function paintHeaderSpecials(){paintHeaderColon();paintHeaderBattery();}'+
      'function drawHeader(date,force){var mode=interactive?2:1,text=headerText(date);if(!force&&mode===lastHeaderMode&&text===lastHeaderText){paintHeaderSpecials();return;}var fg=mode===1?C.fg:C.bg;drawTallBoldString(text,1,fg,mode);lastHeaderMode=mode;lastHeaderText=text;paintHeaderSpecials();}'+
      'function drawHeaderDelta(date){var mode=interactive?2:1,text=headerText(date);if(mode!==lastHeaderMode||!lastHeaderText||text.length!==lastHeaderText.length){drawHeader(date,true);return;}if(text!==lastHeaderText){var gw=9,adv=text.length>1?(W-2-gw)/(text.length-1):0,fg=mode===1?C.fg:C.bg;for(var i=0;i<text.length;i++)if(text[i]!==lastHeaderText[i]){var bx=1+Math.round(i*adv);fillHeaderCharBg(bx,bx+gw-1,1,mode);drawTallBoldChar(text[i],bx,1,fg);}lastHeaderMode=mode;lastHeaderText=text;}paintHeaderSpecials();}'+
      'function drawHeaderOnly(){refreshBattery();drawHeaderDelta(sceneDate());}'+
      'Bangle._orbitDevHeaderBlink=function(on){headerBlinkOn=!!on;paintHeaderColon();if(headerCharging)paintHeaderBattery();};'+
      'Bangle._orbitDevHeaderCharge=function(on){headerCharging=!!on;paintHeaderBattery();};';
    core=core.slice(0,hs)+headerCore+core.slice(he);
    core=core.replace('drawHeaderDelta(new Date());','drawHeaderDelta(sceneDate());');
    core=core.replace('installBleButtonWatch();','0;');
    return core;
  }

  function releaseOrbitHelpers(){try{delete Bangle._orbitDevHeaderBlink;delete Bangle._orbitDevHeaderCharge;}catch(e){}}
  function restoreSettingsMenu(){if(settingsShowMenuOriginal){E.showMenu=settingsShowMenuOriginal;settingsShowMenuOriginal=undefined;}}
  function cleanupSettingsHelper(){try{if(Bangle._orbitSettingsCleanup)Bangle._orbitSettingsCleanup();}catch(e){}try{delete Bangle._orbitSettingsCleanup;}catch(e2){}}

  function startOrbit(){
    if(leaving)return;
    calendar.stop();cleanupSettingsHelper();restoreSettingsMenu();
    mode="orbit";stopTapTimer();stopBlink();useOrbitFillCircle();
    Bangle._orbitSceneDate=sceneDate;
    eval(buildCore());
    try{headerCharge(Bangle.isCharging());}catch(e){}
    if(Bangle.isLCDOn())startBlink();
  }

  function setDateFromCalendar(d){if(d){state.hasSelection=true;state.dayOffset=dayNumber(d)-dayNumber(new Date());}else{state.hasSelection=false;state.dayOffset=0;}}

  function openCalendar(){
    if(leaving||mode!=="orbit")return;
    showTransition();
    stopTapTimer();stopBlink();restoreFillCircle();mode="calendar";
    var focus=state.hasSelection?sceneDate():new Date();
    calendar.start({focusDate:focus,selectedDate:state.hasSelection?focus:undefined,onReturn:function(d){showTransition();setDateFromCalendar(d);startOrbit();}});
    releaseOrbitHelpers();
  }

  function calendarConfigMenu(menu){
    var c=calModule.readConfig();
    menu["Cal language"]={value:c.lang==="en"?1:0,min:0,max:1,step:1,format:function(v){return v?"English":"Japanese";},onchange:function(v){c.lang=v?"en":"ja";calModule.writeConfig(c);}};
    menu["Cal holidays"]={value:c.ukRegion==="sc"?1:0,min:0,max:1,step:1,format:function(v){return v?"Scotland":"England/Wales";},onchange:function(v){c.ukRegion=v?"sc":"ew";calModule.writeConfig(c);}};
    menu["Cal auto return"]={value:c.timeout,min:15,max:120,step:15,format:function(v){return v+" s";},onchange:function(v){c.timeout=v;calModule.writeConfig(c);}};
    if(menu["< Back"]&&!menu["Back to Orbit"])menu["Back to Orbit"]=menu["< Back"];
  }

  function settingsBack(){showTransition();cleanupSettingsHelper();restoreSettingsMenu();startOrbit();}
  function openSettings(){
    if(leaving||mode!=="orbit")return;
    showTransition();
    stopTapTimer();stopBlink();restoreFillCircle();mode="settings";
    settingsShowMenuOriginal=E.showMenu;
    E.showMenu=function(menu){if(menu&&menu[""]&&menu[""].title==="Orbit")calendarConfigMenu(menu);return settingsShowMenuOriginal(menu);};
    try{
      var src=Storage.read("orbit.settings.js");
      if(!src)throw new Error("orbit.settings.js missing");
      src=src.replace(/orbitdevsettings/g,"orbitsettings").replace(/orbit_dev/g,"orbit").replace(/Orbit Dev/g,"Orbit");
      src=src.replace('E.on("kill",onKill);','Bangle._orbitSettingsCleanup=function(){stopGPS();try{E.removeListener("kill",onKill);}catch(e){}};E.on("kill",onKill);');
      var fn=eval(src);if(typeof fn!=="function")throw new Error("invalid Orbit settings");
      fn(settingsBack);releaseOrbitHelpers();
    }catch(e){
      restoreSettingsMenu();cleanupSettingsHelper();
      try{Storage.write("orbit.err","settings: "+e);}catch(x){}
      startOrbit();
    }
  }

  function onTouch(button,xy){
    if(leaving)return;
    if(mode==="calendar"){calendar.touch(xy);return;}
    if(mode!=="orbit")return;
    if(!Bangle.isLCDOn()||Bangle.isLocked()){stopTapTimer();return;}
    tapCount++;if(tapTimer)clearTimeout(tapTimer);
    tapTimer=setTimeout(function(){var n=tapCount;tapTimer=undefined;tapCount=0;if(mode!=="orbit")return;if(n===1)openCalendar();else if(n===2)openSettings();},400);
  }
  function onSwipe(lr,ud){if(mode==="calendar")calendar.swipe(lr,ud);}

  function resetTransientOnLCDOff(){
    var needRestart=mode!=="orbit"||state.dayOffset!==0;
    state.dayOffset=0;state.hasSelection=false;stopTapTimer();
    if(mode==="calendar")calendar.resetTransient();
    if(needRestart)resetOnWake=true;
  }
  function onLCD(on){if(!on){stopBlink();resetTransientOnLCDOff();return;}if(resetOnWake){resetOnWake=false;startOrbit();return;}if(mode==="orbit")startBlink();}
  function onCharging(on){if(mode!=="orbit")return;if(on&&Bangle.isLCDOn()){stopBlink();blinkOn=true;headerBlink(true);headerCharge(true);blinkTimer=setTimeout(blinkTick,1000);}else headerCharge(!!on);}

  function onSideButtonRelease(){if(leaving)return;exitToLauncher();}
  function installButtonWatch(){if(buttonWatch)clearWatch(buttonWatch);buttonWatch=setWatch(onSideButtonRelease,BTN1,{repeat:true,edge:"rising",debounce:30});}

  function controllerCleanup(){
    if(cleanupDone)return;cleanupDone=true;
    stopBlink();stopTapTimer();calendar.stop();cleanupSettingsHelper();restoreSettingsMenu();
    if(buttonWatch){clearWatch(buttonWatch);buttonWatch=undefined;}
    Bangle.removeListener("lcdPower",onLCD);Bangle.removeListener("charging",onCharging);Bangle.removeListener("touch",onTouch);Bangle.removeListener("swipe",onSwipe);
    restoreFillCircle();releaseOrbitHelpers();try{delete Bangle._orbitSceneDate;}catch(e){}
  }
  function exitToLauncher(){if(leaving)return;showTransition();leaving=true;controllerCleanup();if(originalLauncher)originalLauncher();}

  useOrbitFillCircle();eval(buildCore());
  try{headerCharge(Bangle.isCharging());}catch(e){}
  Bangle.on("lcdPower",onLCD);Bangle.on("charging",onCharging);Bangle.on("touch",onTouch);Bangle.on("swipe",onSwipe);
  installButtonWatch();E.on("kill",controllerCleanup);
  if(Bangle.isLCDOn())startBlink();
})();
