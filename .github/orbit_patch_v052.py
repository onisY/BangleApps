import json,re
from pathlib import Path
p=Path('apps/orbit')
ap=p/'app.js'
s=ap.read_text()

map_block=r'''  // Low-detail polar maps tuned for Earth size 40 (~80 px diameter).
  // Latitude/longitude points are deliberately sparse: shapes that do not
  // survive the watch resolution are omitted instead of increasing code size.
  var NH_LAND=[
    // Alaska
    [72,-168,69,-160,65,-154,61,-149,58,-143,55,-136,57,-131,
     61,-134,65,-142,69,-151,72,-160],

    // Canada + USA: stronger Pacific/Gulf/Florida/Atlantic silhouette.
    [72,-140,69,-150,64,-158,60,-154,56,-140,52,-130,49,-124,
     45,-124,40,-122,35,-120,32,-117,30,-110,26,-105,24,-98,
     26,-96,29,-95,29,-90,30,-86,29,-83,25,-81,27,-80,31,-81,
     35,-77,39,-74,43,-70,47,-66,50,-58,55,-60,58,-64,61,-70,
     64,-76,67,-84,70,-96,73,-110,74,-125],

    // Mexico / Baja / Yucatan
    [32,-117,29,-115,26,-113,23,-110,21,-106,19,-105,17,-101,
     15,-96,17,-91,21,-87,22,-90,20,-96,23,-101,26,-104,
     29,-107,31,-112],

    // Eurasia. Europe and North Africa are split below so the Mediterranean
    // remains visible even at the small watch resolution.
    [43,-1,49,-4,54,2,57,10,60,20,63,31,67,45,71,60,73,80,
     72,100,70,120,67,140,63,158,59,175,55,170,51,158,47,145,
     44,137,42,132,40,130,38,128,35,126,32,123,29,121,24,117,
     18,111,13,106,9,101,10,95,15,88,20,82,24,76,28,70,31,63,
     33,56,31,49,33,43,35,37,37,31,39,26,41,21,43,16,44,11,
     43,5,41,0],

    // Iberian Peninsula
    [43,-9,43,0,41,3,39,0,36,-1,36,-7,38,-9,41,-9],

    // Italian Peninsula
    [46,8,45,12,43,13,41,16,39,16,38,14,40,12,42,11,44,8],

    // Balkan / Greece
    [45,14,44,20,42,23,40,24,38,23,39,20,41,18,43,16],

    // North Africa, separated from Europe by visible Mediterranean water.
    [36,-6,35,2,37,10,36,18,34,25,31,32,27,34,22,32,20,25,
     22,15,25,5,28,-3,31,-8,34,-9],

    // Scandinavian Peninsula
    [55,5,58,5,61,7,64,10,67,13,70,18,71,24,69,29,66,29,
     63,26,60,22,58,18,56,13],

    // Japan: Kyushu, Honshu/Shikoku, Hokkaido. Deliberately separated from
    // the Asian mainland so the Japan Sea survives at Earth size 40.
    [30.5,129,32,129.5,33.5,131,33,132.5,31.5,132,30.5,131],
    [33,132,34,133.5,34.5,135.5,35,137.5,36,139.5,38,141,
     40.5,141.5,40,140,38.5,138.5,37,136.5,35.5,134.5,34,133],
    [41.5,140,42.5,141,43.5,143,45.5,145,45,142,43.5,140],

    // Great Britain
    [50,-5.5,51.5,-4.5,53,-4,55,-5,57,-4.5,58.5,-3,58,-1,
     56,0,54,-1,52,0.5,50.5,-1],

    // Iceland
    [63,-24,66,-24,67,-18,65,-14,63,-17]
  ];

  // White areas in North view: Greenland plus a deliberately low-detail
  // Arctic pack. Greenland is no longer rendered as green land.
  var NH_ICE=[
    [59,-46,62,-52,67,-57,73,-58,78,-52,82,-42,83,-30,80,-20,
     75,-18,70,-24,65,-31,61,-38],
    [80,-180,81,-150,82,-120,81,-90,82,-60,81,-30,82,0,81,30,
     80,60,81,90,82,120,81,150]
  ];

  // Tiny northern islands that remain useful as single pixels.
  var NH_ISLANDS=[
    [27.1,142.2],
    [19.7,-155.5],[20.8,-156.3],[21.4,-158.0]
  ];

  // South-view Candidate-B-style geometry: few bold shapes, with islands kept
  // distinct enough to remain legible around an 80 px globe.
  var SH_LAND=[
    // South America
    [0,-80,-6,-81,-13,-77,-20,-71,-28,-71,-36,-73,-44,-74,
     -52,-72,-56,-68,-54,-64,-49,-66,-44,-64,-38,-62,-33,-58,
     -28,-54,-23,-49,-18,-45,-12,-39,-5,-35,0,-50],

    // Southern Africa
    [0,9,-6,12,-13,14,-20,13,-27,16,-33,18,-35,21,-34,27,
     -30,30,-25,34,-19,38,-12,40,-6,39,0,35],

    // Australia
    [-12,113,-16,121,-20,129,-18,137,-22,145,-28,153,-34,153,
     -39,147,-38,138,-35,130,-31,116,-24,113],

    // Madagascar
    [-12,49,-16,50,-21,48,-26,45,-23,43,-17,44],

    // New Zealand: two simplified islands rather than one merged sliver.
    [-34,173,-38,176,-41,174,-44,171,-43,169,-39,170],
    [-41,174,-44,172,-47,168,-45,166,-42,168],

    // Tasmania
    [-40,145,-42,147,-44,146,-43,144]
  ];

  // Antarctica: dedicated irregular white polygon centered on the South Pole.
  // The peninsula is exaggerated just enough to survive at Earth size 40.
  var SH_ICE=[
    [-78,0,-76,30,-72,60,-68,90,-66,120,-69,150,-74,180,
     -76,-150,-74,-120,-72,-90,-64,-60,-66,-45,-72,-30]
  ];
'''

