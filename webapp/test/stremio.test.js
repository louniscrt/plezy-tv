const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStremio, encodeId, decodeId, supports, baseUrl } = require('../stremio');
const { createServer } = require('../server');
const http = require('node:http');
const film = { id: 'tt123', name: 'Fixture', type: 'movie', description: 'Synopsis', poster: 'https://images.test/poster.jpg' };
const series = { ...film, type: 'series', id: 'tt456', name: 'Series', videos: [{id:'tt456:1:2',title:'Second',season:1,episode:2},{id:'tt456:1:1',title:'First',season:1,episode:1}] };
function fixture() {
  const calls = [];
  const engine = createStremio({ config: { metadataManifest: false, addons: ['https://one.test/private-fixture/manifest.json', 'https://two.test/manifest.json', 'https://bad.test/manifest.json'] }, fetchJSON: async url => {
    calls.push(url);
    if (url.includes('bad.test')) throw new Error('offline');
    if (url.endsWith('manifest.json')) return { types: ['movie', 'series'], resources: ['catalog', { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] }, 'stream'], catalogs: [{type:'movie',id:'top',extra:[{name:'search'},{name:'skip'}]}] };
    if (url.includes('/catalog/')) return { metas: [film] };
    if (url.includes('/meta/series/')) return { meta: series };
    if (url.includes('/meta/')) return { meta: film };
    if (url.includes('/stream/')) return { streams: [{url:'https://cdn.test/film.mp4',behaviorHints:{proxyHeaders:{request:{'User-Agent':'Plezy','Host':'malicious.test'}}}}, {url:'https://cdn.test/film.mp4',behaviorHints:{proxyHeaders:{request:{'User-Agent':'Plezy'}}}}, {infoHash:'abc'}, {url:'file:///etc/passwd'}, {url:'https://cdn.test/external',behaviorHints:{notWebReady:true}}] };
    throw new Error('unexpected request');
  }});
  return { engine, calls };
}
test('multiple catalogs and streams are deduplicated; failed addons do not block others', async () => {
  const { engine, calls } = fixture();
  assert.equal((await engine.catalog({ search:'été & test' })).length, 1);
  assert.ok(calls.some(c => c.includes('search=%C3%A9t%C3%A9%20%26%20test')));
  const streams = await engine.streams(encodeId('movie', 'tt123'));
  assert.equal(streams.length, 1); assert.equal(streams[0].headers['user-agent'],'Plezy'); assert.equal(streams[0].headers.host,undefined);
  const before = calls.length; await engine.streams(encodeId('movie', 'tt123')); assert.equal(calls.length,before + 1); // failed manifest is retried, successful streams cached
});
test('metadata and episode identifiers preserve Stremio IDs and order', async () => {
  const { engine } = fixture();
  assert.equal((await engine.meta(encodeId('movie','tt123'))).item.Overview,'Synopsis');
  const list = await engine.episodes(encodeId('series','tt456'));
  assert.deepEqual(list.map(i=>i.IndexNumber),[1,2]); assert.equal(decodeId(list[1].Id).id,'tt456:1:2');
  assert.equal(list[0].SeriesId,encodeId('series','tt456')); assert.equal(list[0].Type,'Episode');
});
test('manifest transports, resource objects, id prefixes and ID validation', () => {
  assert.equal(baseUrl('stremio://addon.test/token/manifest.json'),'https://addon.test/token');
  assert.throws(()=>baseUrl('https://user:password@addon.test/manifest.json'));
  assert.throws(()=>baseUrl('file:///private/config'));
  assert.throws(()=>decodeId('jellyfin-id'));
  assert.equal(supports({resources:[{name:'stream',types:['movie'],idPrefixes:['tt']}]},'stream','movie','tt123'),true);
  assert.equal(supports({resources:[{name:'stream',types:['series'],idPrefixes:['tt']}]},'stream','movie','tt123'),false);
});
test('catalogs requiring unsupported extra fields are skipped and pagination is advertised', async () => {
  const calls=[];
  const engine=createStremio({config:{addons:['https://addon.test/manifest.json'],metadataManifest:false},fetchJSON:async url=>{
    calls.push(url);return url.endsWith('manifest.json')?{catalogs:[{type:'movie',id:'search',extra:[{name:'search',isRequired:true}]},{type:'movie',id:'genre',extra:[{name:'genre',isRequired:true}]},{type:'movie',id:'fixed'}]}:{metas:[film]};
  }});
  await engine.catalog({skip:100});assert.equal(calls.filter(u=>u.includes('/catalog/')).length,0);
  await engine.catalog({search:'test'});assert.equal(calls.filter(u=>u.includes('/catalog/')).length,1);
});
test('server never discloses configured manifests and relays media ranges through opaque tickets', async t => {
  const upstream=http.createServer((req,res)=>{assert.equal(req.headers['user-agent'],'Plezy');assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.range,'bytes=0-3');res.writeHead(206,{'content-type':'video/mp4','content-range':'bytes 0-3/8'});res.end('film');});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));t.after(()=>upstream.close());
  const {engine}=fixture();
  engine.streams=async()=>[{url:`http://127.0.0.1:${upstream.address().port}/private-media`,headers:{'user-agent':'Plezy'}}];
  const server=createServer({stremio:engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const root=`http://127.0.0.1:${server.address().port}`;
  const status=await fetch(root+'/api/stremio/status');assert.deepEqual(await status.json(),{enabled:true});
  const response=await fetch(root+'/api/stremio/streams?id='+encodeURIComponent(encodeId('movie','tt123')));
  const text=await response.text();assert.ok(!text.includes('private-fixture'));assert.ok(!text.includes('private-media'));
  const url=JSON.parse(text).streams[0].url;
  const media=await fetch(root+url,{headers:{Range:'bytes=0-3',Authorization:'Jellyfin-secret'}});assert.equal(media.status,206);assert.equal(await media.text(),'film');
  assert.equal((await fetch(root+'/api/stremio/status',{headers:{Origin:'https://foreign.test'}})).status,403);
  assert.equal((await fetch(root+'/api/stremio/media/unknown')).status,404);
});

