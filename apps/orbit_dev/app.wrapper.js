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
  try{charging=Bangle.isCharging();}catch(e){}

  var FONT3={
    "0":[7,5,5,5,5,5,7],"1":[2,6,2,2,2,2,7],"2":[7,1,1,7,4,4,7],
    "3":[7,1,1,7,1,1,7],"4":[5,5,5,7,1,1,1],"5":[7,4,4,7,1,1,7],
    "6":[7,4,4,7,5,5,7],"7":[7,1,1,2,2,2,2],"8":[7,5,5,7,5,5,7],
    "9":[7,5,5,7,1,1,7],":":[0,2,2,0,2,2,0],"%":[5,1,2,2,4,4,5]
  };

  function headerMode(){return Bangle.isLocked()?1:2;}
  function layout(){
    var digits=(""+batteryPct).length;
    var len=13+digits,gw=9,W=g.getWidth();
    return {gw:gw,adv:len>1?(W-2-gw)/(len-1):0};
  }
  function fillHeaderCharBg(x0,x1,mode){
    var y0=1,y1=21;
    if(mode===2){
      g.setColor("#ff0").fillRect(x0,y0,x1,y1);
    }else{
      g.setColor("#00f").fillRect(x0,y0,x1,y1);
      g.setColor("#f0f");
      for(var x=3;x<g.getWidth();x+=8)if(x>=x0&&x<=x1)g.drawLine(x,y0,x,y1);
    }
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
    var L=layout(),mode=headerMode(),fg=mode===2?"#000":"#fff";
    var bx=1+Math.round(8*L.adv);
    fillHeaderCharBg(bx,bx+L.gw-1,mode);
    if(blinkOn)drawHeaderChar(":",bx,fg);
  }
  function paintBattery(){
    if(!Bangle.isLCDOn())return;
    var L=layout(),mode=headerMode(),normalFg=mode===2?"#000":"#fff";
    var btxt=(""+batteryPct)+"%";
    var show=!charging||blinkOn;
    var fg=batteryPct<=20?"#f00":normalFg;
    for(var i=0;i<btxt.length;i++){
      var bx=1+Math.round((12+i)*L.adv);
      fillHeaderCharBg(bx,bx+L.gw-1,mode);
      if(show)drawHeaderChar(btxt[i],bx,fg);
    }
  }

  function stopBlink(){if(blinkTimer){clearTimeout(blinkTimer);blinkTimer=undefined;}}
  function blinkTick(){
    blinkTimer=undefined;
    if(!Bangle.isLCDOn())return;
    blinkOn=!blinkOn;
    paintColon();
    if(charging)paintBattery();
    /* Schedule from the actual execution time.  A delayed frame therefore
       never causes a fast catch-up flash. */
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
    batteryTimer=setTimeout(batteryTick,300000); /* 5 min */
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
      /* Core redraws the header each minute using its legacy battery text.
         Restore the cached NN% format without re-sampling the battery. */
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
    }
  }
  function onCharging(on){
    charging=!!on;
    if(!Bangle.isLCDOn())return;
    if(charging){
      /* Start the charge indication immediately and synchronise it with ':'. */
      blinkOn=true;
      paintColon();
      paintBattery();
      stopBlink();
      blinkTimer=setTimeout(blinkTick,1000);
    }else{
      paintBattery();
    }
  }

  Bangle.on("lcdPower",onLCD);
  Bangle.on("charging",onCharging);
  E.on("kill",function(){
    stopBlink();stopBatteryTimer();stopMinuteFix();
    Bangle.removeListener("lcdPower",onLCD);
    Bangle.removeListener("charging",onCharging);
  });
  if(Bangle.isLCDOn())onLCD(true);
})();
