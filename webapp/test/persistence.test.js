const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergeCookies,install}=require('../public/seerr-session');
const {createScheduler}=require('../public/refresh');
function client(transport,config={}) {
  const persisted=[];
  const A={config:{seerr:'http://seerr.test',seerrKey:'',seerrCookie:'connect.sid=session',...config},
    save(){persisted.push(JSON.stringify(this.config));},proxy:url=>url,
    endpoint:(base,route,params={})=>{const url=new URL(base+route);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));return url.href;},
    fromSeerr:item=>item,details:async item=>item};
  install(A,transport);return {A,persisted};
}
test('Cookie renouvelé : conserve la session et les autres cookies, sans doublons',()=>{
  assert.equal(mergeCookies('connect.sid=signed=abc; _csrf=old','XSRF-TOKEN=new'),'connect.sid=signed=abc; _csrf=old; XSRF-TOKEN=new');
  assert.equal(mergeCookies('connect.sid=old; _csrf=token','connect.sid=new'),'connect.sid=new; _csrf=token');
  assert.equal(mergeCookies('connect.sid=old; _csrf=token','connect.sid='),'_csrf=token');
});
test('Renouvellement persisté et réutilisable après redémarrage du client',async()=>{
  const {A,persisted}=client(async()=>new Response('{"id":1}',{headers:{'x-set-cookie':'XSRF-TOKEN=renewed'}}));
  await A.keepSeerrAlive();const saved=JSON.parse(persisted.at(-1));assert.equal(saved.seerrCookie,'connect.sid=session; XSRF-TOKEN=renewed');
  let headers;const restarted=client(async(url,options)=>{headers=options.headers;return new Response('{}');},saved);
  await restarted.A.keepSeerrAlive();assert.equal(headers['X-Cookie'],saved.seerrCookie);
});
test('Clé API conservée sans envoyer un ancien cookie expiré',async()=>{
  let headers;const {A}=client(async(url,options)=>{headers=options.headers;return new Response('{}');},{seerrKey:'fixture-key'});
  await A.keepSeerrAlive();assert.equal(headers['X-Api-Key'],'fixture-key');assert.equal(headers['X-Cookie'],undefined);assert.equal(A.config.seerrKey,'fixture-key');
});
test('Panne ou session révoquée : ne déconnecte pas Jellyfin et ne supprime pas les identifiants Seerr',async()=>{
  for(const status of [401,403,500]) {
    const {A}=client(async()=>new Response('{}',{status}),{token:'jf-token'});
    await assert.rejects(A.keepSeerrAlive(),error=>error.status===status);
    assert.equal(A.config.token,'jf-token');assert.equal(A.config.seerrCookie,'connect.sid=session');
  }
});
test('Une réponse en vol ne rétablit pas une session déconnectée explicitement',async()=>{
  let finish;const {A}=client(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=A.seerr('auth/me');A.config.seerrCookie='';
  finish(new Response('{}',{headers:{'x-set-cookie':'connect.sid=stale'}}));await pending;assert.equal(A.config.seerrCookie,'');
});
test('Pas de maintien parallèle ni de mot de passe conservé lors du login',async()=>{
  let finish,calls=0;const {A,persisted}=client(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const first=A.keepSeerrAlive(),second=A.keepSeerrAlive();assert.equal(calls,1);
  finish(new Response('{}'));await Promise.all([first,second]);
  const login=A.seerr('auth/local',{method:'POST',body:{email:'test@example.test',password:'never-save'}});
  finish(new Response('{}',{headers:{'x-set-cookie':'connect.sid=logged-in'}}));await login;
  assert.ok(!persisted.join('').includes('never-save'));
});
function clock() {
  const state={at:1_000_000,active:true,visible:true,canRefresh:true,refreshes:0,heartbeats:0};
  state.scheduler=createScheduler({now:()=>state.at,active:()=>state.active,visible:()=>state.visible,canRefresh:()=>state.canRefresh,
    refresh:async()=>{state.refreshes++;},keepAlive:async()=>{state.heartbeats++;}});return state;
}
test('Intervalle exact : aucun rafraîchissement avant deux minutes',async()=>{
  const state=clock();assert.equal(state.scheduler.interval,120000);await state.scheduler.tick();
  state.at+=119999;await state.scheduler.tick();assert.equal(state.refreshes,0);
  state.at++;await state.scheduler.tick();assert.equal(state.refreshes,1);assert.equal(state.heartbeats,2);
});
test('Lecture ou dialogue : maintien Seerr actif, catalogue différé au retour',async()=>{
  const state=clock();state.canRefresh=false;state.at+=120000;await state.scheduler.tick();
  assert.equal(state.refreshes,0);assert.equal(state.heartbeats,1);
  state.canRefresh=true;await state.scheduler.tick();assert.equal(state.refreshes,1);
});
test('Retour de veille : actualisation immédiate si l’intervalle est écoulé',async()=>{
  const state=clock();state.visible=false;state.at+=600000;await state.scheduler.tick();assert.equal(state.refreshes,0);
  state.visible=true;await state.scheduler.tick();assert.equal(state.refreshes,1);
});
test('Une position enregistrée actualise le catalogue au retour sans attendre deux minutes',async()=>{
  const state=clock();state.at+=10000;state.canRefresh=false;
  state.scheduler.invalidate();await state.scheduler.tick();assert.equal(state.refreshes,0);
  state.canRefresh=true;await state.scheduler.tick();assert.equal(state.refreshes,1);
  await state.scheduler.tick();assert.equal(state.refreshes,1);
});
test('Les actualisations lentes ne se chevauchent pas',async()=>{
  const state=clock();let finish;
  const scheduler=createScheduler({now:()=>state.at,active:()=>true,visible:()=>true,canRefresh:()=>true,keepAlive:async()=>{},refresh:()=>{state.refreshes++;return new Promise(r=>{finish=r;});}});
  state.at+=120000;const pending=scheduler.tick();await Promise.resolve();
  state.at+=120000;await scheduler.tick();assert.equal(state.refreshes,1);finish();await pending;
});