test('HLS playlists use opaque tickets for segments and strip credentials on a different origin',async t=>{
 const seen=[];
 const upstream=http.createServer((req,res)=>{
  seen.push(req.headers);
  if(req.url==='/master.m3u8'){res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl'});return res.end('#EXTM3U\nsegment.ts\nhttps://other.test/private.ts\n');}
  res.writeHead(200,{'content-type':'video/mp2t'});res.end('segment');
 });
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));t.after(()=>upstream.close());
 const {engine}=fixture();const ticket=engine.ticket({url:`http://127.0.0.1:${upstream.address().port}/master.m3u8`,headers:{authorization:'fixture-only'}});
 const server=createServer({stremio:engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const root=`http://127.0.0.1:${server.address().port}`;
 const playlist=await(await fetch(root+ticket)).text();assert.ok(!playlist.includes('other.test'));assert.ok(!playlist.includes('fixture-only'));
 const lines=playlist.trim().split('\n');assert.equal(await(await fetch(root+lines[1])).text(),'segment');assert.equal(seen[1].authorization,'fixture-only');
 assert.equal(engine.getTicket(lines[2].split('/').at(-1)).headers.authorization,undefined);
});

test('direct playback prefers H264 MP4 over HEVC 4K and excludes pending RD downloads',async()=>{
 const engine=createStremio({config:{metadataManifest:false,addons:['https://fixture.test/manifest.json']},fetchJSON:async url=>url.endsWith('manifest.json')?{types:['movie'],resources:['stream']}:{streams:[
  {name:'[RD+] 4K',url:'https://cdn.test/hevc',behaviorHints:{filename:'film.2160p.x265.mkv'}},
  {name:'[RD download]',url:'https://cdn.test/pending',behaviorHints:{filename:'film.1080p.x264.mp4'}},
  {name:'[RD+] 1080p',url:'https://cdn.test/compatible',behaviorHints:{filename:'film.1080p.x264.mp4'}}
 ]}});
 const streams=await engine.streams(encodeId('movie','tt123'));
 assert.equal(streams.length,2);assert.equal(streams[0].url,'https://cdn.test/compatible');
});

test('French-only streams reject ambiguous MULTI, VOSTFR and titles containing French',async()=>{
 const {isFrenchStream}=require('../stremio');
 for(const filename of ['Film.2020.FRENCH.1080p.mp4','Film.MULTI.VFF.1080p.mkv','Film.TRUEFRENCH.mkv'])assert.equal(isFrenchStream({behaviorHints:{filename}}),true,filename);
 for(const filename of ['Film.MULTI.1080p.mkv','Film.VOSTFR.1080p.mkv','The.French.Connection.1971.1080p.ENGLISH.mkv'])assert.equal(isFrenchStream({behaviorHints:{filename}}),false,filename);
 assert.equal(isFrenchStream({title:'Audio 🇫🇷'}),true);
 const engine=createStremio({config:{frenchOnly:true,metadataManifest:false,addons:['https://fixture.test/manifest.json']},fetchJSON:async url=>url.endsWith('manifest.json')?{types:['movie'],resources:['stream']}:{streams:[{url:'https://cdn.test/fr',title:'🇫🇷'},{url:'https://cdn.test/unknown',title:'MULTI'},{url:'https://cdn.test/en',title:'English'}]}});
 const streams=await engine.streams(encodeId('movie','tt123'));assert.equal(streams.length,1);assert.equal(streams[0].url,'https://cdn.test/fr');
 const variants=await engine.streams(encodeId('movie','tt123'),{includeVariants:true});
 assert.equal(variants.streams[0].url,'https://cdn.test/fr');
 assert.ok(variants.englishStreams.some(s=>s.url==='https://cdn.test/en'));
 assert.ok(variants.fallbackStreams.some(s=>s.url==='https://cdn.test/unknown'));
});
test('French metadata uses the configured Seerr binding without exposing its credentials',async()=>{
 let called=false;
 const engine=createStremio({config:{metadataManifest:false,addons:['https://fixture.test/manifest.json'],metadata:{seerrUrl:'http://metadata.test',seerrApiKey:'fixture-private'}},fetchJSON:async(url,headers)=>{
  if(url.endsWith('manifest.json'))return {types:['movie'],resources:['meta'],catalogs:[{id:'top',type:'movie'}]};
  if(url.includes('/api/v1/movie/603')){called=true;assert.equal(headers['X-Api-Key'],'fixture-private');assert.ok(url.endsWith('?language=fr'));return {title:'Titre français',overview:'Synopsis français',genres:[{name:'Science-fiction'}]};}
  if(url.includes('/catalog/'))return {metas:[{...film,moviedb_id:603}]};
  return {meta:{...film,moviedb_id:603}};
 }});
 const item=(await engine.meta(encodeId('movie','tt123'))).item;assert.equal(item.Name,'Titre français');assert.equal(item.Overview,'Synopsis français');assert.equal(item.Genres[0],'Science-fiction');assert.ok(called);assert.ok(!JSON.stringify(item).includes('fixture-private'));
});

test('resolving Seerr titles for playback is read-only; download uses only the existing Seerr request pipeline',async()=>{
 const writes=[];
 const engine=createStremio({config:{metadataManifest:false,addons:['https://fixture.test/manifest.json'],metadata:{seerrUrl:'http://metadata.test',seerrApiKey:'fixture-private'}},fetchJSON:async(url,headers,options)=>{
  if(options?.method==='POST'){writes.push({url,headers,body:options.body});return {id:42,status:1,requestedBy:{email:'private@example.test'}};}
  if(url.endsWith('manifest.json'))return {types:['movie'],resources:['meta']};
  if(url.includes('/api/v1/movie/603'))return {title:'Matrix',overview:'Synopsis français',externalIds:{imdbId:'tt0133093'}};
  return {meta:{id:'tt0133093',name:'The Matrix',moviedb_id:603}};
 }});
 const resolved=await engine.resolveMedia({tmdbId:603,type:'movie'});assert.equal(resolved.item.Id,'stremio~movie~tt0133093');assert.equal(writes.length,0);
 const result=await engine.requestMedia({id:resolved.item.Id,type:'movie'});assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{mediaType:'movie',mediaId:603});assert.deepEqual(result,{ok:true,requestId:42,status:1});assert.ok(!JSON.stringify(result).includes('private'));
 assert.equal(writes[0].body.serverId,undefined);assert.equal(writes[0].body.profileId,undefined);assert.equal(writes[0].body.rootFolder,undefined);
});

