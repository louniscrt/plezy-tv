/* One genuinely most recently watched episode per series; never alter server history. */
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
  async function load(A) {
    // Fetch enough episodes that a prolific series cannot fill all 20 slots.
    const data=await A.jf(`/Users/${A.config.user}/Items/Resume`,{params:{Limit:100,Fields:A.fields,MediaTypes:'Video',EnableUserData:true,SortBy:'DatePlayed',SortOrder:'Descending'}});
    return latest(data.Items||[]).slice(0,20);
  }
  return {latest,load};
});
