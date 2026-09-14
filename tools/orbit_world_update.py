#!/usr/bin/env python3
import json,re,urllib.request,urllib.parse,unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ORBIT=ROOT/'apps'/'orbit'


def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Orbit-location-generator/1.0'})
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def ascii_name(s):
    s=(s or '').replace('’',"'").replace('ʻ',"'").replace('–','-').replace('—','-')
    return unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode('ascii').strip()


def compact(obj):
    return json.dumps(obj,ensure_ascii=True,separators=(',',':'))

# Preserve the existing Japan prefecture/place table exactly as data.
loc_path=ORBIT/'locations.js'
old=loc_path.read_text()
m=re.search(r'exports\.prefs\s*=\s*(\[.*\])\s*;\s*$',old,re.S)
if not m:
    raise RuntimeError('Could not parse existing Japan prefs')
japan_prefs=json.loads(m.group(1))

# REST Countries: English common country names + capital coordinates.
url=('https://restcountries.com/v3.1/all?fields='
     'name,capital,capitalInfo,cca2,independent,unMember')
raw=get_json(url)

# Use sovereign/independent entries, plus commonly listed geographic country entries.
extra={'VA','PS','TW','XK'}
items=[]
for c in raw:
    code=c.get('cca2','')
    if not (c.get('independent') is True or c.get('unMember') is True or code in extra):
        continue
    name=ascii_name((c.get('name') or {}).get('common',''))
    if not name:
        continue
    if name=='Japan':
        items.append({'country':'Japan','places':[],'special':'japan'})
        continue
    if name=='United Kingdom':
        items.append({'country':'United Kingdom','places':[
            ['London',51.5074,-0.1278,None],
            ['Edinburgh',55.9533,-3.1883,None],
            ['Salisbury',51.0688,-1.7945,None]
        ]})
        continue
    caps=c.get('capital') or []
    ll=(c.get('capitalInfo') or {}).get('latlng') or []
    if not caps or len(ll)<2:
        # No capital coordinate means there is no reliable capital entry to use.
        continue
    city=ascii_name(caps[0])
    items.append({'country':name,'places':[[city,round(float(ll[0]),4),round(float(ll[1]),4),None]]})

# Alphabetical by displayed English/ASCII country name.
items.sort(key=lambda x:x['country'].casefold())

# Elevation from Open-Meteo's Copernicus 90 m DEM, max 100 coordinates/request.
refs=[]
for it in items:
    if it.get('special')=='japan':
        continue
    for p in it['places']:
        refs.append(p)
for start in range(0,len(refs),100):
    batch=refs[start:start+100]
    lat=','.join(str(p[1]) for p in batch)
    lon=','.join(str(p[2]) for p in batch)
    elev_url='https://api.open-meteo.com/v1/elevation?'+urllib.parse.urlencode({'latitude':lat,'longitude':lon})
    data=get_json(elev_url)
    elev=data.get('elevation') or []
    if len(elev)!=len(batch):
        raise RuntimeError('Elevation count mismatch')
    for p,e in zip(batch,elev):
        p[3]=int(round(e)) if e is not None else 0

countries=[[it['country'],it['places']] for it in items]
loc_path.write_text('exports.countries='+compact(countries)+';\nexports.prefs='+compact(japan_prefs)+';\n')