test('stream indexing filters out camrips, spam, uncached and wrong-year releases, and prioritizes VFF over VFQ', async () => {
  const { isTrueFrenchStream, isVfqStream } = require('../stremio');
  assert.equal(isTrueFrenchStream({ behaviorHints: { filename: 'Film.2026.MULTi.VFF.1080p.mkv' } }), true);
  assert.equal(isVfqStream({ behaviorHints: { filename: 'Film.2026.MULTi.VFQ.2160p.mkv' } }), true);

  const engine = createStremio({
    config: {
      frenchOnly: true,
      metadataManifest: false,
      addons: ['https://fixture.test/manifest.json']
    },
    fetchJSON: async url => {
      if (url.endsWith('manifest.json')) return { types: ['movie'], resources: ['stream'] };
      return {
        streams: [
          { url: 'https://cdn.test/wrong-year', title: 'Resident Evil 1997 1080p WEB' },
          { url: 'https://cdn.test/camrip', title: 'Resident.Evil.2026.camrip.1080p' },
          { url: 'https://cdn.test/uncached', name: '[❌] Comet', title: 'Resident.Evil.2026' },
          { url: 'https://cdn.test/spam', title: 'Watch Resident Evil (2026) Free HD - Flixmomo.mp4' },
          { url: 'https://cdn.test/vfq-4k', title: 'Resident.Evil.2026.MULTi.VFQ.2160p.HDR.WEB.H265.mkv', behaviorHints: { filename: 'Resident.Evil.2026.MULTi.VFQ.2160p.HDR.WEB.H265.mkv' } },
          { url: 'https://cdn.test/multi-vff-1080p', title: 'Resident.Evil.2026.MULTi.1080p.WEB.H265-YTO\nMulti Audio / 🇬🇧 / 🇫🇷', behaviorHints: { filename: 'Resident.Evil.2026.MULTi.1080p.WEB.H265-YTO.mkv' } }
        ]
      };
    }
  });

  const streams = await engine.streams(encodeId('movie', 'tt35538033'), { year: 2026 });
  assert.equal(streams.length, 2);
  assert.equal(streams[0].url, 'https://cdn.test/multi-vff-1080p');
  assert.equal(streams[1].url, 'https://cdn.test/vfq-4k');
});

