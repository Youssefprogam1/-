const C='tayo-v4',F=['./','index.html','manifest.json','icon.jpg','verses.js','badge.png','https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js','https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(u=>/^http/.test(u)?fetch(u,{mode:'no-cors'}).then(x=>c.put(u,x)).catch(()=>0):c.add(u).catch(()=>0)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!='GET'||!(u.origin==location.origin||/cdnjs|fonts\.g/.test(u.host)))return;
e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(C).then(c=>c.put(r,y));return x}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))});
/* ===== تنبيه آية اليوم + إشعارات المشرف ===== */
self.addEventListener('push',e=>{
 let d={};try{d=e.data?e.data.json():{}}catch(x){}
 const n=d.t=='notice';
 e.waitUntil(self.registration.showNotification(n?'إشعار جديد':'آية اليوم',{body:n?(d.b||'فيه إشعار جديد من الخدمة'):'اضغط عشان تقرا آية النهاردة ✝',icon:'icon.jpg',badge:'badge.png',tag:n?'notice'+Date.now():'daily-verse',renotify:true,lang:'ar',dir:'rtl',data:{t:n?'notice':'verse'}}))});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const t=(e.notification.data&&e.notification.data.t)||'verse';
 const url=new URL('./?'+(t=='notice'?'notice=1':'verse=1'),self.registration.scope).href;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
  for(const c of l){if('focus' in c){c.postMessage({t});return c.focus()}}
  return self.clients.openWindow(url)}))});
