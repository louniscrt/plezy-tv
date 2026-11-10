const CACHE = 'plezy-shell-stremio-20261110-v5';
const SHELL = ['/', '/index.html', '/style.css', '/player.css', '/detail.css', '/api.js', '/resume.js', '/seerr-session.js', '/refresh.js', '/seerr-pairing.js', '/vendor/qrcode.js', '/detail.js', '/app.js', '/playback.js', '/player.js', '/demo.js', '/offline.js', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/vendor/hls.min.js', ...Array.from({length:8},(_,i)=>'/art/demo-'+i+'.jpg'), ...['regular','medium','semibold','bold','extrabold'].map(w => '/fonts/inter_' + w + '.ttf')];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => Promise.all(SHELL.map(async path => {
  const response = await fetch(path, {cache:'reload'});
  if (!response.ok) throw new Error('Ressource Plezy indisponible');
  await cache.put(path, response);
}))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('plezy-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/offline-media/')) {
    event.respondWith(offlineMedia(event.request, url.pathname.split('/').pop())); return;
  }
  // Ne jamais mettre en cache les sessions, API, images privées ou flux vidéo.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/proxy' || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(url.pathname, copy)); } return response; }).catch(() => caches.match(url.pathname)));
});
async function offlineMedia(request, id) {
  if (!/^[a-zA-Z0-9-]+\.(mp4|webm)$/.test(id)) return new Response('Fichier invalide', {status:400});
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('plezy-downloads');
    const handle = await directory.getFileHandle(id), file = await handle.getFile();
    const headers = {'Content-Type': id.endsWith('.webm') ? 'video/webm' : 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control':'no-store'};
    const range = request.headers.get('range');
    if (!range) return new Response(file.stream(), {headers:{...headers,'Content-Length':String(file.size)}});
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${file.size}`}});
    const start = match[1] ? Number(match[1]) : Math.max(0,file.size-Number(match[2]));
    const end = match[1] && match[2] ? Math.min(file.size-1,Number(match[2])) : file.size-1;
    if (start>=file.size || start>end) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
    return new Response(file.slice(start,end+1).stream(),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`}});
  } catch { return new Response('Téléchargement introuvable sur cet appareil',{status:404}); }
}
