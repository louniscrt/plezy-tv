const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const {createServer} = require('../server');
let app, upstream, base, remote, calls=[];
const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
before(async()=>{
 upstream = http.createServer(async(req,res)=>{
  let body=''; for await(const chunk of req) body+=chunk;
  calls.push({url:req.url,method:req.method,headers:req.headers,body});
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/master.m3u8') {res.setHeader('content-type','application/vnd.apple.mpegurl');return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nchild/segment.ts\n');}
  if(url.pathname==='/range') {res.writeHead(206,{'content-type':'video/mp4','content-range':'bytes 2-5/10','accept-ranges':'bytes','content-length':4});return res.end('2345');}
  if(url.pathname==='/slow') {res.writeHead(200,{'content-type':'video/mp4'});res.write('first');const timer=setInterval(()=>res.write('chunk'),5);res.on('close',()=>clearInterval(timer));return;}
  if(url.pathname==='/interrupted') {res.writeHead(200,{'content-type':'video/mp4','content-length':1000});res.write('partial');setTimeout(()=>res.destroy(),10);return;}
  if(url.pathname==='/redirect') {res.writeHead(302,{location:'/range'});return res.end();}
  if(url.pathname==='/error') {res.writeHead(403);return res.end('{}');}
  if(url.pathname.startsWith('/Users/') && !req.headers.authorization) {res.writeHead(400);return res.end('Missing Authorization header');}
  if(url.pathname==='/Users/AuthenticateByName') {res.setHeader('content-type','application/json');return res.end(JSON.stringify({AccessToken:'test-token',User:{Id:'user-1',Name:'Test'}}));}
  if(url.pathname==='/api/v1/auth/local') res.setHeader('set-cookie',['connect.sid=fixture-session; HttpOnly; Path=/']);
  res.setHeader('content-type','application/json');res.end(JSON.stringify({Items:[{Id:'film-1',Name:'Film test'}],results:[]}));
 });
 remote=await listen(upstream);app=createServer();base=await listen(app);
});
after(async()=>{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>upstream.close(r))]);});
const relay = route => base+'/proxy?url='+encodeURIComponent(remote+route);
test('all application scripts, local assets and manifest are served with valid types',async()=>{
 const response=await fetch(base);assert.equal(response.status,200);const html=await response.text();
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if(!/\.(js|css|svg|webmanifest)$/.test(new URL(match[1],base).pathname))continue;
  const asset=await fetch(base+'/'+match[1]);assert.equal(asset.status,200,match[1]);assert.ok(!asset.headers.get('content-type').includes('text/html'),match[1]);
 }
 const manifest=await(await fetch(base+'/manifest.webmanifest')).json();for(const icon of manifest.icons)assert.equal((await fetch(base+icon.src)).status,200);
});
test('health endpoint identifies the Node relay without exposing server configuration',async()=>{
 const response=await fetch(base+'/health');assert.equal(response.status,200);assert.equal(response.headers.get('x-plezy-relay'),'1');
 assert.deepEqual(await response.json(),{service:'plezy-web',status:'ok',relay:true});assert.equal(response.headers.get('cache-control'),'no-store');
 const head=await fetch(base+'/health',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('missing scripts return 404 instead of HTML; malformed escapes return 400',async()=>{
 assert.equal((await fetch(base+'/missing.js')).status,404);assert.equal((await fetch(base+'/%ZZ')).status,400);
});
test('proxy preserves byte ranges and returns streaming bytes unchanged',async()=>{
 const r=await fetch(relay('/range'),{headers:{range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');assert.equal(calls.at(-1).headers.range,'bytes=2-5');
});
test('media URLs authenticate without relying on custom video element headers',async()=>{
 const r=await fetch(relay('/range?api_key=fixture-token'));assert.equal(r.status,206);
 assert.match(calls.at(-1).headers.authorization,/Token="fixture-token"/);
});
test('cancelling a video and losing an upstream stream do not crash the web server',async()=>{
 const response=await fetch(relay('/slow'));const reader=response.body.getReader();await reader.read();await reader.cancel();
 const interrupted=await fetch(relay('/interrupted'));await assert.rejects(()=>interrupted.arrayBuffer());
 assert.equal((await fetch(base)).status,200);
});
test('HLS playlists proxy both segment and key URI and propagate same-origin API key',async()=>{
 const r=await fetch(relay('/master.m3u8?api_key=fixture'));const body=await r.text();assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),null);
 const key=body.match(/URI="([^"]+)"/)[1], segment=body.trim().split('\n').at(-1);
 for(const uri of [key,segment]) {const nested=new URL(new URL(uri,base).searchParams.get('url'));assert.equal(nested.origin,remote);assert.equal(nested.searchParams.get('api_key'),'fixture');}
});
test('GET redirects, upstream errors and session cookies are relayed',async()=>{
 assert.equal((await fetch(relay('/redirect'))).status,206);assert.equal((await fetch(relay('/error'))).status,403);
 const result=await fetch(relay('/api/v1/auth/local'),{method:'POST',headers:{'x-cookie':'connect.sid=before','content-type':'application/json'},body:'{"email":"test@example.test"}'});
 assert.equal(result.headers.get('x-set-cookie'),'connect.sid=fixture-session');assert.equal(calls.at(-1).headers.cookie,'connect.sid=before');assert.equal(result.headers.get('cache-control'),'no-store');
});
test('proxy rejects foreign origins and non-HTTP targets',async()=>{
 assert.equal((await fetch(relay('/range'),{headers:{origin:'https://foreign.example'}})).status,403);
 assert.equal((await fetch(base+'/proxy?url=file:///etc/passwd')).status,400);
 assert.equal((await fetch(base+'/proxy')).status,400);
});
function apiContext(fetcher){
 const storage=new Map(); const context={window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:webcrypto,URL,AbortSignal,fetch:(url,options)=>(fetcher||fetch)(new URL(url,base),options)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/api.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/seerr-session.js'),'utf8'),context);return context.window.PlezyAPI;
}
test('static Docker hosting gives a deployment error instead of blaming Jellyfin credentials',async()=>{
 const api=apiContext(async()=>new Response('<h1>404 Not Found</h1>',{status:404,headers:{'content-type':'text/html'}}));
 await assert.rejects(()=>api.request('http://fixture','/QuickConnect/Initiate',{method:'POST',auth:false}),error=>error.code==='PLEZY_RELAY_UNAVAILABLE' && error.message.includes('Node.js'));
});
test('Jellyfin API 404 responses remain distinct from a missing deployment relay',async()=>{
 const api=apiContext(async()=>new Response('Not found',{status:404,headers:{'x-plezy-relay':'1'}}));
 await assert.rejects(()=>api.request('http://fixture','/missing'),error=>error.status===404 && !error.code);
});
test('Jellyfin authentication omits stale token, persists session and never persists password',async()=>{
 const api=apiContext();api.config.token='expired';await api.login(remote+'/web/index.html',' alice ','secret');
 const auth=calls.at(-1);assert.equal(auth.url,'/Users/AuthenticateByName');assert.equal(auth.headers.authorization,auth.headers['x-emby-authorization']);assert.ok(!auth.headers.authorization.includes('expired'));assert.deepEqual(JSON.parse(auth.body),{Username:'alice',Pw:'secret'});
 assert.equal(api.config.token,'test-token');assert.equal(api.config.user,'user-1');assert.ok(!JSON.stringify(api.config).includes('secret'));
 const films=await api.items({SearchTerm:'test & titre'});assert.equal(films[0].Id,'film-1');const query=new URL(calls.at(-1).url,remote);assert.equal(query.searchParams.get('SearchTerm'),'test & titre');assert.match(calls.at(-1).headers['x-emby-authorization'],/test-token/);
});
test('Seerr cookie auth and API-key auth use the correct headers and query parameters',async()=>{
 const api=apiContext();api.config.seerr=remote;
 await api.seerr('auth/local',{method:'POST',body:{email:'test@example.test',password:'secret'}});assert.equal(api.config.seerrCookie,'connect.sid=fixture-session');
 await api.discover('search?query=film%20test');assert.equal(calls.at(-1).headers.cookie,'connect.sid=fixture-session');assert.equal(new URL(calls.at(-1).url,remote).searchParams.get('query'),'film test');
 api.config.seerrKey='key-fixture';await api.seerr('auth/me');assert.equal(calls.at(-1).headers['x-api-key'],'key-fixture');
});
test('media conversion separates movie and TV ids and handles missing images and ratings',()=>{
 const api=apiContext();const movie=api.fromSeerr({id:10,title:'Film',releaseDate:'2025-01-01',mediaInfo:{status:4}},'movie');const tv=api.fromSeerr({id:10,name:'Série'},'tv');
 assert.notEqual(movie.Id,tv.Id);assert.equal(movie.ProductionYear,2025);assert.equal(tv.Type,'Series');assert.equal(api.image(movie),'');assert.equal(api.image({demo:true,art:'art.jpg'},'Logo'),'');
});
test('normalization preserves reverse-proxy subpaths and rejects embedded credentials',()=>{
 const api=apiContext();assert.equal(api.normalize('media.local:8096/jellyfin/web/index.html'),'http://media.local:8096/jellyfin');assert.throws(()=>api.normalize('http://user:password@localhost'));assert.throws(()=>api.normalize(''));
});

test('mock Jellyfin endpoints support TV app login and info without hard drives', async () => {
 const srv = createServer({ stremio: { enabled: true } });
 await new Promise(resolve => srv.listen(0, resolve));
 const port = srv.address().port;
 try {
  const info = await fetch(`http://127.0.0.1:${port}/System/Info/Public`).then(r => r.json());
  assert.equal(info.ServerName, 'Plezy');
  assert.equal(info.StartupWizardCompleted, true);

  const auth = await fetch(`http://127.0.0.1:${port}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: 'Lounis', Pw: '' })
  }).then(r => r.json());
  assert.ok(auth.AccessToken);
  assert.equal(auth.User.Name, 'Lounis');

  const qc = await fetch(`http://127.0.0.1:${port}/QuickConnect/Initiate`, { method: 'POST' }).then(r => r.json());
  assert.equal(qc.Authenticated, true);
  assert.ok(qc.Code);
 } finally {
  await new Promise(resolve => srv.close(resolve));
 }
});
