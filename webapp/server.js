/* Serveur Plezy : interface locale et relais Jellyfin / Seerr. Node 20+. */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ttf':'font/ttf', '.ico':'image/x-icon' };
const FORWARD = ['accept', 'content-type', 'authorization', 'x-emby-authorization', 'x-api-key', 'range', 'if-range', 'x-cookie'];
function rewritePlaylist(body, target, mediaLink) {
  const resolve = value => {
    const url = new URL(value, target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URI HLS invalide');
    for (const key of ['api_key', 'ApiKey']) if (url.origin === target.origin && !url.searchParams.has(key) && target.searchParams.has(key)) url.searchParams.set(key, target.searchParams.get(key));
    return mediaLink ? mediaLink(url) : '/proxy?url=' + encodeURIComponent(url.href);
  };
  return body.split('\n').map(line => {
    const value = line.trim();
    if (!value) return line;
    if (value.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => 'URI="' + resolve(uri) + '"');
    return resolve(value);
  }).join('\n');
}
function proxy(req, res, target, redirects = 0, inheritedHeaders, mediaTicket) {
  let url;
  try { url = new URL(target); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
  catch { res.writeHead(400); return res.end('URL HTTP(S) invalide'); }
  const headers = inheritedHeaders || {};
  if (!inheritedHeaders) for (const key of FORWARD) if (req.headers[key]) headers[key === 'x-cookie' ? 'cookie' : key] = req.headers[key];
  // Les éléments <video>/<img> ne peuvent pas ajouter d'en-tête d'authentification.
  // Certains serveurs Jellyfin exigent Authorization même pour un jeton en query.
  const mediaToken = url.searchParams.get('api_key') || url.searchParams.get('ApiKey');
  if (!headers.authorization && mediaToken && /^[a-zA-Z0-9._~-]+$/.test(mediaToken)) {
    headers.authorization = `MediaBrowser Client="Plezy Web", Device="Web Browser", DeviceId="plezy-web-media", Version="1.0.0", Token="${mediaToken}"`;
  }
  const fail = () => {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) return res.destroy();
    res.writeHead(502); res.end('Serveur distant inaccessible');
  };
  const upstream = (url.protocol === 'https:' ? https : http).request(url, { method: req.method, headers, timeout: 30000 }, response => {
    if (process.env.PLEZY_DEBUG_STREAMS === '1' && /\/Videos\//i.test(url.pathname)) {
      let transferred = 0;
      console.log('Plezy flux ' + JSON.stringify({ path: url.pathname, status: response.statusCode, type: response.headers['content-type'], range: !!headers.range }));
      response.on('data', chunk => { transferred += chunk.length; });
      response.on('end', () => console.log('Plezy transfert ' + JSON.stringify({ path: url.pathname, bytes: transferred })));
    }
    if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
      response.resume();
      if (redirects >= 5 || !['GET','HEAD'].includes(req.method)) { res.writeHead(502); return res.end('Redirection non prise en charge'); }
      let destination;
      try { destination = new URL(response.headers.location, url); } catch { res.writeHead(502); return res.end('Redirection invalide'); }
      const forwarded = { ...headers };
      if (destination.origin !== url.origin) for (const key of ['authorization','x-emby-authorization','x-api-key','cookie']) delete forwarded[key];
      return proxy(req, res, destination.href, redirects + 1, forwarded, mediaTicket);
    }
    const out = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    for (const key of ['content-type','content-length','content-range','accept-ranges']) if (response.headers[key]) out[key] = response.headers[key];
    if (response.headers['set-cookie']) out['X-Set-Cookie'] = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    if (req.method !== 'HEAD' && response.statusCode === 200 && (/mpegurl/i.test(response.headers['content-type'] || '') || url.pathname.endsWith('.m3u8'))) {
      let body = '', length = 0;
      response.setEncoding('utf8');
      response.on('data', chunk => { length += Buffer.byteLength(chunk); if (length > 4 * 1024 * 1024) response.destroy(new Error('Playlist trop volumineuse')); else body += chunk; });
      response.on('end', () => {
        if (res.writableEnded || res.destroyed) return;
        try {
          const rewritten = rewritePlaylist(body, url, mediaTicket ? destination => {
            const forwarded = { ...headers }; delete forwarded.range;
            if (destination.origin !== url.origin) for (const key of ['authorization', 'cookie', 'x-api-key', 'x-emby-authorization']) delete forwarded[key];
            return mediaTicket({ url: destination.href, headers: forwarded });
          } : undefined);
          delete out['content-length']; out['content-type'] = 'application/vnd.apple.mpegurl'; res.writeHead(response.statusCode, out); res.end(rewritten);
        }
        catch { fail(); }
      });
    } else { res.writeHead(response.statusCode, out); response.pipe(res); }
    response.on('error', fail);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Délai du serveur dépassé')));
  upstream.on('error', fail);
  res.on('error', () => upstream.destroy());
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
  if (redirects) upstream.end(); else req.pipe(upstream);
}
function createServer(options = {}) {
  const pairing=require('./pairing').createPairing();
  const stremio = options.stremio || require('./stremio').createStremio();
  return http.createServer((req, res) => {
    res.setHeader('X-Plezy-Relay', '1');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    let url;
    try { url = new URL(req.url, 'http://' + req.headers.host); } catch { res.writeHead(400); return res.end('Requête invalide'); }
    if (url.pathname.startsWith('/api/stremio/')) {
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && !['http://' + req.headers.host, 'https://' + req.headers.host].includes(req.headers.origin)) { res.writeHead(403); return res.end(); }
      if (!['GET', 'HEAD'].includes(req.method) && !(req.method === 'POST' && url.pathname === '/api/stremio/request')) { res.writeHead(405); return res.end(); }
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data)); };
      const route = url.pathname.slice('/api/stremio/'.length);
      if (route === 'status') return send(200, { enabled: stremio.enabled });
      if (!stremio.enabled) return send(503, { error: 'Addons Stremio non configurés' });
      if (route === 'request' && req.method === 'POST') {
        (async () => {
          let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw Object.assign(new Error('Requête trop volumineuse'), { status: 413 }); }
          let params; try { params = JSON.parse(body); } catch { return send(400, { error: 'Requête invalide' }); }
          return send(200, await stremio.requestMedia(params));
        })().catch(error => send([400, 409, 413, 503].includes(error.status) ? error.status : 502, { error: error.status === 409 ? 'Une demande existe déjà dans Seerr.' : 'La demande Seerr ne peut pas être envoyée.' }));
        return;
      }
      if (route.startsWith('hls/')) {
        const match = /^hls\/([a-f0-9]{48})\/(master\.m3u8|quality-(360|480|720)\.m3u8|segment-(360|480|720)-(\d+)\.ts)$/.exec(route);
        if (!match) return send(404, { error: 'Chemin invalide' });
        const entry = stremio.getTicket(match[1]); if (!entry) return send(404, { error: 'Lien expiré' });
        return require('./stremio-media').hlsMedia(req, res, match[1], match[5] === undefined ? undefined : Number(match[5]), entry.url + JSON.stringify(entry.headers), Number(match[3] || match[4] || 720), match[2] === 'master.m3u8');
      }
      if (route.startsWith('media/')) {
        const entry = stremio.getTicket(route.slice(6));
        if (!entry) return send(404, { error: 'Lien expiré. Relancez la lecture.' });
        if (url.searchParams.get('playback') === 'browser' || url.searchParams.get('probe') === '1') {
          const start = Number(url.searchParams.get('start') || 0);
          if (!Number.isFinite(start) || start < 0 || start > 604800) return send(400, { error: 'Position invalide' });
          return require('./stremio-media').browserMedia(req, res, route.slice(6), { start, probeOnly: url.searchParams.get('probe') === '1', identity: entry.url + JSON.stringify(entry.headers) });
        }
        return proxy(req, res, entry.url, 0, { ...entry.headers, ...(req.headers.range ? { range: req.headers.range } : {}) }, stremio.ticket);
      }
      (async () => {
        const id = url.searchParams.get('id');
        if (route === 'catalog') {
          const type = url.searchParams.get('type') || undefined;
          if (type && !['movie', 'series'].includes(type)) return send(400, { error: 'Type invalide' });
          const skip = Math.max(0, parseInt(url.searchParams.get('skip'), 10) || 0);
          const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit'), 10) || 100));
          return send(200, { Items: await stremio.catalog({ type, search: (url.searchParams.get('search') || '').slice(0, 256), skip, limit }) });
        }
        if (route === 'search') return send(200, await stremio.search((url.searchParams.get('search') || '').slice(0, 256)));
        if (route === 'resolve') { const value = await stremio.resolveMedia({ id, tmdbId: url.searchParams.get('tmdbId'), type: url.searchParams.get('type') || 'movie' }); return send(200, { item: value.item, meta: value.raw }); }
        if (route === 'raw-meta') return send(200, { meta: (await stremio.meta(id)).raw });
        if (route === 'meta') return send(200, (await stremio.meta(id)).item);
        if (route === 'episodes') return send(200, { Items: await stremio.episodes(id) });
        if (route === 'streams') {
          const streams = await stremio.streams(id);
          return send(200, { streams: streams.map(s => ({ url: stremio.ticket(s), hls: /\.m3u8(?:\?|$)/i.test(s.url) })) });
        }
        send(404, { error: 'Route inconnue' });
      })().catch(() => send(502, { error: 'Addon indisponible ou réponse invalide' }));
      return;
    }
    if(url.pathname==='/api/seerr-pair' || url.pathname.startsWith('/api/seerr-pair/')) return pairing(req,res,url);
    if (url.pathname === '/proxy') {
      // Le relais est réservé aux pages servies par cette application.
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) { res.writeHead(403); return res.end('Origine refusée'); }
      if (!['GET','POST','DELETE','PUT','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      return proxy(req, res, url.searchParams.get('url'));
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (url.pathname === '/health') {
      const body = JSON.stringify({ service: 'plezy-web', status: 'ok', relay: true });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('Chemin invalide'); }
    if (pathname.includes('\0')) { res.writeHead(400); return res.end(); }
    const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname === '/tv/' ? '/tv/index.html' : pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Fichier introuvable'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length':stat.size, 'Cache-Control': pathname.startsWith('/fonts/') || pathname.startsWith('/vendor/') || pathname.startsWith('/art/') ? 'public, max-age=86400' : 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8090), host = process.env.HOST || '0.0.0.0';
  const server = createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Le port ${port} est occupé. Choisissez un autre PORT.` : error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`Plezy Web prêt : http://localhost:${port}`);
    if (host === '0.0.0.0') for (const addresses of Object.values(os.networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`Téléphone / tablette (même Wi-Fi) : http://${address.address}:${port}`);
  });
}
module.exports = { createServer, rewritePlaylist };
