/* Two-minute polling, with no page reload and no interruption of playback. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root?.PlezyUI && !root.PlezyRefresh) root.PlezyRefresh=api.install(root);
})(typeof window==='undefined'?null:window,()=>{
  const INTERVAL=120000;
  function createScheduler({now=Date.now,active,visible,canRefresh,refresh,keepAlive}) {
    let lastLibrary=now(),lastSession=-Infinity,libraryBusy=false,sessionBusy=false;
    async function tick() {
      if(!active() || !visible()) return;
      const jobs=[],at=now();
      if(!sessionBusy && at-lastSession>=INTERVAL) {
        sessionBusy=true;lastSession=at;
        jobs.push(Promise.resolve().then(keepAlive).catch(()=>{}).finally(()=>{sessionBusy=false;}));
      }
      if(!libraryBusy && at-lastLibrary>=INTERVAL && canRefresh()) {
        libraryBusy=true;lastLibrary=at;
        jobs.push(Promise.resolve().then(refresh).catch(()=>{}).finally(()=>{libraryBusy=false;}));
      }
      await Promise.all(jobs);
    }
    return {tick,invalidate:()=>{lastLibrary=-Infinity;},interval:INTERVAL};
  }
  function install(root) {
    const A=root.PlezyAPI,U=root.PlezyUI,C=A.config,doc=root.document;
    const $=id=>doc.getElementById(id);
    const page=()=>doc.querySelector('[data-page].active')?.dataset.page;
    async function refresh() {
      const current=page(),rows=$('rows'),pane=$('mainScroll');
      const old=[...rows.childNodes],tracks=[...rows.querySelectorAll('.row-track')];
      let scroll=pane.scrollTop,focused=doc.activeElement;
      function snapshot(node) {
        if(!node || !rows.contains(node)) return null;
        const row=node.closest('.row');
        return {row:row?.querySelector('h2')?.textContent,id:node.dataset.mediaId,label:node.getAttribute('aria-label')};
      }
      let selected=snapshot(focused);
      const rememberFocus=event=>{focused=event.target;selected=snapshot(focused);};
      const rememberScroll=()=>{scroll=pane.scrollTop;};
      doc.addEventListener('focusin',rememberFocus);
      pane.addEventListener('scroll',rememberScroll);
      const billboardHidden=$('billboard').classList.contains('hidden');
      try {
        const pending=U.navigate();
        // navigate starts fetching synchronously. Keep the existing interactive
        // rows and position visible until fresh results replace them.
        rows.replaceChildren(...old);pane.scrollTop=scroll;
        $('billboard').classList.toggle('hidden',billboardHidden);
        await pending;
        if(page()!==current) return;
        if(rows.querySelector('.empty-state h2')?.textContent==='Bibliothèque inaccessible') {
          rows.replaceChildren(...old);$('billboard').classList.toggle('hidden',billboardHidden);
        } else {
          rows.dataset.refreshedAt=String(Date.now());
          root.dispatchEvent(new Event('plezy:library-refreshed'));
        }
        const fresh=[...rows.querySelectorAll('.row-track')];
        tracks.forEach(track=>{
          const title=track.closest('.row')?.querySelector('h2')?.textContent;
          const match=fresh.find(node=>node.closest('.row')?.querySelector('h2')?.textContent===title);
          if(match) match.scrollLeft=track.scrollLeft;
        });
        if(U.screen==='main' && $('modal').hidden) {
          pane.scrollTop=scroll;
          if(selected && (!focused.isConnected || doc.activeElement===doc.body)) {
            const section=[...rows.querySelectorAll('.row')].find(row=>row.querySelector('h2')?.textContent===selected.row);
            const buttons=[...(section||rows).querySelectorAll('button')];
            const match=buttons.find(node=>node.dataset.mediaId===selected.id && node.getAttribute('aria-label')===selected.label);
            (match||buttons[0])?.focus({preventScroll:true});
          }
        }
      } finally {doc.removeEventListener('focusin',rememberFocus);pane.removeEventListener('scroll',rememberScroll);}
    }
    const scheduler=createScheduler({
      active:()=>!!(C.demo || C.token && C.user),visible:()=>!doc.hidden,
      canRefresh:()=>U.screen==='main' && $('modal').hidden && ['HOME','MOVIES','SERIES','SEERR'].includes(page()),
      refresh,keepAlive:()=>A.keepSeerrAlive?.(),
    });
    let timer=root.setInterval(scheduler.tick,INTERVAL);
    root.addEventListener('plezy:playback-stopped',()=>{scheduler.invalidate();scheduler.tick();});
    doc.addEventListener('visibilitychange',scheduler.tick);
    // A refresh postponed by a film or a dialog runs when the catalog returns.
    const observer=new MutationObserver(()=>scheduler.tick());
    observer.observe($('screen-main'),{attributes:true,attributeFilter:['hidden','inert']});
    observer.observe($('modal'),{attributes:true,attributeFilter:['hidden']});
    root.addEventListener('pagehide',()=>{root.clearInterval(timer);timer=null;});
    root.addEventListener('pageshow',()=>{if(!timer)timer=root.setInterval(scheduler.tick,INTERVAL);scheduler.tick();});
    scheduler.tick();
    return {interval:INTERVAL,tick:scheduler.tick};
  }
  return {createScheduler,install};
});