# Settings: Country first; Japan keeps Prefecture/Place; UK and all other countries use Place.
settings=r'''(function (back) {
  var Storage=require("Storage");
  var D=require("orbitloc"), C=D.countries, P=D.prefs;
  var FILE="orbit.json", SHOT_STATE="orbitshot.json", SHOT_MAX=20;
  var d={locationMode:0,countryName:"Japan",pref:12,place:0,
    locPref:"Tokyo",locName:"Chiyoda-ku",lat:35.694,lon:139.754,elevationM:16,
    manualLat:35.694,manualLon:139.754,manualElevationM:16,
    sunSize:6,earthSize:30,moonSize:9,markerSize:2,
    earthStyle:0,earthDayColor:6,earthNightColor:4,earthEdgeColor:7,viewSide:0};
  var EARTH_STYLES=["Current","Custom colors","N/S Hemi map"];
  var VIEW_SIDES=["North","South"];
  var EARTH_COLOR_NAMES=["Black","Red","Green","Yellow","Blue","Magenta","Cyan","White"];
  var s=Storage.readJSON(FILE,1)||{};
  Object.keys(d).forEach(function(k){if(s[k]===undefined)s[k]=d[k];});
  function countryIndex(name){for(var i=0;i<C.length;i++)if(C[i][0]===name)return i;return -1;}
  function prefIndex(name){for(var i=0;i<P.length;i++)if(P[i][0]===name)return i;return -1;}
  if(s.countryName===undefined){var pi=prefIndex(s.locPref);s.countryName=pi>=0?"Japan":s.locPref;}
  var ci=countryIndex(s.countryName);if(ci<0){s.countryName="Japan";ci=countryIndex("Japan");}
  if(s.pref<0||s.pref>=P.length)s.pref=12;
  if(s.countryName==="Japan"){
    var oldpi=prefIndex(s.locPref);if(oldpi>=0)s.pref=oldpi;
    if(s.place<0||s.place>=P[s.pref][1].length)s.place=0;
  } else {
    if(s.place<0||s.place>=C[ci][1].length)s.place=0;
  }
  function write(){Storage.writeJSON(FILE,s);}
  function applyPlace(){
    var idx=countryIndex(s.countryName),p;
    if(idx<0)return;
    if(s.countryName==="Japan"){
      p=P[s.pref][1][s.place];s.locPref=P[s.pref][0];
    }else{
      var places=C[idx][1];if(!places.length)return;
      if(s.place>=places.length)s.place=0;p=places[s.place];s.locPref=C[idx][0];
    }
    s.locName=p[0];s.lat=p[1];s.lon=p[2];s.elevationM=(p.length>3&&isFinite(p[3]))?p[3]:0;write();
  }
  function applyManual(){s.locPref="Manual";s.locName="Custom";s.lat=s.manualLat;s.lon=s.manualLon;s.elevationM=s.manualElevationM;write();}
  function applyCurrent(){if(s.locationMode===1)applyManual();else applyPlace();}
  function shotName(i){return "orb"+(i<10?"0":"")+i+".bmp";}
  function shotCount(){var st=Storage.readJSON(SHOT_STATE,1);if(st&&isFinite(st.count))return Math.max(0,Math.min(SHOT_MAX,st.count|0));var n=0;for(var i=0;i<SHOT_MAX;i++)if(Storage.read(shotName(i))!==undefined)n++;return n;}
  function deleteShots(){for(var i=0;i<SHOT_MAX;i++)Storage.erase(shotName(i));Storage.erase(SHOT_STATE);}
  function show(){
    var m={"":{title:"Orbit"},"< Back":back,
      "Location mode":{value:s.locationMode,min:0,max:1,format:function(v){return v?"Manual":"Place";},onchange:function(v){s.locationMode=v;if(v){s.manualLat=s.lat;s.manualLon=s.lon;s.manualElevationM=s.elevationM||0;applyManual();}else applyPlace();show();}}};
    if(s.locationMode===0){
      var cidx=countryIndex(s.countryName);if(cidx<0)cidx=countryIndex("Japan");
      m["Country"]={value:cidx,min:0,max:C.length-1,format:function(v){return C[v][0];},onchange:function(v){s.countryName=C[v][0];s.place=0;applyPlace();show();}};
      if(s.countryName==="Japan"){
        m["Prefecture"]={value:s.pref,min:0,max:P.length-1,format:function(v){return P[v][0];},onchange:function(v){s.pref=v;s.place=0;applyPlace();show();}};
        m["Place"]={value:s.place,min:0,max:P[s.pref][1].length-1,format:function(v){return P[s.pref][1][v][0];},onchange:function(v){s.place=v;applyPlace();}};
      }else{
        var places=C[cidx][1];
        if(places.length)m["Place"]={value:s.place,min:0,max:places.length-1,format:function(v){return places[v][0];},onchange:function(v){s.place=v;applyPlace();}};
      }
      m["Location info"]=function(){applyPlace();var prefix=s.countryName==="Japan"?("Japan / "+s.locPref):s.locPref;E.showAlert(prefix+" / "+s.locName+"\nLat "+s.lat.toFixed(3)+"\nLon "+s.lon.toFixed(3)+"\nAlt "+Math.round(s.elevationM)+" m","Orbit location").then(show);};
    }else{
      m["Latitude"]={value:s.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLat=v;applyManual();}};
      m["Longitude"]={value:s.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLon=v;applyManual();}};
      m["Elevation m"]={value:s.manualElevationM,min:-500,max:9000,step:1,onchange:function(v){s.manualElevationM=v;applyManual();}};
    }
    m["View side"]={value:s.viewSide,min:0,max:1,format:function(v){return VIEW_SIDES[v];},onchange:function(v){s.viewSide=v;write();show();}};
    m["Earth style"]={value:s.earthStyle,min:0,max:2,format:function(v){return EARTH_STYLES[v];},onchange:function(v){s.earthStyle=v;write();show();}};
    if(s.earthStyle===1){
      m["Earth day"]={value:s.earthDayColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthDayColor=v;write();}};
      m["Earth night"]={value:s.earthNightColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthNightColor=v;write();}};
      m["Earth edge"]={value:s.earthEdgeColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthEdgeColor=v;write();}};
    }
    m["Screenshots"]=function(){E.showAlert(shotCount()+" / "+SHOT_MAX+" saved","Orbit shots").then(show);};
    m["Delete shots"]=function(){E.showPrompt("Delete all screenshots?",{title:"Orbit shots"}).then(function(ok){if(ok)deleteShots();show();});};
    m["Sun size"]={value:s.sunSize,min:3,max:15,step:1,onchange:function(v){s.sunSize=v;write();}};
    m["Earth size"]={value:s.earthSize,min:8,max:48,step:1,onchange:function(v){s.earthSize=v;write();}};
    m["Moon size"]={value:s.moonSize,min:3,max:18,step:1,onchange:function(v){s.moonSize=v;write();}};
    m["Marker size"]={value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;write();}};
    E.showMenu(m);
  }
  applyCurrent();show();
})
'''
(ORBIT/'settings.js').write_text(settings)

