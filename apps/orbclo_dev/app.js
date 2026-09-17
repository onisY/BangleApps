/* Orbclo Dev - development harness; public Orbclo remains clean */
(function(){
  var Storage=require("Storage");
  var src=Storage.read("orbclo_dev.core.js");
  if(!src){E.showMessage("orbclo_dev.core.js missing","Orbclo Dev");return;}
  src=src.replace('var CFG="orbclo.json", SHOTSTATE="orbcloshot.json", SHOTMAX=20;','var CFG="orbclo_dev.json", SHOTSTATE="orbclo_devshot.json", SHOTMAX=20;');
  src=src.replace(/"orbclo"/g,'"orbclodev"');
  src=src.replace('return "oc"+(i<10?"0":"")+i+".bmp";','return "od"+(i<10?"0":"")+i+".bmp";');
  src=src.replace(/Orbclo/g,"Orbclo Dev");
  eval(src);
})();
