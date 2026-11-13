/* Serveur Plezy : interface locale et relais Jellyfin / Seerr. Node 20+. */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const compressedAssets = new Map();
const networkSample = require('node:crypto').randomBytes(128 * 1024);
const acceptsGzip = req => String(req.headers['accept-encoding'] || '').split(',').some(part => /^gzip(?:\s*;|\s*$)/i.test(part.trim()) && !/;\s*q=0(?:\.0*)?\s*$/i.test(part));
function sendJSON(req, res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' };
  const finish = (payload, compressed) => { if (res.destroyed) return; res.writeHead(status, { ...headers, 'Content-Length': payload.length, ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) }); res.end(req.method === 'HEAD' ? undefined : payload); };
  if (body.length >= 1024 && acceptsGzip(req)) zlib.gzip(body, (error, result) => finish(error ? body : result, !error));
  else finish(body, false);
}
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
    const out = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' };
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
  if (!options.stremio && stremio.enabled) {
    setTimeout(() => {
      stremio.catalog({ type: 'movie', limit: 100 }).catch(() => {});
      stremio.catalog({ type: 'series', limit: 100 }).catch(() => {});
    }, 250).unref?.();
  }
  return http.createServer((req, res) => {
    res.setHeader('X-Plezy-Relay', '1');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    let url;
    try { url = new URL(req.url, 'http://' + req.headers.host); } catch { res.writeHead(400); return res.end('Requête invalide'); }
    if (url.pathname === '/api/network-test') {
      if (!['GET','HEAD'].includes(req.method) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type':'application/octet-stream', 'Content-Length':networkSample.length, 'Content-Encoding':'identity', 'Cache-Control':'no-store, no-transform', 'CDN-Cache-Control':'no-store', 'Cloudflare-CDN-Cache-Control':'no-store' });
      res.flushHeaders();
      return res.end(req.method === 'HEAD' ? undefined : networkSample);
    }
    if (url.pathname.startsWith('/api/stremio/')) {
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && !['http://' + req.headers.host, 'https://' + req.headers.host].includes(req.headers.origin)) { res.writeHead(403); return res.end(); }
      if (!['GET', 'HEAD'].includes(req.method) && !(req.method === 'POST' && url.pathname === '/api/stremio/request')) { res.writeHead(405); return res.end(); }
      const send = (status, data) => sendJSON(req, res, status, data);
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
      if (route.startsWith('subtitles/')) {
        const subId = route.slice('subtitles/'.length).replace(/\.vtt$/i, '');
        const entry = stremio.getTicket(subId);
        if (!entry) return send(404, { error: 'Sous-titres expirés' });
        const streamIdx = url.searchParams.get('stream');
        const wantedLang = url.searchParams.get('lang');
        const hasCustomHeaders = Object.keys(entry.headers || {}).length > 0;
        if (entry.isSubtitle) {
          fetch(entry.url, { signal: AbortSignal.timeout(10000), headers: entry.headers || {} })
            .then(async r => {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              const arrayBuf = await r.arrayBuffer();
              let buf = Buffer.from(arrayBuf);
              if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
                const zlib = require('node:zlib');
                buf = zlib.gunzipSync(buf);
              }
              const clean = buf.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
              const vtt = clean.startsWith('WEBVTT')
                ? clean
                : 'WEBVTT\n\n' + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2 --> $3.$4');
              res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*' });
              res.end(req.method === 'HEAD' ? undefined : vtt);
            })
            .catch(() => {
              if (!res.headersSent) {
                res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('WEBVTT\n\n');
              }
            });
          return;
        }
        return require('./stremio-media').subtitleMedia(req, res, subId, { stream: streamIdx, lang: wantedLang || 'fr', identity: entry.url + JSON.stringify(entry.headers), upstreamUrl: entry.url, hasCustomHeaders });
      }
      if (route.startsWith('hls/')) {
        const match = /^hls\/([a-f0-9]{48})\/(master\.m3u8|quality-(240|360|480|720|1080|2160)\.m3u8|segment-(240|360|480|720|1080|2160)-(\d+)\.ts)$/.exec(route);
        if (!match) return send(404, { error: 'Chemin invalide' });
        const entry = stremio.getTicket(match[1]); if (!entry) return send(404, { error: 'Lien expiré' });
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr';
        const allowFallback = url.searchParams.get('fallback') === '1' || lang === 'en' || Boolean(entry.fallback);
        const hasCustomHeaders = Object.keys(entry.headers || {}).length > 0;
        return require('./stremio-media').hlsMedia(req, res, match[1], match[5] === undefined ? undefined : Number(match[5]), entry.url + JSON.stringify(entry.headers), Number(match[3] || match[4] || 1080), match[2] === 'master.m3u8', { lang, allowFallback, upstreamUrl: entry.url, hasCustomHeaders });
      }
      if (route.startsWith('media/')) {
        const entry = stremio.getTicket(route.slice(6));
        if (!entry) return send(404, { error: 'Lien expiré. Relancez la lecture.' });
        if (url.searchParams.get('playback') === 'browser' || url.searchParams.get('probe') === '1') {
          const start = Number(url.searchParams.get('start') || 0);
          const quality = Number(url.searchParams.get('quality') || 360);
          if (![240,360,480,720,1080,2160].includes(quality)) return send(400, { error: 'Qualité invalide' });
          if (!Number.isFinite(start) || start < 0 || start > 604800) return send(400, { error: 'Position invalide' });
          const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'fr';
          const allowFallback = url.searchParams.get('fallback') === '1' || lang === 'en' || Boolean(entry.fallback);
          const hasCustomHeaders = Object.keys(entry.headers || {}).length > 0;
          return require('./stremio-media').browserMedia(req, res, route.slice(6), { start, quality, probeOnly: url.searchParams.get('probe') === '1', identity: entry.url + JSON.stringify(entry.headers), lang, allowFallback, upstreamUrl: entry.url, hasCustomHeaders });
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
          const year = Number(url.searchParams.get('year')) || undefined;
          const [raw, rawSubs] = await Promise.all([
            stremio.streams(id, { includeVariants: true, year }),
            typeof stremio.subtitles === 'function'
              ? Promise.race([stremio.subtitles(id).catch(() => []), new Promise(r => setTimeout(() => r([]), 5000))])
              : Promise.resolve([])
          ]);
          const primary = Array.isArray(raw) ? raw : (raw.streams || []);
          const english = Array.isArray(raw) ? [] : (raw.englishStreams || []);
          const fallback = Array.isArray(raw) ? [] : (raw.fallbackStreams || []);
          const toTicket = s => ({ url: stremio.ticket(s), hls: /\.m3u8(?:\?|$)/i.test(s.url), lang: s.lang || 'fr', fallback: Boolean(s.fallback) });
          const mappedStreams = primary.map(toTicket);
          const mappedEnglish = english.map(s => ({ ...toTicket(s), lang: 'en', fallback: true }));
          const mappedFallback = fallback.map(s => ({ ...toTicket(s), fallback: true }));
          const mappedSubtitles = (rawSubs || []).map((s, idx) => {
            const tPath = stremio.ticket({ url: s.url, headers: {}, isSubtitle: true });
            const ticketId = tPath.split('/').pop();
            return {
              index: 101 + idx,
              lang: s.lang,
              language: s.language,
              label: s.label,
              url: `/api/stremio/subtitles/${ticketId}.vtt`
            };
          });
          const firstCandidate = mappedStreams[0];
          if (firstCandidate && !firstCandidate.hls) {
            const ticketId = firstCandidate.url.split('/').pop();
            const entry = stremio.getTicket(ticketId);
            if (entry) {
              const hasCustomHeaders = Object.keys(entry.headers || {}).length > 0;
              require('./stremio-media').warmProbe?.(ticketId, entry.url + JSON.stringify(entry.headers), { upstreamUrl: entry.url, hasCustomHeaders });
            }
          }
          return send(200, {
            streams: mappedStreams,
            englishStreams: mappedEnglish,
            fallbackStreams: mappedFallback,
            subtitles: mappedSubtitles,
            languages: [
              { code: 'fr', label: 'Français', primary: true, default: true },
              { code: 'en', label: 'Anglais', primary: false, default: false }
            ]
          });
        }
        send(404, { error: 'Route inconnue' });
      })().catch(() => send(502, { error: 'Addon indisponible ou réponse invalide' }));
      return;
    }
    if(url.pathname==='/api/seerr-pair' || url.pathname.startsWith('/api/seerr-pair/')) return pairing(req,res,url);
    // Jellyfin compatibility endpoints for native TV apps and Jellyfin clients
    if (url.pathname === '/System/Info/Public' || url.pathname === '/System/Info') {
      const body = JSON.stringify({
        ServerName: 'Plezy',
        Version: '10.9.0',
        ProductName: 'Plezy Server',
        OperatingSystem: 'Linux',
        Id: 'plezy-server',
        StartupWizardCompleted: true
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname === '/Users/Public') {
      const body = JSON.stringify([{
        Name: 'Lounis',
        Id: 'user_lounis',
        HasPassword: false,
        EnableAutoLogin: true
      }]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname === '/Users/AuthenticateByName' && req.method === 'POST') {
      const body = JSON.stringify({
        AccessToken: 'plezy_local_token',
        ServerId: 'plezy-server',
        User: {
          Name: 'Lounis',
          Id: 'user_lounis',
          HasPassword: false
        },
        SessionInfo: {
          Id: 'plezy_session'
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (url.pathname === '/Users/Me' || url.pathname === '/Users/user_lounis') {
      const body = JSON.stringify({
        Name: 'Lounis',
        Id: 'user_lounis',
        HasPassword: false
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname === '/QuickConnect/Initiate' && req.method === 'POST') {
      const body = JSON.stringify({
        Code: '123456',
        Secret: 'plezy_qc_secret',
        Authenticated: true
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (url.pathname === '/QuickConnect/Connect') {
      const body = JSON.stringify({
        Authenticated: true,
        Secret: 'plezy_qc_secret'
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname === '/Users/AuthenticateWithQuickConnect' && req.method === 'POST') {
      const body = JSON.stringify({
        AccessToken: 'plezy_local_token',
        ServerId: 'plezy-server',
        User: {
          Name: 'Lounis',
          Id: 'user_lounis',
          HasPassword: false
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (/^\/Users\/[^/]+\/Items(?:\/|$)/.test(url.pathname)) {
      const body = JSON.stringify({ Items: [], TotalRecordCount: 0 });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname.startsWith('/Sessions/Playing') || url.pathname.startsWith('/DisplayPreferences/')) {
      if (['POST', 'DELETE'].includes(req.method)) {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('{"Id":"pref","CustomPrefs":{}}');
    }
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
      const ext = path.extname(file);
      const permanent = pathname.startsWith('/fonts/') || pathname.startsWith('/vendor/') || pathname.startsWith('/art/');
      const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'ETag': etag, 'Vary': 'Accept-Encoding', 'Cache-Control': permanent ? 'public, max-age=86400' : 'no-cache, must-revalidate', ...(permanent ? {} : { 'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store' }) };
      if (String(req.headers['if-none-match'] || '').split(',').map(value => value.trim()).some(value => value === etag || value === '*')) { res.writeHead(304, headers); return res.end(); }
      if (stat.size >= 1024 && stat.size <= 2 * 1024 * 1024 && /\.(?:html|css|js|json|svg|webmanifest|ttf)$/.test(ext) && acceptsGzip(req)) {
        const key = file + ':' + etag;
        let payload = compressedAssets.get(key);
        if (!payload) {
          payload = fs.promises.readFile(file).then(body => new Promise((resolve, reject) => zlib.gzip(body, (err, result) => err ? reject(err) : resolve(result))));
          compressedAssets.set(key, payload);
          if (compressedAssets.size > 128) compressedAssets.delete(compressedAssets.keys().next().value);
        }
        return payload.then(body => { if (res.destroyed) return; res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': body.length }); res.end(req.method === 'HEAD' ? undefined : body); }).catch(() => { compressedAssets.delete(key); if (!res.headersSent) res.writeHead(500); res.end(); });
      }
      res.writeHead(200, { ...headers, 'Content-Length': stat.size });
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
