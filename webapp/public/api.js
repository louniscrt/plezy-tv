/* Adaptation des clients JellyfinClient.kt et SeerrClient.kt pour le navigateur. */
(() => {
  'use strict';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const config = read('plezy.web.config', { server: '', token: '', user: '', name: '', seerr: '', seerrKey: '', seerrCookie: '' });
  const device = localStorage.getItem('plezy.web.device') || (crypto.randomUUID ? crypto.randomUUID() : 'web-' + Date.now());
  localStorage.setItem('plezy.web.device', device);
  const save = () => localStorage.setItem('plezy.web.config', JSON.stringify(config));
  function normalize(value) {
    let input = value.trim();
    if (!input) throw new Error('Indiquez l’adresse du serveur.');
    if (!/^https?:\/\//i.test(input)) input = 'http://' + input;
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Adresse du serveur invalide.');
    url.hash = ''; url.search = '';
    url.pathname = url.pathname.replace(/\/web(?:\/.*)?$/i, '').replace(/\/$/, '');
    return url.href.replace(/\/$/, '');
  }
  const proxy = url => /^\/api\/stremio\/(media|hls)\//.test(String(url)) ? url : '/proxy?url=' + encodeURIComponent(url);
  const endpoint = (base, route, params = {}) => {
    const url = new URL(base + '/' + route.replace(/^\//, ''));
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null) url.searchParams.set(key, value); });
    return url.href;
  };
  async function request(base, route, { method = 'GET', body, params, auth = true, seerr = false, signal } = {}) {
    if (typeof location !== 'undefined' && location.protocol === 'file:') throw new Error('Ouvrez Plezy avec son lanceur start.bat, puis utilisez http://localhost:8090. La connexion ne fonctionne pas en ouvrant directement index.html.');
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (seerr) {
      if (config.seerrKey) headers['X-Api-Key'] = config.seerrKey;
      if (config.seerrCookie) headers['X-Cookie'] = config.seerrCookie;
    } else {
      headers['X-Emby-Authorization'] = `MediaBrowser Client="Plezy Web", Device="Web Browser", DeviceId="${device}", Version="1.0.0"${auth && config.token ? `, Token="${config.token}"` : ''}`;
      headers.Authorization = headers['X-Emby-Authorization'];
    }
    const response = await fetch(proxy(endpoint(base, route, params)), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(25000), cache: 'no-store' });
    if (!response.ok) {
      if ([404,405].includes(response.status) && response.headers.get('x-plezy-relay') !== '1') {
        let relayAvailable = false;
        try {
          const check = await fetch('/health', { cache:'no-store', signal:AbortSignal.timeout(3000) });
          const info = check.ok ? await check.json() : {};
          relayAvailable = info.service === 'plezy-web' && info.relay === true;
        } catch { /* Un hébergement statique ne fournit pas le relais Node.js. */ }
        if (!relayAvailable) {
          const error = new Error('Le relais Plezy /proxy est absent ou inaccessible sur cet hébergement. Utilisez le conteneur Plezy Node.js complet, pas uniquement les fichiers public dans Nginx.');
          error.status = response.status; error.code = 'PLEZY_RELAY_UNAVAILABLE'; throw error;
        }
      }
      const error = new Error(response.status === 401 ? 'Connexion refusée ou expirée. Vérifiez vos identifiants.' : response.status === 403 ? 'Votre compte n’a pas accès à cette action.' : `Le serveur a renvoyé une erreur (${response.status}).`);
      error.status = response.status; throw error;
    }
    if (seerr && response.headers.get('x-set-cookie')) { config.seerrCookie = response.headers.get('x-set-cookie'); save(); }
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new Error('Réponse inattendue. Vérifiez l’adresse du serveur.'); }
  }
  const nativeJf = (route, options) => request(config.server, route, options);
  const jf = (route, options = {}) => stremioRequest(route, options);
  const seerr = (route, options = {}) => request(config.seerr, '/api/v1/' + route, { ...options, seerr: true });
  const fields = 'Overview,Genres,People,MediaSources,MediaStreams,Chapters,ProviderIds,PrimaryImageAspectRatio,ChildCount';
  const items = async params => (await jf(`/Users/${config.user}/Items`, { params: { Recursive: true, IncludeItemTypes: 'Movie,Series', Fields: fields, Limit: 60, ...params } })).Items || [];
  function image(item, type = 'Backdrop', width = 780) {
    if (!item) return '';
    if (item.stremio && !item.offline) return item.stremioArt?.[type] ? proxy(item.stremioArt[type]) : '';
    if (item.offline) return type === 'Logo' ? '' : item.art || '';
    if (item.demo) return type === 'Logo' ? '' : item.art;
    if (item.seerr) {
      const img = type === 'Primary' ? item.posterPath : item.backdropPath || item.posterPath;
      return img ? `https://image.tmdb.org/t/p/${type === 'Primary' ? 'w342' : 'w1280'}${img}` : '';
    }
    let id = item.Id, tag;
    if (type === 'Backdrop') {
      tag = item.BackdropImageTags?.[0];
      if (!tag && item.ParentBackdropItemId) { id = item.ParentBackdropItemId; tag = item.ParentBackdropImageTags?.[0]; }
      if (!tag) type = 'Primary';
    }
    if (type !== 'Backdrop') tag = item.ImageTags?.[type];
    if (type === 'Logo' && !tag) return '';
    return proxy(endpoint(config.server, `/Items/${id}/Images/${type}${type === 'Backdrop' ? '/0' : ''}`, { maxWidth: width, quality: 90, tag, api_key: config.token }));
  }
  function isWatchable(item) {
    if (!item) return false;
    if (!item.seerr) return true;
    if (item.mediaInfo?.status === 4 || item.mediaInfo?.status === 5) return true;
    const currentYear = new Date().getFullYear();
    const year = Number(item.ProductionYear || (item.releaseDate ? String(item.releaseDate).slice(0, 4) : 0));
    if (year && year > currentYear) return false;
    if (item.releaseDate && new Date(item.releaseDate).getTime() > Date.now()) return false;
    const status = String(item.status || '').toLowerCase();
    if (['planned', 'in production', 'announced', 'upcoming', 'canceled', 'rumored'].includes(status)) return false;
    return true;
  }
  function fromSeerr(item, type) {
    return { ...item, Id: 'seerr-' + (item.mediaType || type || (item.name ? 'tv' : 'movie')) + '-' + item.id,
      Name: item.title || item.name, Type: (item.mediaType || type || (item.name ? 'tv' : 'movie')) === 'tv' ? 'Series' : 'Movie',
      Overview: item.overview, ProductionYear: Number((item.releaseDate || item.firstAirDate || '').slice(0, 4)) || '',
      CommunityRating: item.voteAverage, Genres: (item.genres || []).map(g => g.name), seerr: true,
      RunTimeTicks: (item.runtime || item.episodeRunTime?.[0] || 0) * 600000000,
      People: (item.credits?.cast || []).slice(0, 16).map(p => ({ Name: p.name, Role: p.character, photo: p.profilePath ? 'https://image.tmdb.org/t/p/w185' + p.profilePath : '' })) };
  }

  let stremioEnabled = false;
  const known = new Map();
  const historyKey = () => 'plezy.web.stremio.history.' + (config.server || 'local') + ':' + (config.user || 'local');
  const history = () => read(historyKey(), []);
  const isStremio = id => String(id || '').startsWith('stremio~');
  function remember(item) {
    const saved = history().find(i => i.Id === item.Id);
    const result = { ...item, UserData: { ...item.UserData, ...saved?.UserData } };
    known.set(item.Id, result); return result;
  }
  async function stremio(route, params = {}, signal) {
    const query = new URLSearchParams(params);
    const response = await fetch('/api/stremio/' + route + '?' + query, { signal: signal || AbortSignal.timeout(55000), cache: 'no-store' });
    if (!response.ok) throw new Error('Addon indisponible. Vérifiez la configuration Stremio et Real-Debrid.');
    return response.json();
  }
  function updateHistory(id, change) {
    const previous = history();
    const item = known.get(id) || previous.find(i => i.Id === id);
    if (item) {
      const normalized = { ...change };
      if (item.RunTimeTicks > 0 && normalized.PlaybackPositionTicks >= item.RunTimeTicks * 0.95) {
        normalized.PlaybackPositionTicks = 0;
        normalized.Played = true;
      }
      const updated = { ...item, UserData: { ...item.UserData, ...normalized } };
      known.set(id, updated);
      localStorage.setItem(historyKey(), JSON.stringify([updated, ...previous.filter(i => i.Id !== id)].slice(0, 200)));
    }
    return {};
  }
  async function stremioRequest(route, options = {}) {
    const p = options.params || {}, id = route.split('/').at(-1);
    if (route.startsWith('/Sessions/Playing') && isStremio(options.body?.ItemId)) return updateHistory(options.body.ItemId, { PlaybackPositionTicks: options.body.PositionTicks || 0, LastPlayedDate: new Date().toISOString() });
    if (/\/(FavoriteItems|PlayedItems)\//.test(route) && isStremio(id)) return updateHistory(id, { [route.includes('/FavoriteItems/') ? 'IsFavorite' : 'Played']: options.method === 'POST' });
    if (route.endsWith('/Items/Resume')) {
      const own = history().filter(i => i.UserData?.PlaybackPositionTicks > 0 && !i.UserData?.Played && (!p.ParentId || i.SeriesId === p.ParentId));
      const native = config.server && config.token ? await nativeJf(route, options).catch(error => { if (!stremioEnabled) throw error; return { Items: [] }; }) : { Items: [] };
      return { ...native, Items: [...(native.Items || []), ...own] };
    }
    if (isStremio(p.SeriesId) || route.endsWith('/Similar') && isStremio(route.split('/').at(-2))) return { Items: [] };
    if (route.startsWith('/Shows/') && isStremio(route.split('/')[2])) {
      const series = route.split('/')[2];
      const list = (await stremio('episodes', { id: series }, options.signal)).Items.map(remember);
      if (route.endsWith('/Seasons')) {
        const nums = [...new Set(list.map(i => i.ParentIndexNumber))].sort((a, b) => (a === 0 ? 9999 : a) - (b === 0 ? 9999 : b));
        return { Items: nums.map(n => ({ Id: series + '~season~' + n, IndexNumber: n, Name: n === 0 ? 'Épisodes spéciaux' : 'Saison ' + n })) };
      }
      const season = p.SeasonId ? Number(p.SeasonId.split('~season~').at(-1)) : undefined;
      return { Items: list.filter(i => season === undefined || i.ParentIndexNumber === season) };
    }
    if (isStremio(id) && route.includes('/Items/')) return remember(await stremio('meta', { id }, options.signal));
    if (route.endsWith('/Items') && stremioEnabled) {
      const native = config.server && config.token ? await nativeJf(route, options).catch(error => { if (!stremioEnabled) throw error; return { Items: [] }; }) : { Items: [] };
      let extra;
      if (p.Filters) extra = history().filter(i => p.Filters === 'IsFavorite' ? i.UserData?.IsFavorite : p.Filters === 'IsUnplayed' ? !i.UserData?.Played : false);
      else if (p.AnyProviderIdEquals) extra = [];
      else extra = (await stremio('catalog', { ...(p.IncludeItemTypes === 'Movie' ? { type: 'movie' } : p.IncludeItemTypes === 'Series' ? { type: 'series' } : {}), search: p.SearchTerm || '', skip: p.StartIndex || 0, limit: p.Limit || 100 }, options.signal)).Items.map(remember);
      let discovered = [];
      if (p.SearchTerm) { try { discovered = (await stremio('search', { search: p.SearchTerm }, options.signal)).results.filter(i => i.mediaType === 'movie' || i.mediaType === 'tv').map(i => fromSeerr(i)).filter(isWatchable); } catch { /* Other providers remain available. */ } }
      let items = [...(native.Items || []), ...extra, ...discovered].filter(isWatchable);
      if (p.IncludeItemTypes === 'Movie') items = items.filter(i => i.Type === 'Movie');
      if (p.IncludeItemTypes === 'Series') items = items.filter(i => i.Type === 'Series');
      if (p.SortBy === 'SortName') items.sort((a, b) => a.Name.localeCompare(b.Name));
      return { ...native, Items: [...new Map(items.map(i => [(i.Type === 'Series' ? 'series:' : 'movie:') + (i.ProviderIds?.Tmdb || (i.seerr ? i.id : i.Id)), i])).values()] };
    }
    return nativeJf(route, options);
  }

  window.PlezyAPI = { config, save, read, normalize, proxy, endpoint, request, jf, seerr, items, image, fromSeerr, device, fields,
    stremio,
    async resolveStremio(item) {
      if (item.stremio) return item;
      const result = await stremio('resolve', { type: item.Type === 'Series' ? 'series' : 'movie', ...(item.ProviderIds?.Imdb ? { id: item.ProviderIds.Imdb } : { tmdbId: item.seerr ? item.id : item.ProviderIds?.Tmdb }) });
      return remember(result.item);
    },
    async requestDownload(item) {
      const response = await fetch('/api/stremio/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: item.Type === 'Series' ? 'series' : 'movie', ...(item.stremio ? { id: item.Id } : { tmdbId: item.seerr ? item.id : item.ProviderIds?.Tmdb }) }), signal: AbortSignal.timeout(30000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'La demande Seerr a échoué.'); return data;
    },
    async initStremio() { try { stremioEnabled = (await stremio('status')).enabled === true; } catch { stremioEnabled = false; } return stremioEnabled; },
    async login(server, username, password) {
      const base = normalize(server);
      const result = await request(base, '/Users/AuthenticateByName', { method: 'POST', body: { Username: username.trim(), Pw: password }, auth: false });
      this.session(base, result);
    },
    profiles() {
      const profiles = read('plezy.web.profiles', []);
      return Array.isArray(profiles) ? profiles.filter(p => p && typeof p.server === 'string' && typeof p.user === 'string' && typeof p.token === 'string' && p.token && p.user) : [];
    },
    rememberProfile() {
      if (!config.token || !config.user || config.demo) return;
      const profiles = this.profiles().filter(p => p.server !== config.server || p.user !== config.user);
      profiles.push({ server: config.server, user: config.user, token: config.token, name: config.name });
      localStorage.setItem('plezy.web.profiles', JSON.stringify(profiles));
    },
    async selectProfile(server, user) {
      const selected = this.profiles().find(p => p.server === server && p.user === user);
      if (!selected) throw new Error('Profil introuvable.');
      const response = await fetch(proxy(endpoint(selected.server, '/Users/Me')), { headers: { Accept: 'application/json', Authorization: `MediaBrowser Client="Plezy Web", Device="Web Browser", DeviceId="${device}", Version="1.0.0", Token="${selected.token}"` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (!response.ok) throw new Error('Profil indisponible ou session expirée. Reconnectez ce compte.');
      const account = await response.json();
      if (account.Id !== selected.user) throw new Error('La session ne correspond pas à ce profil.');
      this.rememberProfile();
      Object.assign(config, selected, { demo: false, seerrKey: '', seerrCookie: '' });
      known.clear(); save();
    },
    removeProfile(server, user) {
      localStorage.setItem('plezy.web.profiles', JSON.stringify(this.profiles().filter(p => p.server !== server || p.user !== user)));
      if (config.server === server && config.user === user) this.logout();
    },
    session(server, result) {
      if (!result.AccessToken || !result.User?.Id) throw new Error('Session Jellyfin invalide.');
      this.rememberProfile();
      Object.assign(config, { server, token: result.AccessToken, user: result.User.Id, name: result.User.Name, demo: false, seerrKey: '', seerrCookie: '' });
      known.clear(); save(); this.rememberProfile();
    },
    logout() { Object.assign(config, { token: '', user: '', name: '', demo: false, seerrKey: '', seerrCookie: '' }); save(); },
    async details(item) { if (item.seerr && stremioEnabled) return remember((await stremio('resolve', { tmdbId: item.id, type: item.Type === 'Series' ? 'series' : 'movie' })).item); if (item.stremio && !item.offline) return item.Type === 'Episode' ? remember(item) : remember(await stremio('meta', { id: item.Id })); return item.demo || item.offline ? item : item.seerr ? fromSeerr(await seerr(`${item.Type === 'Series' ? 'tv' : 'movie'}/${item.id}`, { params: { language: 'fr' } }), item.Type === 'Series' ? 'tv' : 'movie') : jf(`/Users/${config.user}/Items/${item.Id}`); },
    async discover(route) { const data = await seerr(route, { params: { language: 'fr' } }); return (data.results || []).filter(i => i.mediaType !== 'person').map(i => fromSeerr(i)).filter(isWatchable); }
  };
})();
