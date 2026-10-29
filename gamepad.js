/* gamepad.js v1.0 - shared game controller support for Peter's Arcade games.
   Works with Xbox, PlayStation and Switch Pro controllers (USB or Bluetooth,
   computer or phone) through the standard Gamepad API mapping.
   Gameplay: controller buttons are turned into the same keyboard keys the game
   already understands, so touch and keyboard keep working exactly as before.
   Menus: stick/D-pad moves a highlight between on-screen buttons, A selects,
   B goes back. Optional virtual cursor for tap-and-drag games.
   Usage: <script src="gamepad.js?v=1"></script> then GamepadSupport.init({...}). */
(function(){
'use strict';
if(window.GamepadSupport)return;
var BTN={a:0,b:1,x:2,y:3,lb:4,rb:5,lt:6,rt:7,back:8,start:9,ls:10,rs:11,up:12,down:13,left:14,right:15};
var NAMES=Object.keys(BTN);
var KC={Space:[' ',32],Enter:['Enter',13],Escape:['Escape',27],Backspace:['Backspace',8],Tab:['Tab',9],
 ArrowLeft:['ArrowLeft',37],ArrowUp:['ArrowUp',38],ArrowRight:['ArrowRight',39],ArrowDown:['ArrowDown',40],
 ShiftLeft:['Shift',16],ShiftRight:['Shift',16],ControlLeft:['Control',17],AltLeft:['Alt',18]};
function keyInfo(code){
 if(KC[code])return {key:KC[code][0],keyCode:KC[code][1]};
 var m=/^Key([A-Z])$/.exec(code);if(m)return {key:m[1].toLowerCase(),keyCode:m[1].charCodeAt(0)};
 m=/^Digit([0-9])$/.exec(code);if(m)return {key:m[1],keyCode:48+(+m[1])};
 return {key:code,keyCode:0};
}
var cfg={},held={},keyDown={},latched={},prevMode='',connected={},rafId=0,lastT=0,repT={},cursorEl=null,cur={x:0,y:0,down:false,target:null},focusEl=null,toastEl=null,toastTimer=0,started=false,navT={},scrollT=0;
var RAF=window.requestAnimationFrame.bind(window);
var DEFAULT_FOCUS='button,a[href],[role=button],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),.gp-nav';

function css(){
 if(document.getElementById('gp-style'))return;
 var s=document.createElement('style');s.id='gp-style';
 s.textContent='.gp-focus{outline:3px solid #ffd400!important;outline-offset:2px!important;box-shadow:0 0 0 6px rgba(255,212,0,.45)!important;}'+
 '#gp-toast{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%) translateY(-140%);z-index:2147483647;background:rgba(15,15,25,.92);color:#fff;font:600 14px/1.2 system-ui,sans-serif;padding:8px 14px;border-radius:999px;border:2px solid #ffd400;pointer-events:none;transition:transform .25s ease;white-space:nowrap}'+
 '#gp-toast.show{transform:translateX(-50%) translateY(0)}'+
 '#gp-cursor{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:3px solid #ffd400;box-shadow:0 0 0 2px #000,0 0 10px #ffd400;z-index:2147483646;pointer-events:none;display:none}'+
 '#gp-cursor.down{background:rgba(255,212,0,.45)}'+
 '.gp-help{margin-top:6px}'+
 '#gp-hint{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(6px + env(safe-area-inset-bottom));z-index:60;max-width:calc(100vw - 16px);box-sizing:border-box;background:rgba(10,10,25,.78);color:#e8f6ff;font:600 12px/1.25 system-ui,sans-serif;padding:4px 10px;border-radius:10px;pointer-events:none;text-align:center;display:none}';
 (document.head||document.documentElement).appendChild(s);
}
function toast(msg){
 if(!document.body)return;
 if(!toastEl){toastEl=document.createElement('div');toastEl.id='gp-toast';toastEl.setAttribute('role','status');document.body.appendChild(toastEl);}
 toastEl.textContent=msg;void toastEl.offsetWidth;toastEl.classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('show')},2200);
}
function target(){var a=document.activeElement;return (a&&a!==document.body&&a.tagName!=='IFRAME')?a:document.body||document;}
function fireKey(type,code,repeat){
 var k=keyInfo(code),ev;
 try{ev=new KeyboardEvent(type,{key:k.key,code:code,bubbles:true,cancelable:true,repeat:!!repeat,view:window});}catch(e){return}
 try{Object.defineProperty(ev,'keyCode',{get:function(){return k.keyCode}});Object.defineProperty(ev,'which',{get:function(){return k.keyCode}});}catch(e){}
 ev.__gp=1;
 target().dispatchEvent(ev);
}
function keysFor(name,mode){
 var src=(mode==='menu'&&cfg.menuKeys&&name in cfg.menuKeys)?cfg.menuKeys:(cfg.keys||{});
 var v=src[name];if(!v)return [];return Array.isArray(v)?v:[v];
}
function press(name,mode){
 var ks=keysFor(name,mode);
 for(var i=0;i<ks.length;i++){var k=ks[i];if(typeof k==='function'){try{k(true)}catch(e){console.warn(e)}continue;}
  keyDown[k]=(keyDown[k]||0)+1;if(keyDown[k]===1)fireKey('keydown',k,false);}
 held[name]=ks;repT[name]=performance.now()+(cfg.repeatDelay||420);
}
function release(name){
 var ks=held[name]||[];delete held[name];delete repT[name];
 for(var i=0;i<ks.length;i++){var k=ks[i];if(typeof k==='function'){try{k(false)}catch(e){console.warn(e)}continue;}
  keyDown[k]=(keyDown[k]||1)-1;if(keyDown[k]<=0){delete keyDown[k];fireKey('keyup',k,false);}}
}
function releaseAll(){for(var n in held)release(n);}
function visible(el){
 if(!el||!el.getBoundingClientRect)return false;
 if(el instanceof VItem){var vr=el.getBoundingClientRect();return vr.width>1&&vr.height>1;}
 if(el.disabled||el.getAttribute('aria-hidden')==='true')return false;
 var r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;
 var st=getComputedStyle(el);if(st.visibility==='hidden'||st.display==='none'||+st.opacity===0)return false;
 if(el.closest('[hidden],[aria-hidden="true"],.gp-skip'))return false;
 for(var p=el;p&&p!==document.documentElement;p=p.parentElement){var s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return false;}
 var cx=r.left+r.width/2,cy=r.top+r.height/2;
 if(cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight){
  var h=document.elementFromPoint(cx,cy);
  if(h&&h!==el&&!el.contains(h)&&!h.contains(el)){
   // covered by something else? try the corners before giving up
   var ok=false,pts=[[r.left+3,r.top+3],[r.right-3,r.bottom-3],[r.left+3,r.bottom-3],[r.right-3,r.top+3]];
   for(var i=0;i<pts.length&&!ok;i++){var q=document.elementFromPoint(pts[i][0],pts[i][1]);if(q&&(q===el||el.contains(q)))ok=true;}
   if(!ok)return false;
  }
 } else if(r.bottom<0||r.right<0||r.top>innerHeight*4||r.left>innerWidth*2)return false;
 return true;
}
var ringEl=null;
function VItem(o){this.o=o;this.id=o.id||'';this.tagName='VIRTUAL';this.isConnected=true;this.disabled=false;var self=this;
 this.classList={add:function(c){if(c==='gp-focus')showRing(self)},remove:function(c){if(c==='gp-focus')hideRing()},contains:function(){return false}};
 this.textContent=o.label||o.id||'';}