pat=re.compile(r'  // Simplified northern-hemisphere land polygons:.*?  var SH_ICE_LAT=65;\n',re.S)
m=pat.search(s)
assert m, 'map block not found'
s=s[:m.start()]+map_block+s[m.end():]

new_func=r'''  function drawHemisphereMap(r,baseA,ux,uy){
    var south=!!settings.viewSide;
    var land=south?SH_LAND:NH_LAND;
    var ice=south?SH_ICE:NH_ICE;

    g.setColor("#00f").fillCircle(EX,EY,r);
    fillLitHalf(EX,EY,r,ux,uy,"#0ff");

    for(var i=0;i<land.length;i++){
      var p=geoPoly(land[i],r,baseA);
      g.setColor("#0f0").fillPoly(p);
      g.setColor("#000").drawPoly(p,true);
    }

    for(var j=0;j<ice.length;j++){
      var ip=geoPoly(ice[j],r,baseA);
      g.setColor("#fff").fillPoly(ip);
      g.setColor("#000").drawPoly(ip,true);
    }

    if(!south){
      g.setColor("#0f0");
      for(var k=0;k<NH_ISLANDS.length;k++){
        var q=geoPoint(NH_ISLANDS[k][0],NH_ISLANDS[k][1],r,baseA);
        g.setPixel(q[0],q[1]);
      }
    }

    shadeEarthNight(r,ux,uy);

    g.setColor("#fff");
    for(var n=0;n<land.length;n++)g.drawPoly(geoPoly(land[n],r,baseA),true);
    for(var z=0;z<ice.length;z++)g.drawPoly(geoPoly(ice[z],r,baseA),true);

    g.setColor("#000").fillCircle(EX,EY,2);
    g.setColor("#fff").drawCircle(EX,EY,r);
  }
'''
fpat=re.compile(r'  function drawHemisphereMap\(r,baseA,ux,uy\)\{.*?\n  \}\n\n  function drawEarth',re.S)
fm=fpat.search(s)
assert fm, 'drawHemisphereMap not found'
s=s[:fm.start()]+new_func+'\n  function drawEarth'+s[fm.end():]
ap.write_text(s)

