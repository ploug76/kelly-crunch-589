/* studio-logo v1 (Oct 30 2026): a tiny studio logo in one corner of the TITLE screen only.
   <script src="studio-logo.js" data-src="studio-logo.webp" data-alt="Book of Heaven Studios" data-when="state==='title'" data-corner="br" data-cornerl="br" data-h="52" data-hl="44"></script>
   corner: tl|tr|bl|br (portrait), cornerl for landscape. Never takes taps (pointer-events:none). */
(function(){var s=document.currentScript;if(!s)return;var d=s.dataset,when;
 try{when=new Function('try{return !!('+(d.when||'true')+')}catch(e){return false}')}catch(e){return}
 var im=new Image(),shown=null,land=null;im.src=d.src;im.alt=d.alt||'';im.id='studioLogo';im.decoding='async';im.draggable=false;im.setAttribute('aria-hidden','true');
 function place(){var L=innerWidth>innerHeight,c=(L&&d.cornerl)||d.corner||'br',v=c[0]==='t'?'top':'bottom',h=c[1]==='l'?'left':'right',ox=(L&&d.xl)||d.x||'8px',oy=(L&&d.yl)||d.y||'8px';
  im.style.cssText='position:fixed;'+v+':calc('+oy+' + env(safe-area-inset-'+v+',0px));'+h+':calc('+ox+' + env(safe-area-inset-'+h+',0px));height:'+((L&&d.hl)||d.h||48)+'px;width:auto;z-index:'+(d.z||9000)+';pointer-events:none;opacity:.94;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.45);display:'+(shown?'block':'none');land=L}
 function tick(){var on=when()&&!document.querySelector('#palbOv.on,#palbOv.open,.palb-open');if(on!==shown){shown=on;im.style.display=on?'block':'none'}if((innerWidth>innerHeight)!==land)place()}
 function boot(){place();(document.body||document.documentElement).appendChild(im);tick();setInterval(tick,200);addEventListener('resize',place)}
 if(document.body)boot();else addEventListener('DOMContentLoaded',boot)})();