VItem.prototype.getBoundingClientRect=function(){var o=this.o,sc=cfg.itemScale?cfg.itemScale():1,ox=0,oy=0;
 if(cfg.itemOrigin){var r=cfg.itemOrigin();ox=r.left;oy=r.top;}
 var x=ox+o.x*sc,y=oy+o.y*sc,w=o.w*sc,h=o.h*sc;return {left:x,top:y,right:x+w,bottom:y+h,width:w,height:h,x:x,y:y};};
VItem.prototype.matches=function(){return false};VItem.prototype.closest=function(){return null};VItem.prototype.contains=function(o){return o===this};
VItem.prototype.hasAttribute=function(){return false};VItem.prototype.getAttribute=function(a){return a==='aria-label'?(this.o.label||this.o.id||''):null};
VItem.prototype.scrollIntoView=function(){};VItem.prototype.focus=function(){};
function showRing(v){if(!ringEl){ringEl=document.createElement('div');ringEl.id='gp-ring';ringEl.style.cssText='position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #ffd400;border-radius:12px;box-shadow:0 0 0 3px rgba(0,0,0,.6),0 0 14px #ffd400;display:none';document.body.appendChild(ringEl);}
 var r=v.getBoundingClientRect();ringEl.style.left=(r.left-4)+'px';ringEl.style.top=(r.top-4)+'px';ringEl.style.width=(r.width+2)+'px';ringEl.style.height=(r.height+2)+'px';ringEl.style.display='block';}