def strip_comments(src):
    out=[];i=0;state='code';q=''
    while i<len(src):
        ch=src[i];n=src[i+1] if i+1<len(src) else ''
        if state=='code':
            if ch in "'\"`":state='str';q=ch;out.append(ch);i+=1;continue
            if ch=='/' and n=='/':state='line';i+=2;continue
            if ch=='/' and n=='*':state='block';i+=2;continue
            out.append(ch);i+=1;continue
        if state=='str':
            out.append(ch)
            if ch=='\\' and i+1<len(src):out.append(src[i+1]);i+=2;continue
            if ch==q:state='code'
            i+=1;continue
        if state=='line':
            if ch=='\n':out.append('\n');state='code'
            i+=1;continue
        if state=='block':
            if ch=='*' and n=='/':state='code';i+=2;continue
            i+=1
    return ''.join(out)

def mini(src):
    src=strip_comments(src);out=[];i=0;state='code';q='';pending=False
    def word(c):return bool(c) and (c.isalnum() or c in '_$')
    while i<len(src):
        ch=src[i]
        if state=='code':
            if ch in "'\"`":
                if pending:
                    prev=out[-1] if out else ''
                    if word(prev):out.append(' ')
                    pending=False
                state='str';q=ch;out.append(ch);i+=1;continue
            if ch.isspace():pending=True;i+=1;continue
            if pending:
                prev=out[-1] if out else ''
                if (word(prev) and word(ch)) or (prev=='+' and ch=='+') or (prev=='-' and ch=='-'):out.append(' ')
                pending=False
            out.append(ch);i+=1;continue
        out.append(ch)
        if ch=='\\' and i+1<len(src):out.append(src[i+1]);i+=2;continue
        if ch==q:state='code'
        i+=1
    return ''.join(out).strip()+'\n'

(p/'app.min.js').write_text(mini(s))

mp=p/'metadata.json'
meta=json.loads(mp.read_text())
assert meta['version']=='0.51', meta['version']
meta['version']='0.52'
mp.write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n')

rp=p/'README.md'
rp.write_text(rp.read_text()+'''\n\n## Version 0.52 refined north/south hemisphere maps\n\n- Reworked the low-detail N/S Hemi map specifically for the watch-scale Earth size 40 target.\n- North view follows the selected Candidate C direction: more recognizable North America/Eurasia, a visible Mediterranean and Japan Sea, white Greenland, and a compact Arctic ice pack.\n- South view follows the selected Candidate B direction: simplified South America, southern Africa and Australia, with Madagascar, two New Zealand islands and Tasmania kept distinct.\n- South view now draws an irregular Antarctica polygon instead of a generic circular polar cap.\n- North and South maps are separate vector datasets rather than mirrored copies.\n- Added a black size-2 pole marker at the center for both North and South views.\n- Other Earth styles and astronomical calculations are unchanged.\n''')

a=s
m=(p/'app.min.js').read_text()
assert 'var NH_ICE=[' in a and 'var SH_ICE=[' in a
assert 'Greenland is no longer rendered as green land' in a
assert 'New Zealand: two simplified islands' in a
assert 'g.setColor("#000").fillCircle(EX,EY,2);' in a
assert 'var NH_ICE_LAT' not in a and 'var SH_ICE_LAT' not in a
assert 'g.setColor("#000").fillCircle(EX,EY,2)' in m
assert json.loads((p/'metadata.json').read_text())['version']=='0.52'
block=a[a.index('var NH_LAND=['):a.index('function geoPoint')]
nums=re.findall(r'(?<![A-Za-z_])-?\d+(?:\.\d+)?',block)
assert len(nums)<650, len(nums)
print('Orbit v0.52 patch complete; numeric map entries:',len(nums))
