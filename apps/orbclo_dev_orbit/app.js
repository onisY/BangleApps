/* Orbclo Dev Orbit 0.11 - proven baseline + faster transition + render timing */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,unlockTimer;
  var SUNX=W-28,SUNY=52,EARTHX=54,EARTHY=116,EARTHR=30;

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}

  function drawHeader(){
    var d=new Date(),bat=E.getBattery();
    var left=pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
    var right=bat+"%";
    g.setColor(WHITE).fillRect(0,0,W-1,23);
    g.setFont("Vector",12).setBgColor(WHITE);
    g.setFontAlign(-1,0).setColor(BLACK).drawString(left,3,11);
    g.setFontAlign(1,0).setColor(bat<=20?RED:BLACK).drawString(right,W-3,11);
  }

  function drawSun(){
    var r=6;
    g.setColor(ORANGE);
    for(var i=0;i<8;i++){
      var a=i*Math.PI/4;
      g.drawLine(Math.round(SUNX+Math.cos(a)*(r+1)),Math.round(SUNY+Math.sin(a)*(r+1)),Math.round(SUNX+Math.cos(a)*(r+4)),Math.round(SUNY+Math.sin(a)*(r+4)));
    }
    g.setColor(YELLOW).fillCircle(SUNX,SUNY,r);
  }

  function drawEarth(){
    var dx=SUNX-EARTHX,dy=SUNY-EARTHY;
    g.setColor(CYAN).fillCircle(EARTHX,EARTHY,EARTHR);

    /* Night side is the half of the disk facing away from the Sun. */
    g.setColor(DARKBLUE);
    for(var yy=-EARTHR;yy<=EARTHR;yy++){
      var span=Math.floor(Math.sqrt(Math.max(0,EARTHR*EARTHR-yy*yy)));
      if(span<=0)continue;
      var cut=-yy*dy/dx;
      var end=Math.min(span,Math.floor(cut-0.5));
      if(end>=-span)g.drawLine(EARTHX-span,EARTHY+yy,EARTHX+end,EARTHY+yy);
    }

    var len=Math.sqrt(dx*dx+dy*dy),tx=-dy/len,ty=dx/len;
    g.setColor(WHITE).drawLine(
      Math.round(EARTHX-tx*(EARTHR-1)),Math.round(EARTHY-ty*(EARTHR-1)),
      Math.round(EARTHX+tx*(EARTHR-1)),Math.round(EARTHY+ty*(EARTHR-1))
    );
    g.setColor(WHITE).drawCircle(EARTHX,EARTHY,EARTHR);
  }

  function drawBase(){
    var t0=getTime();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    drawSun();
    drawEarth();
    drawHeader();
    var ms=Math.round((getTime()-t0)*1000);
    g.setColor(WHITE).setBgColor(BLACK).setFont("6x8",1).setFontAlign(0,0).drawString("draw "+ms+" ms",W>>1,H-12);
    try{g.flip();}catch(e){}
    busy=false;
  }

  function showTouch(){
    touchCount++;
    busy=true;
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    g.setColor(WHITE).setBgColor(NAVY).setFont("Vector",24).setFontAlign(0,0).drawString("TOUCH "+touchCount,W>>1,H>>1);
    try{g.flip();}catch(e){}
    clear(transitionTimer);
    transitionTimer=setTimeout(function(){transitionTimer=undefined;if(!killed)drawBase();},80);
  }

  function onTouch(){
    if(killed||busy)return;
    showTouch();
  }

  function onLock(isLocked){
    if(!isLocked||killed)return;
    clear(unlockTimer);
    unlockTimer=setTimeout(function(){unlockTimer=undefined;if(!killed)try{Bangle.setLocked(false);}catch(e){}},0);
  }

  function armMinute(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){minuteTimer=undefined;if(!killed){drawHeader();try{g.flip();}catch(e){}armMinute();}},60000-(Date.now()%60000)+25);
  }

  function cleanup(){
    if(killed)return;
    killed=true;
    clear(transitionTimer);clear(minuteTimer);clear(unlockTimer);
    try{Bangle.removeListener("lock",onLock);}catch(e){}
  }

  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
})();