function hideRing(){if(ringEl)ringEl.style.display='none';}
var vcache={};
function virtuals(){
 if(!cfg.items)return [];var arr=[];try{arr=cfg.items()||[]}catch(e){return []}
 var out=[];for(var i=0;i<arr.length;i++){var o=arr[i];if(!o||o.dis||o.hidden)continue;var key=(o.id||'')+'@'+i;var v=vcache[key];
  if(!v||v.o.id!==o.id){v=new VItem(o);vcache[key]=v;}else v.o=o;
  var r=v.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;out.push(v);}
 return out;
}
function navigables(){
 var root=document;var sel=cfg.focusSel||DEFAULT_FOCUS;var out=[];
 var list=root.querySelectorAll(sel);
 for(var i=0;i<list.length;i++){var el=list[i];
  if(el.id==='gp-toast'||el.id==='gp-cursor')continue;
  if(cfg.ignoreSel&&el.matches(cfg.ignoreSel))continue;
  if(cfg.ignoreSel&&el.closest(cfg.ignoreSel))continue;
  if(visible(el))out.push(el);}
 // keep only the innermost of nested matches
 out=out.filter(function(el){return !out.some(function(o){return o!==el&&el.contains(o)})});
 if(cfg.items&&!(cfg.itemsWhen&&!cfg.itemsWhen()))out=out.concat(virtuals());
 return out;
}
function menuActive(){
 if(typeof cfg.menu==='function'){try{return !!cfg.menu()}catch(e){return false}}
 return navigables().length>0;
}
function cursorActive(){if(typeof cfg.cursor==='function'){try{return !!cfg.cursor()}catch(e){}}return false;}
function setFocus(el){
 if(focusEl&&focusEl!==el)focusEl.classList.remove('gp-focus');
 focusEl=el;if(!el)return;el.classList.add('gp-focus');
 try{el.scrollIntoView({block:'nearest',inline:'nearest'})}catch(e){}
}
function pickDefault(list){
 if(typeof cfg.defaultFocus==='string'){for(var i=0;i<list.length;i++)if(list[i].matches(cfg.defaultFocus))return list[i];}
 for(var j=0;j<list.length;j++)if(list[j].hasAttribute('autofocus')||list[j].classList.contains('primary'))return list[j];
 if(typeof cfg.defaultFocus==='function'){try{var d=cfg.defaultFocus(list);if(d)return d}catch(e){}}
 for(var k=0;k<list.length;k++){var t=(list[k].getAttribute('aria-label')||list[k].textContent||'').trim();if(!/^\W*(close|back|menu|home|mute|sound|music|[✕✖×xX])\W*$/i.test(t)&&list[k].tagName!=='INPUT')return list[k];}
 return list[0];
}
function ensureFocus(list){
 list=list||navigables();
 if(!list.length){setFocus(null);return null;}
 if(!focusEl||list.indexOf(focusEl)<0)setFocus(pickDefault(list));
 return focusEl;
}
function center(r){return {x:r.left+r.width/2,y:r.top+r.height/2};}
function moveFocus(dir){
 var list=navigables();if(!list.length)return false;
 var cur=ensureFocus(list);var a=cur.getBoundingClientRect(),c=center(a),best=null,bs=1e9;
 for(var i=0;i<list.length;i++){var el=list[i];if(el===cur)continue;var r=el.getBoundingClientRect(),p=center(r);
  var dx=p.x-c.x,dy=p.y-c.y,prim,orth;
  if(dir==='left'){prim=-dx;orth=Math.abs(dy);if(r.right>a.left+a.width*.5&&prim<a.width*.5)continue;}
  else if(dir==='right'){prim=dx;orth=Math.abs(dy);if(r.left<a.right-a.width*.5&&prim<a.width*.5)continue;}
  else if(dir==='up'){prim=-dy;orth=Math.abs(dx);if(r.bottom>a.top+a.height*.5&&prim<a.height*.5)continue;}
  else {prim=dy;orth=Math.abs(dx);if(r.top<a.bottom-a.height*.5&&prim<a.height*.5)continue;}
  if(prim<=1)continue;
  var s=prim+orth*2;if(s<bs){bs=s;best=el;}}
 if(best){setFocus(best);return true;}
 // nothing that way: scroll the page/panel so long help text can be read
 if(cfg.scroll){try{cfg.scroll(dir)}catch(e){}return false;}
 var sc=scrollParent(cur);if(sc&&(dir==='up'||dir==='down')){sc.scrollBy(0,dir==='up'?-90:90);}
 return false;
}
function scrollParent(el){for(var p=el&&el.parentElement;p;p=p.parentElement){var s=getComputedStyle(p);if(/(auto|scroll)/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+4)return p;}return document.scrollingElement;}
function mouseSeq(el,x,y,types){
 for(var i=0;i<types.length;i++){var t=types[i],ev,o={bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,screenX:x,screenY:y,view:window,button:0,buttons:/up|click/.test(t)?0:1};
  if(t.indexOf('pointer')===0){try{o.pointerId=1;o.pointerType='mouse';o.isPrimary=true;o.width=1;o.height=1;o.pressure=/down|move/.test(t)?.5:0;ev=new PointerEvent(t,o);}catch(e){continue}}
  else ev=new MouseEvent(t,o);
  ev.__gp=1;el.dispatchEvent(ev);}
}
function activate(el){
 if(!el)return;
 if(cfg.activate){try{if(cfg.activate(el)===true)return}catch(e){console.warn(e)}}
 if(el instanceof VItem){
  if(el.o.act){try{el.o.act()}catch(e){console.warn(e)}return;}
  var vr=el.getBoundingClientRect(),vx=vr.left+vr.width/2,vy=vr.top+vr.height/2,tg=document.elementFromPoint(vx,vy)||document.body;
  if(ringEl)ringEl.style.visibility='hidden';tg=document.elementFromPoint(vx,vy)||tg;if(ringEl)ringEl.style.visibility='';
  mouseSeq(tg,vx,vy,['pointerdown','mousedown']);setTimeout(function(){mouseSeq(tg,vx,vy,['pointerup','mouseup','click'])},40);return;}
 var tag=el.tagName;
 if(tag==='INPUT'&&/^(range)$/i.test(el.type))return;
 if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'){el.focus();if(/checkbox|radio/i.test(el.type))el.click();return;}
 var r=el.getBoundingClientRect(),p=center(r);
 mouseSeq(el,p.x,p.y,['pointerover','pointerenter','mouseover','pointerdown','mousedown']);
 if(el.isConnected)mouseSeq(el,p.x,p.y,['pointerup','mouseup']);
 if(el.isConnected)mouseSeq(el,p.x,p.y,['click']);
}
function adjustRange(el,dir){if(el&&el.tagName==='INPUT'&&el.type==='range'){var st=+el.step||((+el.max-+el.min)/20)||1;el.value=+el.value+(dir==='right'||dir==='up'?st:-st);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;}
function back(){
 if(cfg.back){try{if(cfg.back()===true)return}catch(e){console.warn(e)}}
 var list=navigables(),re=cfg.backText||/^\s*(?:[←‹<✕✖×xX]\s*)?(back|close|done|exit|cancel|menu|home|ok|got it|✕|✖|×|x)\s*[→›>]?\s*$/i;
 if(cfg.backSel){for(var i=0;i<list.length;i++)if(list[i].matches(cfg.backSel)){activate(list[i]);return;}}
 for(var j=0;j<list.length;j++){var t=(list[j].getAttribute('aria-label')||list[j].textContent||'').trim();if(re.test(t)){activate(list[j]);return;}}
 fireKey('keydown','Escape');fireKey('keyup','Escape');
}
function ensureCursor(){
 if(!cursorEl){cursorEl=document.createElement('div');cursorEl.id='gp-cursor';document.body.appendChild(cursorEl);cur.x=innerWidth/2;cur.y=innerHeight/2;}
 return cursorEl;
}
function cursorPointer(type){
 var el=document.elementFromPoint(cur.x,cur.y)||document.body;
 if(type==='down'){cur.target=el;mouseSeq(el,cur.x,cur.y,['pointerdown','mousedown']);}
 else if(type==='move'){mouseSeq(cur.down?(cur.target||el):el,cur.x,cur.y,['pointermove','mousemove']);}
 else {var t=cur.target||el;mouseSeq(t,cur.x,cur.y,['pointerup','mouseup']);if(t===el||t.contains(el)||el.contains(t))mouseSeq(el,cur.x,cur.y,['click']);cur.target=null;}
}
function readPad(){
 var pads=[];try{pads=navigator.getGamepads?navigator.getGamepads():[]}catch(e){}
 var st={},ax={x:0,y:0},any=false,rx=0,ry=0;
 for(var i=0;i<(pads?pads.length:0);i++){var p=pads[i];if(!p||!p.connected)continue;any=true;
  for(var n=0;n<NAMES.length;n++){var b=p.buttons[BTN[NAMES[n]]];if(b&&(b.pressed||b.value>.5))st[NAMES[n]]=true;}
  var x=p.axes[0]||0,y=p.axes[1]||0;if(Math.abs(x)>Math.abs(ax.x))ax.x=x;if(Math.abs(y)>Math.abs(ax.y))ax.y=y;
  if(Math.abs(p.axes[2]||0)>Math.abs(rx))rx=p.axes[2]||0;if(Math.abs(p.axes[3]||0)>Math.abs(ry))ry=p.axes[3]||0;}
 var dz=cfg.deadzone||.5;
 if(ax.x<-dz)st.left=true;if(ax.x>dz)st.right=true;if(ax.y<-dz)st.up=true;if(ax.y>dz)st.down=true;
 return {any:any,st:st,ax:ax,rx:rx,ry:ry};
}
var prevSt={};
function tick(t){
 rafId=RAF(tick);
 var dt=Math.min(.05,(t-(lastT||t))/1000);lastT=t;
 var r=readPad();
 if(!r.any){if(Object.keys(prevSt).length){releaseAll();prevSt={};}if(cursorEl)cursorEl.style.display='none';return;}
 if(document.hidden){releaseAll();return;}
 var st=r.st,mode=cursorActive()?'cursor':(menuActive()?'menu':'play');
 if(mode!==prevMode){
  // a button held across a screen change must be let go before it acts again
  releaseAll();for(var k in st)latched[k]=true;
  if(prevMode==='cursor'&&cur.down){cur.down=false;cursorPointer('up');}
  if(mode!=='menu'&&focusEl){focusEl.classList.remove('gp-focus');focusEl=null;}
  hideRing();
  if(cursorEl)cursorEl.style.display=mode==='cursor'?'block':'none';
  prevMode=mode;
  if(cfg.onMode)try{cfg.onMode(mode)}catch(e){}
 }
 for(var l in latched)if(!st[l])delete latched[l];
 var now=performance.now();
 for(var i=0;i<NAMES.length;i++){var n=NAMES[i],on=!!st[n]&&!latched[n],was=!!prevSt[n];
  if(on&&!was)down(n,mode);
  else if(!on&&was)up(n,mode);
  else if(on&&was)hold(n,mode,now);
 }
 prevSt={};for(var j=0;j<NAMES.length;j++)if(st[NAMES[j]]&&!latched[NAMES[j]])prevSt[NAMES[j]]=true;
 if(mode==='cursor'){
  ensureCursor().style.display='block';
  var sp=(cfg.cursorSpeed||900)*dt,mx=Math.abs(r.ax.x)>.15?r.ax.x:0,my=Math.abs(r.ax.y)>.15?r.ax.y:0;
  if(st.left&&!mx)mx=-.6;if(st.right&&!mx)mx=.6;if(st.up&&!my)my=-.6;if(st.down&&!my)my=.6;
  if(mx||my){cur.x=Math.max(0,Math.min(innerWidth-1,cur.x+mx*Math.abs(mx)*sp*1.4));cur.y=Math.max(0,Math.min(innerHeight-1,cur.y+my*Math.abs(my)*sp*1.4));
   cursorEl.style.transform='translate('+cur.x+'px,'+cur.y+'px)';cursorPointer('move');}
  else cursorEl.style.transform='translate('+cur.x+'px,'+cur.y+'px)';
 }
 if(focusEl instanceof VItem){if(mode==='menu'&&focusEl.isConnected)showRing(focusEl);else hideRing();}
 if(mode==='menu'&&now>(navT._auto||0)){navT._auto=now+200;if(!focusEl||!focusEl.isConnected||!visible(focusEl)||(focusEl instanceof VItem&&navigables().indexOf(focusEl)<0))ensureFocus();}
 if(cfg.onFrame)try{cfg.onFrame(r,mode)}catch(e){}
}
var DIRS={up:1,down:1,left:1,right:1};
function down(n,mode){
 if(n==='start'||n==='back'){if(keysFor(n,'play').length||keysFor(n,mode).length){press(n,mode);return;}}
 if(mode==='menu'){
  var list=navigables();
  if(list.length){
   if(DIRS[n]){if(!adjustRange(focusEl,n))moveFocus(n);navT[n]=performance.now()+380;return;}
   if(n==='a'){var f=ensureFocus(list);if(f){f.classList.add('gp-press');activate(f);}return;}
   if(n==='b'){back();return;}
   if(n==='start'){var g=ensureFocus(list);if(g)activate(g);return;}
   if(keysFor(n,'menu').length)press(n,mode);
   return;
  }
  press(n,mode);return; // canvas-drawn menu: use the game's own keys
 }
 if(mode==='cursor'){
  if(n==='a'){cur.down=true;if(cursorEl)cursorEl.classList.add('down');cursorPointer('down');return;}
  if(DIRS[n])return;
  if(n==='b'&&!keysFor('b','play').length){back();return;}
 }
 press(n,mode);
}
function up(n,mode){
 if(mode==='cursor'&&n==='a'&&cur.down){cur.down=false;if(cursorEl)cursorEl.classList.remove('down');cursorPointer('up');return;}
 delete navT[n];
 if(held[n])release(n);
}
function hold(n,mode,now){
 if(mode==='menu'&&DIRS[n]&&navT[n]&&now>navT[n]&&navigables().length){if(!adjustRange(focusEl,n))moveFocus(n);navT[n]=now+140;return;}
 if(cfg.repeat===false||!held[n]||!repT[n]||now<repT[n])return;
 if(cfg.noRepeat&&cfg.noRepeat.indexOf(n)>=0)return;
 repT[n]=now+(cfg.repeatRate||40);
 for(var i=0;i<held[n].length;i++){var k=held[n][i];if(typeof k!=='function')fireKey('keydown',k,true);}
}
function addHelp(){
 if(!cfg.help)return;
 var text=cfg.helpText||'🎮 Controller: left stick or D-pad to move, A to jump, X to attack, Start to pause. Menus: D-pad to pick, A to select, B to go back.';
 var nodes=document.querySelectorAll(cfg.help);
 for(var i=0;i<nodes.length;i++){var n=nodes[i];if(n.querySelector('.gp-help'))continue;var p=document.createElement(cfg.helpTag||'p');p.className='gp-help';p.textContent=text;n.appendChild(p);}
}
var hintEl=null;
function hintTick(){
 if(!cfg.hint||!document.body)return;
 if(!hintEl){hintEl=document.createElement('div');hintEl.id='gp-hint';hintEl.className='gp-help';document.body.appendChild(hintEl);}
 var on=false;try{on=cfg.hint.when?!!cfg.hint.when():true}catch(e){}
 if(on&&cfg.hint.style)hintEl.style.cssText=cfg.hint.style;
 hintEl.textContent=cfg.hint.text;hintEl.style.display=on?'block':'none';
}
function onConnect(e){
 var id=e&&e.gamepad?e.gamepad.index:0;
 if(!connected[id]){connected[id]=true;toast('🎮 Controller connected');}
 start();
}
function onDisconnect(e){
 var id=e&&e.gamepad?e.gamepad.index:0;delete connected[id];
 releaseAll();prevSt={};
 if(cur.down){cur.down=false;cursorPointer('up');}
 if(cursorEl)cursorEl.style.display='none';
 if(focusEl){focusEl.classList.remove('gp-focus');focusEl=null;}
 prevMode='';
 toast('🎮 Controller disconnected');
 if(cfg.onDisconnect)try{cfg.onDisconnect()}catch(err){}
}
function start(){if(started)return;started=true;lastT=0;rafId=RAF(tick);}
// some browsers only report a pad after its first button press, with no event: poll gently
function sniff(){var p=[];try{p=navigator.getGamepads?navigator.getGamepads():[]}catch(e){}for(var i=0;i<(p?p.length:0);i++)if(p[i]&&p[i].connected&&!connected[p[i].index])onConnect({gamepad:p[i]});}
window.GamepadSupport={
 version:'1.0',
 init:function(o){cfg=o||{};css();
  var go=function(){addHelp();sniff();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
  if(cfg.help)setInterval(addHelp,1500);
  if(cfg.hint)setInterval(hintTick,250);
  window.addEventListener('gamepadconnected',onConnect);
  window.addEventListener('gamepaddisconnected',onDisconnect);
  setInterval(sniff,1000);
  document.addEventListener('visibilitychange',function(){if(document.hidden)releaseAll();});
  window.addEventListener('blur',releaseAll);
  return this;},
 config:function(){return cfg;},
 toast:toast,
 /* adapt a game's own list of canvas-drawn buttons ({x,y,w,h,fn|cb}) into pad-navigable items.
    o.canvas: canvas element (or getter) when the list is in canvas pixels; o.scale: number/getter for custom scaling */
 list:function(getter,o){o=o||{};return function(){var a=[];try{a=getter()||[]}catch(e){return []}
  var cv=typeof o.canvas==='function'?o.canvas():o.canvas,sc=1,ox=0,oy=0;
  if(cv){var r=cv.getBoundingClientRect();sc=r.width/(cv.width||r.width);ox=r.left;oy=r.top;}
  if(o.scale!=null)sc=typeof o.scale==='function'?o.scale():o.scale;
  if(o.origin){var og=o.origin();ox=og[0];oy=og[1];}
  var out=[],seen={};for(var i=0;i<a.length;i++){var b=a[i];if(!b||b.dis||b.disabled||b.hidden)continue;
   var k=Math.round(b.x)+','+Math.round(b.y)+','+Math.round(b.w);if(seen[k])continue;seen[k]=1;
   var f=o.act?o.act(b):(b.fn||b.cb||b.onTap||b.action||null);
   out.push({id:String(b.id!=null?b.id:(b.k!=null?b.k:(b.label!=null?b.label:k))),label:b.label||b.id||b.k,x:ox+b.x*sc,y:oy+b.y*sc,w:b.w*sc,h:b.h*sc,act:(o.tap||!f)?null:(function(f){return function(){f()}})(f)});}
  return out;};},
 _state:function(){return {mode:prevMode,held:Object.keys(held),focus:focusEl,cursor:{x:cur.x,y:cur.y,down:cur.down}};}
};
})();