# App source: remove NOW, remove touch/drag time-navigation code, and make solar hour global/UTC based.
app_path=ORBIT/'app.js'
app=app_path.read_text()
app=app.replace('  var tickTimer, eventTimer, timeOffsetMs = 0, lastCenterTap = 0;\n  var holdTimer, holdDir = 0, edgeDownDir = 0, edgeDownAt = 0;\n  var edgeTapTimer, pendingEdgeDir = 0;\n','  var tickTimer,eventTimer;\n')
app=re.sub(r'  function sceneDate\(\)\{ return new Date\(Date\.now\(\)\+timeOffsetMs\); \}\n  function currentLabel\(\)\{.*?\n  \}\n','  function sceneDate(){ return new Date(); }\n',app,flags=re.S)
app=app.replace('    var mode=interactive?2:(timeOffsetMs===0?1:0);','    var mode=interactive?2:1;')
app=app.replace('    g.setFont("6x8",1).setFontAlign(0,-1).setColor(C.fg).drawString(currentLabel(),W/2,24);\n','')
old='''    var civilMin=date.getHours()*60+date.getMinutes()+date.getSeconds()/60;\n    var solarMin=civilMin + 4*(loc.lon-135) + eot; // JST standard meridian = 135E\n'''
new='''    // UTC-based apparent solar time works for any selected world longitude.\n    var utcMin=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60;\n    var solarMin=utcMin + 4*loc.lon + eot;\n'''
if old not in app: raise RuntimeError('localSolarHourAngle block not found')
app=app.replace(old,new)
# Remove all touch/drag time navigation functions now that they are intentionally unsupported.
app,n=re.subn(r'\n  function stepHour\(dir\)\{.*?\n  function queueTick\(\)\{','\n  function queueTick(){',app,flags=re.S)
if n!=1: raise RuntimeError('touch function block removal failed')
# Remove old touch-navigation cleanup/state references.
app=app.replace('    stopHold();\n    cancelPendingEdgeTap();\n    edgeDownDir=0;\n','')
app=app.replace('    timeOffsetMs=0;\n    lastCenterTap=0;\n','')
app=app.replace('        timeOffsetMs=0;\n','')
app=app.replace('      stopHold();\n','')
app=app.replace('            timeOffsetMs=0;\n','')
app=app.replace('    stopHold();\n    cancelPendingEdgeTap();\n    edgeDownDir=0;\n','')
app=app.replace('    Bangle.removeListener("drag",onDrag);\n    Bangle.removeListener("touch",onTouch);\n','')
app=app.replace('  Bangle.on("drag",onDrag);\n  Bangle.on("touch",onTouch);\n','')
# Guard against leftovers.
for token in ['currentLabel','onTouch','onDrag','stepHour','timeOffsetMs','lastCenterTap','holdTimer','edgeTapTimer']:
    if token in app: raise RuntimeError('Unexpected touch/time-nav token remains: '+token)
