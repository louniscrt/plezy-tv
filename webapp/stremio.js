'use strict';
// Only the server reads configured manifests: their paths can contain private tokens.
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');

function httpUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; }
}
function baseUrl(value) {
  const u = httpUrl(String(value || '').replace(/^stremio:\/\//i, 'https://'));
  if (!u || u.search || u.hash) throw new Error('Manifest Stremio invalide');
  return u.href.replace(/\/manifest\.json\/?$/, '').replace(/\/$/, '');
}
function supports(manifest, resource, type, id = '') {
  return (manifest.resources || []).some(r => {
    const entry = typeof r === 'string' ? { name: r } : r;
    const types = entry.types || manifest.types || [];
    const prefixes = entry.idPrefixes || manifest.idPrefixes;
    return entry.name === resource && types.includes(type) && (!prefixes?.length || prefixes.some(p => id.startsWith(p)));
  });
}
const encodeId = (type, id) => 'stremio~' + type + '~' + encodeURIComponent(id);
function decodeId(value) {
  const match = /^stremio~(movie|series)~(.+)$/.exec(value || '');
  if (!match) throw new Error('Identifiant Stremio invalide');
  const id = decodeURIComponent(match[2]);
  if (!id || id.length > 512 || /[\x00-\x1f]/.test(id)) throw new Error('Identifiant Stremio invalide');
  return { type: match[1], id };
}
function media(meta, type = meta.type) {
  if (!meta.id || !meta.name || !['movie', 'series'].includes(type)) return null;
  return { Id: encodeId(type, meta.id), Name: meta.name, Type: type === 'series' ? 'Series' : 'Movie',
    stremio: true, Overview: meta.description || '', ProductionYear: Number(String(meta.releaseInfo || meta.year || '').slice(0, 4)) || undefined,
    CommunityRating: Number(meta.imdbRating) || undefined, Genres: meta.genres || [],
    RunTimeTicks: (parseInt(meta.runtime, 10) || 0) * 600000000,
    stremioArt: { Primary: httpUrl(meta.poster)?.href || '', Backdrop: httpUrl(meta.background || meta.poster)?.href || '', Logo: httpUrl(meta.logo)?.href || '' },
    People: (meta.cast || []).filter(n => typeof n === 'string').map(Name => ({ Name, Type: 'Actor' })), UserData: {} };
}
async function parallel(values, fn) {
  let next = 0; const results = [];
  await Promise.all(Array.from({ length: Math.min(4, values.length) }, async () => {
    while (next < values.length) { const index = next++; try { results[index] = await fn(values[index]); } catch { results[index] = null; } }
  }));
  return results.filter(Boolean);
}
function createStremio({ config, fetchJSON } = {}) {
  if (!config) {
    const file = process.env.STREMIO_CONFIG_FILE;
    config = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : { addons: [] };
  }
  const bases = [...new Set((config.addons || []).map(a => baseUrl(typeof a === 'string' ? a : a.manifestUrl)))];
  // Cinemeta supplies metadata, not Real-Debrid links. It is optional and replaceable.
  if (bases.length && config.metadataManifest !== false) bases.push(baseUrl(config.metadataManifest || 'https://v3-cinemeta.strem.io/manifest.json'));
  const enabled = (config.addons || []).length > 0;
  const cache = new Map(), tickets = new Map();
  const readJSON = fetchJSON || (async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Addon indisponible');
    const length = Number(response.headers.get('content-length'));
    if (length > 4 * 1024 * 1024) throw new Error('Réponse trop volumineuse');
    let size = 0; const parts = [];
    for await (const part of response.body) { size += part.length; if (size > 4 * 1024 * 1024) throw new Error('Réponse trop volumineuse'); parts.push(part); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  });
  function cached(key, ttl, fn) {
    const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.promise;
    if (cache.size > 256) cache.delete(cache.keys().next().value);
    const promise = fn().catch(error => { cache.delete(key); throw error; });
    cache.set(key, { until: Date.now() + ttl, promise }); return promise;
  }
  const manifests = () => parallel(bases, base => cached(base, 1800000, async () => ({ base, manifest: await readJSON(base + '/manifest.json') })));
  async function catalog({ type, search = '', skip = 0, limit = 100 } = {}) {
    const types = type ? [type] : ['movie', 'series'];
    const jobs = (await manifests()).flatMap(addon => (addon.manifest.catalogs || []).filter(c => {
      if (!types.includes(c.type)) return false;
      const extras = c.extra || [];
      return (!search || extras.some(e => e.name === 'search')) && extras.every(e => !e.isRequired || e.name === 'search' && search || e.name === 'skip');
    }).map(c => ({ ...addon, c })));
    const lists = await parallel(jobs, ({ base, c }) => {
      const extra = [search ? 'search=' + encodeURIComponent(search) : '', skip ? 'skip=' + skip : ''].filter(Boolean).join('&');
      if (skip && !(c.extra || []).some(e => e.name === 'skip')) return [];
      return cached(base + c.type + c.id + extra, 60000, async () => {
        const data = await readJSON(`${base}/catalog/${c.type}/${encodeURIComponent(c.id)}${extra ? '/' + extra : ''}.json`);
        return (data.metas || []).map(m => media(m, c.type)).filter(Boolean);
      });
    });
    return [...new Map(lists.flat().map(m => [m.Id, m])).values()].slice(0, Math.min(500, limit));
  }
  async function meta(key) {
    const { type, id } = decodeId(key);
    const candidates = (await manifests()).filter(a => supports(a.manifest, 'meta', type, id));
    for (const { base } of candidates) {
      try { const data = await cached(base + '/meta/' + key, 60000, () => readJSON(`${base}/meta/${type}/${encodeURIComponent(id)}.json`)); if (data.meta) return { raw: data.meta, item: media(data.meta, type) }; } catch { /* Try another provider. */ }
    }
    throw new Error('Métadonnées indisponibles');
  }
  async function episodes(key) {
    const { raw, item } = await meta(key);
    return (raw.videos || []).filter(v => v.id && Number.isInteger(v.season) && Number.isInteger(v.episode)).map(v => ({
      ...item, Id: encodeId('series', v.id), Type: 'Episode', Name: v.title || v.name || `Épisode ${v.episode}`,
      SeriesId: item.Id, SeriesName: item.Name, ParentIndexNumber: v.season, IndexNumber: v.episode,
      Overview: v.overview || item.Overview, PremiereDate: v.released,
      stremioArt: { ...item.stremioArt, Primary: httpUrl(v.thumbnail)?.href || item.stremioArt.Primary }
    })).sort((a, b) => a.ParentIndexNumber - b.ParentIndexNumber || a.IndexNumber - b.IndexNumber);
  }
  async function streams(key) {
    const { type, id } = decodeId(key);
    const addons = (await manifests()).filter(a => supports(a.manifest, 'stream', type, id));
    const lists = await parallel(addons, ({ base }) => cached(base + '/stream/' + key, 30000, async () => {
      const data = await readJSON(`${base}/stream/${type}/${encodeURIComponent(id)}.json`);
      return (data.streams || []).filter(s => httpUrl(s.url) && !s.behaviorHints?.notWebReady).map(s => {
        const headers = {};
        for (const [name, value] of Object.entries(s.behaviorHints?.proxyHeaders?.request || {})) {
          if (['user-agent', 'referer', 'origin', 'authorization', 'cookie'].includes(name.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[name.toLowerCase()] = value;
        }
        return { url: s.url, headers };
      });
    }));
    return [...new Map(lists.flat().map(s => [s.url + JSON.stringify(s.headers), s])).values()];
  }
  function ticket(stream) {
    for (const [id, entry] of tickets) if (entry.until < Date.now()) tickets.delete(id);
    if (tickets.size >= 10000) tickets.delete(tickets.keys().next().value);
    const id = randomBytes(24).toString('hex'); tickets.set(id, { ...stream, until: Date.now() + 4 * 3600000 });
    return '/api/stremio/media/' + id;
  }
  function getTicket(id) { const entry = tickets.get(id); return entry && entry.until > Date.now() ? entry : null; }
  return { enabled, catalog, meta, episodes, streams, ticket, getTicket };
}
module.exports = { createStremio, encodeId, decodeId, supports, baseUrl, media };
