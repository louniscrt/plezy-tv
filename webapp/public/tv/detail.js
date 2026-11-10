/* Présentation des fiches : données réelles Jellyfin/Seerr, sans métadonnées inventées. */
(() => {
  const minutes = ticks => Math.max(0, Math.floor((Number(ticks) || 0) / 600000000));
  const runtime = ticks => { const m = minutes(ticks); return m ? m >= 60 ? `${Math.floor(m/60)} h${m%60 ? ' '+String(m%60).padStart(2,'0')+' min' : ''}` : `${m} min` : ''; };
  function progress(item) {
    const position = Number(item?.UserData?.PlaybackPositionTicks) || 0, duration = Number(item?.RunTimeTicks) || 0;
    return { visible: position > 0 && duration > 0, percent: duration > 0 ? Math.max(0,Math.min(100,position/duration*100)) : 0, label: `${minutes(position)} sur ${minutes(duration)} min` };
  }
  function episodeLabel(item) {
    if (!item || item.Type !== 'Episode') return '';
    const prefix = [Number.isInteger(item.ParentIndexNumber) ? 'S'+item.ParentIndexNumber : '', Number.isInteger(item.IndexNumber) ? 'E'+item.IndexNumber : ''].filter(Boolean).join(':');
    return [prefix, item.Name ? '« '+item.Name+' »' : ''].filter(Boolean).join(' ');
  }
  function chooseEpisode(items, preferred) {
    const match = preferred && items.find(item => String(item.Id).replaceAll('-','').toLowerCase() === String(preferred.Id).replaceAll('-','').toLowerCase());
    if (match) return {...match,UserData:{...match.UserData,...preferred.UserData}};
    return preferred || items.find(item => item.UserData?.PlaybackPositionTicks > 0) || items.find(item => !item.UserData?.Played) || items[0];
  }
  function facts(item, { episode, seasons = [], episodeCount } = {}) {
    const playing = episode || item, streams = playing.MediaSources?.[0]?.MediaStreams || playing.MediaStreams || item.MediaSources?.[0]?.MediaStreams || item.MediaStreams || [];
    const video = streams.find(s=>s.Type==='Video'), width = video?.Width || playing.Width || 0, height = video?.Height || playing.Height || 0;
    const result = [];
    if (item.ProductionYear) result.push({text:String(item.ProductionYear)});
    if (item.Genres?.[0]) result.push({text:item.Genres[0]});
    if (item.Type === 'Series') {
      if (episodeCount > 0) result.push({text:`${episodeCount} épisode${episodeCount>1?'s':''}`});
      else if (seasons.length) result.push({text:`${seasons.length} saison${seasons.length>1?'s':''}`});
      else if (item.numberOfSeasons) result.push({text:`${item.numberOfSeasons} saison${item.numberOfSeasons>1?'s':''}`});
      else result.push({text:'Série'});
    } else if (runtime(playing.RunTimeTicks)) result.push({text:runtime(playing.RunTimeTicks)});
    if (width >= 3840 || height >= 2160) result.push({text:'4K',badge:true});
    else if (width >= 1280 || height >= 720) result.push({text:'HD',badge:true});
    const channels = Math.max(0,...streams.filter(s=>s.Type==='Audio').map(s=>Number(s.Channels)||0));
    if (channels >= 8) result.push({text:'7.1',badge:true});
    else if (channels >= 6) result.push({text:'5.1',badge:true});
    const range=video?.VideoRangeType||video?.VideoRange;
    if (range && !['SDR','UNKNOWN'].includes(String(range).toUpperCase())) result.push({text:String(range).replace(/_/g,' '),badge:true});
    if (streams.some(s=>s.Type==='Audio' && (s.IsAudioDescription || /audio.?description/i.test(s.DisplayTitle||s.Title||'')))) result.push({text:'AD',badge:true});
    return result;
  }
  function create({ A, $, el, action, picture, onOpen, onPlay, onSeason }) {
    function setImage(id, url) {
      const img=$(id);
      if (!url || img.dataset.failedSrc === url) { img.hidden=true;img.removeAttribute('src');return false; }
      const ready=img.getAttribute('src')===url && img.complete && img.naturalWidth>0;
      img.hidden=id==='dLogo'?!ready:false;
      if(id==='dLogo')img.onload=()=>{img.hidden=false;$('dTitle').classList.add('detail-title-fallback');};
      if (img.getAttribute('src') !== url) img.src=url;
      img.onerror=()=>{img.hidden=true;img.dataset.failedSrc=url;if(id==='dLogo')$('dTitle').classList.remove('detail-title-fallback');};
      return id==='dLogo'?ready:true;
    }
    function factLine(id, label, values, more) {
      const node=$(id);node.replaceChildren();node.hidden=!values.length;
      if(!values.length)return;
      node.append(el('span','detail-fact-label',label+' : '),el('span','',values.join(', ')));
      if(more) node.append(document.createTextNode(', '),action('plus',()=>{ $('dCastSec').scrollIntoView({behavior:'smooth',block:'start'}); },'detail-text-link'));
    }
    function render(item, options = {}) {
      const playing=options.episode||item;
      const art=A.image(item,'Backdrop',1600);setImage('dBackdrop',art);
      const logo=A.image(item,'Logo',760), hasLogo=setImage('dLogo',logo);
      $('dTitle').textContent=item.Name||'';$('dTitle').classList.toggle('detail-title-fallback',!!hasLogo);
      const p=progress(playing);$('dResume').hidden=!p.visible;$('dProgressFill').style.width=p.percent+'%';$('dProgressText').textContent=p.label;
      $('dMeta').replaceChildren(...facts(item,options).map(m=>el('span',m.badge?'detail-badge':'',m.text)));
      $('dRating').hidden=!item.OfficialRating;$('dRating').replaceChildren();
      if(item.OfficialRating)$('dRating').append(el('span','detail-age',item.OfficialRating.replace(/^FR-/,'')));
      const label=episodeLabel(playing);$('dEpHeader').hidden=!label;$('dEpHeader').textContent=label;
      $('dOverview').textContent=playing.Overview||item.Overview||'Aucun synopsis disponible.';
      const cast=(item.People||[]).filter(p=>!p.Type||p.Type==='Actor').filter(p=>p.Name);
      const directors=(item.People||[]).filter(p=>p.Type==='Director').map(p=>p.Name);
      factLine('dCast','Distribution',cast.slice(0,3).map(p=>p.Name),cast.length>3);
      factLine('dGenres','Genres',item.Genres||[]);factLine('dDirector','Réalisation',directors);
      $('dCastSec').hidden=!cast.length;
      $('castRail').replaceChildren(...cast.slice(0,20).map(person=>{
        const node=el('div','detail-person'),photo=el('div','detail-person-photo',person.Name.slice(0,1));
        const src=person.photo||(person.PrimaryImageTag?A.image({Id:person.Id,ImageTags:{Primary:person.PrimaryImageTag}},'Primary',200):'');
        if(src){const image=el('img');image.src=src;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();photo.append(image);}
        node.append(photo,el('strong','',person.Name),el('span','',person.Role||''));return node;
      }));
      $('dAboutTitle').textContent='À propos de '+(item.Name||'ce programme');
      const about=[];
      if(item.Overview)about.push(el('p','',item.Overview));
      if(item.Genres?.length){const row=el('p');row.append(el('span','detail-fact-label','Genres : '),document.createTextNode(item.Genres.join(', ')));about.push(row);}
      if(cast.length){const row=el('p');row.append(el('span','detail-fact-label','Distribution : '),document.createTextNode(cast.map(p=>p.Name).join(', ')));about.push(row);}
      if(directors.length){const row=el('p');row.append(el('span','detail-fact-label','Réalisation : '),document.createTextNode(directors.join(', ')));about.push(row);}
      $('dAbout').replaceChildren(...about);
    }
    function seasons(items, selected) {
      const select=el('select');select.id='dSeasonSelect';select.setAttribute('aria-label','Choisir une saison');
      items.forEach(s=>{const option=el('option','',s.Name||'Saison '+s.IndexNumber);option.value=s.Id;select.append(option);});
      select.value=selected?.Id||items[0]?.Id||'';
      select.onchange=()=>{const season=items.find(s=>s.Id===select.value);if(season)onSeason(season);};
      $('seasonTabs').replaceChildren(select);
    }
    function episodes(items, currentId) {
      $('episodeRail').replaceChildren(...items.map(item=>{
        const button=el('button','detail-episode'+(item.Id===currentId?' current':''));
        button.dataset.episodeId=item.Id;button.setAttribute('aria-label','Lire '+episodeLabel(item));
        if(item.Id===currentId)button.setAttribute('aria-current','true');
        const number=el('span','detail-episode-number',item.IndexNumber??'');
        const thumb=el('span','detail-episode-thumb');thumb.append(picture(item,'Primary',520));
        const overlay=el('span','detail-episode-play');overlay.innerHTML='<svg viewBox="0 0 24 24"><path d="M7 3v18l15-9z"/></svg>';thumb.append(overlay);
        const p=progress(item);if(p.visible){const bar=el('span','detail-episode-progress'),fill=el('i');fill.style.width=p.percent+'%';bar.append(fill);thumb.append(bar);}
        const info=el('span','detail-episode-info'),heading=el('span','detail-episode-heading');
        heading.append(el('strong','',item.Name||'Épisode '+item.IndexNumber),el('span','detail-episode-runtime',runtime(item.RunTimeTicks)));
        info.append(heading,el('span','detail-episode-overview',item.Overview||'Aucun synopsis disponible.'));
        button.append(number,thumb,info);button.onclick=()=>onPlay(item);return button;
      }));
      if(!items.length)$('episodeRail').append(el('p','detail-empty','Aucun épisode disponible pour cette saison.'));
    }
    function similar(items) {
      $('dSimilarSec').hidden=!items.length;
      $('dSimilarGrid').replaceChildren(...items.slice(0,9).map(item=>{
        const button=el('button','detail-similar-card');button.setAttribute('aria-label','Voir la fiche de '+item.Name);
        const cover=el('span','detail-similar-cover');cover.append(picture(item,'Backdrop',600));
        const info=el('span','detail-similar-info');info.append(el('strong','',item.Name),el('span','detail-similar-year',item.ProductionYear||''),el('span','detail-similar-overview',item.Overview||''));
        button.append(cover,info);button.onclick=()=>onOpen(item);return button;
      }));
    }
    return {render,seasons,episodes,similar};
  }
  window.PlezyDetail={minutes,runtime,progress,episodeLabel,chooseEpisode,facts,create};
})();
