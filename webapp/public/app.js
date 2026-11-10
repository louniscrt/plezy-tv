(() => {
  'use strict';
  const A = window.PlezyAPI, C = A.config;
  const $ = id => document.getElementById(id);
  const text = (id, value) => { $(id).textContent = value || ''; };
  const el = (tag, cls, content) => { const node = document.createElement(tag); if (cls) node.className = cls; if (content !== undefined) node.textContent = content; return node; };
  const action = (label, callback, cls = 'opt') => { const b = el('button', cls, label); b.onclick = () => run(callback, b); return b; };
  let page = 'HOME', screen = 'login', hero, detail, episodes = [], pageVersion = 0, detailVersion = 0, searchVersion = 0, qcVersion = 0, lastFocus;
  let returnFocus;
  let primaryEpisode, primaryEpisodeQueue = [], detailSeasons = [], detailEpisodeCount, detailBusy = false;
  const sameId = (a,b) => String(a||'').replaceAll('-','').toLowerCase() === String(b||'').replaceAll('-','').toLowerCase();
  const detailView = window.PlezyDetail.create({A,$,el,action,picture,
    onOpen: item => run(() => openDetail(item)), onPlay: item => run(() => play(item)),
    onSeason: season => run(() => loadSeason(detail,season,detailVersion))});
  const requested = new Set();
  const listKey = () => `plezy.web.list.${C.demo ? 'demo' : C.server + ':' + C.user}`;
  const saved = () => A.read(listKey(), []);
  const isSaved = item => saved().some(i => i.Id === item.Id);
  const updateSaved = item => {
    const list = saved(); const index = list.findIndex(i => i.Id === item.Id);
    if (index < 0) list.push(item); else list.splice(index, 1);
    localStorage.setItem(listKey(), JSON.stringify(list));
    toast(index < 0 ? 'Ajouté à votre liste' : 'Retiré de votre liste');
  };
  let toastTimer;
  function toast(message) { text('toast', message); $('toast').classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), 4000); }
  async function run(fn, button) {
    if (button) button.disabled = true;
    try { await fn(); } catch (error) { toast(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'Serveur inaccessible. Vérifiez son adresse et votre connexion.' : error.message); }
    finally { if (button?.isConnected) button.disabled = false; }
  }
  function show(next, record = true) {
    const focused = document.activeElement;
    document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== 'screen-' + next && !(next === 'detail' && s.id === 'screen-main'));
    $('screen-main').inert = next !== 'main';
    if (next !== screen) {
      if (next === 'detail') returnFocus = focused;
      screen = next;
      if (record) history.pushState({ screen: next }, '', '#' + next);
    }
  }
  function closeModal() { $('modal').hidden = true; if (lastFocus?.isConnected) lastFocus.focus(); }
  function modal(title, children) {
    if ($('modal').hidden) lastFocus = document.activeElement;
    const h = el('h3', '', title); h.id = 'modalTitle';
    $('modalCard').replaceChildren(h, ...children, action('Fermer', closeModal, 'btn btn-ghost'));
    $('modal').hidden = false;
    $('modalCard').querySelector('input,button,select')?.focus();
  }
  function field(label, value = '', type = 'text') {
    const node = el('label', 'field', undefined), input = el('input');
    input.type = type; input.value = value; node.append(el('span', '', label), input);
    return { node, input };
  }
  function picture(item, type, width, cls) {
    const image = el('img', cls); image.alt = ''; image.loading = 'lazy';
    const src = A.image(item, type, width);
    if (src) image.src = src;
    image.onerror = () => image.remove(); return image;
  }
  function backdrop(id, item, type = 'Backdrop') {
    const image = $(id), src = A.image(item, type, 1600);
    image.classList.remove('on'); image.onload = () => image.classList.add('on');
    image.onerror = () => { image.removeAttribute('src'); image.classList.remove('on'); };
    if (src) image.src = src; else image.removeAttribute('src');
  }
  function meta(item) {
    return [item.ProductionYear, item.CommunityRating ? '★ ' + Number(item.CommunityRating).toFixed(1) : '', item.OfficialRating,
      item.Type === 'Series' ? 'Série' : item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 36000000000) + ' h ' + Math.round(item.RunTimeTicks / 600000000) % 60 + ' min' : 'Film', 'FR · EN', ...(item.Genres || []).slice(0, 2)].filter(Boolean).join(' · ');
  }
  function status(item) { const s = item.mediaInfo?.status; return s === 5 ? 'Disponible' : s === 4 ? 'Partiellement disponible' : requested.has(item.Id) || s === 2 || s === 3 ? 'Demandé' : 'À demander'; }
  function playLabel(item) { if (item.seerr && C.stremio) return item.Type === 'Series' ? 'Voir les épisodes' : 'Lecture'; return item.seerr ? status(item) === 'Disponible' || status(item) === 'Partiellement disponible' ? 'Voir dans Jellyfin' : status(item) === 'Demandé' ? 'Demande en cours' : 'Demander' : item.Type === 'Series' ? 'Voir les épisodes' : item.UserData?.PlaybackPositionTicks ? 'Reprendre' : 'Lecture'; }
  function tile(item, index, top = false) {
    const button = el('button', top ? 'top10' : 'tile');
    button.dataset.mediaId = item.Id;
    button.setAttribute('aria-label', item.Name + (item.Type === 'Episode' ? ' — ' + item.SeriesName : ''));
    const holder = top ? el('div', 'poster') : button;
    if (top) { button.append(el('span', 'num', index + 1), holder); }
    holder.append(el('span', 't-fallback', item.Name), picture(item, top || page === 'SEARCH' ? 'Primary' : 'Backdrop', 600));
    holder.append(el('span', 't-name', item.Name));
    if (item.seerr) holder.append(el('span', 't-seerr' + (status(item) === 'Demandé' ? ' req' : status(item) === 'Disponible' ? ' ok' : ''), status(item)));
    if (item.UserData?.PlaybackPositionTicks && item.RunTimeTicks) {
      const progress = el('span', 't-prog'), fill = el('i'); fill.style.width = Math.min(100, item.UserData.PlaybackPositionTicks / item.RunTimeTicks * 100) + '%'; progress.append(fill); holder.append(progress);
    }
    button.onclick = () => run(() => openDetail(item));
    button.onfocus = () => { if (!['SEARCH', 'MYLIST'].includes(page)) renderHero(item); };
    return button;
  }
  function row(title, items, top = false, empty = '') {
    if (!items.length && !empty) return;
    const section = el('section', 'row'); section.append(el('h2', '', title));
    if (!items.length) section.append(el('p', 'empty-row', empty));
    else {
      const wrap = el('div', 'row-wrap'), track = el('div', 'row-track');
      track.append(...items.map((i, n) => tile(i, n, top)));
      wrap.append(track, action('‹', () => track.scrollBy({ left: -track.clientWidth * .85, behavior: 'smooth' }), 'row-arrow l'), action('›', () => track.scrollBy({ left: track.clientWidth * .85, behavior: 'smooth' }), 'row-arrow r'));
      section.append(wrap);
    }
    $('rows').append(section);
  }
  function renderHero(item) {
    if (!item) { $('billboard').classList.add('hidden'); return; }
    hero = item; $('billboard').classList.remove('hidden');
    backdrop('heroImg', item); text('bbTitle', item.Name); text('bbCat', item.Type === 'Series' || item.Type === 'Episode' ? 'S É R I E' : 'F I L M');
    text('bbMeta', meta(item)); text('bbOverview', item.Overview); text('bbPlayLbl', playLabel(item)); text('bbRating', item.OfficialRating);
    text('bbCallout', C.demo ? 'Aperçu Plezy · catalogue de démonstration' : item.stremio || item.seerr && C.stremio ? 'Lecture directe · Français (Principal) · Anglais' : item.seerr ? 'Découvrir avec Seerr · Français · Anglais' : 'Dans votre bibliothèque Jellyfin · Français · Anglais');
    const logo = A.image(item, 'Logo', 600); $('bbLogo').hidden = !logo;
    if (logo) { $('bbLogo').src = logo; $('bbLogo').onerror = () => $('bbLogo').hidden = true; }
  }
  async function catalog() {
    if (C.demo) return { resume: window.PlezyDemo.slice(0, 4), movies: window.PlezyDemo.filter(i => i.Type === 'Movie'), shows: window.PlezyDemo.filter(i => i.Type === 'Series') };
    const results = await Promise.all([
      window.PlezyResume.load(A),
      A.items({ IncludeItemTypes: 'Movie', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 100 }),
      A.items({ IncludeItemTypes: 'Series', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 100 })
    ]);
    return { resume: results[0], movies: results[1], shows: results[2] };
  }
  async function navigate(next = page) {
    const version = ++pageVersion; ++searchVersion;
    page = next; show('main'); $('screen-main').classList.toggle('search-mode', next === 'SEARCH');
    document.querySelectorAll('[data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
    $('mainScroll').scrollTop = 0; $('rows').replaceChildren(); $('searchGrid').replaceChildren();
    $('searchBox').hidden = next !== 'SEARCH'; $('billboard').classList.add('hidden');
    if (next === 'SEARCH') { text('searchHint', 'Recherchez dans votre bibliothèque et dans Seerr.'); $('inSearch').focus(); if ($('inSearch').value) search(); return; }
    $('rows').append(el('p', 'loading-state', 'Chargement de votre bibliothèque…'));
    try {
      if (next === 'MYLIST') {
        $('rows').replaceChildren(); renderHero(saved()[0] || window.PlezyOffline.list()[0]);
        row('Ma liste', saved(), false, 'Ajoutez des titres depuis leur fiche pour les retrouver ici.');
        row('Téléchargements sur cet appareil', C.demo ? [] : window.PlezyOffline.list(), false, 'Téléchargez un film ou un épisode depuis le menu de sa fiche (HTTPS ou localhost).');
        if (!C.demo) {
          const result = await Promise.allSettled([window.PlezyResume.load(A), A.items({ Filters: 'IsFavorite' })]);
          if (version !== pageVersion) return;
          if (result[0].status === 'fulfilled') row('Reprendre', result[0].value);
          if (result[1].status === 'fulfilled') row('Mes favoris Jellyfin', result[1].value);
        }
        return;
      }
      if (next === 'SEERR') {
        if (!C.seerr || !(C.seerrKey || C.seerrCookie) || C.demo) {
          $('rows').replaceChildren(); const state = el('div', 'empty-state'); state.append(el('h2', '', 'Découvrez votre prochain coup de cœur'), el('p', 'muted', 'Connectez Seerr pour découvrir des films et séries et envoyer vos demandes.'), action('Connecter Seerr', seerrSettings, 'btn btn-white')); $('rows').append(state); return;
        }
        const data = await Promise.all(['discover/trending', 'discover/movies', 'discover/tv', 'discover/movies/upcoming'].map(r => A.discover(r)));
        if (version !== pageVersion) return;
        $('rows').replaceChildren(); renderHero(data[0][0]);
        ['Top 10 des tendances aujourd’hui', 'Films populaires', 'Séries populaires', 'Prochainement au cinéma'].forEach((t, i) => row(t, i === 0 ? data[i].slice(0, 10) : data[i], i === 0)); return;
      }
      const data = await catalog();
      if (version !== pageVersion) return;
      $('rows').replaceChildren();
      const recent = next === 'SERIES' ? data.shows : next === 'MOVIES' ? data.movies : [...data.movies, ...data.shows];
      const all = next !== 'HOME' && !C.demo ? await A.items({ IncludeItemTypes: next === 'SERIES' ? 'Series' : 'Movie', SortBy: 'SortName', SortOrder: 'Ascending', Limit: 100 }) : recent;
      if (version !== pageVersion) return;
      renderHero(recent[0] || all[0]);
      row('Reprendre la lecture', data.resume.filter(i => next === 'HOME' || (next === 'SERIES' ? i.Type !== 'Movie' : i.Type === 'Movie')), false, 'Les films et épisodes commencés apparaîtront ici.');
      if (next === 'HOME') {
        if (C.demo) row('La sélection Plezy · aperçu Top 10', window.PlezyDemo, true);
        if (C.seerr && (C.seerrKey || C.seerrCookie) && !C.demo) {
          try { const trends = await A.discover('discover/trending'); if (version !== pageVersion) return; row('Top 10 des tendances aujourd’hui', trends.slice(0, 10), true); } catch { toast('Seerr indisponible. Votre bibliothèque reste accessible.'); }
        }
        row('Films ajoutés récemment', data.movies.slice(0, 20)); row('Séries ajoutées récemment', data.shows.slice(0, 20)); row('Ma liste', saved());
      } else row('Nouveautés', recent.slice(0, 20));
      row('Les mieux notés', [...all].sort((a, b) => (b.CommunityRating || 0) - (a.CommunityRating || 0)).slice(0, 20));
      const genres = [...new Set(all.flatMap(i => i.Genres || []))];
      genres.slice(0, 6).forEach(g => row(g, all.filter(i => i.Genres?.includes(g))));
      row(next === 'HOME' ? 'Dans votre bibliothèque' : next === 'MOVIES' ? 'Films de A à Z' : 'Séries de A à Z', [...all].sort((a, b) => a.Name.localeCompare(b.Name, 'fr')), false, 'Votre bibliothèque est vide. Ajoutez des médias dans Jellyfin.');
      if (!C.demo && all.length >= (next === 'HOME' ? 200 : 100)) {
        const button = action('Charger la suite du catalogue', async () => {
          const more = await A.items({ IncludeItemTypes: next === 'SERIES' ? 'Series' : next === 'MOVIES' ? 'Movie' : 'Movie,Series', SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: offset, Limit: 100 });
          if (version !== pageVersion) return;
          row('Suite du catalogue', more); offset += more.length; if (more.length < 100) button.remove(); else $('rows').append(button);
        }, 'btn btn-ghost load-more');
        let offset = all.length; // The first batch is fetched separately for each media type on Home.
        if (next !== 'HOME') $('rows').append(button);
      }
    } catch (error) {
      if (version !== pageVersion) return;
      $('rows').replaceChildren(); const state = el('div', 'empty-state'); state.append(el('h2', '', 'Bibliothèque inaccessible'), el('p', 'muted', error.message), action('Réessayer', () => navigate(), 'btn btn-white'), action('Réglages', settings, 'btn btn-ghost')); $('rows').append(state);
      if (!C.demo && window.PlezyOffline.list().length) row('Disponibles hors connexion', window.PlezyOffline.list());
    }
  }
  async function search() {
    const query = $('inSearch').value.trim(), version = ++searchVersion;
    if (!query) { $('searchGrid').replaceChildren(); text('searchHint', 'Titres, personnes, genres…'); return; }
    text('searchHint', 'Recherche en cours…');
    const jobs = [C.demo ? Promise.resolve(window.PlezyDemo.filter(i => (i.Name + ' ' + i.Genres.join(' ')).toLocaleLowerCase().includes(query.toLocaleLowerCase()))) : A.items({ SearchTerm: query, Limit: 100 })];
    if (C.seerr && (C.seerrKey || C.seerrCookie) && !C.demo) jobs.push(A.discover('search?query=' + encodeURIComponent(query)));
    const results = await Promise.allSettled(jobs);
    if (version !== searchVersion || page !== 'SEARCH') return;
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    $('searchGrid').replaceChildren(...items.map((item, i) => tile(item, i)));
    text('searchHint', `${items.length} résultat${items.length > 1 ? 's' : ''}${results.some(r => r.status === 'rejected') ? ' · Une source est indisponible.' : items.length ? '' : ' · Essayez un autre titre.'}`);
  }
  function detailButtons(item) {
    const inList = isSaved(item);
    $('dSave').classList.toggle('on', inList); $('dSave').setAttribute('aria-pressed', String(inList));
    $('dSave').title = inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'; $('dSave').setAttribute('aria-label',$('dSave').title);
    $('dSaveIcon').innerHTML = inList ? '<path d="m5 12 4 4L19 6"/>' : '<path d="M12 5v14M5 12h14"/>';
    $('dFav').classList.toggle('on', !!item.UserData?.IsFavorite); $('dWatched').classList.toggle('on', !!item.UserData?.Played);
    $('dFav').setAttribute('aria-pressed', String(!!item.UserData?.IsFavorite)); $('dWatched').setAttribute('aria-pressed', String(!!item.UserData?.Played));
    $('dFav').hidden = $('dWatched').hidden = !!item.seerr || !!item.offline;
    const series = item.Type === 'Series' && !item.seerr;
    $('dPlay').disabled = series && (detailBusy || !primaryEpisode);
    text('dPlayLbl', series ? detailBusy ? 'Chargement…' : primaryEpisode ? primaryEpisode.UserData?.PlaybackPositionTicks ? 'Reprendre' : 'Lecture' : 'Épisodes indisponibles' : playLabel(item));
    const trailer = item.seerr ? item.relatedVideos?.some(v => v.site?.toLowerCase() === 'youtube') : item.RemoteTrailers?.length;
    $('dSecond').hidden = !trailer; text('dSecondLbl','Bande-annonce');
  }
  async function openDetail(item) {
    const version = ++detailVersion; detail = item; episodes = []; primaryEpisode = undefined; primaryEpisodeQueue = [];
    detailSeasons = []; detailEpisodeCount = undefined; detailBusy = item.Type === 'Series' && !item.seerr;
    show('detail'); $('detailScroll').scrollTop = 0;
    $('dSeasons').hidden = $('dCastSec').hidden = $('dSimilarSec').hidden = true;
    $('episodeRail').replaceChildren(); $('seasonTabs').replaceChildren();
    $('dDetailStatus').hidden = !detailBusy; text('dDetailStatus',detailBusy ? 'Chargement des épisodes…' : '');
    renderDetail(item); $('screen-detail').querySelector('[data-back]').focus();
    try {
      const context = await window.PlezyDetail.resolveContext(item, entry => A.details(entry));
      if (version !== detailVersion || screen !== 'detail') return;
      const full = context.item;
      primaryEpisode = context.episode;
      detailBusy = full.Type === 'Series' && !full.seerr;
      detail = full; renderDetail(full); loadRelated(full,version);
      if (full.Type === 'Series' && !full.seerr) {
        let resume=[], next=[];
        if (full.demo) detailSeasons = window.PlezyDemoSeasons(full);
        else {
          const results = await Promise.allSettled([
            A.jf(`/Shows/${full.Id}/Seasons`,{params:{UserId:C.user}}),
            A.jf(`/Users/${C.user}/Items/Resume`,{params:{ParentId:full.Id,Limit:30,Fields:A.fields,MediaTypes:'Video'},signal:AbortSignal.timeout(5000)}),
            A.jf('/Shows/NextUp',{params:{UserId:C.user,SeriesId:full.Id,Limit:1,Fields:A.fields},signal:AbortSignal.timeout(5000)})
          ]);
          if (version !== detailVersion) return;
          if (results[0].status === 'rejected') throw results[0].reason;
          detailSeasons = results[0].value.Items || [];
          if (results[1].status === 'fulfilled') resume=(results[1].value.Items||[]).filter(i=>sameId(i.SeriesId,full.Id));
          if (results[2].status === 'fulfilled') next=(results[2].value.Items||[]).filter(i=>sameId(i.SeriesId,full.Id)||!i.SeriesId && i.SeriesName===full.Name);
        }
        if (version !== detailVersion) return;
        primaryEpisode = context.episode || resume[0] || next[0];
        if (detailSeasons.length && detailSeasons.every(s=>Number.isFinite(s.ChildCount))) detailEpisodeCount=detailSeasons.reduce((n,s)=>n+s.ChildCount,0);
        const selected=detailSeasons.find(s=>context.seasonId && sameId(s.Id,context.seasonId)) || detailSeasons.find(s=>primaryEpisode?.SeasonId && sameId(s.Id,primaryEpisode.SeasonId) || primaryEpisode && s.IndexNumber===primaryEpisode.ParentIndexNumber) || detailSeasons[0];
        $('dSeasons').hidden=false; detailView.seasons(detailSeasons,selected);
        if (selected) await loadSeason(full,selected,version);
        else { detailBusy=false; $('dDetailStatus').hidden=true; detailView.episodes([],undefined); renderDetail(full); }
      }
    } catch(error) {
      if (version !== detailVersion) return;
      detailBusy=false; renderDetail(detail); $('dDetailStatus').hidden=false; text('dDetailStatus','Certains détails sont indisponibles. '+error.message);
      if (detail.Type === 'Series' && !detail.seerr) { $('dSeasons').hidden=false; $('episodeRail').replaceChildren(el('p','detail-empty','Impossible de charger les épisodes.'),action('Réessayer',()=>openDetail(detail),'detail-retry')); }
    }
  }
  function renderDetail(item) {
    detailView.render(item,{episode:primaryEpisode,seasons:detailSeasons,episodeCount:detailEpisodeCount});
    detailButtons(item);
  }
  async function loadRelated(item, version) {
    try {
      const list=item.demo ? window.PlezyDemo.filter(i=>i.Id!==item.Id && i.Type===item.Type) : item.seerr || item.offline ? [] : (await A.jf(`/Items/${item.Id}/Similar`,{params:{UserId:C.user,Limit:9,Fields:A.fields}})).Items || [];
      if (version === detailVersion) detailView.similar(list.filter(i=>i.Id!==item.Id));
    } catch { if (version === detailVersion) detailView.similar([]); }
  }
  async function loadSeason(series, season, version) {
    const key=season.Id; $('episodeRail').replaceChildren(el('p','detail-empty','Chargement des épisodes…')); $('seasonTabs').dataset.selected=key;
    const select=$('dSeasonSelect'); if (select) select.value=key;
    try {
      const list=series.demo ? window.PlezyDemoEpisodes(series,season) : (await A.jf(`/Shows/${series.Id}/Episodes`,{params:{UserId:C.user,SeasonId:season.Id,Fields:A.fields}})).Items || [];
      if (version !== detailVersion || $('seasonTabs').dataset.selected !== key) return;
      episodes=list;
      primaryEpisode=window.PlezyDetail.chooseEpisode(list,primaryEpisode);
      const match=list.find(i=>primaryEpisode && sameId(i.Id,primaryEpisode.Id));
      if (match) { primaryEpisode={...match,UserData:{...match.UserData,...primaryEpisode.UserData}}; primaryEpisodeQueue=list; }
      if (detailSeasons.length===1) detailEpisodeCount=list.length;
      detailBusy=false; $('dDetailStatus').hidden=true;
      detailView.episodes(list,primaryEpisode?.Id); renderDetail(series);
    } catch(error) {
      if (version !== detailVersion || $('seasonTabs').dataset.selected !== key) return;
      detailBusy=false; renderDetail(series);
      $('episodeRail').replaceChildren(el('p','detail-empty','Impossible de charger cette saison. '+error.message),action('Réessayer',()=>loadSeason(series,season,version),'detail-retry'));
    }
  }
  async function play(item) {
    if (C.stremio && !item.stremio && !item.demo && !item.offline) {
      try { item = await A.resolveStremio(item); } catch (error) { if (item.seerr) throw error; }
    }
    if (item.seerr) return requestTitle(item);
    if (item.Type === 'Series') { await openDetail(item); $('dSeasons').scrollIntoView({ behavior: 'smooth' }); return; }
    await window.PlezyPlayer.start(item, episodes);
  }
  async function requestTitle(item) {
    if (!C.seerr && !C.stremio) return seerrSettings();
    if (!C.stremio && item.mediaInfo?.status >= 4) {
      const matches = await A.items({ AnyProviderIdEquals: 'Tmdb.' + item.id });
      if (matches[0]) return openDetail(matches[0]);
      return toast('Ce titre n’est pas encore visible dans votre bibliothèque Jellyfin.');
    }
    if (requested.has(item.Id) || [2, 3].includes(item.mediaInfo?.status)) return toast('Une demande est déjà en cours.');
    modal('Demander « ' + item.Name + ' » ?', [el('p', 'muted', item.Type === 'Series' ? 'Toutes les saisons seront demandées à Seerr. Le traitement dépend des autorisations de votre compte.' : 'La demande sera envoyée à Seerr avec votre compte.'), action('Confirmer la demande', async () => {
      if (C.stremio) await A.requestDownload(item);
      else await A.seerr('request', { method: 'POST', body: { mediaType: item.Type === 'Series' ? 'tv' : 'movie', mediaId: item.id, ...(item.Type === 'Series' ? { seasons: 'all' } : {}) } });
      item.mediaInfo = { ...item.mediaInfo, status: 2 }; requested.add(item.Id);
      if (detail?.Id === item.Id) detailButtons(item);
      if (hero?.Id === item.Id) text('bbPlayLbl', playLabel(item));
      document.querySelectorAll('[data-media-id]').forEach(node => { if (node.dataset.mediaId === item.Id) { const badge = node.querySelector('.t-seerr'); if (badge) { badge.textContent = 'Demandé'; badge.className = 't-seerr req'; } } });
      closeModal(); toast('Demande envoyée à Seerr');
    }, 'btn btn-white')]);
  }
  async function toggleUserData(key, route) {
    if (!detail || detail.seerr) return;
    const value = !detail.UserData?.[key];
    if (!C.demo) await A.jf(`/Users/${C.user}/${route}/${detail.Id}`, { method: value ? 'POST' : 'DELETE' });
    detail.UserData = { ...detail.UserData, [key]: value }; detailButtons(detail); toast(value ? key === 'Played' ? 'Marqué comme vu' : 'Ajouté aux favoris' : key === 'Played' ? 'Marqué comme non vu' : 'Retiré des favoris');
  }
  function settings() {
    modal('Réglages Plezy', [el('p', 'muted', C.demo ? 'Mode démonstration · aucun serveur connecté' : `${C.name} · ${C.server}`), action('Connexion à Seerr', seerrSettings), action('Actualiser la bibliothèque', () => { closeModal(); return navigate(); }), action('Installer l’application', installHelp), action('Raccourcis clavier', () => modal('Raccourcis clavier', [el('p', 'muted', 'Tabulation pour naviguer · Entrée pour ouvrir · Échap pour revenir. Dans le lecteur : Espace pour lecture/pause, ← et → pour avancer de 10 secondes, F pour le plein écran, M pour couper le son.')])), action('Se déconnecter', logout)]);
  }
  function seerrSettings() {
    const url = field('Adresse de Seerr', C.seerr, 'url'), key = field('Clé API (ou laissez vide pour utiliser un compte)', '', 'password'), email = field('E-mail du compte local', '', 'email'), password = field('Mot de passe Seerr', '', 'password');
    modal('Connexion à Seerr', [el('p','muted','Connexion conservée sur cet appareil. Une clé API permet de rester connecté sans expiration de session, tant qu’elle reste valide sur Seerr.'),url.node, key.node, email.node, password.node, action('Connecter', async () => {
      const old = { seerr: C.seerr, seerrKey: C.seerrKey, seerrCookie: C.seerrCookie };
      try {
        const base=A.normalize(url.input.value),reuse=base===old.seerr && !key.input.value.trim() && !email.input.value.trim() && !password.input.value && (old.seerrKey||old.seerrCookie);
        if(reuse) await A.seerr('auth/me');
        else {
        Object.assign(C, { seerr: base, seerrKey: key.input.value.trim(), seerrCookie: '' });
        if (C.seerrKey) await A.seerr('auth/me');
        else { if (!email.input.value || !password.input.value) throw new Error('Indiquez une clé API ou votre e-mail et mot de passe.'); await A.seerr('auth/local', { method: 'POST', body: { email: email.input.value.trim(), password: password.input.value } }); if (!C.seerrCookie) throw new Error('Seerr n’a pas retourné de session.'); }
        }
        A.save(); closeModal(); toast('Seerr connecté'); if (page === 'SEERR') await navigate();
      } catch (error) { Object.assign(C, old); A.save(); throw error; }
    }, 'btn btn-white'), ...(C.seerrKey || C.seerrCookie ? [action('Déconnecter Seerr', () => { C.seerrKey = C.seerrCookie = ''; A.save(); closeModal(); toast('Seerr déconnecté'); })] : [])]);
  }
  let installPrompt;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  async function installHelp() { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; } else modal('Installer Plezy', [el('p', 'muted', 'Dans le menu de votre navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur iPhone et iPad, utilisez Partager dans Safari. L’installation nécessite HTTPS ou localhost. La lecture nécessite une connexion à votre serveur.')]); }
  function logout() { ++qcVersion; ++pageVersion; ++detailVersion; ++searchVersion; requested.clear(); for (const controller of window.PlezyOffline.pending.values()) controller.abort(); closeModal(); A.logout(); $('inPass').value = ''; show('login'); $('inServer').focus(); }
  async function login() {
    const button = $('btnLogin'); button.disabled = true; text('loginError', 'Connexion…'); ++qcVersion;
    try { await A.login($('inServer').value, $('inUser').value, $('inPass').value); $('inPass').value = ''; text('loginError', ''); await boot(); }
    catch (error) { text('loginError', error.message); } finally { button.disabled = false; }
  }
  async function quickConnect() {
    const version = ++qcVersion; $('btnQc').disabled = true;
    try {
      const base = A.normalize($('inServer').value);
      const state = await A.request(base, 'QuickConnect/Initiate', { method: 'POST', auth: false });
      if (!state.Secret || !state.Code) throw new Error('Quick Connect n’est pas activé sur ce serveur.');
      text('qcCode', state.Code); text('qcStatus', 'Autorisez ce code depuis Jellyfin → Profil → Quick Connect.');
      const deadline = Date.now() + 300000;
      while (version === qcVersion && screen === 'login' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        if (version !== qcVersion) return;
        const check = await A.request(base, 'QuickConnect/Connect', { params: { secret: state.Secret }, auth: false });
        if (version !== qcVersion || screen !== 'login') return;
        if (check.Authenticated) {
          const result = await A.request(base, 'Users/AuthenticateWithQuickConnect', { method: 'POST', body: { Secret: state.Secret }, auth: false });
          if (version !== qcVersion || screen !== 'login') return;
          A.session(base, result); ++qcVersion; await boot(); return;
        }
      }
      if (version === qcVersion) text('qcStatus', 'Code expiré. Générez un nouveau code.');
    } catch (error) { if (version === qcVersion) text('qcStatus', error.message); }
    finally { $('btnQc').disabled = false; }
  }
  async function boot() { text('btnProfile', (C.name || 'P').slice(0, 1).toUpperCase()); $('btnProfile').title = 'Profil de ' + C.name; await navigate('HOME'); }
  function back() {
    if (!$('modal').hidden) { closeModal(); return; }
    if (screen === 'player') { window.PlezyPlayer.stop(); return; }
    if (screen === 'detail') { ++detailVersion; show('main'); if (returnFocus?.isConnected) returnFocus.focus(); if (page === 'MYLIST') run(() => navigate()); }
    else if (screen === 'main' && page !== 'HOME') run(() => navigate('HOME'));
  }
  window.PlezyUI = { $, el, action, text, toast, run, show, modal, closeModal, openDetail, navigate, play, back, get screen() { return screen; } };
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => run(() => navigate(b.dataset.page)));
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = back);
  $('btnLogin').onclick = login; $('btnQc').onclick = quickConnect;
  $('inPass').onkeydown = e => { if (e.key === 'Enter') login(); };
  $('btnDemo').onclick = () => { ++qcVersion; C.demo = true; C.name = 'Démo'; A.save(); run(boot); };
  $('btnSettings').onclick = settings;
  function chooseProfile(manage = false) {
    const grid = el('div', 'profile-grid');
    for (const profile of A.profiles()) {
      const button = action('', async () => {
        if (manage) { A.removeProfile(profile.server, profile.user); chooseProfile(true); return; }
        ++qcVersion; ++pageVersion; ++detailVersion; ++searchVersion;
        requested.clear();
        for (const controller of window.PlezyOffline.pending.values()) controller.abort();
        await A.selectProfile(profile.server, profile.user);
        closeModal(); await boot();
      }, 'profile-tile');
      button.append(el('span', 'profile-avatar', (profile.name || 'P').slice(0, 1).toUpperCase()), el('span', '', (manage ? 'Retirer ' : '') + (profile.name || 'Profil')));
      if (!manage && profile.server === C.server && profile.user === C.user) button.setAttribute('aria-current', 'true');
      grid.append(button);
    }
    const addProfile = action('...', connectAnotherProfile, 'profile-add');
    addProfile.title = 'Connecter un autre profil';
    addProfile.setAttribute('aria-label', 'Connecter un autre profil');
    const extra = el('div', 'profile-extra');
    extra.append(addProfile, el('span', 'muted', 'Connecter un autre profil'));
    modal('Qui est-ce ?', [grid, extra, el('p', 'muted', 'Les comptes connectés sont mémorisés sur cet appareil. Choisir un profil donne accès à sa session ; ceci ne remplace pas un verrouillage par mot de passe.'), action(manage ? 'Terminer' : 'Gérer les profils', () => chooseProfile(!manage)), action('Réglages', settings)]);
  }
  function connectAnotherProfile() {
    A.rememberProfile();
    const server = field('Serveur Jellyfin', C.server || '', 'url');
    const username = field('Nom d’utilisateur', '', 'text');
    const password = field('Mot de passe', '', 'password');
    const status = el('p', 'muted', 'Les profils déjà connectés restent enregistrés sur cet appareil.');
    let connecting = false;
    const connect = action('Connecter ce profil', async () => {
      if (connecting) return;
      connecting = true; connect.disabled = true;
      try {
        const base = A.normalize(server.input.value);
        const result = await A.request(base, '/Users/AuthenticateByName', { method: 'POST', body: { Username: username.input.value.trim(), Pw: password.input.value }, auth: false });
        password.input.value = '';
        if (!connect.isConnected || $('modal').hidden) return;
        A.session(base, result);
        ++qcVersion; ++pageVersion; ++detailVersion; ++searchVersion;
        requested.clear();
        for (const controller of window.PlezyOffline.pending.values()) controller.abort();
        closeModal(); await boot();
      } catch (error) { status.textContent = error.message; }
      finally { connecting = false; connect.disabled = false; }
    }, 'btn btn-white');
    modal('Connecter un autre profil', [server.node, username.node, password.node, status, connect, action('Retour aux profils', () => { password.input.value = ''; chooseProfile(); })]);
  }
  function profileMenu() {
    A.rememberProfile();
    modal('Profil de ' + (C.name || 'Utilisateur'), [action('Changer de profil', () => chooseProfile()), action('Réglages', settings), action('Fermer', closeModal)]);
  }
  $('btnProfile').onclick = profileMenu;
  $('bbInfo').onclick = () => hero && run(() => openDetail(hero)); $('bbPlay').onclick = () => hero && run(() => play(hero));
  $('dPlay').onclick = () => detail && run(() => detail.Type === 'Series' && !detail.seerr && primaryEpisode ? window.PlezyPlayer.start(primaryEpisode,primaryEpisodeQueue) : play(detail),$('dPlay'));
  $('dSave').onclick = () => { updateSaved(detail); detailButtons(detail); };
  $('dWatched').onclick = () => run(() => toggleUserData('Played', 'PlayedItems'), $('dWatched'));
  $('dFav').onclick = () => run(() => toggleUserData('IsFavorite', 'FavoriteItems'), $('dFav'));
  $('dMore').onclick = () => {
    const selected = detail, options = [action(isSaved(selected) ? 'Retirer de ma liste' : 'Ajouter à ma liste', () => { updateSaved(selected); detailButtons(selected); closeModal(); })];
    if (!selected.demo && !selected.offline && C.stremio) options.push(action('Télécharger via Seerr', () => { closeModal(); return requestTitle(selected); }));
    if (!selected.demo && !selected.seerr) options.push(action('Retirer de « Reprendre la lecture »', async () => {
      window.PlezyResume.remove(A, selected);
      closeModal(); await navigate(page);
      toast('Retiré de Reprendre la lecture sur cet appareil. Le programme reste dans votre bibliothèque.');
    }));
    if (!selected.seerr) {
      if (!selected.offline) options.push(action(selected.UserData?.Played ? 'Marquer comme non vu' : 'Marquer comme vu',async()=>{await toggleUserData('Played','PlayedItems');closeModal();}));
      options.push(action('Recommencer depuis le début',()=>{closeModal();const target=selected.Type==='Series' ? primaryEpisode : selected;if(target)return window.PlezyPlayer.start({...target,UserData:{...target.UserData,PlaybackPositionTicks:0}},selected.Type==='Series'?primaryEpisodeQueue:episodes);}));
    }
    if (!selected.demo && !selected.seerr && selected.Type !== 'Series') {
      const download = window.PlezyOffline.list().find(i => i.Id === selected.Id);
      if (download) options.push(action('Supprimer le téléchargement local', async () => { await window.PlezyOffline.remove(download); closeModal(); toast('Téléchargement supprimé de cet appareil'); }));
      else if (window.PlezyOffline.pending.has(selected.Id)) options.push(action('Annuler le téléchargement', () => { window.PlezyOffline.cancel(selected.Id); closeModal(); }));
      else options.push(action('Télécharger sur cet appareil', async () => { closeModal(); toast('Préparation du téléchargement…'); await window.PlezyOffline.download(selected); }));
    }
    modal(selected.Name, options);
  };
  $('dSecond').onclick = () => {
    const trailer = detail.seerr ? detail.relatedVideos?.find(v => v.site?.toLowerCase() === 'youtube') : null;
    const url = trailer ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(trailer.key) : detail.RemoteTrailers?.[0]?.Url;
    if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
  };
  let searchTimer; $('inSearch').oninput = () => { ++searchVersion; clearTimeout(searchTimer); searchTimer = setTimeout(() => run(search), 300); };
  $('mainScroll').onscroll = () => $('topbar').classList.toggle('solid', $('mainScroll').scrollTop > 40);
  $('modal').onclick = event => { if (event.target === $('modal')) closeModal(); };
  $('screen-detail').onclick = event => { if(event.target.hasAttribute('data-detail-dismiss') || event.target===$('detailScroll')) back(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); back(); }
    if (event.key === 'Tab' && screen === 'detail' && $('modal').hidden) {
      const nodes=[...$('screen-detail').querySelectorAll('button:not(:disabled),select,a')].filter(n=>!n.hidden && n.getClientRects().length);
      if(nodes.length && event.shiftKey && document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
      else if(nodes.length && !event.shiftKey && document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
    }
    if (event.key === 'Tab' && !$('modal').hidden) {
      const focusable = [...$('modalCard').querySelectorAll('button:not(:disabled),input,select,a')];
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  window.onpopstate = () => { if (screen === 'player') window.PlezyPlayer.stop(false); else if (screen === 'detail') { ++detailVersion; show('main', false); } else if (!C.token && !C.demo && !C.stremio) show('login', false); else run(() => navigate('HOME')); };
  $('inServer').value = C.server || 'http://192.168.0.89:8096'; history.replaceState({ screen: 'login' }, '', '#login');
  show('login', false);
  if (location.protocol === 'file:') {
    text('loginError', 'Ce fichier est ouvert directement. Lancez webapp/start.bat pour démarrer Plezy, puis ouvrez son adresse web.');
    text('qcStatus', 'La connexion nécessite le serveur web Plezy.');
    $('btnLogin').disabled = $('btnQc').disabled = true;
    const link = el('a', 'btn btn-white', 'Ouvrir Plezy Web'); link.href = 'http://localhost:8090';
    $('loginError').after(link);
  } else {
    A.rememberProfile();
    const profilesButton = action('Choisir un profil mémorisé', () => chooseProfile(), 'btn');
    profilesButton.hidden = !A.profiles().length;
    $('loginError').after(profilesButton);
    A.initStremio().then(enabled => {
      C.stremio = enabled; if (enabled) C.demo = false;
      if (C.token && C.user || C.demo || enabled) run(async () => {
        await boot();
        if (A.profiles().length > 1) chooseProfile();
      });
    });
  }
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
