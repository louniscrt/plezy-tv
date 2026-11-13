(() => {
  'use strict';
  const controls = root => [...root.querySelectorAll('button,input,select,a[href]')];
  const usable = node => node && !node.disabled && !node.closest('[hidden],[inert]') && node.getClientRects().length;
  function capture(root, pane, active) {
    const row = active?.closest('.row');
    return {
      node: root.contains(active) ? active : null,
      id: active?.id, media: active?.dataset?.mediaId,
      row: row?.querySelector('h2')?.textContent,
      index: row ? controls(row).indexOf(active) : -1,
      top: pane.scrollTop,
      tracks: [...root.querySelectorAll('.row')].map(section => ({
        title: section.querySelector('h2')?.textContent,
        left: section.querySelector('.row-track')?.scrollLeft || 0
      }))
    };
  }
  function restore(root, pane, state) {
    if (!state) return false;
    const rows = [...root.querySelectorAll('.row')];
    const row = rows.find(r => r.querySelector('h2')?.textContent === state.row);
    const choices = controls(row || root).filter(usable);
    const target = usable(state.node) && root.contains(state.node) ? state.node
      : choices.find(n => state.media && n.dataset.mediaId === state.media)
        || controls(root).find(n => state.id && n.id === state.id && usable(n))
        || choices[Math.min(Math.max(0, state.index), choices.length - 1)];
    target?.focus({preventScroll:true});
    for (const position of state.tracks) {
      const track = rows.find(r => r.querySelector('h2')?.textContent === position.title)?.querySelector('.row-track');
      if (track) track.scrollLeft = position.left;
    }
    pane.scrollTop = state.top;
    return !!target;
  }
  function moveFocus(direction) {
    if (typeof document === 'undefined' || window.PlezyTV) return false;
    const modal = document.getElementById('modal');
    const scope = modal && !modal.hidden
      ? document.getElementById('modalCard')
      : document.getElementById('screen-' + (window.PlezyUI?.screen || 'login')) || document.body;
    if (!scope) return false;
    const active = document.activeElement;
    const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
    const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
    // 1. Navigation dédiée pour l'écran Choisir le profil
    if (scope.id === 'screen-profiles') {
      const grid = active?.closest?.('#profilesGrid');
      if (horizontal && grid) {
        const cards = [...grid.querySelectorAll('.profile-card')].filter(usable);
        const next = cards[cards.indexOf(active) + sign];
        if (next) { next.focus({preventScroll: true}); return true; }
      }
      if (direction === 'ArrowDown' && grid) {
        const btn = document.getElementById('btnManageProfiles');
        if (btn && usable(btn)) { btn.focus({preventScroll: true}); return true; }
      }
      if (direction === 'ArrowUp' && active?.id === 'btnManageProfiles') {
        const cards = [...(document.getElementById('profilesGrid')?.querySelectorAll('.profile-card') || [])].filter(usable);
        if (cards.length) { (cards[2] || cards[0]).focus({preventScroll: true}); return true; }
      }
    }

    // 2. Navigation directe et intuitive pour l'écran de détails
    if (scope.id === 'screen-detail') {
      if (active?.id === 'dPlay' && direction === 'ArrowDown') {
        const target = document.querySelector('#episodeRail button, #seasonTabs button, #dSimilarSec button, #dAbout');
        if (target && usable(target)) {
          target.focus({preventScroll: true});
          target.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
          return true;
        }
      }
      if (active?.closest?.('#episodeRail,#seasonTabs') && direction === 'ArrowUp') {
        const play = document.getElementById('dPlay');
        if (play && usable(play)) {
          play.focus({preventScroll: true});
          play.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
          return true;
        }
      }
      if (active?.hasAttribute?.('data-back') && direction === 'ArrowDown') {
        const play = document.getElementById('dPlay');
        if (play && usable(play)) { play.focus({preventScroll: true}); return true; }
      }
    }

    // 3. Navigation fluide et intuitive dans le mode lecteur (Player)
    if (scope.id === 'screen-player') {
      const playerUi = document.getElementById('playerUi');
      const isHidden = playerUi?.classList.contains('hide');
      if (isHidden) {
        playerUi?.classList.remove('hide');
        if (window.PlezyPlayer?.wake) window.PlezyPlayer.wake();
        if (horizontal) return false; // laisser le seek se faire
        const play = document.getElementById('pPlay');
        play?.focus({preventScroll: true});
        return true;
      }
      const pPlay = document.getElementById('pPlay');
      const pNext = document.getElementById('pNext');
      const pBar = document.getElementById('pBar');
      const pBack = document.getElementById('pBack');
      const pRestart = document.getElementById('pRestart');
      const pSettings = document.getElementById('pSettings');
      const pLanguages = [...(document.getElementById('pLanguages')?.querySelectorAll('button') || [])].filter(usable);
      const bottomRow = [pPlay, ...(pNext && usable(pNext) ? [pNext] : []), ...pLanguages, pSettings].filter(usable);

      if (active === pBar) {
        if (direction === 'ArrowDown') { pPlay?.focus(); return true; }
        if (direction === 'ArrowUp') { (pBack || pRestart)?.focus(); return true; }
        if (horizontal) return false; // laisser seek sur pBar
      }
      if (bottomRow.includes(active)) {
        if (direction === 'ArrowUp') { pBar?.focus(); return true; }
        if (horizontal) {
          const idx = bottomRow.indexOf(active);
          const next = bottomRow[idx + sign];
          if (next) { next.focus(); return true; }
        }
      }
      if (active === pBack || active === pRestart) {
        if (direction === 'ArrowDown') { pBar?.focus(); return true; }
        if (horizontal) {
          const topRow = [pBack, pRestart].filter(usable);
          const next = topRow[topRow.indexOf(active) + sign];
          if (next) { next.focus(); return true; }
        }
      }
    }

    const track = active?.closest?.('.row-track');
    if (horizontal && track && scope.contains(active)) {
      const row = [...track.querySelectorAll('button:not(.row-arrow)')].filter(usable);
      const next = row[row.indexOf(active) + sign];
      if (next) {
        next.focus({preventScroll: true});
        next.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
      }
      return true;
    }
    const nodes = controls(scope).filter(n => usable(n) && !n.matches?.('.row-arrow,[type="hidden"]'));
    if (!nodes.length) return false;
    if (!nodes.includes(active)) {
      nodes[0].focus({preventScroll: true});
      return true;
    }
    const rect = active.getBoundingClientRect();
    const at = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    const mainPane = active.closest?.('#mainScroll');
    const blockHeader = direction === 'ArrowUp' && mainPane && mainPane.scrollTop > 1;
    let best = null, score = Infinity;
    for (const node of nodes) {
      if (node === active) continue;
      if (blockHeader && node.closest?.('.topbar')) continue;
      const box = node.getBoundingClientRect();
      if (!horizontal && typeof innerWidth === 'number' && (box.right < 40 || box.left > innerWidth - 40)) continue;
      const pt = {x: box.left + box.width / 2, y: box.top + box.height / 2};
      const primary = horizontal ? (pt.x - at.x) * sign : (pt.y - at.y) * sign;
      if (primary < 4) continue;
      const side = Math.abs(horizontal ? pt.y - at.y : pt.x - at.x);
      const overlap = horizontal ? box.bottom > rect.top && box.top < rect.bottom : box.right > rect.left && box.left < rect.right;
      const rank = primary + side * (overlap ? 0.35 : 3) + (overlap ? 0 : 200);
      if (rank < score) { score = rank; best = node; }
    }
    if (best) {
      best.focus({preventScroll: true});
      if (!best.closest?.('.topbar') && !best.closest?.('#screen-player')) {
        best.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
      }
      return true;
    }
    if (!horizontal) {
      const pane = active.closest?.('#detailScroll,#mainScroll,#modalCard');
      if (pane && typeof innerHeight === 'number') pane.scrollBy({top: sign * innerHeight * 0.55, behavior: 'smooth'});
      return true;
    }
    return false;
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    // Keep the visual marker in sync for remote, mouse and programmatic focus.
    document.addEventListener('focusin', event => {
      document.querySelectorAll('#screen-main .focused').forEach(node => node.classList.remove('focused'));
      event.target?.closest?.('#screen-main .tile, #screen-main .poster')?.classList.add('focused');
    });
    document.addEventListener('focusout', event => {
      event.target?.closest?.('#screen-main .tile, #screen-main .poster')?.classList.remove('focused');
    });
    document.addEventListener('keydown', event => {
      if (window.PlezyTV) return;
      const tag = event.target?.tagName || '';
      const input = /INPUT|TEXTAREA|SELECT/.test(tag);
      const isPlayer = window.PlezyUI?.screen === 'player' && document.getElementById('modal')?.hidden;
      const direction = ({19:'ArrowUp', 20:'ArrowDown', 21:'ArrowLeft', 22:'ArrowRight'})[event.keyCode] || event.key || '';
      if (event.keyCode === 23 && event.key !== 'Enter' && !input) {
        const focused = document.activeElement;
        if (focused && usable(focused) && typeof focused.click === 'function') { event.preventDefault(); focused.click(); }
        return;
      }
      if (direction.startsWith('Arrow')) {
        if (input && (tag === 'SELECT' || event.target?.type === 'range' || ['ArrowLeft','ArrowRight'].includes(direction))) return;
        if (isPlayer && ['ArrowLeft','ArrowRight'].includes(direction)) {
          const playerUi = document.getElementById('playerUi');
          const isHidden = playerUi?.classList.contains('hide');
          const isBar = document.activeElement?.id === 'pBar';
          if (isHidden || isBar) return; // laisser le seek se faire
        }
        if (moveFocus(direction)) event.preventDefault();
      }
    });
  }
  window.PlezyNavigation = {capture, restore, moveFocus};
})();