test('resolving tmdb: prefix queries stream addons with resolved IMDb ID and returns streams', async () => {
  const calls = [];
  const engine = createStremio({
    config: {
      metadataManifest: false,
      addons: ['https://stream.test/manifest.json'],
      metadata: { seerrUrl: 'https://seerr.test', seerrApiKey: 'test-key' }
    },
    fetchJSON: async (url, headers) => {
      calls.push(url);
      if (url.endsWith('manifest.json')) {
        return {
          types: ['movie', 'series'],
          resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }]
        };
      }
      if (url.includes('/api/v1/movie/155')) {
        return { id: 155, externalIds: { imdbId: 'tt0468569' } };
      }
      if (url.includes('/stream/movie/tt0468569.json')) {
        return {
          streams: [
            { url: 'https://cdn.test/dark-knight.mp4', title: 'The.Dark.Knight.2008.1080p.VF.mp4' }
          ]
        };
      }
      throw new Error('Unexpected URL: ' + url);
    }
  });

  const res = await engine.streams(encodeId('movie', 'tmdb:155'), { includeVariants: true });
  assert.equal(res.streams.length, 1);
  assert.equal(res.streams[0].url, 'https://cdn.test/dark-knight.mp4');
  assert.ok(calls.some(c => c.includes('/stream/movie/tt0468569.json')));
});
