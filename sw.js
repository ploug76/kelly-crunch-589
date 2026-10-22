const P='f589-kelly-crunch-589-',V=P+'v2',OLD=[],FILES=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!=V&&(n.startsWith(P)||OLD.some(o=>n.startsWith(o)))).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!='GET')return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.open(V).then(c=>c.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode=='navigate'?c.match('./'):undefined)))))});
