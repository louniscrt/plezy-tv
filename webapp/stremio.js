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
function parseRuntimeTicks(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value * 600000000);
  const text = String(value || '').trim();
  if (!text) return 0;
  const hm = /(\d+)\s*h(?:r|rs|our|ours)?\s*(?:(\d+)\s*m(?:in|ins)?)?/i.exec(text);
  if (hm) return ((parseInt(hm[1], 10) || 0) * 60 + (parseInt(hm[2], 10) || 0)) * 600000000;
  const m = /(\d+)\s*(?:min|m\b)/i.exec(text) || /^(\d+)$/.exec(text);
  return m ? (parseInt(m[1], 10) || 0) * 600000000 : 0;
}
function media(meta, type = meta.type) {
  if (!meta.id || !meta.name || !['movie', 'series'].includes(type)) return null;
  const imdbId = String(meta.imdb_id || meta.imdbId || (String(meta.id).startsWith('tt') ? meta.id : ''));
  const tmdbId = String(meta.moviedb_id || meta.tmdb_id || meta.tmdbId || (String(meta.id).startsWith('tmdb:') ? meta.id.slice(5) : ''));
  return { Id: encodeId(type, meta.id), Name: meta.name, Type: type === 'series' ? 'Series' : 'Movie',
    stremio: true, ProviderIds: { ...(imdbId ? { Imdb: imdbId } : {}), ...(tmdbId ? { Tmdb: tmdbId } : {}) }, Overview: meta.description || '', ProductionYear: Number(String(meta.releaseInfo || meta.year || '').slice(0, 4)) || undefined,
    CommunityRating: Number(meta.imdbRating) || undefined, Genres: meta.genres || [],
    RunTimeTicks: parseRuntimeTicks(meta.runtime),
    stremioArt: { Primary: httpUrl(meta.poster)?.href || '', Backdrop: httpUrl(meta.background || meta.poster)?.href || '', Logo: httpUrl(meta.logo)?.href || '' },
    People: (meta.cast || []).filter(n => typeof n === 'string').map(Name => ({ Name, Type: 'Actor' })), UserData: {} };
}
// Prefer sources that older Fire TV devices and browser decoders can play directly.
function parseSizeGb(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*(gib|gb|go|mib|mb|mo)\b/i.exec(text || '');
  if (!m) return 0;
  const val = parseFloat(m[1].replace(',', '.'));
  return /m/i.test(m[2]) ? val / 1024 : val;
}
function hasExplicitFrenchAudio(stream) {
  const languages = [stream.language, ...(Array.isArray(stream.languages) ? stream.languages : [])].filter(v => typeof v === 'string').map(v => v.toLowerCase());
  if (languages.some(v => /^(fr|fra|fre|french|francais|français)(?:[-_].*)?$/.test(v))) return true;
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  const release = stream.behaviorHints?.filename || stream.title || '';
  const marker = /(?:19|20)\d{2}|(?:2160|1080|720|576|480)p/i.exec(release);
  const tags = marker ? release.slice(marker.index + marker[0].length) : release;
  const strong = /(?:^|[^a-z0-9])(?:truefrench|vff|vfq|vf2|vfi|vf|fra|fre|fr)(?:$|[^a-z0-9])/i;
  const french = /(?:^|[^a-z0-9])(?:french|fran[cç]ais)(?:$|[^a-z0-9])/i;
  return strong.test(release) || french.test(tags) || /(?:audio|language|langue)\s*[:=-]\s*(?:french|fran[cç]ais|fr)\b/i.test(text);
}
function isTrueFrenchStream(stream) {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  return /(?:^|[^a-z0-9])(?:truefrench|vff)\b/i.test(text);
}
function isVfqStream(stream) {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  return /(?:^|[^a-z0-9])(?:vfq|vf2)\b/i.test(text) && !isTrueFrenchStream(stream);
}
function isFrenchStream(stream) {
  if (hasExplicitFrenchAudio(stream)) return true;
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  return text.includes('🇫🇷');
}
function isEnglishStream(stream) {
  const languages = [stream.language, ...(Array.isArray(stream.languages) ? stream.languages : [])].filter(v => typeof v === 'string').map(v => v.toLowerCase());
  if (languages.some(v => /^(en|eng|english|anglais)(?:[-_].*)?$/.test(v))) return true;
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  if (text.includes('🇬🇧') || text.includes('🇺🇸')) return true;
  const release = stream.behaviorHints?.filename || stream.title || '';
  const marker = /(?:19|20)\d{2}|(?:2160|1080|720|576|480)p/i.exec(release);
  const tags = marker ? release.slice(marker.index + marker[0].length) : release;
  return /(?:^|[^a-z0-9])(?:english|anglais|eng|en)(?:$|[^a-z0-9])/i.test(tags) || /(?:audio|language|langue)\s*[:=-]\s*(?:english|anglais|eng|en)\b/i.test(text);
}
function isMultiStream(stream) {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  const release = stream.behaviorHints?.filename || stream.title || '';
  if (/\bvostfr\b/i.test(release) && !/\b(multi|dual|vff|vfq|vfi|vf|truefrench)\b/i.test(release)) return false;
  return /(?:^|[^a-z0-9])(?:multi\d*|dual(?:[ ._-]?audio)?)(?:$|[^a-z0-9])/i.test(release) || /\b(?:multi|dual\s*audio)\b/i.test(text);
}
function isHighResStream(stream) {
  const info = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ').toLowerCase();
  return /2160p|\b4k\b|\buhd\b|1080p/.test(info);
}
function isLowResStream(stream) {
  const info = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ').toLowerCase();
  return /\b(?:720p|576p|480p|360p|cam|hdcam|ts|telesync|scr|dvdscr)\b/.test(info) && !/2160p|\b4k\b|\buhd\b|1080p/.test(info);
}
function streamPriority(stream) {
  const rawText = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join(' ');
  const info = rawText.toLowerCase();
  const sizeGb = stream.behaviorHints?.videoSize ? stream.behaviorHints.videoSize / (1024 * 1024 * 1024) : parseSizeGb(info);
  const sizeScore = sizeGb > 0 ? (sizeGb >= 0.8 && sizeGb <= 14 ? 50 : sizeGb <= 22 ? 20 : sizeGb > 26 ? -95 : sizeGb > 22 ? -45 : sizeGb < 0.25 ? -140 : 0) : 0;
  const remuxPenalty = /\b(?:remux|bdremux|brremux|uhd[ ._-]?remux|complete[ ._-]?bluray)\b/.test(info) ? -90 : 0;
  const webBonus = /\b(?:web[ ._-]?dl|webrip)\b/.test(info) ? 40 : /\b(?:bluray|bdrip)\b/.test(info) ? 20 : 0;
  
  const fr = isFrenchStream(stream);
  const trueFr = isTrueFrenchStream(stream);
  const vfq = isVfqStream(stream);
  const multi = isMultiStream(stream);

  let langScore = 0;
  if (trueFr) {
    langScore = 140;
  } else if (multi && fr) {
    langScore = 120;
  } else if (fr && !vfq) {
    langScore = 85;
  } else if (vfq) {
    langScore = -30;
  } else {
    const manyForeignFlags = (rawText.match(/🇯🇵|🇷🇺|🇮🇹|🇵🇹|🇪🇸|🇰🇷|🇨🇳|🇸🇦|🇹🇷|🇵🇱|🇨🇿|🇩🇪|🇮🇳|🇺🇦/g) || []).length >= 3;
    langScore = manyForeignFlags ? -75 : 0;
  }

  const dualBonus = fr && (multi || isEnglishStream(stream)) ? 30 : 0;
  const resScore = /1080p/.test(info) ? 90 : /2160p|\b4k\b|\buhd\b/.test(info) ? 55 : /720p/.test(info) ? -60 : /\b(?:480p|576p|360p)\b/.test(info) ? -140 : 0;
  const camPenalty = /\b(?:cam|camrip|hdcam|telesync|hdts|hdtscr|telecine|tc|scr|dvdscr|r5|screener)\b/.test(info) ? -500 : 0;

  return (/h[ ._-]?264|x264|avc/.test(info) ? 120 : 0) +
    (/\.mp4\b/.test(info) ? 45 : /\.webm\b/.test(info) ? 20 : 0) +
    resScore -
    (/hevc|h[ ._-]?265|x265|av1|dolby.?vision|dovi/.test(info) ? 25 : 0) +
    sizeScore + remuxPenalty + webBonus + langScore + dualBonus + camPenalty;
}
async function parallel(values, fn, concurrency = 8) {
  let next = 0; const results = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) { const index = next++; try { results[index] = await fn(values[index]); } catch { results[index] = null; } }
  }));
  return results.filter(Boolean);
}
function isWatchableMeta(m) {
  if (!m) return false;
  if (m.mediaInfo?.status === 4 || m.mediaInfo?.status === 5) return true;
  const currentYear = new Date().getFullYear();
  const relStr = m.releaseDate || m.firstAirDate || m.releaseInfo;
  const year = Number(m.ProductionYear || (relStr ? String(relStr).slice(0, 4) : 0));
  if (year && year > currentYear) return false;
  if (m.releaseDate) {
    const rel = new Date(m.releaseDate);
    if (!isNaN(rel.getTime()) && rel.getTime() > Date.now()) return false;
  }
  const status = String(m.status || '').toLowerCase();
  if (['planned', 'in production', 'announced', 'upcoming', 'canceled', 'rumored'].includes(status)) return false;
  if (!m.poster && !m.posterPath && !m.backdropPath && !m.background && !m.overview && !m.description) return false;
  return true;
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
    const response = await fetch(url, { method: options.method || 'GET', body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(options.timeout || 10000), headers: { Accept: 'application/json', ...headers } });
    if (!response.ok) throw Object.assign(new Error('Service indisponible'), { status: response.status });
    const length = Number(response.headers.get('content-length'));
    if (length > 4 * 1024 * 1024) throw new Error('Réponse trop volumineuse');
    let size = 0; const parts = [];
    for await (const part of response.body) { size += part.length; if (size > 4 * 1024 * 1024) throw new Error('Réponse trop volumineuse'); parts.push(part); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  });
  function cached(key, ttl, fn) {
    const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.promise;
    if (cache.size > 4096) cache.delete(cache.keys().next().value);
    const promise = fn().catch(error => { cache.delete(key); throw error; });
    cache.set(key, { until: Date.now() + ttl, promise }); return promise;
  }
  const manifests = () => parallel(bases, base => cached(base, 1800000, async () => ({ base, manifest: await readJSON(base + '/manifest.json', {}, { timeout: 6000 }) })));
  let metadataActive = 0; const metadataQueue = [];
  async function metadataJSON(route) {
    if (!config.metadata?.seerrUrl || !config.metadata?.seerrApiKey) return null;
    const base = httpUrl(config.metadata.seerrUrl);
    if (!base) return null;
    return cached('fr:' + route, 86400000, async () => {
      if (metadataActive >= 10) await new Promise(resolve => metadataQueue.push(resolve));
      metadataActive++;
      try { const url = new URL(base.href.replace(/\/$/, '') + '/api/v1/' + route); url.searchParams.set('language', 'fr');
        return await readJSON(url.href, { 'X-Api-Key': config.metadata.seerrApiKey }, { timeout: 3500 }); }
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
      const tmdbRuntime = Number(data.runtime) || (Array.isArray(data.episodeRunTime) ? Number(data.episodeRunTime[0]) : 0);
      return { ...raw, name, description: data.overview || (config.frenchOnly ? '' : raw.description),
        genres: data.genres?.map(g => g.name) || (config.frenchOnly ? [] : raw.genres), poster, background,
        runtime: tmdbRuntime > 0 ? `${tmdbRuntime} min` : raw.runtime,
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
    const ttl = search ? 60000 : 900000;
    const perCatalogLimit = search ? Math.min(40, limit) : Math.min(60, limit);
    const lists = await parallel(jobs, ({ base, c }) => {
      const extra = [search ? 'search=' + encodeURIComponent(search) : '', skip ? 'skip=' + skip : ''].filter(Boolean).join('&');
      if (skip && !(c.extra || []).some(e => e.name === 'skip')) return [];
      return cached(base + c.type + c.id + extra, ttl, async () => {
        const data = await readJSON(`${base}/catalog/${c.type}/${encodeURIComponent(c.id)}${extra ? '/' + extra : ''}.json`, {}, { timeout: 6000 });
        const metas = await parallel((data.metas || []).slice(0, perCatalogLimit), m => localize(m, c.type), 10);
        return metas.map(m => media(m, c.type)).filter(Boolean);
      });
    });
    let discovery = [];
    if (search && config.metadata) {
      try {
        const rawResults = (await metadataJSON('search?query=' + encodeURIComponent(search)))?.results || [];
        discovery = rawResults
          .filter(m => ['movie', 'tv'].includes(m.mediaType))
          .filter(isWatchableMeta)
          .map(m => ({
            ...m, Id: 'seerr_' + m.mediaType + '_' + m.id, Name: m.title || m.name, Type: m.mediaType === 'tv' ? 'Series' : 'Movie',
            seerr: true, Overview: m.overview || '', ProductionYear: Number((m.releaseDate || m.firstAirDate || '').slice(0, 4)) || undefined,
            CommunityRating: m.voteAverage, Genres: [], UserData: {}
          }));
      } catch { /* Catalogues remain usable. */ }
    }
    return [...new Map([...lists.flat(), ...discovery].map(m => [m.Id, m])).values()].slice(0, Math.min(500, limit));
  }
  async function resolveImdbId(type, id) {
    if (!id || typeof id !== 'string') return id;
    if (id.startsWith('tt') || id.startsWith('kitsu:')) return id;

    let tmdbNum = '';
    let extra = '';
    if (id.startsWith('tmdb:')) {
      const rest = id.slice(5);
      const parts = rest.split(':');
      tmdbNum = parts[0];
      if (parts.length > 1) extra = ':' + parts.slice(1).join(':');
    } else if (/^\d+/.test(id)) {
      const parts = id.split(':');
      tmdbNum = parts[0];
      if (parts.length > 1) extra = ':' + parts.slice(1).join(':');
    }

    if (!tmdbNum) return id;

    const cacheKey = 'tmdb2imdb:' + type + ':' + tmdbNum;
    return cached(cacheKey, 86400000, async () => {
      try {
        const seerrType = type === 'series' ? 'tv' : 'movie';
        const data = await metadataJSON(`${seerrType}/${tmdbNum}`);
        const imdb = data?.externalIds?.imdbId || data?.externalIds?.imdb_id || data?.imdbId;
        if (imdb && /^tt\d+$/.test(imdb)) return imdb + extra;
      } catch { /* Try next fallback */ }

      try {
        const key = encodeId(type, 'tmdb:' + tmdbNum);
        const metaRes = await meta(key).catch(() => null);
        const raw = metaRes?.raw;
        const imdb = raw?.imdb_id || raw?.imdbId;
        if (imdb && /^tt\d+$/.test(imdb)) return imdb + extra;
      } catch { /* Fallback */ }

      return id;
    });
  }
  async function meta(key) {
    const { type, id } = decodeId(key);
    const candidates = (await manifests()).filter(a => supports(a.manifest, 'meta', type, id));
    for (const { base } of candidates) {
      try { const data = await cached(base + '/meta/' + key, 60000, () => readJSON(`${base}/meta/${type}/${encodeURIComponent(id)}.json`)); if (data.meta) { const raw = await localize(data.meta, type); return { raw, item: media(raw, type) }; } } catch { /* Try another provider. */ }
    }
    if (id.startsWith('tmdb:') || /^\d+$/.test(id)) {
      try {
        const imdbId = await resolveImdbId(type, id);
        if (imdbId && imdbId.startsWith('tt')) {
          return await meta(encodeId(type, imdbId));
        }
      } catch { /* ignore */ }
    }
    throw new Error('Métadonnées indisponibles');
  }
  async function episodes(key) {
    const { type, id } = decodeId(key);
    const { raw, item } = await meta(key);
    const localizedSeasons = new Map();
    const episodeRuntimes = new Map();
    const tasks = [];
    const tmdbShowId = raw.moviedb_id || raw.tmdb_id || (id.startsWith('tmdb:') ? id.slice(5) : null);
    if (tmdbShowId) {
      tasks.push(parallel([...new Set((raw.videos || []).map(v => v.season).filter(Number.isInteger))], async season => {
        try { const data = await metadataJSON('tv/' + encodeURIComponent(tmdbShowId) + '/season/' + season); if (data) localizedSeasons.set(season, data.episodes || []); } catch { /* Keep available metadata. */ }
      }));
    }
    const imdbShowId = raw.imdb_id || raw.imdbId || (/^tt\d+$/.test(id) ? id : null);
    if (config.metadataManifest !== false && !fetchJSON && imdbShowId) {
      tasks.push(cached('tvmaze:' + imdbShowId, 86400000, async () => {
        const show = await readJSON('https://api.tvmaze.com/lookup/shows?imdb=' + encodeURIComponent(imdbShowId));
        if (!show?.id) return [];
        return await readJSON('https://api.tvmaze.com/shows/' + encodeURIComponent(show.id) + '/episodes');
      }).then(list => {
        for (const ep of list || []) {
          if (Number.isInteger(ep.season) && Number.isInteger(ep.number) && Number(ep.runtime) > 0) {
            episodeRuntimes.set(`${ep.season}:${ep.number}`, Number(ep.runtime));
          }
        }
      }).catch(() => {}));
    }
    await Promise.all(tasks);
    return (raw.videos || []).filter(v => v.id && Number.isInteger(v.season) && Number.isInteger(v.episode)).map(v => ({
      ...item, Id: encodeId('series', v.id), Type: 'Episode', Name: v.title || v.name || `Épisode ${v.episode}`,
      SeriesId: item.Id, SeriesName: item.Name, ParentIndexNumber: v.season, IndexNumber: v.episode,
      Overview: v.overview || item.Overview, PremiereDate: v.released,
      RunTimeTicks: parseRuntimeTicks(v.runtime || episodeRuntimes.get(`${v.season}:${v.episode}`)) || item.RunTimeTicks || 0,
      stremioArt: { ...item.stremioArt, Primary: httpUrl(v.thumbnail)?.href || item.stremioArt.Primary }
    })).map(episode => {
      const info = (localizedSeasons.get(episode.ParentIndexNumber) || []).find(e => (e.episodeNumber ?? e.episode_number) === episode.IndexNumber);
      const epTicks = parseRuntimeTicks(info?.runtime ?? info?.runTime ?? episodeRuntimes.get(`${episode.ParentIndexNumber}:${episode.IndexNumber}`));
      return info ? { ...episode, Name: info.name || episode.Name, Overview: info.overview || episode.Overview, RunTimeTicks: epTicks || episode.RunTimeTicks } : (epTicks ? { ...episode, RunTimeTicks: epTicks } : episode);
    }).sort((a, b) => (a.ParentIndexNumber === 0 ? 9999 : a.ParentIndexNumber) - (b.ParentIndexNumber === 0 ? 9999 : b.ParentIndexNumber) || a.IndexNumber - b.IndexNumber);
  }
  async function streams(key, options = {}) {
    const { type, id: rawId } = decodeId(key);
    const id = await resolveImdbId(type, rawId);
    let targetYear = options.year;
    if (!targetYear) {
      try {
        const hit = [...cache.entries()].find(([k]) => k.includes('/meta/' + key) || (rawId !== id && k.includes('/meta/' + encodeId(type, id))));
        if (hit) {
          const val = await Promise.resolve(hit[1].promise).catch(() => null);
          targetYear = Number(val?.item?.ProductionYear || val?.meta?.releaseInfo || val?.meta?.year || 0) || undefined;
        }
      } catch { /* ignore */ }
    }
    const addons = (await manifests()).filter(a => supports(a.manifest, 'stream', type, id) || (rawId !== id && supports(a.manifest, 'stream', type, rawId)));
    const lists = await parallel(addons, ({ base, manifest }) => {
      const queryId = supports(manifest, 'stream', type, id) ? id : rawId;
      const cacheId = rawId !== id ? `${rawId}~${queryId}` : queryId;
      return cached(base + '/stream/all/' + encodeId(type, cacheId), 30000, async () => {
        const data = await readJSON(`${base}/stream/${type}/${encodeURIComponent(queryId)}.json`, {}, { timeout: 4500 });
        return (data.streams || []).filter(s => {
          if (!httpUrl(s.url) || s.behaviorHints?.notWebReady || /rd\s+download/i.test(s.name || '')) return false;
          const name = String(s.name || '');
          const title = String(s.title || '');
          const fn = String(s.behaviorHints?.filename || '');
          const all = (name + ' ' + title + ' ' + fn).toLowerCase();

          if (/\[❌\]|\b(?:uncached|not\s*cached|download\s*failed)\b/i.test(name || title)) return false;
          if (/\b(?:watch\s+.*\s+free|flixmomo|fmovies|123movies)\b/i.test(all) || /\.(?:exe|rar|zip|iso|txt|nfo)$/i.test(fn)) return false;
          if (/^(?:ncop|nced|sample|trailer)\b/i.test(fn)) return false;
          if (/\b(?:cam|camrip|hdcam|telesync|hdts|hdtscr|telecine|tc|scr|dvdscr|r5|screener)\b/i.test(all)) return false;

          if (targetYear && targetYear >= 1900) {
            const yearMatch = /\b((?:19|20)\d{2})\b/.exec(fn || title);
            if (yearMatch) {
              const streamYear = parseInt(yearMatch[1], 10);
              if (Math.abs(streamYear - targetYear) >= 2) return false;
            }
          }
          return true;
        }).map(s => {
          const headers = {};
          for (const [name, value] of Object.entries(s.behaviorHints?.proxyHeaders?.request || {})) {
            if (['user-agent', 'referer', 'origin', 'authorization', 'cookie'].includes(name.toLowerCase()) && typeof value === 'string' && !/[\r\n]/.test(value)) headers[name.toLowerCase()] = value;
          }
          const fr = isFrenchStream(s);
          const en = isEnglishStream(s);
          const multi = isMultiStream(s);
          const highRes = isHighResStream(s);
          const lowRes = isLowResStream(s);
          return { url: s.url, headers, priority: streamPriority(s), fr, en, multi, highRes, lowRes };
        });
      });
    });
    const allUnique = [...new Map(lists.flat().sort((a, b) => b.priority - a.priority).map(s => [s.url + JSON.stringify(s.headers), s])).values()];
    const hasHighRes = allUnique.some(s => s.highRes);
    const unique = hasHighRes ? allUnique.filter(s => !s.lowRes) : allUnique;
    const strip = s => ({ url: s.url, headers: s.headers });
    const frenchList = unique.filter(s => s.fr);
    const multiList = unique.filter(s => !s.fr && s.multi);
    const englishList = unique.filter(s => s.en || s.multi || !s.fr);
    if (!options.includeVariants) {
      if (!config.frenchOnly) return unique.map(strip);
      if (frenchList.length) return frenchList.map(strip);
      return (multiList.length ? multiList : unique).slice(0, 12).map(strip);
    }
    const primary = config.frenchOnly ? (frenchList.length ? frenchList : (multiList.length ? multiList : unique).slice(0, 12)) : unique;
    const primaryKeys = new Set(primary.map(s => s.url + JSON.stringify(s.headers)));
    const fallback = unique.filter(s => !primaryKeys.has(s.url + JSON.stringify(s.headers)) && (s.multi || s.en || !s.fr)).slice(0, 12);
    return {
      streams: primary.map(s => ({ url: s.url, headers: s.headers, lang: 'fr', fallback: !s.fr })),
      englishStreams: englishList.slice(0, 12).map(s => ({ url: s.url, headers: s.headers, lang: 'en', fallback: true })),
      fallbackStreams: fallback.map(s => ({ url: s.url, headers: s.headers, lang: s.fr ? 'fr' : 'en', fallback: true }))
    };
  }
  async function subtitles(key) {
    const { type, id: rawId } = decodeId(key);
    const id = await resolveImdbId(type, rawId);
    const subAddons = (await manifests()).filter(a => supports(a.manifest, 'subtitles', type, id) || (rawId !== id && supports(a.manifest, 'subtitles', type, rawId))).map(a => ({ base: a.base, manifest: a.manifest }));
    if (config.metadataManifest !== false && !subAddons.some(a => a.base.includes('opensubtitles'))) {
      subAddons.push({ base: 'https://opensubtitles-v3.strem.io', manifest: { resources: ['subtitles'], types: ['movie', 'series'], idPrefixes: ['tt'] } });
    }
    const lists = await parallel(subAddons, ({ base, manifest }) => {
      const queryId = supports(manifest, 'subtitles', type, id) ? id : rawId;
      const cacheId = rawId !== id ? `${rawId}~${queryId}` : queryId;
      return cached(base + '/subtitles/' + encodeId(type, cacheId), 300000, async () => {
        const data = await readJSON(`${base}/subtitles/${type}/${encodeURIComponent(queryId)}.json`);
        return (data.subtitles || []).filter(s => httpUrl(s.url) && typeof s.lang === 'string');
      });
    });
    const raw = lists.flat();

    const isQualitySub = s => !/(cam|telesync|\bts\b|hdts|hdtscr|screener|\bscr\b)/i.test(s.movieReleaseName || s.subtitleFileName || '');
    const cleanSubs = raw.filter(isQualitySub).length > 0 ? raw.filter(isQualitySub) : raw;

    const scoreSub = s => {
      let score = Number(s.g || 0);
      const name = (s.movieReleaseName || s.subtitleFileName || '').toLowerCase();
      if (/bluray|bdrip|remux/i.test(name)) score += 50;
      else if (/web-dl|webrip|web\b/i.test(name)) score += 40;
      if (/(cam|telesync|\bts\b|hdts|scr)/i.test(name)) score -= 100;
      return score;
    };

    const frSubs = cleanSubs
      .filter(s => /^(fr|fra|fre|french)/i.test(s.lang))
      .sort((a, b) => scoreSub(b) - scoreSub(a))
      .slice(0, 3)
      .map((s, i) => {
        const isForced = /forc[eé]|forced/i.test(s.movieReleaseName || s.subtitleFileName || '');
        const kind = isForced ? ' (forcé - OpenSubtitles)' : (i === 0 ? ' (OpenSubtitles)' : ` (OpenSubtitles ${i + 1})`);
        return {
          url: s.url,
          lang: 'fr',
          language: 'fra',
          label: `Français${kind}`
        };
      });

    const enSubs = cleanSubs
      .filter(s => /^(en|eng|english)/i.test(s.lang))
      .sort((a, b) => scoreSub(b) - scoreSub(a))
      .slice(0, 3)
      .map((s, i) => {
        const isForced = /forc[eé]|forced/i.test(s.movieReleaseName || s.subtitleFileName || '');
        const kind = isForced ? ' (forcé - OpenSubtitles)' : (i === 0 ? ' (OpenSubtitles)' : ` (OpenSubtitles ${i + 1})`);
        return {
          url: s.url,
          lang: 'en',
          language: 'eng',
          label: `Anglais${kind}`
        };
      });

    return [...frSubs, ...enSubs];
  }
  async function search(query) {
    if (!query?.trim()) return { results: [] };
    const trimmed = query.trim();
    const yearMatch = /\b((?:19|20)\d{2})\b/.exec(trimmed);
    const searchYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const cleanQuery = searchYear ? trimmed.replace(yearMatch[0], '').replace(/\s+/g, ' ').trim() : trimmed;

    const data = await metadataJSON('search?query=' + encodeURIComponent(cleanQuery || trimmed)) || { results: [] };
    let filtered = (data.results || []).filter(isWatchableMeta);

    if (searchYear && filtered.length) {
      filtered.sort((a, b) => {
        const yA = Number((a.releaseDate || a.firstAirDate || '').slice(0, 4));
        const yB = Number((b.releaseDate || b.firstAirDate || '').slice(0, 4));
        const matchA = yA === searchYear ? 1 : 0;
        const matchB = yB === searchYear ? 1 : 0;
        return matchB - matchA;
      });
    }

    return { ...data, results: filtered };
  }
  async function resolveMedia({ id, tmdbId, type = 'movie' }) {
    if (!['movie', 'series'].includes(type)) throw new Error('Type invalide');
    if (id?.startsWith('stremio~')) return meta(id);
    if (/^tt\d+$/.test(id || '')) return meta(encodeId(type, id));
    if (id?.startsWith('tmdb:')) return meta(encodeId(type, id));
    const targetTmdb = tmdbId || (id && /^\d+$/.test(id) ? id : null);
    if (!/^\d+$/.test(String(targetTmdb || ''))) throw new Error('Identifiant TMDB absent');
    const data = await metadataJSON((type === 'series' ? 'tv' : 'movie') + '/' + targetTmdb);
    const imdb = data?.externalIds?.imdbId || data?.externalIds?.imdb_id || data?.imdbId;
    if (imdb && /^tt\d+$/.test(imdb)) {
      try {
        return await meta(encodeId(type, imdb));
      } catch {}
    }
    const fallbackRaw = {
      id: imdb || `tmdb:${targetTmdb}`,
      type,
      moviedb_id: Number(targetTmdb),
      name: data?.title || data?.name || imdb || `Titre #${targetTmdb}`,
      description: data?.overview || '',
      releaseInfo: String(data?.releaseDate || data?.firstAirDate || '').slice(0, 4),
      genres: (data?.genres || []).map(g => g.name).filter(Boolean),
      poster: data?.posterPath ? 'https://image.tmdb.org/t/p/w500' + data.posterPath : '',
      background: data?.backdropPath ? 'https://image.tmdb.org/t/p/w1280' + data.backdropPath : ''
    };
    return { raw: fallbackRaw, item: media(fallbackRaw, type) };
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
  return { enabled, catalog, meta, episodes, streams, subtitles, ticket, getTicket, resolveMedia, requestMedia, search };
}
module.exports = { createStremio, encodeId, decodeId, supports, baseUrl, media, streamPriority, isFrenchStream, isEnglishStream, isMultiStream, hasExplicitFrenchAudio, isTrueFrenchStream, isVfqStream };
