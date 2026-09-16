/* Orbit Dev runtime wrapper */
(function(){
  var Storage=require("Storage"), originalLauncher=Bangle.showLauncher;
  function appSource(id,direct){var info=Storage.readJSON(id+".info",1);if(info&&info.src&&Storage.read(info.src)!==undefined)return info.src;if(Storage.read(direct)!==undefined)return direct;}
  function openCalendarOrSettings(){var src=appSource("fivewcal","fivewcal.app.js")||appSource("calendar","calendar.app.js")||appSource("setting","setting.app.js");if(src){load(src);return;}if(originalLauncher)originalLauncher();}
  Bangle.showLauncher=openCalendarOrSettings;
  var originalFillCircle=g.fillCircle;
  g.fillCircle=function(x,y,r){if(x===74&&y===101&&r===2)return this;return originalFillCircle.apply(this,arguments);};
  var core=Storage.read("orbit_dev.core.js");if(!core)throw new Error("orbit_dev.core.js missing");eval(core);
  var blinkTimer,blinkOn=true;
  var FONT3={"0":[7,5,5,5,5,5,7],"1":[2,6,2,2,2,2,7],"2":[7,1,1,7,4,4,7],"3":[7,1,1,7,1,1,7],"4":[5,5,5,7,1,1,1],"5":[7,4,4,7,1,1,7],"6":[7,4,4,7,5,5,7],"7":[7,1,1,2,2,2,2],"8":[7,5,5,7,5,5,7],"9":[7,5,5,7,1,1,7],":":[0,2,2,0,2,2,0],"%":[5,1,2,2,4,4,5]};
  function headerMode(){return Bangle.isLocked()?1:2;}
  function fillHeaderCharBg(x0,x1,mode){var y0=1,y1=21;if(mode===2){g.setColor("#ff0").fillRect(x0,y0,x1,y1);}else{g.setColor("#00f").fillRect(x0,y0,x1,y1);g.setColor("#f0f");for(var x=3;x<g.getWidth();x+=8)if(x>=x0&&x<=x1)g.drawLine(x,y0,x,y1);}}
  function drawHeaderChar(ch,bx,fg){var rows=FONT3[ch];if(!rows)return;g.setColor(fg);for(var ry=0;ry<7;ry++){var bits=rows[ry];for(var rx=0;rx<3;rx++)if(bits&(4>>rx)){var px=bx+rx*3,py=1+ry*3;g.fillRect(px,py,px+2,py+2);}}}
  function paintHeaderOverlay(){if(!Bangle.isLCDOn())return;var bat=E.getBattery(),digits=(""+bat).length;var len=13+digits,gw=9,W=g.getWidth();var adv=len>1?(W-2-gw)/(len-1):0;var mode=headerMode(),fg=mode===2?"#000":"#fff";var cbx=1+Math.round(8*adv);fillHeaderCharBg(cbx,cbx+gw-1,mode);if(blinkOn)drawHeaderChar(":",cbx,fg);var btxt=(""+bat)+"%",charging=false;try{charging=Bangle.isCharging();}catch(e){}var showBat=!charging||blinkOn;var bfg=bat<=20?"#f00":fg;for(var i=0;i<btxt.length;i++){var idx=12+i,bx=1+Math.round(idx*adv);fillHeaderCharBg(bx,bx+gw-1,mode);if(showBat)drawHeaderChar(btxt[i],bx,bfg);}}
  function stopBlink(){if(blinkTimer){clearInterval(blinkTimer);blinkTimer=undefined;}}
  function startBlink(){stopBlink();blinkOn=true;paintHeaderOverlay();blinkTimer=setInterval(function(){if(!Bangle.isLCDOn()){stopBlink();return;}blinkOn=!blinkOn;paintHeaderOverlay();},1000);}
  function onBlinkLCD(on){if(on)startBlink();else stopBlink();}
  Bangle.on("lcdPower",onBlinkLCD);E.on("kill",function(){stopBlink();Bangle.removeListener("lcdPower",onBlinkLCD);});if(Bangle.isLCDOn())startBlink();
})();
