/* Orbclo Dev Cal 0.01 - isolated five-week calendar test */
(function(){
  var Storage=require("Storage"),W=g.getWidth(),H=g.getHeight();
  var BLACK=0,WHITE=0xFFFF,BLUE=0x001F,RED=0xF800,GREEN=0x07E0,GRAY=0x7BEF,NAVY=0x000F,DAY=86400000;
  var cfg=Storage.readJSON("orbclo_caldev.json",1)||{holidays:true};
  var start,selected,blinkWhite=true,blinkTimer,tapTimer,tapCount=0,idleTimer,buttonWatch,inputBusy=false,releaseTimer,killed=false,widgetsLoaded=false;
  function clear(t){if(t)clearTimeout(t);}
  function copyDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function addDays(d,n){var x=copyDay(d);x.setDate(x.getDate()+n);return x;}
  function monday(d){var x=copyDay(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
  function same(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function dayNum(d){return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY);}
  function lock(){inputBusy=true;clear(releaseTimer);releaseTimer=undefined;stopTap();}
  function unlockSoon(){clear(releaseTimer);releaseTimer=setTimeout(function(){releaseTimer=undefined;inputBusy=false;},120);}
  function stopTap(){clear(tapTimer);tapTimer=undefined;tapCount=0;}
  function nthMonday(y,m,n){var d=new Date(y,m,1);return 1+((8-d.getDay())%7)+7*(n-1);}
  function vernal(y){return Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));}
  function autumn(y){return Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));}
  function baseHoliday(d){
    var y=d.getFullYear(),m=d.getMonth(),n=d.getDate();
    if(m===0&&n===1)return true;if(m===0&&n===nthMonday(y,0,2))return true;if(m===1&&n===11)return true;if(m===1&&n===23&&y>=2020)return true;
    if(m===2&&n===vernal(y))return true;if(m===3&&n===29)return true;if(m===4&&(n===3||n===4||n===5))return true;
    if(m===6&&n===nthMonday(y,6,3))return true;if(m===7&&y>=2016&&n===11)return true;if(m===8&&n===nthMonday(y,8,3))return true;
    if(m===8&&n===autumn(y))return true;if(m===9&&n===nthMonday(y,9,2))return true;if(m===10&&(n===3||n===23))return true;return false;
  }
  function holiday(d){if(!cfg.holidays)return false;if(baseHoliday(d))return true;var p=addDays(d,-1);if(d.getFullYear()>=1973&&p.getDay()===0&&baseHoliday(p))return true;return false;}
  function geom(i){var c=i%7,r=(i/7)|0,top=48,gh=H-top;return {c:c,x1:Math.floor(c*W/7),x2:Math.floor((c+1)*W/7)-1,y1:top+Math.floor(r*gh/5),y2:top+Math.floor((r+1)*gh/5)-1};}
  function indexSelected(){if(!selected)return -1;var n=dayNum(selected)-dayNum(start);return n>=0&&n<35?n:-1;}
  function drawCell(i){
    var q=geom(i),d=addDays(start,i),bg=BLACK,fg=WHITE;if(q.c===5)bg=BLUE;if(q.c===6||holiday(d))bg=RED;if(same(d,new Date())){bg=GREEN;fg=BLACK;}if(same(d,selected))fg=blinkWhite?WHITE:BLACK;
    g.setColor(bg).fillRect(q.x1,q.y1,q.x2,q.y2);g.setColor(fg).setBgColor(bg).setFont("Vector",18).setFontAlign(0,0).drawString(""+d.getDate(),(q.x1+q.x2)>>1,(q.y1+q.y2)>>1);g.setColor(GRAY).drawRect(q.x1,q.y1,q.x2,q.y2);
  }
  function showWidgets(){try{if(!widgetsLoaded){Bangle.loadWidgets();widgetsLoaded=true;}Bangle.drawWidgets();}catch(e){}}
  function draw(){
    lock();g.reset().setBgColor(BLACK).setColor(BLACK).clear();showWidgets();
    var ym=start.getFullYear()+"/"+(start.getMonth()+1<10?"0":"")+(start.getMonth()+1);g.setFont("Vector",13).setFontAlign(0,0).setColor(WHITE).setBgColor(BLACK).drawString(ym,W>>1,11);
    var names=["M","T","W","T","F","S","S"];for(var c=0;c<7;c++){var x1=Math.floor(c*W/7),x2=Math.floor((c+1)*W/7)-1,bg=c===5?BLUE:(c===6?RED:BLACK);g.setColor(bg).fillRect(x1,24,x2,47);g.setColor(WHITE).setBgColor(bg).setFont("Vector",17).drawString(names[c],(x1+x2)>>1,35);}
    for(var i=0;i<35;i++)drawCell(i);startBlink();unlockSoon();
  }
  function startBlink(){clear(blinkTimer);blinkTimer=undefined;if(!selected||!Bangle.isLCDOn())return;blinkTimer=setTimeout(function tick(){blinkTimer=undefined;if(!selected||killed||!Bangle.isLCDOn())return;blinkWhite=!blinkWhite;var i=indexSelected();if(i>=0)drawCell(i);blinkTimer=setTimeout(tick,500);},500);}
  function dateAt(xy){if(!xy||xy.y<48||xy.y>=H)return;var c=Math.floor(xy.x*7/W),r=Math.floor((xy.y-48)*5/(H-48));if(c<0||c>6||r<0||r>4)return;return addDays(start,r*7+c);}
  function select(xy){var old=indexSelected(),d=dateAt(xy);selected=d?copyDay(d):undefined;blinkWhite=true;if(old>=0)drawCell(old);var ni=indexSelected();if(ni>=0)drawCell(ni);startBlink();}
  function touch(btn,xy){
    if(killed||inputBusy)return;if(tapCount===0){tapCount=1;tapTimer=setTimeout(function(){tapTimer=undefined;tapCount=0;},400);return;}
    clear(tapTimer);tapTimer=undefined;tapCount=0;lock();select(xy);unlockSoon();
  }
  function swipe(lr,ud){if(killed||inputBusy||!ud)return;lock();start=addDays(start,ud<0?35:-35);draw();}
  function cleanup(){if(killed)return;killed=true;clear(blinkTimer);clear(tapTimer);clear(releaseTimer);try{Bangle.removeListener("touch",touch);}catch(e){}try{Bangle.removeListener("swipe",swipe);}catch(e){}if(buttonWatch){clearWatch(buttonWatch);buttonWatch=undefined;}}
  try{Bangle.setUI({mode:"custom",remove:cleanup});}catch(e){}showWidgets();start=monday(new Date());Bangle.on("touch",touch);Bangle.on("swipe",swipe);buttonWatch=setWatch(function(){if(inputBusy)return;cleanup();Bangle.showLauncher();},BTN1,{repeat:true,edge:"rising",debounce:30});E.on("kill",cleanup);draw();
})();
