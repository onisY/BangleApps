/* Orbit Dev runtime wrapper */
(function(){
  var Storage=require("Storage"), originalLauncher=Bangle.showLauncher;
  function appSource(id,direct){var info=Storage.readJSON(id+".info",1);if(info&&info.src&&Storage.read(info.src)!==undefined)return info.src;if(Storage.read(direct)!==undefined)return direct;}
  function openSystemSettings(){var src=appSource("setting","setting.app.js");if(src){load(src);return;}if(originalLauncher)originalLauncher();}
  Bangle.showLauncher=openSystemSettings;

  var originalFillCircle=g.fillCircle;
  g.fillCircle=function(x,y,r){if(x===74&&y===101&&r===2)return this;return originalFillCircle.apply(this,arguments);};

  var core=Storage.read("orbit_dev.core.js");
  if(!core)throw new Error("orbit_dev.core.js missing");

  /* Patch the actual core header renderer before it is evaluated. This avoids
     any post-draw overlay race when the header changes between blue/yellow. */
  var oldHeader='function headerText(d){return f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" ."+batteryPct;}';
  var newHeader='function headerText(d){return f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" "+batteryPct+"%";}';
  if(core.indexOf(oldHeader)<0)throw new Error("Orbit Dev headerText patch mismatch");
  core=core.replace(oldHeader,newHeader);
  if(core.indexOf('if(now-batterySampleAt>=600000)')<0)throw new Error("Orbit Dev battery interval patch mismatch");
  core=core.replace('if(now-batterySampleAt>=600000)','if(now-batterySampleAt>=300000)');

  var hs=core.indexOf('function sceneDate(){return new Date();}function drawHeader(date,force)');
  var he=core.indexOf('function drawSun()',hs);
  if(hs<0||he<0)throw new Error("Orbit Dev header renderer patch mismatch");
  var headerCore='function sceneDate(){return new Date();}'+
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
  eval(core);

  var blinkTimer,tapTimer,blinkOn=true,openingSettings=false,leavingOrbit=false;

  function headerBlink(on){if(Bangle._orbitDevHeaderBlink)Bangle._orbitDevHeaderBlink(on);}
  function headerCharge(on){if(Bangle._orbitDevHeaderCharge)Bangle._orbitDevHeaderCharge(on);}
  function stopBlink(){if(blinkTimer){clearTimeout(blinkTimer);blinkTimer=undefined;}}
  function blinkTick(){
    blinkTimer=undefined;
    if(!Bangle.isLCDOn())return;
    blinkOn=!blinkOn;
    headerBlink(blinkOn);
    blinkTimer=setTimeout(blinkTick,1000);
  }
  function startBlink(){
    stopBlink();
    blinkOn=true;
    headerBlink(true);
    blinkTimer=setTimeout(blinkTick,1000);
  }
  function stopTapTimer(){if(tapTimer){clearTimeout(tapTimer);tapTimer=undefined;}}

  function onLCD(on){if(on)startBlink();else{stopBlink();stopTapTimer();}}
  function onCharging(on){
    if(on&&Bangle.isLCDOn()){
      stopBlink();
      blinkOn=true;
      headerBlink(true);
      headerCharge(true);
      blinkTimer=setTimeout(blinkTick,1000);
    }else headerCharge(!!on);
  }

  function removeWrapperListeners(){
    stopBlink();stopTapTimer();
    Bangle.removeListener("lcdPower",onLCD);
    Bangle.removeListener("charging",onCharging);
    Bangle.removeListener("touch",onTouch);
    Bangle.showLauncher=originalLauncher;
    try{delete Bangle._orbitDevHeaderBlink;delete Bangle._orbitDevHeaderCharge;}catch(e){}
  }
  function prepareToLeave(){if(leavingOrbit)return false;leavingOrbit=true;removeWrapperListeners();g.fillCircle=originalFillCircle;return true;}
  function returnToOrbit(){load("orbit_dev.app.js");}
  function openCalendar(){
    if(!prepareToLeave())return;
    var src=appSource("fivewcal","fivewcal.app.js")||appSource("calendar","calendar.app.js");
    if(src){load(src);return;}
    if(originalLauncher)originalLauncher();
  }
  function openOrbitSettings(){
    if(openingSettings)return;
    openingSettings=true;
    if(!prepareToLeave())return;
    var originalShowMenu=E.showMenu;
    function settingsBack(){
      E.showMenu=originalShowMenu;
      returnToOrbit();
    }
    E.showMenu=function(menu){
      if(menu&&menu[""]&&menu[""].title==="Orbit Dev"&&menu["< Back"]&&!menu["Exit settings"]){
        /* Use the exact same safe leave() handler as < Back, but expose an
           explicit end-of-settings item at the bottom of the main menu. */
        menu["Exit settings"]=menu["< Back"];
      }
      return originalShowMenu(menu);
    };
    try{
      var src=Storage.read("orbit_dev.settings.js");if(!src)throw new Error("orbit_dev.settings.js missing");
      var fn=eval(src);if(typeof fn!=="function")throw new Error("invalid Orbit Dev settings");
      fn(settingsBack);
    }catch(e){
      E.showMenu=originalShowMenu;
      try{Storage.write("orbit_dev.err","settings: "+e);}catch(x){}
      returnToOrbit();
    }
  }
  function onTouch(button,xy){
    if(!Bangle.isLCDOn()||Bangle.isLocked()){stopTapTimer();return;}
    if(tapTimer){stopTapTimer();openOrbitSettings();return;}
    tapTimer=setTimeout(function(){tapTimer=undefined;openCalendar();},450);
  }

  Bangle.on("lcdPower",onLCD);
  Bangle.on("charging",onCharging);
  Bangle.on("touch",onTouch);
  E.on("kill",function(){removeWrapperListeners();});
  try{headerCharge(Bangle.isCharging());}catch(e){}
  if(Bangle.isLCDOn())startBlink();
})();
