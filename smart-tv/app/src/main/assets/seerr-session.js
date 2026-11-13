/* Persistent Seerr credentials and rolling session cookies; never store passwords. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root?.PlezyAPI) api.install(root.PlezyAPI);
})(typeof window==='undefined'?null:window,()=>{
  function mergeCookies(current,updates) {
    const jar=new Map();
    for(const cookie of (current||'').split(/;\s*/)) {
      const at=cookie.indexOf('='); if(at>0) jar.set(cookie.slice(0,at),cookie.slice(at+1));
    }
    for(const cookie of (updates||'').split(/;\s*/)) {
      const at=cookie.indexOf('='); if(at<1) continue;
      const name=cookie.slice(0,at),value=cookie.slice(at+1);
      if(value) jar.set(name,value); else jar.delete(name);
    }
    return [...jar].map(([name,value])=>name+'='+value).join('; ');
  }
  function install(A,transport=fetch) {
    if(A.keepSeerrAlive) return A;
    const C=A.config, originalDetails=A.details;
    A.seerr=async function(route,{method='GET',body,params,signal}={}) {
      const base=C.seerr,key=C.seerrKey,cookie=C.seerrCookie;
      const login=/^auth\/(?:local|jellyfin|plex)(?:\?|$)/.test(route);
      const headers={Accept:'application/json'};
      if(body!==undefined) headers['Content-Type']='application/json';
      if(!login && key) headers['X-Api-Key']=key;
      else if(!login && cookie) headers['X-Cookie']=cookie;
      const response=await transport(A.proxy(A.endpoint(base,'/api/v1/'+route,params)),{
        method,headers,body:body===undefined?undefined:JSON.stringify(body),
        signal:signal||AbortSignal.timeout(25000),cache:'no-store',
      });
      const cookies=response.headers.get('x-set-cookie');
      // Partial cookie renewals must not erase connect.sid. Ignore replies from
      // an old server/key or a session explicitly disconnected while in flight.
      if(cookies && C.seerr===base && C.seerrKey===key && (login || !cookie || C.seerrCookie)) {
        C.seerrCookie=mergeCookies(C.seerrCookie,cookies); A.save();
      }
      if(!response.ok) {
        const error=new Error(response.status===401?'La connexion Seerr a expiré ou a été révoquée. Reconnectez Seerr, ou utilisez une clé API pour une connexion durable.':response.status===403?'Votre compte Seerr n’a pas accès à cette action.':`Seerr a renvoyé une erreur (${response.status}).`);
        error.status=response.status; throw error;
      }
      const text=await response.text();
      if(!text) return {};
      try{return JSON.parse(text);}catch{throw new Error('Réponse Seerr inattendue. Vérifiez son adresse.');}
    };
    A.discover=async route=>{
      const data=await A.seerr(route,{params:{language:'fr'}});
      return (data.results||[]).filter(item=>item.mediaType!=='person').map(item=>A.fromSeerr(item));
    };
    A.details=async item=>item.seerr?A.fromSeerr(await A.seerr(`${item.Type==='Series'?'tv':'movie'}/${item.id}`,{params:{language:'fr'}}),item.Type==='Series'?'tv':'movie'):originalDetails.call(A,item);
    let heartbeat;
    A.keepSeerrAlive=()=>{
      if(C.demo || !C.seerr || !(C.seerrKey||C.seerrCookie)) return Promise.resolve(false);
      if(!heartbeat) heartbeat=A.seerr('auth/me').then(()=>true).finally(()=>{heartbeat=null;});
      return heartbeat;
    };
    return A;
  }
  return {mergeCookies,install};
});
