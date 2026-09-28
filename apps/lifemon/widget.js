(() => {
  let timer,phase=true,warn=false,lcd=true;
  function paint(w,show){if(!w||w.x===undefined)return;g.reset().clearRect(w.x,w.y,w.x+w.width-1,w.y+23);if(!show)return;g.setColor(warn?"#f00":g.theme.fg);let x=w.x,y=w.y;g.drawRect(x+1,y+3,x+22,y+20);g.drawPoly([x+3,y+12,x+7,y+12,x+9,y+7,x+12,y+17,x+15,y+10,x+18,y+12,x+21,y+12]);}
  function stop(){if(timer)clearInterval(timer);timer=undefined;phase=true;}
  function sync(w){if(!warn||!lcd){stop();paint(w,true);return;}if(!timer){phase=true;timer=setInterval(()=>{phase=!phase;paint(WIDGETS.lifemon,phase);},1000);}paint(w,phase);}
  WIDGETS.lifemon={area:"tr",width:24,draw:function(){warn=!!(global.LIFEMON&&global.LIFEMON.isBatteryWarning&&global.LIFEMON.isBatteryWarning());sync(this);},setWarning:function(v){warn=!!v;sync(this);}};
  Bangle.on("lcdPower",on=>{lcd=!!on;if(!lcd)stop();else if(WIDGETS.lifemon)WIDGETS.lifemon.draw();});
})();