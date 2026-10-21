# Kelly Crunch automated overlap + safety test.
# Every HUD pill, button, announcer, score pop-up, tip/toast lane and panel line registers its rect each frame (UIE).
# Asserts: no two registered rects overlap, all stay inside the safe area, the Share/Install dock never touches a
# canvas button, no JS errors. Runs bot-played Endless (with stress-spawned announcers/pop-ups) and every puzzle
# (bot plays the solver's moves in-game and must reach "Puzzle Clear" within the move limit).
import sys,asyncio,json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/kelly-crunch/'
VIEWS=[(390,844,None),(360,640,None),(375,667,None),(430,932,None),(390,844,{'t':47,'r':0,'b':34,'l':0}),(844,390,{'t':0,'r':47,'b':21,'l':47}),(667,375,None)]
CHECK=r'''(tag)=>{const L=__T.layout(),E=L.els,S=L.SAFE,bad=[];const o=(a,b)=>a.x<b.x+b.w-.01&&b.x<a.x+a.w-.01&&a.y<b.y+b.h-.01&&b.y<a.y+a.h-.01;
 for(let i=0;i<E.length;i++){const a=E[i];if(a.x<S.l-.5||a.y<S.t-.5||a.x+a.w>S.r+.5||a.y+a.h>S.b+.5)bad.push(tag+' edge '+a.k);for(let j=i+1;j<E.length;j++)if(o(a,E[j]))bad.push(tag+' '+a.k+' x '+E[j].k)}
 const dk=['shareBtn','instBtn','dockHint'].map(i=>document.getElementById(i)).filter(e=>e&&getComputedStyle(e).display!=='none'&&e.getClientRects().length);
 for(const d of dk){const r=d.getBoundingClientRect();const q={x:(r.left-L.OXs)/L.SC,y:(r.top-L.OYs)/L.SC,w:r.width/L.SC,h:r.height/L.SC};for(const a of E)if(a.k.startsWith('btn:')&&o(q,a))bad.push(tag+' dock '+d.id+' x '+a.k)}
 return bad}'''
ENDLESS=r'''async (secs)=>{const T=__T;T.start('endless');window.__BOT=1;const bad=[];let f=0;const CH=window.__CHECK;
 for(let i=0;i<secs*60;i++){T.step(1);f++;const G=T.G;if(!G)break;
  if(i%97===0)T.announce(['Super Crunch!','Food Chain!','KELLY CRUNCH!!','Level 9!  Faster vines!'][i%4],1+i%7);
  if(i%13===0)T.label('+'+(i*7),40+Math.random()*320,200+Math.random()*400);
  if(i%3===0){const b=CH('endless');if(b.length)bad.push(...b.slice(0,3))}
  if(G.panel==='over'){bad.push(...CH('over'));break}}
 const G=T.G;window.__BOT=0;return{frames:f,score:G.score,level:G.level,chainMax:G.chainMax,popped:G.popped,over:G.panel,bad:bad.slice(0,12),nbad:bad.length}}'''
PUZZ=r'''async ()=>{const T=__T;const out=[];const CH=window.__CHECK;let bad=[];
 for(let i=0;i<T.PUZ.length;i++){T.start('puzzle',i);window.__BOT=1;let k=0;while(!T.G.panel&&k<60*60){T.step(1);k++;if(k%4===0){const b=CH('pz'+i);if(b.length)bad.push(...b)}}
  window.__BOT=0;for(let j=0;j<40;j++)T.step(1);bad.push(...CH('pz'+i+'-'+T.G.panel));out.push([i,T.G.panel,T.G.moves,T.G.limit,T.G.par])}
 return{out,bad:bad.slice(0,12),nbad:bad.length}}'''
async def main():
  tot=0;errsAll=[];pzFail=0
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for vi,(w,h,safe) in enumerate(VIEWS):
      ctx=await b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True);pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
      if safe:await ctx.add_init_script('window.__SAFE='+json.dumps(safe))
      await pg.goto(URL);await pg.wait_for_timeout(900);await pg.evaluate('()=>{window.__CHECK=eval('+json.dumps(CHECK)+')}')
      await pg.evaluate("()=>{if(window.__dock){__dock.resetHint();__dock.forceInstall();__dock.showHint()}}");await pg.wait_for_timeout(400)
      bad=[]
      bad+=await pg.evaluate("()=>{__T.step(2);return __CHECK('title')}")
      bad+=await pg.evaluate("()=>{__T.openLevels();__T.step(2);return __CHECK('levels')}")
      for k in range(6):bad+=await pg.evaluate(f"()=>{{__T.openHow({k});__T.step(2);return __CHECK('how{k}')}}")
      r=await pg.evaluate(ENDLESS,60 if vi==0 else 25);bad+=r['bad']
      for pn in ['pause','over','clear','fail']:
        mode='endless' if pn in ('pause','over') else 'puzzle'
        act='__T.togglePause()' if pn=='pause' else f'__T.setPanel("{pn}")'
        bad+=await pg.evaluate(f"()=>{{__T.start('{mode}',3);__T.step(5);{act};__T.step(30);return __CHECK('{pn}')}}")
      line=f"{w}x{h}{' safe' if safe else ''}: endless frames {r['frames']} score {r['score']} lvl {r['level']} maxChain {r['chainMax']} popped {r['popped']} end={r['over']}"
      if vi in (0,1,4):
        pz=await pg.evaluate(PUZZ);bad+=pz['bad'];nc=sum(1 for o in pz['out'] if o[1]=='clear');pzFail+=len(pz['out'])-nc
        line+=f" | puzzles cleared in-game {nc}/{len(pz['out'])}"
        if nc<len(pz['out']):line+=' FAILED '+str([o for o in pz['out'] if o[1]!='clear'])
      print(line,'| overlaps',len(bad),bad[:6],flush=True)
      if errs:print('  JS ERRORS',errs[:5])
      tot+=len(bad);errsAll+=errs;await ctx.close()
    await b.close()
  print(f'TOTAL overlaps {tot} js_errors {len(errsAll)} puzzle_failures {pzFail}');sys.exit(1 if tot or errsAll or pzFail else 0)
asyncio.run(main())
