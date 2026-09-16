/* Orbit Dev runtime wrapper */
(function(){
  var Storage=require("Storage"), originalLauncher=Bangle.showLauncher;
  function appSource(id,direct){var info=Storage.readJSON(id+".info",1);if(info&&info.src&&Storage.read(info.src)!==undefined)return info.src;if(Storage.read(direct)!==undefined)return direct;}
  function openCalendarOrSettings(){var src=appSource("fivewcal","fivewcal.app.js")||appSource("calendar","calendar.app.js")||appSource("setting","setting.app.js");if(src){load(src);return;}if(originalLauncher)originalLauncher();}
  Bangle.showLauncher=openCalendarOrSettings;

  /* Hide the polar centre marker only; keep the polar map itself unchanged. */
  var originalFillCircle=g.fillCircle;
  g.fillCircle=function(x,y,r){if(x===74&&y===101&&r===2)return this;return originalFillCircle.apply(this,arguments);};

  var core=Storage.read("orbit_dev.core.js");if(!core)throw new Error("orbit_dev.core.js missing");eval(core);

  var blinkTimer,batteryTimer,minuteFixTimer;
  var blinkOn=true;
  var batteryPct=E.getBattery();
  var charging=false;
  var lastTap=0,openingSettings=false;
  try{charging=Bangle.isCharging();}catch(e){}

  var FONT3={
    "0":[7,5,5,5,5,5,7],"1":[2,6,2,2,2,2,7],"2":[7,1,1,7,4,4,7],
    "3":[7,1,1,7,1,1,7],"4":[5,5,5,7,1,1,1],"5":[7,4,4,7,1,1,7],
    "6":[7,4,4,7,5,5,7],"7":[7,1,1,2,2,2,2],"8":[7,5,5,7,5,5,7],
    "9":[7,5,5,7,1,1,7],":":[0,2,2,0,2,2,0],"%":[5,1,2,2,4,4,5]
  };

  function layout(){
    var digits=(""+batteryPct).length;
    var len=13+digits,gw=9,W=g.getWidth();
    return {gw:gw,adv:len>1?(W-2-gw)/(len-1):0};
  }

  /* Copy the actual header background already on screen.  Row 0 contains
     background only (no glyph pixels), so copying its per-column colour
     preserves blue/magenta stripes, yellow, or white exactly. */
  function restoreHeaderBg(x0,x1){
    for(var x=x0;x<=x1;x++){
      var c=g.getPixel(x,0);
      g.setColor(c).drawLine(x,1,x,21);
    }
  }
  function headerFgAt(x){
    var c=g.getPixel(x,0);
    /* Bangle.js 2 3-bit colours: yellow/white backgrounds need black text;
       blue or magenta backgrounds need white text. */
    return (c===6||c===7)?"#000":"#fff";
  }
  function drawHeaderChar(ch,bx,fg){
    var rows=FONT3[ch];if(!rows)return;
    g.setColor(fg);
    for(var ry=0;ry<7;ry++){
      var bits=rows[ry];
      for(var rx=0;rx<3;rx++)if(bits&(4>>rx)){
        var px=bx+rx*3,py=1+ry*3;
        g.fillRect(px,py,px+2,py+2);
      }
    }
  }
  function paintColon(){
    if(!Bangle.isLCDOn())return;
    var L=layout(),bx=1+Math.round(8*L.adv);
    restoreHeaderBg(bx,bx+L.gw-1);
    if(blinkOn)drawHeaderChar(":",bx,headerFgAt(bx));
  }
  function paintBattery(){
    if(!Bangle.isLCDOn())return;
    var L=layout(),btxt=(""+batteryPct)+"%";
    var show=!charging||blinkOn;
    for(var i=0;i<btxt.length;i++){
      var bx=1+Math.round((12+i)*L.adv);
      restoreHeaderBg(bx,bx+L.gw-1);
      if(show)drawHeaderChar(btxt[i],bx,batteryPct<=20?"#f00":headerFgAt(bx));
    }
  }

  function stopBlink(){if(blinkTimer){clearTimeout(blinkTimer);blinkTimer=undefined;}}
  function blinkTick(){
    blinkTimer=undefined;
    if(!Bangle.isLCDOn())return;
    blinkOn=!blinkOn;
    paintColon();
    if(charging)paintBattery();
    blinkTimer=setTimeout(blinkTick,1000);
  }
  function startBlink(){
    stopBlink();
    blinkOn=true;
    paintColon();
    if(charging)paintBattery();
    blinkTimer=setTimeout(blinkTick,1000);
  }

  function stopBatteryTimer(){if(batteryTimer){clearTimeout(batteryTimer);batteryTimer=undefined;}}
  function batteryTick(){
    batteryTimer=undefined;
    if(!Bangle.isLCDOn())return;
    batteryPct=E.getBattery();
    paintBattery();
    batteryTimer=setTimeout(batteryTick,300000);
  }
  function startBatteryTimer(){
    stopBatteryTimer();
    batteryPct=E.getBattery();
    paintBattery();
    batteryTimer=setTimeout(batteryTick,300000);
  }

  function stopMinuteFix(){if(minuteFixTimer){clearTimeout(minuteFixTimer);minuteFixTimer=undefined;}}
  function scheduleMinuteFix(){
    stopMinuteFix();
    if(!Bangle.isLCDOn())return;
    var wait=60000-(Date.now()%60000)+180;
    minuteFixTimer=setTimeout(function(){
      minuteFixTimer=undefined;
      if(!Bangle.isLCDOn())return;
      paintBattery();
      paintColon();
      scheduleMinuteFix();
    },wait);
  }

  function onLCD(on){
    if(on){
      startBatteryTimer();
      scheduleMinuteFix();
      startBlink();
    }else{
      stopBlink();
      stopBatteryTimer();
      stopMinuteFix();
      lastTap=0;
    }
  }
  function onCharging(on){
    charging=!!on;
    if(!Bangle.isLCDOn())return;
    if(charging){
      blinkOn=true;
      paintColon();
      paintBattery();
      stopBlink();
      blinkTimer=setTimeout(blinkTick,1000);
    }else{
      paintBattery();
    }
  }

  function removeWrapperListeners(){
    stopBlink();stopBatteryTimer();stopMinuteFix();
    Bangle.removeListener("lcdPower",onLCD);
    Bangle.removeListener("charging",onCharging);
    Bangle.removeListener("touch",onTouch);
  }
  function returnToOrbit(){load("orbit_dev.app.js");}
  function openOrbitSettings(){
    if(openingSettings)return;
    openingSettings=true;
    removeWrapperListeners();
    /* The core's E.showMenu call will replace its custom UI and trigger its
       own cleanup. Restore the native drawing primitive before leaving Orbit. */
    g.fillCircle=originalFillCircle;
    try{
      var src=Storage.read("orbit_dev.settings.js");
      if(!src)throw new Error("orbit_dev.settings.js missing");
      var fn=eval(src);
      if(typeof fn!=="function")throw new Error("invalid Orbit Dev settings");
      fn(returnToOrbit);
    }catch(e){
      try{Storage.write("orbit_dev.err","settings: "+e);}catch(x){}
      returnToOrbit();
    }
  }
  function onTouch(button,xy){
    /* Double tap is active only during Orbit's yellow/unlocked operation
       state. A lone tap deliberately remains a no-op. */
    if(!Bangle.isLCDOn()||Bangle.isLocked()){lastTap=0;return;}
    var now=Date.now();
    if(lastTap&&now-lastTap<=450){
      lastTap=0;
      openOrbitSettings();
    }else lastTap=now;
  }

  Bangle.on("lcdPower",onLCD);
  Bangle.on("charging",onCharging);
  Bangle.on("touch",onTouch);
  E.on("kill",function(){removeWrapperListeners();});
  if(Bangle.isLCDOn())onLCD(true);
})();
