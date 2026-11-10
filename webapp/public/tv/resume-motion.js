/* Layout changes once; only transforms animate on the visible TV cards. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PlezyResumeMotion=api;
})(typeof window==='undefined'?null:window,()=>{
  const active=new WeakMap();
  function select(button,{width=window.innerWidth,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches}={}) {
    if(button.classList.contains('resume-selected'))return;
    const cards=[...button.parentElement.querySelectorAll('.resume-card')];
    const before=new Map(cards.map(card=>[card,card.getBoundingClientRect()]));
    for(const card of cards){active.get(card)?.cancel();card.classList.toggle('resume-selected',card===button);}
    if(reduced)return;
    for(const card of cards){
      const from=before.get(card),to=card.getBoundingClientRect();
      if(!card.animate||!to.width||to.right<0||to.left>width)continue;
      const dx=from.left-to.left,scale=from.width/to.width;
      if(Math.abs(dx)<.5&&Math.abs(scale-1)<.01)continue;
      const animation=card.animate([
        {transform:`translateX(${dx}px) scaleX(${scale})`,transformOrigin:'left top'},
        {transform:'none',transformOrigin:'left top'}
      ],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
      active.set(card,animation);
    }
  }
  return {select};
});
