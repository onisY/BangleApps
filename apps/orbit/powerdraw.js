/* Small background patch for charging-only minute updates. MIT. */
function capture(g,a,firmware){
  var v=/^(\d+)v(\d+)/.exec(firmware||"");
  if(!v||(+v[1]<2||+v[1]===2&&+v[2]<26)||typeof g.asImage!=="function")return;
  var xs=[],ys=[],d=a.south?1:-1;
  [0,300000].forEach(function(dt){
    var angle=a.angle+d*dt*2*Math.PI/86400000;
    [a.radius-2,a.radius+a.height+2].forEach(function(r){xs.push(a.cx+r*Math.cos(angle));ys.push(a.cy+r*Math.sin(angle));});
  });
  var x=Math.max(0,Math.floor(Math.min.apply(null,xs))-3),y=Math.max(0,Math.floor(Math.min.apply(null,ys))-3);
  var right=Math.min(g.getWidth()-1,Math.ceil(Math.max.apply(null,xs))+3);
  var bottom=Math.min(g.getHeight()-1,Math.ceil(Math.max.apply(null,ys))+3);
  var w=right-x+1,h=bottom-y+1;
  if(w<=0||h<=0||w*h>2048)return;
  try{
    var image=g.asImage({x:x,y:y,w:w,h:h,type:"object"});
    if(!image||image.width!==w||image.height!==h||!image.buffer)return;
    return {x:x,y:y,w:w,h:h,image:image,bucket:a.bucket,moon:a.moon};
  }catch(e){}
}
function draw(g,patch,rest,labels,clock){
  if(!patch||typeof g.setClipRect!=="function")return false;
  try{
    g.reset();g.drawImage(patch.image,patch.x,patch.y);
    g.setClipRect(patch.x,patch.y,patch.x+patch.w-1,patch.y+patch.h-1);
    rest();labels();
    g.setClipRect(0,0,g.getWidth()-1,g.getHeight()-1);
    clock();g.flip();return true;
  }catch(e){return false;}
  finally{try{g.setClipRect(0,0,g.getWidth()-1,g.getHeight()-1);}catch(e){}}
}
exports.capture=capture;
exports.draw=draw;
