/* Plezy TV adapter: the original web app owns all data and playback actions. */
(() => {
  'use strict';
  if (window.PlezyTV) return;
  const $ = id => document.getElementById(id);
  const android = document.documentElement.classList.contains?.('plezy-android-tv');
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content = 'width=1280, user-scalable=no';
  document.documentElement.classList.add('plezy-tv');

  function visible(node) {
    if (!node || !node.isConnected || node.disabled || node.closest('[hidden],[inert]')) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }
  function scope() {
    if ($('modal') && !$('modal').hidden) return $('modalCard');
    return $('screen-' + (window.PlezyUI?.screen || 'login')) || document.body;
  }
  function controls() {
    return [...scope().querySelectorAll('button,input,select,a[href],[tabindex="0"]')]
      .filter(node => visible(node) && !node.matches('.row-arrow,[type="hidden"]') && node.tabIndex >= 0);
  }
  function center(rect) { return {x:rect.left + rect.width/2, y:rect.top + rect.height/2}; }
  function focus(node) {
    if (!node || !visible(node)) return;
    node.focus({preventScroll:true});
    if (!node.closest('.topbar') && !node.closest('#screen-player')) {
      node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
    }
  }
  let previousScope;
  function recover() {
    const root = scope();
    const changed = previousScope !== root;
    previousScope = root;
    if (changed && root === $('screen-detail') && visible($('dPlay'))) { focus($('dPlay')); return; }
    if (root === $('screen-detail') && document.activeElement?.matches('.detail-close') && visible($('dPlay')) && root.dataset.tvAwaitingPlay === '1') {
      root.dataset.tvAwaitingPlay = ''; focus($('dPlay')); return;
    }
    if (changed && root === $('screen-detail') && !visible($('dPlay'))) root.dataset.tvAwaitingPlay = '1';
    if (root.contains(document.activeElement) && visible(document.activeElement) && document.activeElement !== root) return;
    const first = ['pRetry','dPlay','bbPlay','btnQc','pPlay'].map($).find(node => root.contains(node) && visible(node));
    focus(visible(first) ? first : controls()[0]);
  }
  function move(direction) {
    const active = document.activeElement;
    const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
    const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
    const track = active?.closest('.row-track');
    // On Android, check only neighbors for a sideways move within a row.
    if (android && horizontal && track && scope().contains(active) &&
        active.matches('button:not(.row-arrow)') && active.tabIndex >= 0 && visible(active)) {
      const row = Array.from(track.querySelectorAll('button'));
      for (let i = row.indexOf(active) + sign; i >= 0 && i < row.length; i += sign) {
        if (visible(row[i])) { focus(row[i]); break; }
      }
      return;
    }
    const nodes = controls();
    if (!nodes.includes(active)) { recover(); return; }
    const rect = active.getBoundingClientRect(), at = center(rect);
    const mainPane = active.closest('#mainScroll');
    // The pinned header is geometrically close even halfway down the catalog.
    // Up must climb the content (or scroll it to zero) before entering it.
    const blockHeader = direction === 'ArrowUp' && mainPane && mainPane.scrollTop > 1;
    // Stay in a carousel until its edge, including cards beyond the viewport.
    if (horizontal && track) {
      const row = [...track.querySelectorAll('button')].filter(visible);
      focus(row[row.indexOf(active) + sign]); return;
    }
    let best, score = Infinity;
    for (const node of nodes) {
      if (node === active) continue;
      if (blockHeader && node.closest('.topbar')) continue;
      const box = node.getBoundingClientRect(), point = center(box);
      // Off-screen carousel cards must not steal vertical focus from the visible column.
      if (!horizontal && (box.right < 40 || box.left > innerWidth-40)) continue;
      const primary = horizontal ? (point.x-at.x)*sign : (point.y-at.y)*sign;
      if (primary < 4) continue;
      const side = Math.abs(horizontal ? point.y-at.y : point.x-at.x);
      const overlap = horizontal ? box.bottom>rect.top && box.top<rect.bottom : box.right>rect.left && box.left<rect.right;
      const rank = primary + side * (overlap ? .35 : 3) + (overlap ? 0 : 200);
      if (rank < score) { score = rank; best = node; }
    }
    if (best) focus(best);
    else if (!horizontal) {
      const pane = active.closest('#detailScroll,#mainScroll,#modalCard');
      if (pane) pane.scrollBy({top:sign*innerHeight*.55,behavior:'auto'});
    }
  }
  function wake() {
    const player = $('screen-player');
    if (player) player.dispatchEvent(new Event('pointermove'));
  }
  function media(command) {
    const screen = window.PlezyUI?.screen;
    if (screen === 'detail' && (command === 'toggle' || command === 'play') && visible($('dPlay'))) {
      $('dPlay').click(); return true;
    }
    if (screen === 'main' && (command === 'toggle' || command === 'play')) {
      if (visible(document.activeElement) && document.activeElement.matches('.tile,.poster')) { document.activeElement.click(); return true; }
      if (visible($('bbPlay'))) { $('bbPlay').click(); return true; }
    }
    if (screen !== 'player') return false;
    const video = $('video');
    if (!video) return false;
    wake();
    if (command === 'toggle') $('pPlay')?.click();
    else if (command === 'play' && video.paused) $('pPlay')?.click();
    else if (command === 'pause' && !video.paused) video.pause();
    else if (command === 'rewind') $('pRew')?.click();
    else if (command === 'forward') $('pFwd')?.click();
    else if (command === 'next' && visible($('pNext'))) $('pNext').click();
    else if (command === 'stop') window.PlezyUI.back();
    return true;
  }
  function back() {
    const ui = window.PlezyUI;
    if (!ui) return false;
    const modalOpen = $('modal') && !$('modal').hidden;
    const home = document.querySelector('[data-page="HOME"].active');
    if (modalOpen || ui.screen === 'player' || ui.screen === 'detail' || (ui.screen === 'main' && !home)) {
      ui.back(); setTimeout(recover,0); return true;
    }
    return false;
  }
  function key(event) {
    const input = /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '');
    if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack' || (event.key === 'Backspace' && !input)) {
      event.preventDefault(); event.stopImmediatePropagation(); back(); return;
    }
    if (['PageUp','PageDown','ChannelUp','ChannelDown'].includes(event.key) && !input) {
      const pane = document.activeElement?.closest?.('#detailScroll,#mainScroll,#modalCard') || $('mainScroll');
      if (pane) {
        event.preventDefault(); event.stopImmediatePropagation();
        const sign = event.key === 'PageUp' || event.key === 'ChannelUp' ? -1 : 1;
        pane.scrollBy({top: sign * innerHeight * 0.7, behavior: 'auto'});
        move(sign < 0 ? 'ArrowUp' : 'ArrowDown');
        return;
      }
    }
    const player = window.PlezyUI?.screen === 'player' && $('modal')?.hidden;
    const playerError = player && $('screen-player')?.dataset?.state === 'error';
    const hiddenControls = player && !playerError && $('playerUi')?.classList.contains('hide');
    if (player) wake();
    if (playerError && event.key.startsWith('Arrow')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (document.activeElement === $('pRetry') && event.key === 'ArrowRight' && visible($('pCompatible'))) focus($('pCompatible'));
      else if (document.activeElement === $('pCompatible') && event.key === 'ArrowLeft' && visible($('pRetry'))) focus($('pRetry'));
      else if (![$('pRetry'), $('pCompatible'), $('pBack')].includes(document.activeElement)) focus(visible($('pRetry')) ? $('pRetry') : $('pCompatible'));
      else move(event.key);
      return;
    }
    if (hiddenControls && !input && (event.key.startsWith('Arrow') || ['Enter','Accept','Select','NumpadEnter',' '].includes(event.key))) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'ArrowLeft') media('rewind');
      else if (event.key === 'ArrowRight') media('forward');
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') focus($('pPlay'));
      else if (!event.repeat) media('toggle');
      return;
    }
    if (event.key.startsWith('Arrow')) {
      if (input && (event.target.tagName === 'SELECT' || event.target.type === 'range' || ['ArrowLeft','ArrowRight'].includes(event.key))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      // Invisible playback controls: left/right seek, down/up reveal the control bar.
      if (player && (document.activeElement === document.body || !visible(document.activeElement) || !scope().contains(document.activeElement))) {
        if (event.key === 'ArrowLeft') { media('rewind'); return; }
        if (event.key === 'ArrowRight') { media('forward'); return; }
        focus($('pPlay')); return;
      }
      if (player && document.activeElement === $('pBar') && ['ArrowLeft','ArrowRight'].includes(event.key)) {
        media(event.key === 'ArrowLeft' ? 'rewind' : 'forward'); return;
      }
      move(event.key); return;
    }
    if (['Enter','Accept','Select','NumpadEnter',' '].includes(event.key) && !input) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      const active = document.activeElement;
      if (player && (active === document.body || !visible(active) || !scope().contains(active) || active === $('pBar'))) media('toggle');
      else if (visible(active) && active.matches('button,a')) active.click();
      else recover();
    }
    const commands = {MediaPlayPause:'toggle',MediaPlay:'play',MediaPause:'pause',MediaRewind:'rewind',MediaFastForward:'forward',MediaTrackNext:'next',MediaStop:'stop'};
    if (commands[event.key]) { event.preventDefault(); event.stopImmediatePropagation(); media(commands[event.key]); }
  }
  document.addEventListener('keydown',key,true);
  document.addEventListener('focusin', event => {
    document.querySelectorAll('.tv-focus').forEach(node => node.classList.remove('tv-focus'));
    if (event.target.matches('button,input,select,a,[tabindex="0"]')) event.target.classList.add('tv-focus');
    if (event.target.closest('#screen-detail') && !event.target.matches('.detail-close')) $('screen-detail').dataset.tvAwaitingPlay = '';
  });
  // Menu is also reachable without a dedicated Menu key, on both login and home.
  for (const container of [document.querySelector('.topbar'),document.querySelector('.login-card')]) {
    if (!container) continue;
    const button = document.createElement('a');
    button.href = 'plezytv://settings'; button.className = 'tv-address';
    button.textContent = 'TV'; button.title = 'Adresse de Plezy Web';
    button.setAttribute('aria-label','Changer l’adresse de Plezy Web');
    container.append(button);
  }
  let pending = false;
  function adaptMenu() {
    for (const button of $('modalCard')?.querySelectorAll('button') || []) {
      if (button.dataset.tvAdapted) continue;
      const label = button.textContent.trim();
      if (label === 'Installer l’application') {
        button.dataset.tvAdapted = '1'; button.textContent = 'Adresse de Plezy Web';
        button.onclick = () => { location.href = 'plezytv://settings'; };
      } else if (label === 'Raccourcis clavier') {
        button.dataset.tvAdapted = '1'; button.textContent = 'Utiliser la télécommande';
        button.onclick = () => {
          const ui = window.PlezyUI;
          ui.modal('Votre télécommande', [
            ui.el('p','muted','Flèches : parcourir les menus et les affiches. OK : sélectionner. Retour : fermer ou revenir à l’écran précédent.'),
            ui.el('p','muted','Lecture / Pause : contrôler la vidéo. Avance et retour rapide : sauter 10 secondes. Dans le lecteur, les flèches donnent accès aux épisodes, pistes audio, sous-titres et réglages.'),
            ui.el('p','muted','Menu ou le bouton TV : changer l’adresse de Plezy Web. Le volume se règle avec les touches de votre téléviseur.')
          ]);
        };
      }
    }
  }
  const clockLabels = new Set(['pCur','pRem','pEnds','pChapter']);
  const observer = new MutationObserver(records => {
    if (pending) return;
    if (records.every(record => record.type === 'childList' && clockLabels.has(record.target.id))) return;
    pending = true;
    requestAnimationFrame(() => { pending=false; adaptMenu(); recover(); });
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','disabled']});
  window.PlezyTV = {back,media,move,controls};
  recover();
})();
