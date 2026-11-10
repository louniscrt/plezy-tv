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
    document.addEventListener('keydown', event => {
      if (window.PlezyTV) return;
      const tag = event.target?.tagName || '';
      const input = /INPUT|TEXTAREA|SELECT/.test(tag);
      const isPlayer = window.PlezyUI?.screen === 'player' && document.getElementById('modal')?.hidden;
      if (event.key.startsWith('Arrow')) {
        if (input && (tag === 'SELECT' || event.target?.type === 'range' || ['ArrowLeft','ArrowRight'].includes(event.key))) return;
        if (isPlayer && ['ArrowLeft','ArrowRight'].includes(event.key) && document.getElementById('screen-player')?.dataset?.state !== 'error') return;
        if (moveFocus(event.key)) event.preventDefault();
      }
    });
  }
  window.PlezyNavigation = {capture, restore, moveFocus};
})();