app_path.write_text(app)

# Wrapper no longer needs to monkey-patch Bangle.on because touch/drag code is physically gone.
wrapper=r'''/* Orbit runtime wrapper v0.38 */
(function(){
  var Storage=require("Storage"), originalLauncher=Bangle.showLauncher;
  function appSource(id,direct){var info=Storage.readJSON(id+".info",1);if(info&&info.src&&Storage.read(info.src)!==undefined)return info.src;if(Storage.read(direct)!==undefined)return direct;}
  function openCalendarOrSettings(){var src=appSource("fivewcal","fivewcal.app.js")||appSource("calendar","calendar.app.js")||appSource("setting","setting.app.js");if(src){load(src);return;}if(originalLauncher)originalLauncher();}
  Bangle.showLauncher=openCalendarOrSettings;
  var core=Storage.read("orbit.core.js");if(!core)throw new Error("orbit.core.js missing");eval(core);
})();
'''
(ORBIT/'app.wrapper.js').write_text(wrapper)

# Simple lexer-style minifier used only for installed runtime copies.
def minify_js(src):
    out=[];i=0;state='code';q='';pending=False
    def word(ch): return bool(ch) and (ch.isalnum() or ch in '_$')
    while i<len(src):
        ch=src[i];nxt=src[i+1] if i+1<len(src) else ''
        if state=='code':
            if ch in "'\"`":
                if pending:
                    p=out[-1] if out else ''
                    if word(p): out.append(' ')
                    pending=False
                state='str';q=ch;out.append(ch);i+=1;continue
            if ch=='/' and nxt=='/': state='line';i+=2;continue
            if ch=='/' and nxt=='*': state='block';i+=2;continue
            if ch.isspace(): pending=True;i+=1;continue
            if pending:
                p=out[-1] if out else ''
                if (word(p) and word(ch)) or (p=='+' and ch=='+') or (p=='-' and ch=='-'): out.append(' ')
                pending=False
            out.append(ch);i+=1;continue
        if state=='str':
            out.append(ch)
            if ch=='\\' and i+1<len(src): out.append(src[i+1]);i+=2;continue
            if ch==q: state='code'
            i+=1;continue
        if state=='line':
            if ch=='\n': pending=True;state='code'
            i+=1;continue
        if state=='block':
            if ch=='*' and nxt=='/': state='code';pending=True;i+=2;continue
            i+=1
    return ''.join(out).strip()+'\n'

(ORBIT/'app.min.js').write_text(minify_js(app))
(ORBIT/'settings.min.js').write_text(minify_js(settings))

# Metadata and README.
meta_path=ORBIT/'metadata.json';meta=json.loads(meta_path.read_text())
meta['version']='0.38'
meta['description']='Lightweight Sun-Earth-Moon clock for Bangle.js 2 with world-capital locations, Japan regional locations, North/South views, daily solar-event buzzes, swipe screenshots, optional calendar launch and BLE reset. No GPS.'
meta_path.write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n')

readme=ORBIT/'README.md'
readme.write_text(readme.read_text()+'''\n\n## Version 0.38 world locations and display cleanup\n\n- Removed the on-screen `NOW` label.\n- Added an alphabetically sorted English/ASCII country list.\n- Each country normally uses its capital's latitude/longitude from REST Countries and terrain elevation from Open-Meteo's 90 m DEM.\n- Japan keeps the existing 47-prefecture / three-place-per-prefecture table unchanged.\n- United Kingdom provides London, Edinburgh and Salisbury.\n- Touch, double-tap and long-touch time navigation code is physically removed from the Orbit core; swipe screenshots remain.\n- Local apparent solar hour angle is now derived from UTC plus longitude, so Earth rotation remains correct for selected locations anywhere in the world.\n''')

print('countries',len(countries))
print('first',countries[:5])
print('last',countries[-5:])
print('UK',[x for x in countries if x[0]=='United Kingdom'])
print('Japan',[x for x in countries if x[0]=='Japan'])
