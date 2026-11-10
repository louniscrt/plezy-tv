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
    stremio: true, ProviderIds: { ...(String(meta.id).startsWith('tt') ? { Imdb: meta.id } : {}), ...(meta.moviedb_id ? { Tmdb: String(meta.moviedb_id) } : {}) }, Overview: meta.description || '', ProductionYear: Number(String(meta.releaseInfo || meta.year || '').slice(0, 4)) || undefined,
    CommunityRating: Number(meta.imdbRating) || undefined, Genres: meta.genres || [],
    RunTimeTicks: (parseInt(meta.runtime, 10) || 0) * 600000000,
    stremioArt: { Primary: httpUrl(meta.poster)?.href || '', Backdrop: httpUrl(meta.background || meta.poster)?.href || '', Logo: httpUrl(meta.logo)?.href || '' },
    People: (meta.cast || []).filter(n => typeof n === 'string').map(Name => ({ Name, Type: 'Actor' })), UserData: {} };
}
// Prefer sources that older Fire TV devices and browser decoders can play directly.
function streamPriority(stream) {
  const info = [stream.name, stream.title, stream.behaviorHints?.filename].filter(Boolean).join(' ').toLowerCase();
  return (/h[ ._-]?264|x264|avc/.test(info) ? 40 : 0) +
    (/\.mp4\b/.test(info) ? 40 : /\.webm\b/.test(info) ? 20 : 0) +
    (/1080p/.test(info) ? 20 : /720p/.test(info) ? 10 : 0) -
    (/2160p|\b4k\b/.test(info) ? 30 : 0) -
    (/hevc|h[ ._-]?265|x265|av1|dolby.?vision|dovi/.test(info) ? 50 : 0);
}
function isFrenchStream(stream) {
  const languages = [stream.language, ...(Array.isArray(stream.languages) ? stream.languages : [])].filter(v => typeof v === 'string').map(v => v.toLowerCase());
  if (languages.some(v => /^(fr|fra|fre|french|francais|français)(?:[-_].*)?$/.test(v))) return true;
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  if (text.includes('🇫🇷')) return true;
  const release = stream.behaviorHints?.filename || stream.title || '';
  const marker = /(?:19|20)\d{2}|(?:2160|1080|720|576|480)p/i.exec(release);
  const tags = marker ? release.slice(marker.index + marker[0].length) : release;
  const strong = /(?:^|[^a-z0-9])(?:truefrench|vff|vfq|vfi|vf|fra|fre|fr)(?:$|[^a-z0-9])/i;
  const french = /(?:^|[^a-z0-9])(?:french|fran[cç]ais)(?:$|[^a-z0-9])/i;
  return strong.test(release) || french.test(tags) || /(?:audio|language|langue)\s*[:=-]\s*(?:french|fran[cç]ais|fr)\b/i.test(text);
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
  const readJSON = fetchJSON || (async (url, headers = {}, options = {}) => {
    const response = await fetch(url, { method: options.method || 'GET', body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json', ...headers } });
    if (!response.ok) throw Object.assign(new Error('Service indisponible'), { status: response.status });
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
  let metadataActive = 0; const metadataQueue = [];
  async function metadataJSON(route) {
    if (!config.metadata?.seerrUrl || !config.metadata?.seerrApiKey) return null;
    const base = httpUrl(config.metadata.seerrUrl);
    if (!base) return null;
    return cached('fr:' + route, 86400000, async () => {
      if (metadataActive >= 4) await new Promise(resolve => metadataQueue.push(resolve));
      metadataActive++;
      try { const url = new URL(base.href.replace(/\/$/, '') + '/api/v1/' + route); url.searchParams.set('language', 'fr');
        return await readJSON(url.href, { 'X-Api-Key': config.metadata.seerrApiKey }); }
      finally { metadataActive--; metadataQueue.shift()?.(); }
    });
  }
  async function localize(raw, type) {
    if (!raw.moviedb_id) return raw;
    try {
      const data = await metadataJSON((type === 'series' ? 'tv' : 'movie') + '/' + encodeURIComponent(raw.moviedb_id));
      if (!data) return raw;
      const name = data.title || data.name || raw.name;
      const poster = data.posterPath ? 'https://image.tmdb.org/t/p/w500' + data.posterPath : raw.poster;
      const background = data.backdropPath ? 'https://image.tmdb.org/t/p/w1280' + data.backdropPath : raw.background;
      return { ...raw, name, description: data.overview || (config.frenchOnly ? '' : raw.description),
        genres: data.genres?.map(g => g.name) || (config.frenchOnly ? [] : raw.genres), poster, background,
        logo: name !== raw.name ? null : raw.logo };
    } catch { return config.frenchOnly ? { ...raw, description: '', genres: [], logo: null } : raw; }
  }
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
        const metas = await parallel((data.metas || []).slice(0, Math.min(100, limit)), m => localize(m, c.type));
        return metas.map(m => media(m, c.type)).filter(Boolean);
      });
    });
    let discovery = [];
    if (search && config.metadata) {
      try { discovery = (await metadataJSON('search?query=' + encodeURIComponent(search))).results.filter(m => ['movie', 'tv'].includes(m.mediaType)).map(m => ({
        ...m, Id: 'seerr_' + m.mediaType + '_' + m.id, Name: m.title || m.name, Type: m.mediaType === 'tv' ? 'Series' : 'Movie',
        seerr: true, Overview: m.overview || '', ProductionYear: Number((m.releaseDate || m.firstAirDate || '').slice(0, 4)) || undefined,
        CommunityRating: m.voteAverage, Genres: [], UserData: {}
      })); } catch { /* Catalogues remain usable. */ }
    }
    return [...new Map([...lists.flat(), ...discovery].map(m => [m.Id, m])).values()].slice(0, Math.min(500, limit));
  }
  async function meta(key) {
    const { type, id } = decodeId(key);
    const candidates = (await manifests()).filter(a => supports(a.manifest, 'meta', type, id));
    for (const { base } of candidates) {
      try { const data = await cached(base + '/meta/' + key, 60000, () => readJSON(`${base}/meta/${type}/${encodeURIComponent(id)}.json`)); if (data.meta) { const raw = await localize(data.meta, type); return { raw, item: media(raw, type) }; } } catch { /* Try another provider. */ }
    }
    throw new Error('Métadonnées indisponibles');
  }
  async function episodes(key) {
    const { raw, item } = await meta(key);
    const localizedSeasons = new Map();
    if (raw.moviedb_id) await parallel([...new Set((raw.videos || []).map(v => v.season).filter(Number.isInteger))], async season => {
      try { const data = await metadataJSON('tv/' + encodeURIComponent(raw.moviedb_id) + '/season/' + season); if (data) localizedSeasons.set(season, data.episodes || []); } catch { /* Keep available metadata. */ }
    });
    return (raw.videos || []).filter(v => v.id && Number.isInteger(v.season) && Number.isInteger(v.episode)).map(v => ({
      ...item, Id: encodeId('series', v.id), Type: 'Episode', Name: v.title || v.name || `Épisode ${v.episode}`,
      SeriesId: item.Id, SeriesName: item.Name, ParentIndexNumber: v.season, IndexNumber: v.episode,
      Overview: v.overview || item.Overview, PremiereDate: v.released,
      stremioArt: { ...item.stremioArt, Primary: httpUrl(v.thumbnail)?.href || item.stremioArt.Primary }
    })).map(episode => {
      const info = (localizedSeasons.get(episode.ParentIndexNumber) || []).find(e => (e.episodeNumber ?? e.episode_number) === episode.IndexNumber);
      return info ? { ...episode, Name: info.name || episode.Name, Overview: info.overview || episode.Overview } : episode;
    }).sort((a, b) => a.ParentIndexNumber - b.ParentIndexNumber || a.IndexNumber - b.IndexNumber);
  }
  async function streams(key) {
    const { type, id } = decodeId(key);
    const addons = (await manifests()).filter(a => supports(a.manifest, 'stream', type, id));
    const lists = await parallel(addons, ({ base }) => cached(base + '/stream/' + key, 30000, async () => {
      const data = await readJSON(`${base}/stream/${type}/${encodeURIComponent(id)}.json`);
      return (data.streams || []).filter(s => httpUrl(s.url) && !s.behaviorHints?.notWebReady && (!config.frenchOnly || isFrenchStream(s)) && !/rd\s+download/i.test(s.name || '')).map(s => {
        const headers = {};
        for (const [name, value] of Object.entries(s.behaviorHints?.proxyHeaders?.request || {})) {
          if (['user-agent', 'referer', 'origin', 'authorization', 'cookie'].includes(name.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[name.toLowerCase()] = value;
        }
        return { url: s.url, headers, priority: streamPriority(s) };
      });
    }));
    return [...new Map(lists.flat().sort((a, b) => b.priority - a.priority).map(s => [s.url + JSON.stringify(s.headers), s])).values()].map(({ url, headers }) => ({ url, headers }));
  }
  async function search(query) {
    if (!query?.trim()) return { results: [] };
    return await metadataJSON('search?query=' + encodeURIComponent(query.trim())) || { results: [] };
  }
  async function resolveMedia({ id, tmdbId, type = 'movie' }) {
    if (!['movie', 'series'].includes(type)) throw new Error('Type invalide');
    if (id?.startsWith('stremio~')) return meta(id);
    if (/^tt\d+$/.test(id || '')) return meta(encodeId(type, id));
    if (!/^\d+$/.test(String(tmdbId || ''))) throw new Error('Identifiant TMDB absent');
    const data = await metadataJSON((type === 'series' ? 'tv' : 'movie') + '/' + tmdbId);
    const imdb = data?.externalIds?.imdbId || data?.externalIds?.imdb_id || data?.imdbId;
    if (!/^tt\d+$/.test(imdb || '')) throw new Error('Identifiant IMDb indisponible');
    return meta(encodeId(type, imdb));
  }
  async function requestMedia({ id, tmdbId, type = 'movie' }) {
    if (!config.metadata?.seerrUrl || !config.metadata?.seerrApiKey) throw Object.assign(new Error('Seerr non configuré'), { status: 503 });
    if (!['movie', 'series'].includes(type)) throw Object.assign(new Error('Type invalide'), { status: 400 });
    const raw = id && !tmdbId ? (await meta(id)).raw : null;
    const mediaId = Number(tmdbId || raw?.moviedb_id);
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0) throw Object.assign(new Error('Identifiant TMDB absent'), { status: 400 });
    const base = httpUrl(config.metadata.seerrUrl); if (!base) throw new Error('Seerr non configuré');
    const result = await readJSON(base.href.replace(/\/$/, '') + '/api/v1/request', { 'X-Api-Key': config.metadata.seerrApiKey, 'Content-Type': 'application/json' }, {
      method: 'POST', body: { mediaType: type === 'series' ? 'tv' : 'movie', mediaId, ...(type === 'series' ? { seasons: 'all' } : {}) }
    });
    return { ok: true, requestId: result.id, status: result.status };
  }
  function ticket(stream) {
    for (const [id, entry] of tickets) if (entry.until < Date.now()) tickets.delete(id);
    if (tickets.size >= 10000) tickets.delete(tickets.keys().next().value);
    const id = randomBytes(24).toString('hex'); tickets.set(id, { ...stream, until: Date.now() + 4 * 3600000 });
    return '/api/stremio/media/' + id;
  }
  function getTicket(id) { const entry = tickets.get(id); return entry && entry.until > Date.now() ? entry : null; }
  return { enabled, catalog, meta, episodes, streams, ticket, getTicket, resolveMedia, requestMedia, search };
}
module.exports = { createStremio, encodeId, decodeId, supports, baseUrl, media, streamPriority, isFrenchStream };
