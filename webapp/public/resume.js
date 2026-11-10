/* One most recently watched episode per series; explicit reset is separate from local hiding. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PlezyResume=api;
})(typeof window==='undefined'?null:window,()=>{
  const id=value=>String(value||'').replaceAll('-','').toLowerCase();
  const played=item=>Date.parse(item.UserData?.LastPlayedDate||'')||0;
  const episode=item=>(Number(item.ParentIndexNumber)||0)*100000+(Number(item.IndexNumber)||0);
  function latest(items=[]) {
    const groups=new Map();
    items.forEach((item,index)=>{
      const series=item.Type==='Episode'&&(item.SeriesId||item.SeriesName);
      const key=series?'series:'+(item.SeriesId?id(item.SeriesId):String(item.SeriesName).trim().toLowerCase()):'item:'+(id(item.Id)||index);
      const previous=groups.get(key);
      if(!previous)groups.set(key,{item,index});
      else if(played(item)>played(previous.item)||played(item)===played(previous.item)&&episode(item)>episode(previous.item))previous.item=item;
    });
    return [...groups.values()].sort((a,b)=>played(b.item)-played(a.item)||a.index-b.index).map(entry=>entry.item);
  }
  const scope=A=>'plezy.web.resume.hidden.'+JSON.stringify([A.config.server||'local',A.config.user||'local']);
  const group=item=>item.Type==='Series'?'series:'+id(item.Id):item.Type==='Episode'&&item.SeriesId?'series:'+id(item.SeriesId):'item:'+id(item.Id);
  function store(A) {
    try { const value=JSON.parse(localStorage.getItem(scope(A))||'{}'); return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
    catch { return {}; }
  }
  function change(A,edit) {
    const value=store(A); edit(value);
    localStorage.setItem(scope(A),JSON.stringify(value));
  }
  function remove(A,item) { change(A,value=>{value[group(item)]=true;}); }
  // Explicit TV removal also resets the selected film/episode before hiding it.
  async function resetAndRemove(A,item,target=item) {
    if (!target?.Id || target.Type === 'Series') throw new Error('Épisode à remettre à zéro indisponible. Rouvrez sa fiche.');
    const server=A.config.server, user=A.config.user;
    const stremio=String(target.Id).startsWith('stremio~');
    if (stremio) {
      await A.jf('/Sessions/Playing/Progress',{method:'POST',body:{ItemId:target.Id,PositionTicks:0}});
    } else {
      await A.jf(`/Users/${encodeURIComponent(user)}/PlayedItems/${encodeURIComponent(target.Id)}`,{method:'DELETE'});
    }
    if (A.config.server!==server || A.config.user!==user) throw new Error('Le profil a changé. La position a été remise à zéro sur le profil précédent.');
    target.UserData={...target.UserData,PlaybackPositionTicks:0,...(stremio?{}:{Played:false,PlayCount:0,LastPlayedDate:null})};
    remove(A,item);
  }
  function complete(A,item) { change(A,value=>{value['finished:'+id(item.Id)]=true;}); }
  function restore(A,item) { change(A,value=>{delete value[group(item)];delete value['finished:'+id(item.Id)];}); }
  function visible(A,items) {
    const hidden=store(A);
    return latest(items).filter(item=>!hidden[group(item)]&&!hidden['finished:'+id(item.Id)]&&!item.UserData?.Played);
  }
  async function load(A) {
    // Fetch enough episodes that a prolific series cannot fill all 20 slots.
    const data=await A.jf(`/Users/${A.config.user}/Items/Resume`,{params:{Limit:100,Fields:A.fields,MediaTypes:'Video',EnableUserData:true,SortBy:'DatePlayed',SortOrder:'Descending'}});
    return visible(A,data.Items||[]).slice(0,20);
  }
  return {latest,load,remove,resetAndRemove,complete,restore,visible};
});
