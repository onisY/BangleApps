/* Orbit integrated 5wCal module. Evaluates to an API object. */
(function(){
  var Storage=require("Storage");
  var CFG_FILE="orbit.cal.json";
  var DAY=86400000;

  function normalizeConfig(c){
    c=c||{};
    if(c.lang!=="ja"&&c.lang!=="en")c.lang="ja";
    if(c.ukRegion!=="ew"&&c.ukRegion!=="sc")c.ukRegion="ew";
    if(!(c.timeout>=15&&c.timeout<=120))c.timeout=30;
    return c;
  }
  function readConfig(){
    var c=Storage.readJSON(CFG_FILE,1);
    if(!c){
      var old=Storage.readJSON("fivewcal.json",1)||{};
      c=normalizeConfig({lang:old.lang,ukRegion:old.ukRegion,timeout:old.timeout});
      Storage.writeJSON(CFG_FILE,c);
    }
    return normalizeConfig(c);
  }
  function writeConfig(c){Storage.writeJSON(CFG_FILE,normalizeConfig(c));}

  function create(){
    var W=g.getWidth(),H=g.getHeight();
    var BLACK=0x0000,WHITE=0xFFFF,BLUE=0x001F,RED=0xF800,GREEN=0x07E0,GRAY=0x4208;
    var cfg,today,pageStart,selected;
    var active=false,onReturn;
    var tapTimer,tapCount=0,lastXY;
    var blinkTimer,blinkWhite=true,autoTimer;

    function midnight(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
    function copyDate(d){return d?new Date(d.getFullYear(),d.getMonth(),d.getDate()):undefined;}
    function addDays(d,n){var x=copyDate(d);x.setDate(x.getDate()+n);return x;}
    function mondayOf(d){var x=copyDate(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
    function sameDay(a,b){return !!a&&!!b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
    function dayNumber(d){return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY);}
    function pad2(n){return (n<10?"0":"")+n;}
    function nthMonday(y,m,n){var d=new Date(y,m-1,1);return 1+((8-d.getDay())%7)+7*(n-1);}
    function lastMonday(y,m){var d=new Date(y,m,0);return d.getDate()-((d.getDay()+6)%7);}
    function vernal(y){return Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));}
    function autumn(y){return Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));}

    function baseHoliday(d){
      var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
      if(m===1&&n===1)return true;
      if(m===1&&((y>=2000&&n===nthMonday(y,1,2))||(y>=1949&&y<2000&&n===15)))return true;
      if(m===2&&n===11&&y>=1967)return true;
      if(m===2&&n===23&&y>=2020)return true;
      if(m===3&&y>=1949&&n===vernal(y))return true;
      if(m===4&&n===29&&y>=1949)return true;
      if(m===5&&n===3&&y>=1949)return true;
      if(m===5&&n===4&&y>=2007)return true;
      if(m===5&&n===5&&y>=1949)return true;
      if(y===2020&&m===7&&n===23)return true;
      if(y===2021&&m===7&&n===22)return true;
      if(y!==2020&&y!==2021&&m===7&&((y>=2003&&n===nthMonday(y,7,3))||(y>=1996&&y<2003&&n===20)))return true;
      if(y===2020&&m===8&&n===10)return true;
      if(y===2021&&m===8&&n===8)return true;
      if(y!==2020&&y!==2021&&y>=2016&&m===8&&n===11)return true;
      if(m===9&&((y>=2003&&n===nthMonday(y,9,3))||(y>=1966&&y<2003&&n===15)))return true;
      if(m===9&&y>=1948&&n===autumn(y))return true;
      if(y===2020&&m===7&&n===24)return true;
      if(y===2021&&m===7&&n===23)return true;
      if(y!==2020&&y!==2021&&m===10&&((y>=2000&&n===nthMonday(y,10,2))||(y>=1966&&y<2000&&n===10)))return true;
      if(m===11&&n===3&&y>=1948)return true;
      if(m===11&&n===23&&y>=1948)return true;
      if(m===12&&n===23&&y>=1989&&y<=2018)return true;
      if(y===2019&&((m===5&&n===1)||(m===10&&n===22)))return true;
      return false;
    }
    function isJapanHoliday(d){
      if(baseHoliday(d))return true;
      var y=d.getFullYear();
      if(y>=1986&&baseHoliday(addDays(d,-1))&&baseHoliday(addDays(d,1)))return true;
      if(y>=1973){
        var p=addDays(d,-1);
        if(y<2007)return d.getDay()===1&&baseHoliday(p)&&p.getDay()===0;
        while(baseHoliday(p)){if(p.getDay()===0)return true;p=addDays(p,-1);}
      }
      return false;
    }
    function easterSunday(y){
      var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
      var f=Math.floor((b+8)/25),gg=Math.floor((b-f+1)/3);
      var h=(19*a+b-d-gg+15)%30,i=Math.floor(c/4),k=c%4;
      var l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
      var q=h+l-7*mm+114,month=Math.floor(q/31),day=(q%31)+1;
      return new Date(y,month-1,day);
    }
    function commonUKSpecial(d){
      var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
      if(y===2011&&m===4&&n===29)return true;
      if(y===2022&&m===9&&n===19)return true;
      if(y===2023&&m===5&&n===8)return true;
      return false;
    }
    function christmasHoliday(d){
      var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
      if(m!==12)return false;
      var xd=new Date(y,11,25).getDay(),x=(xd===0||xd===6)?27:25;
      if(n===x)return true;
      var bd=new Date(y,11,26).getDay(),bb=(bd===0||bd===6)?28:26;
      return n===bb;
    }
    function isEnglandWalesHoliday(d){
      var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
      var dow=new Date(y,0,1).getDay(),ny=(dow===6)?3:(dow===0?2:1);
      if(m===1&&n===ny)return true;
      var easter=easterSunday(y);
      if(sameDay(d,addDays(easter,-2))||sameDay(d,addDays(easter,1)))return true;
      if(y===2020){if(m===5&&n===8)return true;}else if(m===5&&n===nthMonday(y,5,1))return true;
      if(y===2002){if(m===6&&(n===3||n===4))return true;}
      else if(y===2012){if(m===6&&(n===4||n===5))return true;}
      else if(y===2022){if(m===6&&(n===2||n===3))return true;}
      else if(m===5&&n===lastMonday(y,5))return true;
      if(commonUKSpecial(d))return true;
      if(m===8&&n===lastMonday(y,8))return true;
      return christmasHoliday(d);
    }
    function isScotlandHoliday(d){
      var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
      var dow=new Date(y,0,1).getDay(),ny1,ny2;
      if(dow===6){ny1=3;ny2=4;}else if(dow===0){ny1=2;ny2=3;}else if(dow===5){ny1=1;ny2=4;}else{ny1=1;ny2=2;}
      if(m===1&&(n===ny1||n===ny2))return true;
      var easter=easterSunday(y);
      if(sameDay(d,addDays(easter,-2)))return true;
      if(y===2020){if(m===5&&n===8)return true;}else if(m===5&&n===nthMonday(y,5,1))return true;
      if(y===2002){if(m===6&&(n===3||n===4))return true;}
      else if(y===2012){if(m===6&&(n===4||n===5))return true;}
      else if(y===2022){if(m===6&&(n===2||n===3))return true;}
      else if(m===5&&n===lastMonday(y,5))return true;
      if(commonUKSpecial(d))return true;
      if(y===2026&&m===6&&n===15)return true;
      if(m===8&&n===nthMonday(y,8,1))return true;
      var sd=new Date(y,10,30).getDay(),sm=11,sn=30;
      if(sd===6){sm=12;sn=2;}else if(sd===0){sm=12;sn=1;}
      if(m===sm&&n===sn)return true;
      return christmasHoliday(d);
    }
    function isEnglishHoliday(d){return cfg.ukRegion==="sc"?isScotlandHoliday(d):isEnglandWalesHoliday(d);}

    function topFreeGap(){
      var spans=[];
      if(typeof WIDGETS!=="undefined")Object.keys(WIDGETS).forEach(function(k){var wd=WIDGETS[k];if(!wd||!wd.width||!wd.area||wd.area.charAt(0)!=="t")return;if(typeof wd.x==="number")spans.push([wd.x,wd.x+wd.width-1]);});
      if(!spans.length&&typeof WIDGETS!=="undefined"){
        var lw=0,rw=0;Object.keys(WIDGETS).forEach(function(k){var wd=WIDGETS[k];if(!wd||!wd.width)return;if(wd.area==="tl")lw+=wd.width;else if(wd.area==="tr")rw+=wd.width;});
        if(lw)spans.push([0,lw-1]);if(rw)spans.push([W-rw,W-1]);
      }
      spans.sort(function(a,b){return a[0]-b[0];});
      var merged=[];spans.forEach(function(s){s[0]=Math.max(0,s[0]);s[1]=Math.min(W-1,s[1]);if(!merged.length||s[0]>merged[merged.length-1][1]+1)merged.push([s[0],s[1]]);else if(s[1]>merged[merged.length-1][1])merged[merged.length-1][1]=s[1];});
      var gaps=[],p=0;merged.forEach(function(s){if(s[0]>p)gaps.push([p,s[0]-1]);p=Math.max(p,s[1]+1);});if(p<W)gaps.push([p,W-1]);if(!gaps.length)return [0,W-1];
      gaps.sort(function(a,b){var aw=a[1]-a[0]+1,bw=b[1]-b[0]+1;if(aw!==bw)return bw-aw;return Math.abs(((a[0]+a[1])>>1)-(W>>1))-Math.abs(((b[0]+b[1])>>1)-(W>>1));});return gaps[0];
    }
    function drawTop(){
      try{Bangle.drawWidgets();}catch(e){}
      var s=pageStart.getFullYear()+"/"+pad2(pageStart.getMonth()+1),gap=topFreeGap(),x1=gap[0]+2,x2=gap[1]-2;if(x2<x1){x1=gap[0];x2=gap[1];}
      var avail=Math.max(1,x2-x1+1),fs=14;g.setFont("Vector",fs);while(fs>8&&g.stringWidth(s)+4>avail){fs-=2;g.setFont("Vector",fs);}
      g.setBgColor(BLACK).setColor(BLACK).fillRect(x1,1,x2,22);g.setColor(WHITE).setFont("Vector",fs).setFontAlign(0,0).drawString(s,(x1+x2)>>1,12);
    }
    function line2(x1,y1,x2,y2){g.drawLine(x1,y1,x2,y2);g.drawLine(x1+1,y1,x2+1,y2);}
    function weekdayGlyph(c,x,y){
      g.setColor(WHITE);
      if(c===0){line2(x-6,y-8,x-6,y+8);line2(x+5,y-8,x+5,y+8);line2(x-6,y-8,x+5,y-8);line2(x-6,y-2,x+5,y-2);line2(x-6,y+4,x+5,y+4);}
      else if(c===1){line2(x,y-8,x,y+2);line2(x-2,y-1,x-7,y-6);line2(x+2,y-1,x+7,y-6);line2(x,y+1,x-6,y+8);line2(x,y+1,x+7,y+8);}
      else if(c===2){line2(x,y-8,x,y+8);line2(x-2,y-1,x-7,y-4);line2(x-2,y-1,x-7,y+6);line2(x+2,y-2,x+7,y-5);line2(x+1,y,x+7,y+6);line2(x-1,y-7,x+2,y-4);}
      else if(c===3){line2(x,y-8,x,y+8);line2(x-7,y-2,x+7,y-2);line2(x,y-1,x-7,y+7);line2(x,y-1,x+7,y+7);}
      else if(c===4){line2(x,y-8,x-7,y-2);line2(x,y-8,x+7,y-2);line2(x-5,y-2,x+5,y-2);line2(x-6,y+3,x+6,y+3);line2(x,y-2,x,y+7);line2(x-7,y+8,x+7,y+8);line2(x-5,y+5,x-7,y+2);line2(x+5,y+5,x+7,y+2);}
      else if(c===5){line2(x,y-8,x,y+7);line2(x-5,y-4,x+5,y-4);line2(x-7,y+7,x+7,y+7);}
      else{line2(x-6,y-8,x+5,y-8);line2(x-6,y+8,x+5,y+8);line2(x-6,y-8,x-6,y+8);line2(x+5,y-8,x+5,y+8);line2(x-6,y,x+5,y);}
    }
    function drawWeekday(c){var x1=Math.floor(c*W/7),x2=Math.floor((c+1)*W/7)-1,bg=BLACK;if(c===5)bg=BLUE;else if(c===6)bg=RED;g.setColor(bg).fillRect(x1,24,x2,47);if(cfg.lang==="en")g.setColor(WHITE).setFont("Vector",20).setFontAlign(0,0).drawString(["M","T","W","T","F","S","S"][c],(x1+x2)>>1,35);else weekdayGlyph(c,(x1+x2)>>1,35);}
    function cellGeometry(index){var c=index%7,r=(index/7)|0,top=48,gh=H-48;return {x1:Math.floor(c*W/7),x2:Math.floor((c+1)*W/7)-1,y1:top+Math.floor(r*gh/5),y2:top+Math.floor((r+1)*gh/5)-1,c:c};}
    function drawCell(index){
      if(index<0||index>=35)return;var q=cellGeometry(index),d=addDays(pageStart,index),bg=BLACK,fg=WHITE;
      if(q.c===5)bg=BLUE;if(q.c===6||(cfg.lang==="en"?isEnglishHoliday(d):isJapanHoliday(d)))bg=RED;if(sameDay(d,today)){bg=GREEN;fg=BLACK;}if(selected&&sameDay(d,selected))fg=blinkWhite?WHITE:BLACK;
      g.setColor(bg).fillRect(q.x1,q.y1,q.x2,q.y2);g.setColor(fg).setBgColor(bg).setFont("Vector",20).setFontAlign(0,0).drawString(""+d.getDate(),(q.x1+q.x2)>>1,(q.y1+q.y2)>>1);g.setColor(GRAY).drawRect(q.x1,q.y1,q.x2,q.y2);
    }
    function selectedIndex(){if(!selected)return -1;var n=dayNumber(selected)-dayNumber(pageStart);return n>=0&&n<35?n:-1;}
    function redrawSelected(){var i=selectedIndex();if(i>=0)drawCell(i);}
    function drawCalendar(){g.setBgColor(BLACK).setColor(BLACK).clear();for(var c=0;c<7;c++)drawWeekday(c);for(var i=0;i<35;i++)drawCell(i);drawTop();}
    function clearTimer(t){if(t)clearTimeout(t);}
    function clearTaps(){clearTimer(tapTimer);tapTimer=undefined;tapCount=0;lastXY=undefined;}
    function stopBlink(){clearTimer(blinkTimer);blinkTimer=undefined;}
    function blinkTick(){blinkTimer=undefined;if(!active||!selected||!Bangle.isLCDOn())return;blinkWhite=!blinkWhite;redrawSelected();blinkTimer=setTimeout(blinkTick,500);}
    function startBlink(){stopBlink();blinkWhite=true;if(active&&selected)blinkTimer=setTimeout(blinkTick,500);}
    function stopAuto(){clearTimer(autoTimer);autoTimer=undefined;}
    function armAuto(){stopAuto();if(!active||!cfg||!(cfg.timeout>=15))return;autoTimer=setTimeout(function(){autoTimer=undefined;returnToOrbit();},cfg.timeout*1000);}
    function stop(){stopBlink();stopAuto();clearTaps();active=false;onReturn=undefined;}
    function resetTransient(){selected=undefined;clearTaps();stopBlink();stopAuto();today=midnight(new Date());pageStart=mondayOf(today);}
    function returnToOrbit(){if(!active)return;var cb=onReturn,sel=selected?copyDate(selected):undefined;stop();if(cb)cb(sel);}
    function dateAt(xy){if(!xy||xy.x<0||xy.x>=W||xy.y<48||xy.y>=H)return undefined;var c=Math.floor(xy.x*7/W),r=Math.floor((xy.y-48)*5/(H-48));if(c<0||c>6||r<0||r>4)return undefined;return addDays(pageStart,r*7+c);}
    function selectAt(xy){var old=selectedIndex(),d=dateAt(xy);selected=d?copyDate(d):undefined;blinkWhite=true;if(old>=0)drawCell(old);var ni=selectedIndex();if(ni>=0)drawCell(ni);if(selected)startBlink();else stopBlink();}
    function touch(xy){
      if(!active)return;armAuto();tapCount++;lastXY=xy;clearTimer(tapTimer);
      tapTimer=setTimeout(function(){var n=tapCount,xy0=lastXY;tapTimer=undefined;tapCount=0;lastXY=undefined;if(!active)return;if(n===1)returnToOrbit();else if(n===2)selectAt(xy0);},400);
    }
    function swipe(lr,ud){if(!active||!ud)return;clearTaps();armAuto();pageStart=addDays(pageStart,ud<0?35:-35);drawCalendar();}
    function start(opts){
      opts=opts||{};stop();cfg=readConfig();active=true;onReturn=opts.onReturn;today=midnight(new Date());
      var focus=opts.focusDate?midnight(opts.focusDate):(opts.selectedDate?midnight(opts.selectedDate):today);pageStart=mondayOf(focus);selected=opts.selectedDate?midnight(opts.selectedDate):undefined;blinkWhite=true;
      try{if(typeof WIDGETS==="undefined")Bangle.loadWidgets();}catch(e){}
      Bangle.setUI({mode:"custom",remove:stop});drawCalendar();if(selected)startBlink();armAuto();
    }
    function isActive(){return active;}
    return {start:start,stop:stop,resetTransient:resetTransient,touch:touch,swipe:swipe,isActive:isActive};
  }

  return {create:create,readConfig:readConfig,writeConfig:writeConfig};
})()
