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
  window.PlezyNavigation = {capture, restore};
})();
