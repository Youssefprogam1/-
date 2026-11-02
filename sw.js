const C='tayo-v2',F=['./','index.html','manifest.json','icon.jpg','verses.js','badge.png','https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js','https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(u=>/^http/.test(u)?fetch(u,{mode:'no-cors'}).then(x=>c.put(u,x)).catch(()=>0):c.add(u).catch(()=>0)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!='GET'||!(u.origin==location.origin||/cdnjs|fonts\.g/.test(u.host)))return;
e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(C).then(c=>c.put(r,y));return x}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))});
/* ===== تنبيه آية اليوم ===== */
self.addEventListener('push',e=>{
 e.waitUntil(self.registration.showNotification('آية اليوم',{body:'اضغط عشان تقرا آية النهاردة ✝',icon:'icon.jpg',badge:'badge.png',tag:'daily-verse',renotify:true,lang:'ar',dir:'rtl',data:{t:'verse'}}))});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const url=new URL('./?verse=1',self.registration.scope).href;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
  for(const c of l){if('focus' in c){c.postMessage({t:'verse'});return c.focus()}}
  return self.clients.openWindow(url)}))});
