(() => {
  'use strict';
  const A = window.PlezyAPI, C = A.config, U = window.PlezyUI;
  const { $, action, text, toast, run } = U, video = $('video');
  $('screen-player').dataset.build = '20261103-2';
  let item, source, plan, hls, next, episodeList = [], returnScreen = 'detail';
  let reportTimer, hideTimer, startupTimer, bufferTimer, negotiation, generation = 0, loadGeneration = 0;
  let desiredStart = 0, offset = 0, audio, subtitle = -1, bitrate = 0, aspect = 0, fallback = false, switching = false, started = false, seeking = false;
  let state = 'idle';
  const time = value => {
    const s = Math.max(0, Math.floor(value || 0));
    return (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + String(Math.floor(s / 60) % 60).padStart(s >= 3600 ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const position = () => (video.currentTime || 0) + offset;
  const duration = () => item?.demo ? (Number.isFinite(video.duration) ? video.duration : 0) : plan?.duration || item?.RunTimeTicks / 10000000 || (Number.isFinite(video.duration) ? video.duration + offset : 0);
  function report(event = 'Progress') {
    if (!item || item.demo || item.offline || !plan || !started && event !== '') return Promise.resolve();
    return A.jf('/Sessions/Playing' + (event ? '/' + event : ''), { method: 'POST', body: {
      ItemId: item.Id, MediaSourceId: source?.Id, PlaySessionId: plan.session,
      PositionTicks: Math.round(position() * 10000000), IsPaused: video.paused, CanSeek: true,
      PlayMethod: plan.method, AudioStreamIndex: audio ?? source?.DefaultAudioStreamIndex, SubtitleStreamIndex: subtitle
    } }).catch(() => {});
  }
  // Suggestions façon Netflix : « Passer l'intro » et « Épisode suivant ».
  function introRange(media) {
    const segments = Array.isArray(media?.MediaSegments) ? media.MediaSegments : media?.MediaSegments?.Items || [];
    for (const segment of segments) {
      const start = Number(segment.StartTicks) / 10000000, end = Number(segment.EndTicks) / 10000000;
      if (String(segment.Type).toLowerCase() === 'intro' && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) return {start,end};
    }
    const chapters = media?.Chapters || [];
    const first = chapters.find(ch => /^(intro\s*start|début\s*(?:de\s*l[’']?)?intro)$/i.test((ch.Name || '').trim()));
    const last = chapters.find(ch => /^(intro\s*end|fin\s*(?:de\s*l[’']?)?intro)$/i.test((ch.Name || '').trim()));
    const start = Number(first?.StartPositionTicks) / 10000000, end = Number(last?.StartPositionTicks) / 10000000;
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) return {start,end};
    return media?.stremio && media.Type === 'Episode' ? {start:4,end:90} : null;
  }
  function outroStart(media) {
    const segments = Array.isArray(media?.MediaSegments) ? media.MediaSegments : media?.MediaSegments?.Items || [];
    for (const segment of segments) {
      const at = Number(segment.StartTicks) / 10000000;
      if (['outro', 'credits'].includes(String(segment.Type).toLowerCase()) && Number.isFinite(at) && at > 0) return at;
    }
    const credits = (media?.Chapters || []).find(ch => /^(outro|credits?|générique(?:\s*de\s*fin)?|end\s*credits)$/i.test((ch.Name || '').trim()));
    const at = Number(credits?.StartPositionTicks) / 10000000;
    return Number.isFinite(at) && at > 0 ? at : null;
  }
  function loadSegments(media, version) {
    if (!media || media.demo || media.offline || media.stremio || media.MediaSegments || !media.Id) return;
    A.jf('/MediaSegments/' + media.Id, { params: { includeSegmentTypes: 'Intro' } })
      .then(data => { if (version === generation && item === media) { media.MediaSegments = data?.Items || []; updatePrompts(); } }).catch(() => {});
  }
  let dismissedNext = false;
  const prompts = U.el('div', 'tv-playback-prompts');
  prompts.setAttribute('aria-label', 'Suggestions de lecture');
  const skipIntro = action('Passer l’intro', () => { const range = introRange(item); if (range) seek(range.end); });
  const nextEpisode = action('Épisode suivant', () => next && run(() => start(next, episodeList)));
  const dismissNext = action('Pas maintenant', () => { dismissedNext = true; updatePrompts(); });
  prompts.append(skipIntro, nextEpisode, dismissNext);
  $('screen-player').append(prompts);
  const promptStyle = U.el('style');
  promptStyle.textContent = '.tv-playback-prompts{position:absolute;right:4%;bottom:14%;z-index:25;display:flex;flex-direction:row-reverse;gap:12px;animation:tvPromptIn .28s ease-out}@keyframes tvPromptIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}.tv-playback-prompts[hidden],.tv-playback-prompts button[hidden]{display:none!important}.tv-playback-prompts button{font:700 clamp(14px,1.5vw,20px) inherit;font-family:inherit;padding:.8em 1.7em;border-radius:6px;border:2px solid rgba(255,255,255,.85);background:rgba(20,20,20,.78);color:#fff;cursor:pointer;backdrop-filter:blur(6px)}.tv-playback-prompts button:first-child,.tv-playback-prompts button:nth-child(2){background:#fff;color:#000}.tv-playback-prompts button:hover{transform:scale(1.05)}@media(max-width:640px){.tv-playback-prompts{right:3%;bottom:96px}}';
  document.head.append(promptStyle);
  function updatePrompts(ended = false) {
    const range = introRange(item), current = position(), length = duration();
    const active = !!item && U.screen === 'player' && !switching && !['idle','loading','error'].includes(state);
    skipIntro.hidden = !(active && range && current >= range.start && current < range.end);
    const outro = outroStart(item);
    nextEpisode.hidden = !(active && next && !dismissedNext && (ended || length > 0 && current >= (outro && outro > length * .5 ? outro : Math.max(0, length - 30))));
    if (!nextEpisode.hidden && next) nextEpisode.textContent = 'Épisode suivant' + (next.IndexNumber ? ' · É' + next.IndexNumber : '');
    dismissNext.hidden = nextEpisode.hidden;
    prompts.hidden = skipIntro.hidden && nextEpisode.hidden;
  }
  prompts.hidden = true;
  function stopEncoding(previous) {
    if (previous?.session && previous.method === 'Transcode') A.jf('/Videos/ActiveEncodings', { method: 'DELETE', params: { DeviceId: A.device, PlaySessionId: previous.session } }).catch(() => {});
  }
  function wake() {
    $('playerUi').classList.remove('hide'); clearTimeout(hideTimer);
    if (state === 'playing' && !video.paused) hideTimer = setTimeout(() => {
      if (state === 'playing' && !video.paused && $('modal').hidden && !seeking) $('playerUi').classList.add('hide');
    }, 3000);
  }
  function setState(value, message = '') {
    state = value;
    $('screen-player').dataset.state = value;
    $('pPauseInfo').hidden = value !== 'paused';
    $('pNotice').hidden = !['loading','error','buffering'].includes(value);
    $('pSpinner').hidden = value === 'error'; $('pRecovery').hidden = value !== 'error';
    text('pNoticeTitle', value === 'error' ? 'Lecture indisponible' : value === 'buffering' ? 'Chargement…' : 'Préparation de la lecture…');
    text('pNoticeText', message);
    $('pPlay').setAttribute('aria-label', video.paused ? 'Lecture' : 'Pause');
    $('pPlayIco').innerHTML = video.paused ? '<path d="M7 3v18l15-9z"/>' : '<path d="M5 3h5v18H5zM14 3h5v18h-5z"/>';
    if (!started || value === 'paused' || value === 'error' || !$('playerUi').classList.contains('hide')) wake();
  }
  function fail(message) {
    clearTimeout(startupTimer); clearTimeout(bufferTimer); switching = true; video.pause(); switching = false;
    setState('error', message);
  }
  async function playVideo() {
    if (!item) return;
    if (state === 'error') return load(desiredStart, true);
    try { await video.play(); }
    catch (error) {
      if (error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') { setState('paused'); toast('Appuyez sur Lecture pour démarrer.'); }
      else if (state !== 'error') recover('Le navigateur ne parvient pas à décoder ce flux.');
    }
  }
  function destroyMedia() {
    if (hls) { hls.destroy(); hls = null; }
    for (const tr of video.querySelectorAll?.('track[data-plezy-sub]') || []) tr.remove();
    video.onloadedmetadata = null; video.pause(); video.removeAttribute('src'); video.load();
  }
  function resetTimelineUi(startSec = 0) {
    $('pFill').style.width = $('pKnob').style.left = '0%';
    $('pBuf').style.width = '0%';
    $('pBar').setAttribute('aria-valuenow', Math.floor(startSec));
    $('pBar').setAttribute('aria-valuemax', 0);
    $('pBar').setAttribute('aria-valuetext', time(startSec));
    text('pCur', time(startSec));
    text('pRem', '0:00');
    text('pEnds', '');
    text('pChapter', '');
  }
  function applyExternalSubtitles() {
    for (const tr of video.querySelectorAll?.('track[data-plezy-sub]') || []) tr.remove();
    if (!item?.stremio || subtitle < 0) return;
    const chosen = streams('Subtitle').find(s => s.Index === subtitle && s.DeliveryUrl);
    if (!chosen || !document.createElement) return;
    const trackEl = document.createElement('track');
    trackEl.kind = 'subtitles';
    trackEl.label = chosen.DisplayTitle || 'Sous-titres';
    trackEl.srclang = chosen.Language === 'eng' ? 'en' : 'fr';
    trackEl.src = chosen.DeliveryUrl;
    trackEl.default = true;
    trackEl.setAttribute('data-plezy-sub', '1');
    video.appendChild(trackEl);
    if (video.textTracks?.[0]) video.textTracks[0].mode = 'showing';
  }
  async function recover(message) {
    if (!item || switching || state === 'error') return;
    const at = Math.max(desiredStart, position());
    if (!item.demo && !item.offline && (item.stremio ? plan?.hasMore : !fallback && !plan?.hls)) {
      fallback = true; return run(() => load(at, true));
    }
    fail(message);
  }
  async function load(start = 0, force = false) {
    const version = ++loadGeneration, active = item;
    negotiation?.abort(); negotiation = new AbortController();
    clearTimeout(startupTimer); clearTimeout(bufferTimer); switching = true;
    const previous = plan; report('Stopped'); stopEncoding(previous); destroyMedia(); plan = null;
    started = false;
    desiredStart = Math.max(0, start); offset = 0;
    if (desiredStart === 0) video.currentTime = 0;
    resetTimelineUi(desiredStart);
    setState('loading');
    try {
      if (active.offline) plan = { url: '/offline-media/' + active.offlineFile, hls: false, method: 'DirectPlay', offset: 0 };
      else if (active.demo) plan = { url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov', hls: false, method: 'DirectPlay', offset: 0 };
      else if (force === 'original' && !active.stremio) plan = { url: A.endpoint(C.server, `/Videos/${active.Id}/stream.${source?.Container || 'mkv'}`, { Static: true, MediaSourceId: source?.Id || active.Id, api_key: C.token }), hls: false, method: 'DirectPlay', offset: 0, source };
      else {
        const response = await window.PlezyPlayback.negotiate(active, {
          start: desiredStart, force, audio, subtitle, bitrate,
          mp4: !!video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
          webm: !!video.canPlayType('video/webm; codecs="vp9, opus"'), signal: negotiation.signal
        });
        if (version !== loadGeneration || item !== active) { stopEncoding(response); return; }
        plan = response; source = plan.source;
        console.info('Plezy lecture ' + JSON.stringify({ mode: plan.method, hls: plan.hls, container: source?.Container, video: source?.MediaStreams?.find(s => s.Type === 'Video')?.Codec, audio: source?.MediaStreams?.find(s => s.Type === 'Audio')?.Codec }));
      }
      if (version !== loadGeneration || item !== active) return;
      if (active.stremio && plan.duration > 0) active.RunTimeTicks = Math.round(plan.duration * 10000000);
      offset = plan.offset || 0;
      renderLanguageShortcuts();
      text('pStream', active.demo ? 'Démonstration' : active.offline ? 'Hors connexion' : plan.method === 'DirectPlay' ? 'Lecture directe' : 'Lecture compatible · HLS');
      video.onloadedmetadata = () => {
        applyExternalSubtitles();
        if (active.stremio && video.audioTracks) {
          const tracks = Array.from(video.audioTracks);
          const wanted = audio === 2
            ? tracks.find(t => /^(en|eng)(?:-|$)/i.test(t.language || '') || /english|anglais/i.test(t.label || ''))
            : tracks.find(t => /^(fr|fra|fre)(?:-|$)/i.test(t.language || '') || /fran[cç]ais|french/i.test(t.label || ''));
          if (wanted) tracks.forEach(t => { t.enabled = t === wanted; });
        }
        if (version !== loadGeneration || item !== active) return;
        clearTimeout(startupTimer); switching = false;
        if (desiredStart > offset) {
          const mediaStart = desiredStart - offset;
          video.currentTime = Math.min(mediaStart, Number.isFinite(video.duration) ? Math.max(0, video.duration - .1) : mediaStart);
        }
        video.playbackRate = selectedSpeed;
        updateTimeline(); playVideo();
      };
      const wantedHeight = bitrate >= 18000000 ? 2160 : bitrate > 0 && bitrate <= 2000000 ? 480 : bitrate > 0 && bitrate <= 5000000 ? 720 : 1080;
      const rawUrl = active.offline ? plan.url : A.proxy(plan.url);
      const url = active.stremio && plan.hls ? rawUrl.replace('/master.m3u8', `/quality-${wantedHeight}.m3u8`) : rawUrl;
      // Préférer MediaSource/HLS.js sur les navigateurs qui l'annoncent :
      // certains Chromium annoncent HLS natif sans pouvoir le lire correctement.
      if (plan.hls && window.Hls?.isSupported()) {
        hls = new Hls({ startPosition: Math.max(0, desiredStart - offset), startLevel: 0, capLevelToPlayerSize: false, maxBufferLength: 60, maxMaxBufferLength: 120, maxBufferSize: 90 * 1000 * 1000, backBufferLength: 30, manifestLoadingTimeOut: 25000, fragLoadingTimeOut: 45000 });
        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          console.info('Plezy manifeste ' + JSON.stringify({ levels: data.levels?.length }));
        });
        applyExternalSubtitles();
        let fragmentLogged = false;
        let diagnosing = false;
        let networkRecoveries = 0;
        hls.on(Hls.Events.FRAG_BUFFERED, () => { if (!fragmentLogged) { fragmentLogged = true; console.info('Plezy premier segment prêt'); } });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (version !== loadGeneration) return;
          const status = data.response?.code;
          console.warn('Plezy flux HLS ' + JSON.stringify({ type: data.type, detail: data.details, status, fatal: data.fatal }));
          if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR && (!status || status === 408 || status === 429 || status >= 500) && networkRecoveries < 2) {
            const engine = hls;
            const delay = 1000 * ++networkRecoveries;
            setTimeout(() => {
              if (version === loadGeneration && hls === engine && state !== 'error') engine.startLoad();
            }, delay);
            return;
          }
          if (status >= 500 && !diagnosing) {
            diagnosing = true; hls.stopLoad();
            diagnoseStream(version, status); return;
          }
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !hlsRecovered) { hlsRecovered = true; hls.recoverMediaError(); return; }
          if (active.stremio && plan?.hasMore) { recover('Le flux vidéo ne répond pas. Essai d’une autre source…'); return; }
          fail(status === 401 || status === 403 ? 'Jellyfin refuse l’accès au flux vidéo. Vérifiez les droits de lecture de votre compte.' : status ? `Jellyfin ne fournit pas le flux vidéo (HTTP ${status}). Essayez une autre qualité.` : 'Le flux HLS ne peut pas être lu. Essayez une autre qualité ou vérifiez le transcodage Jellyfin.');
        });
        hlsRecovered = false; hls.attachMedia(video); hls.loadSource(url);
      } else if (plan.hls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        throw new Error('Ce navigateur ne prend pas en charge la lecture HLS. Utilisez une version récente de Safari, Chrome, Edge ou Firefox.');
      } else video.src = url;
      switching = false;
      startupTimer = setTimeout(() => { if (version === loadGeneration && state === 'loading') fail('La préparation de la vidéo prend trop de temps. Vérifiez le transcodage Jellyfin, puis réessayez.'); }, 45000);
    } catch (error) {
      if (version !== loadGeneration || error.name === 'AbortError') return;
      switching = false;
      fail(error.name === 'TypeError' ? 'Connexion au serveur vidéo interrompue. Vérifiez que Jellyfin et Plezy sont toujours accessibles.' : error.message);
    }
  }
  let hlsRecovered = false, selectedSpeed = 1;
  async function diagnoseStream(version, status) {
    const active = item;
    try {
      const original = A.endpoint(C.server, `/Videos/${active.Id}/stream`, { Static: true, MediaSourceId: source?.Id || active.Id, api_key: C.token });
      const response = await fetch(A.proxy(original), { headers: { Range: 'bytes=0-63' }, signal: AbortSignal.timeout(10000) });
      await response.body?.cancel();
      if (version !== loadGeneration || item !== active) return;
      fail(response.status === 404 ? `Jellyfin ne fournit pas le fichier original (404) et échoue sur les segments vidéo (${status}). Vérifiez que ce titre se lit dans Jellyfin et que son dossier est accessible au serveur.` : `Jellyfin échoue à préparer les segments vidéo (HTTP ${status}). Le fichier ${response.ok ? 'est accessible' : 'renvoie HTTP ' + response.status} : vérifiez le transcodage dans Jellyfin ou essayez le fichier original depuis l’aide à la lecture.`);
    } catch { if (version === loadGeneration) fail(`Jellyfin ne fournit pas les segments vidéo (HTTP ${status}). Vérifiez sa connexion et son transcodage.`); }
  }
  async function start(selected, episodes = []) {
    const originalScreen = U.screen;
    if (item) stop(false, false);
    const version = ++generation;
    returnScreen = originalScreen === 'main' ? 'main' : 'detail';
    dismissedNext = false; prompts.hidden = true;
    item = selected; source = selected.MediaSources?.[0]; audio = undefined; subtitle = -1; bitrate = 0; fallback = false;
    episodeList = episodes; const index = episodes.findIndex(e => e.Id === selected.Id); next = index >= 0 ? episodes[index + 1] : undefined;
    $('pNext').hidden = !next; $('pEpisodes').hidden = !episodes.length;
    text('pTitle', selected.SeriesName || selected.Name);
    text('pSub', selected.Type === 'Episode' ? `E${selected.IndexNumber}  ${selected.Name}` : selected.demo ? 'Extrait de démonstration' : selected.ProductionYear);
    text('pPauseTitle', selected.SeriesName || selected.Name); text('pPauseSeries', selected.Type === 'Episode' ? selected.SeriesName : '');
    text('pPauseEpisode', selected.Type === 'Episode' ? `${selected.Name} : Ép. ${selected.IndexNumber}` : selected.ProductionYear);
    text('pPauseOverview', selected.Overview || '');
    $('pLanguages')?.replaceChildren();
    video.currentTime = 0;
    resetTimelineUi(0);
    $('pPlay').blur(); U.show('player'); setState('loading');
    try {
      if (!selected.demo && !source && !selected.offline) {
        const full = await A.details(selected); if (version !== generation) return; item = full; source = full.MediaSources?.[0];
      }
      loadSegments(item, version);
      await load((selected.UserData?.PlaybackPositionTicks || 0) / 10000000);
      if (version !== generation) return;
      clearInterval(reportTimer); reportTimer = setInterval(() => { if (started) report(); }, 10000);
    } catch (error) { if (version === generation) fail(error.message); }
  }
  function stop(record = true, navigate = true) {
    prompts.hidden = true; dismissedNext = false;
    report('Stopped').then(()=>window.dispatchEvent?.(new Event('plezy:playback-stopped'))); stopEncoding(plan); clearInterval(reportTimer); clearTimeout(hideTimer); clearTimeout(startupTimer); clearTimeout(bufferTimer);
    ++generation; ++loadGeneration; negotiation?.abort(); switching = true; destroyMedia(); switching = false; item = null; plan = null; state = 'idle';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (navigate) { U.show(returnScreen, record); if (returnScreen === 'main') run(() => U.navigate()); }
  }
  function seek(target) {
    if (!item || !duration()) return;
    const at = Math.max(0, Math.min(duration() - .1, target));
    if (plan?.remux) run(() => load(at, 'seek'));
    else if (plan?.hls && (at < offset || !Number.isFinite(video.duration) || at - offset > video.duration)) run(() => load(at, true));
    else { desiredStart = at; video.currentTime = Math.max(0, at - offset); }
    wake();
  }
  function choose(title, options, current, callback) {
    U.modal(title, options.map(([label, value]) => action(label, async () => { U.closeModal(); await callback(value); }, 'opt' + (current === value ? ' sel' : ''))));
  }
  const streams = type => {
    const raw = (source?.MediaStreams || item?.MediaStreams || []).filter(s => s.Type === type);
    if (item?.demo || item?.offline) return raw;
    if (type === 'Audio' && raw.length < 2) {
      const fr = raw.find(a => /^(fr|fra|fre)/i.test(a.Language || '')) || raw[0] || { Type: 'Audio', Index: 1, Language: 'fra', DisplayTitle: 'Français (Principal)' };
      const en = raw.find(a => /^(en|eng)/i.test(a.Language || '')) || { Type: 'Audio', Index: fr.Index === 2 ? 1 : 2, Language: 'eng', DisplayTitle: 'Anglais' };
      return [fr, en];
    }
    if (type === 'Subtitle' && (item?.stremio || raw.length === 0)) {
      const hasFr = raw.some(s => /^(fr|fra|fre)/i.test(s.Language || ''));
      const hasEn = raw.some(s => /^(en|eng)/i.test(s.Language || ''));
      const ticketMatch = /\/api\/stremio\/(?:hls|media)\/([a-f0-9]{48})/.exec(plan?.url || '');
      const baseVtt = ticketMatch ? `/api/stremio/subtitles/${ticketMatch[1]}.vtt` : '';
      const list = [...raw];
      if (!hasFr) list.push({ Type: 'Subtitle', Index: 101, Language: 'fra', DisplayTitle: 'Français', DeliveryUrl: baseVtt ? `${baseVtt}?lang=fr` : '' });
      if (!hasEn) list.push({ Type: 'Subtitle', Index: 102, Language: 'eng', DisplayTitle: 'Anglais', DeliveryUrl: baseVtt ? `${baseVtt}?lang=en` : '' });
      return list;
    }
    return raw;
  };
  function renderLanguageShortcuts() {
    const root = $('pLanguages');
    if (!root) return;
    const audios = streams('Audio'), subs = streams('Subtitle');
    const currentAudio = audio ?? source?.DefaultAudioStreamIndex ?? audios[0]?.Index;
    root.replaceChildren();
    const names = { fra: 'français', fre: 'français', fr: 'français', eng: 'anglais', en: 'anglais', por: 'portugais', pt: 'portugais', spa: 'espagnol', es: 'espagnol', deu: 'allemand', ger: 'allemand', de: 'allemand', ita: 'italien', it: 'italien', jpn: 'japonais', ja: 'japonais', kor: 'coréen', ko: 'coréen' };
    const label = track => {
      const code = String(track?.Language || '').toLowerCase(), display = track?.DisplayTitle || track?.Title || '';
      return /^(por|pt)/.test(code) && /br[ée]sil|brazil|brasil/i.test(display) ? 'portugais (Brésil)' : names[code] || display || code || 'Audio';
    };
    const primary = audios.find(a => a.Index === source?.DefaultAudioStreamIndex) || audios[0];
    const alternate = audios.find(a => a.Index !== primary?.Index);
    const sub = subs.find(s => s.Language === primary?.Language) || subs[0];
    const choices = [];
    if (primary) choices.push({ audio: primary.Index, subtitle: -1, label: label(primary) });
    if (alternate) choices.push({ audio: alternate.Index, subtitle: sub?.Index ?? -1, label: label(alternate) + (sub ? ' avec sous-titres' : '') });
    if (primary && sub) choices.push({ audio: primary.Index, subtitle: sub.Index, label: label(primary) + ' avec sous-titres' });
    choices.slice(0, 3).forEach(choice => {
      const selected = choice.audio === currentAudio && choice.subtitle === subtitle;
      const button = action((selected ? '✓  ' : '') + choice.label, async () => {
        const sameAudio = choice.audio === currentAudio;
        const at = Math.max(desiredStart, position());
        audio = choice.audio; subtitle = choice.subtitle;
        if (item?.stremio && sameAudio) { applyExternalSubtitles(); renderLanguageShortcuts(); return; }
        await load(at, false);
      }, 'language-pill' + (selected ? ' selected' : ''));
      button.setAttribute('aria-pressed', String(selected)); root.append(button);
    });
    root.append(action('Autre…', () => $('pTracks').click(), 'language-pill'));
  }
  $('pAudio').onclick = () => {
    const tracks = streams('Audio'); if (item?.demo || item?.offline || !tracks.length) return toast('Aucune autre piste audio disponible.');
    choose('Piste audio', tracks.map(s => [s.DisplayTitle || s.Title || s.Language || 'Piste ' + s.Index, s.Index]), audio ?? source?.DefaultAudioStreamIndex ?? tracks[0]?.Index, async value => { const at = Math.max(desiredStart, position()); audio = value; await load(at, item?.stremio ? false : true); });
  };
  $('pSubs').onclick = () => {
    if (item?.demo || item?.offline) return toast('La sélection des sous-titres nécessite une lecture depuis Jellyfin.');
    choose('Sous-titres', [['Désactivés', -1], ...streams('Subtitle').map(s => [s.DisplayTitle || s.Title || s.Language || 'Piste ' + s.Index, s.Index])], subtitle, async value => {
      subtitle = value;
      if (item?.stremio) { applyExternalSubtitles(); renderLanguageShortcuts(); return; }
      const at = Math.max(desiredStart, position()); await load(at, true);
    });
  };
  $('pTracks').onclick = () => {
    const audios = streams('Audio'), subs = streams('Subtitle');
    const currentAudio = audio ?? source?.DefaultAudioStreamIndex ?? audios[0]?.Index;
    const items = [
      ...audios.map(s => action((currentAudio === s.Index ? '✓ ' : '') + 'Audio : ' + (s.DisplayTitle || s.Title || s.Language || 'Piste ' + s.Index), async () => {
        U.closeModal(); const at = Math.max(desiredStart, position()); audio = s.Index; await load(at, item?.stremio ? false : true);
      }, 'opt' + (currentAudio === s.Index ? ' sel' : ''))),
      action((subtitle === -1 ? '✓ ' : '') + 'Sous-titres : Désactivés', async () => {
        U.closeModal(); subtitle = -1;
        if (item?.stremio) { applyExternalSubtitles(); renderLanguageShortcuts(); return; }
        const at = Math.max(desiredStart, position()); await load(at, true);
      }, 'opt' + (subtitle === -1 ? ' sel' : '')),
      ...subs.map(s => action((subtitle === s.Index ? '✓ ' : '') + 'Sous-titres : ' + (s.DisplayTitle || s.Title || s.Language || 'Piste ' + s.Index), async () => {
        U.closeModal(); subtitle = s.Index;
        if (item?.stremio) { applyExternalSubtitles(); renderLanguageShortcuts(); return; }
        const at = Math.max(desiredStart, position()); await load(at, true);
      }, 'opt' + (subtitle === s.Index ? ' sel' : ''))),
      action('Audio', () => $('pAudio').click()),
      action('Sous-titres', () => $('pSubs').click())
    ];
    U.modal('Audio et sous-titres', items);
  };
  $('pQuality').onclick = () => {
    if (item?.demo || item?.offline) return toast('La qualité est fixe pour ce fichier.');
    choose('Qualité vidéo', [['Automatique (1080p / 4K)', 0], ['4K UHD · 20 Mb/s', 20000000], ['1080p · 12 Mb/s', 12000000], ['1080p · 8 Mb/s', 8000000], ['720p · 4 Mb/s', 4000000], ['480p · 1,5 Mb/s', 1500000]], bitrate, async value => { const at = Math.max(desiredStart, position()); bitrate = value; await load(at, item?.stremio ? false : value > 0); });
  };
  $('pChapters').onclick = () => {
    const chapters = item?.Chapters || []; if (!chapters.length) return toast('Aucun chapitre disponible.');
    choose('Chapitres', chapters.map(ch => [time(ch.StartPositionTicks / 10000000) + ' · ' + ch.Name, ch.StartPositionTicks / 10000000]), -1, value => seek(value));
  };
  $('pAspect').onclick = () => { aspect = (aspect + 1) % 3; video.classList.toggle('zoom', aspect === 1); video.classList.toggle('fill', aspect === 2); toast('Format : ' + ['original','zoom','étiré'][aspect]); };
  $('pSettings').onclick = () => U.modal('Réglages de lecture', [action('Audio et sous-titres', () => $('pTracks').click()), action('Qualité vidéo', () => $('pQuality').click()), action('Vitesse de lecture', () => $('pSpeed').click()), action('Chapitres', () => $('pChapters').click()), action('Format de l’image', () => $('pAspect').click()), ...(episodeList.length ? [action('Épisodes', showEpisodes)] : []), U.el('p', 'muted', $('pStream').textContent)]);
  $('pSpeed').onclick = () => choose('Vitesse de lecture', [['0,5 ×',.5],['0,75 ×',.75],['Normale',1],['1,25 ×',1.25],['1,5 ×',1.5],['1,75 ×',1.75],['2 ×',2]], selectedSpeed, value => { selectedSpeed = value; video.playbackRate = value; });
  function showEpisodes() {
    if (!episodeList.length) return;
    choose('Épisodes', episodeList.map(ep => [`${ep.IndexNumber}. ${ep.Name}`, ep.Id]), item?.Id, id => start(episodeList.find(ep => ep.Id === id), episodeList));
  }
  $('pEpisodes').onclick = showEpisodes;
  $('pReport').onclick = () => U.modal('Aide à la lecture', [U.el('p','muted','Si la lecture s’interrompt, essayez une qualité compatible. Les pistes audio et sous-titres nécessitent parfois le transcodage sur Jellyfin.'), action('Relancer en qualité compatible', () => { U.closeModal(); return load(Math.max(desiredStart,position()), true); }), action('Essayer le fichier original', () => { U.closeModal(); return load(Math.max(desiredStart,position()), 'original'); }), action('Choisir la qualité vidéo', () => $('pQuality').click())]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('screen-player').requestFullscreen) await $('screen-player').requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else toast('Le plein écran est indisponible dans ce navigateur.');
    } catch { toast('Le plein écran est indisponible.'); }
  }
  $('pFull').onclick = fullscreen;
  $('pNext').onclick = () => next && run(() => start(next, episodeList));
  $('pBack').onclick = () => stop();
  $('pPlay').onclick = event => { event.currentTarget.blur(); if (video.paused) run(playVideo); else video.pause(); };
  $('pRew').onclick = () => seek(position() - 10); $('pFwd').onclick = () => seek(position() + 10);
  $('pRetry').onclick = () => run(() => load(Math.max(desiredStart,position()), false));
  $('pCompatible').onclick = () => run(() => load(Math.max(desiredStart,position()), item?.stremio && !plan?.hasMore ? 'compatible' : true));
  $('pMute').onclick = () => { video.muted = !video.muted; };
  $('pVolume').oninput = () => { video.volume = Number($('pVolume').value); video.muted = video.volume === 0; };
  video.onvolumechange = () => { $('pVolume').value = video.muted ? 0 : video.volume; $('pMute').setAttribute('aria-label', video.muted ? 'Activer le son' : 'Couper le son'); $('pMute').classList.toggle('muted-volume', video.muted || video.volume === 0); };
  $('screen-player').onpointermove = wake;
  $('screen-player').onclick = event => {
    if (event.target.closest('button,input,[role="slider"]')) return;
    if ($('playerUi').classList.contains('hide')) wake();
    else if (event.pointerType === 'touch' || matchMedia('(pointer:coarse)').matches) { if (state === 'playing') $('playerUi').classList.add('hide'); }
    else if (state === 'playing' || state === 'paused') { video.paused ? run(playVideo) : video.pause(); }
  };
  $('screen-player').onfocusin = wake;
  if (window.MutationObserver) {
    new MutationObserver(() => { if (U.screen === 'player') wake(); })
      .observe($('modal'),{attributes:true,attributeFilter:['hidden']});
  }
  let scrubTarget = 0;
  $('pBar').onpointerdown = event => {
    if (!duration()) return; seeking = true; $('pBar').setPointerCapture(event.pointerId);
    const update = event => { const bounds = $('pBar').getBoundingClientRect(); scrubTarget = Math.max(0, Math.min(1, (event.clientX-bounds.left)/bounds.width))*duration(); const pct = scrubTarget/duration()*100; $('pFill').style.width = $('pKnob').style.left = pct+'%'; $('pBar').setAttribute('aria-valuetext',time(scrubTarget)); };
    update(event); $('pBar').onpointermove = update;
    $('pBar').onpointerup = () => { seeking = false; $('pBar').onpointermove = null; seek(scrubTarget); };
    $('pBar').onpointercancel = () => { seeking = false; $('pBar').onpointermove = null; updateTimeline(); wake(); };
  };
  function updateTimeline() {
    if (seeking) return;
    const length = duration(), current = position(), pct = length ? Math.max(0,Math.min(100,current/length*100)) : 0;
    $('pFill').style.width = $('pKnob').style.left = pct+'%';
    $('pBar').setAttribute('aria-valuenow',Math.floor(current)); $('pBar').setAttribute('aria-valuemax',Math.floor(length)); $('pBar').setAttribute('aria-valuetext',time(current)+' sur '+time(length));
    text('pCur',time(current)); text('pRem',time(length-current));
    text('pEnds',length?'Fin à '+new Date(Date.now()+Math.max(0,length-current)*1000).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'}):'');
    const chapter=[...(item?.Chapters||[])].reverse().find(ch=>ch.StartPositionTicks/10000000<=current); text('pChapter',chapter?.Name||'');
    if(video.buffered.length && length) $('pBuf').style.width=Math.min(100,(video.buffered.end(video.buffered.length-1)+offset)/length*100)+'%';
    updatePrompts();
  }
  video.ontimeupdate = updateTimeline;
  video.onplay = () => { if (!item || switching) return; clearTimeout(bufferTimer); setState('playing'); };
  video.onplaying = () => {
    if (!item || switching) return; clearTimeout(startupTimer); clearTimeout(bufferTimer); setState('playing');
    if (!started) { if (!item.demo) { try { window.PlezyResume?.restore(A, item); } catch { toast('Impossible de mettre à jour la liste de reprise sur cet appareil.'); } } started = true; report(''); }
  };
  video.onpause = () => { if (item && !switching && !['loading','error'].includes(state)) { clearTimeout(bufferTimer); setState('paused'); report(); } };
  video.onwaiting = () => {
    if (item && !switching && state === 'playing') {
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => { if (item && !switching && state === 'playing') setState('buffering'); }, 1500);
    }
  };
  video.onended = () => {
    if (!item || switching || !started) return;
    if (!item.demo) { try { window.PlezyResume?.complete(A, item); } catch { toast('Impossible de retirer le programme terminé de la liste de reprise.'); } }
    clearInterval(reportTimer);
    report('Stopped').then(() => window.dispatchEvent?.(new Event('plezy:playback-stopped')));
    setState('paused');
    updatePrompts(true);
    if (next) toast('Épisode terminé. Utilisez Épisode suivant pour continuer.');
  };
  video.onerror = () => { if (item && !switching) recover('Le navigateur ne peut pas lire le flux reçu. Essayez la qualité compatible ou une autre qualité vidéo.'); };
  document.addEventListener('keydown', event => {
    if (U.screen !== 'player' || !$('modal').hidden || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === ' ' && event.target.tagName !== 'BUTTON') { event.preventDefault(); video.paused ? run(playVideo) : video.pause(); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seek(position() + (event.key === 'ArrowLeft' ? -10 : 10)); }
    if (event.key.toLowerCase() === 'f') fullscreen();
    if (event.key.toLowerCase() === 'm') video.muted = !video.muted;
    wake();
  });
  window.addEventListener('pagehide', () => report('Stopped'));
  window.PlezyPlayer = { start, stop };
})();
