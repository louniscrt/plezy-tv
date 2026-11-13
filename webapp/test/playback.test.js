const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function playback(response,variant=''){
 let call;
 const api={config:{server:'http://media.local:8096/jellyfin',user:'u1',token:'fixture-token'},device:'browser-1',endpoint:(base,route,params)=>{const u=new URL(base+route);for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);return u.href;},jf:async(route,options)=>{call={route,options};return response;}};
 const context={window:{PlezyAPI:api},URL,fetch:async()=>({ok:true,json:async()=>({duration:8000})})};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/'+variant+'playback.js'),'utf8'),context);
 return {api:context.window.PlezyPlayback,get call(){return call;}};
}
test('negotiation declares only browser containers and uses server media source/session IDs',async()=>{
 const fixture=playback({PlaySessionId:'session1',MediaSources:[{Id:'source1',Container:'mp4',SupportsDirectPlay:true}]});
 const plan=await fixture.api.negotiate({Id:'film1',MediaSources:[{Id:'original-source'}]});
 assert.equal(fixture.call.route,'/Items/film1/PlaybackInfo');assert.equal(fixture.call.options.body.UserId,'u1');assert.equal(fixture.call.options.body.MediaSourceId,'original-source');
 assert.ok(!fixture.call.options.body.DeviceProfile.DirectPlayProfiles.some(p=>p.Container.includes('mkv')));
 assert.equal(plan.session,'session1');assert.equal(plan.source.Id,'source1');assert.equal(plan.method,'DirectPlay');assert.equal(plan.hls,false);
 const u=new URL(plan.url);assert.equal(u.pathname,'/jellyfin/Videos/film1/stream.mp4');assert.equal(u.searchParams.get('api_key'),'fixture-token');assert.equal(u.searchParams.get('MediaSourceId'),'source1');
});

test('TV audio selection allows remux/video copy instead of forcing video encoding',async()=>{
 const fixture=playback({PlaySessionId:'tv-session',MediaSources:[{Id:'s',Container:'mkv',TranscodingUrl:'/Videos/f/master.m3u8?VideoCodec=copy'}]},'tv/');
 const plan=await fixture.api.negotiate({Id:'f'},{start:127,audio:5,subtitle:-1});
 const body=fixture.call.options.body;
 assert.equal(body.EnableDirectPlay,false);assert.equal(body.EnableDirectStream,true);assert.equal(body.AllowVideoStreamCopy,true);
 assert.equal(body.AudioStreamIndex,5);assert.equal(body.StartTimeTicks,0);assert.equal(plan.offset,0);assert.equal(plan.method,'DirectStream');
});

test('TV HEVC is advertised only after a positive capability probe; compatible mode still forces encoding',async()=>{
 const fixture=playback({MediaSources:[{Id:'s',Container:'mp4',SupportsDirectPlay:true,TranscodingUrl:'/Videos/f/master.m3u8?VideoCodec=h264'}]},'tv/');
 assert.ok(!fixture.api.profile().DirectPlayProfiles.some(p=>p.VideoCodec==='hevc'));
 await fixture.api.negotiate({Id:'f'},{hevc:true});
 const profile=fixture.call.options.body.DeviceProfile;
 assert.ok(profile.DirectPlayProfiles.some(p=>p.VideoCodec==='hevc'));
 assert.equal(profile.TranscodingProfiles[0].Container,'mp4');assert.match(profile.TranscodingProfiles[0].VideoCodec,/hevc/);
 await fixture.api.negotiate({Id:'f'},{hevc:true,force:true});
 assert.equal(fixture.call.options.body.AllowVideoStreamCopy,false);assert.equal(fixture.call.options.body.EnableDirectStream,false);
});
test('incompatible movies use negotiated HLS rather than guessing a master URL',async()=>{
 const fixture=playback({PlaySessionId:'session2',MediaSources:[{Id:'source2',Container:'mkv',SupportsDirectPlay:false,TranscodingUrl:'/jellyfin/Videos/film2/master.m3u8?VideoCodec=h264&AudioStreamIndex=3',TranscodingSubProtocol:'hls'}]});
 const plan=await fixture.api.negotiate({Id:'film2'},{start:120,audio:3,subtitle:5,bitrate:4000000,force:true});
 assert.equal(plan.hls,true);assert.equal(plan.offset,0);assert.equal(plan.session,'session2');assert.equal(fixture.call.options.body.StartTimeTicks,0);assert.equal(fixture.call.options.body.EnableDirectPlay,false);assert.equal(fixture.call.options.body.AudioStreamIndex,3);assert.equal(fixture.call.options.body.SubtitleStreamIndex,5);assert.equal(fixture.call.options.body.MaxStreamingBitrate,4000000);assert.match(plan.url,/AudioStreamIndex=3/);
});
test('direct stream MP4 is not misclassified as HLS by an unrelated server flag',async()=>{
 const fixture=playback({MediaSources:[{Id:'s',SupportsDirectPlay:true,Container:'mp4',DirectStreamUrl:'/jellyfin/Videos/f/stream.mp4?static=true',TranscodingSubProtocol:'hls'}]});
 const plan=await fixture.api.negotiate({Id:'f'});assert.equal(plan.hls,false);assert.match(plan.url,/stream\.mp4/);
});
test('source selection prefers a playable version over an incompatible source',async()=>{
 const fixture=playback({MediaSources:[{Id:'bad',Container:'mkv'},{Id:'good',SupportsDirectPlay:true,Container:'mp4'}]});
 assert.equal((await fixture.api.negotiate({Id:'f'})).source.Id,'good');
});
test('missing or forbidden playback plans produce actionable errors',async()=>{
 for(const data of [{ErrorCode:'NotAllowed'},{MediaSources:[]},{MediaSources:[{Id:'s',SupportsDirectPlay:false}]}]) {
  const fixture=playback(data);await assert.rejects(()=>fixture.api.negotiate({Id:'f'}),/autorisé|compatible|préparer/);
 }
});
test('external stream destinations never receive the Jellyfin access token',()=>{
 const fixture=playback({});const url=fixture.api.absolute('https://cdn.example/video.mp4',{PlaySessionId:'session'});assert.equal(url,'https://cdn.example/video.mp4');assert.throws(()=>fixture.api.absolute('file:///private/movie.mp4'));
});

test('slow-network automatic playback warms the same 240p variant it will use',async()=>{
 for(const variant of ['', 'tv/']){
  const urls=[];
  const api={stremio:async()=>({streams:[{url:'/api/stremio/media/first'}]})};
  const context={window:{PlezyAPI:api,navigator:{connection:{saveData:true}}},URL,fetch:async url=>{urls.push(url);return {ok:true,json:async()=>({duration:600})};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/bandwidth.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/'+variant+'playback.js'),'utf8'),context);
  const item={Id:'stremio~movie~tt123',stremio:true};
  await context.window.PlezyPlayback.negotiate(item);assert.match(urls.at(-1),/quality=240/);
  await context.window.PlezyPlayback.negotiate(item,{bitrate:12000000});assert.match(urls.at(-1),/quality=1080/);
 }
});

test('the speed measurement finishes before choosing which quality to prepare',async()=>{
 for(const variant of ['', 'tv/']){
  let measured=false;const urls=[];
  const api={stremio:async()=>({streams:[{url:'/api/stremio/media/first'}]})};
  const bandwidth={prepare:async()=>{await new Promise(setImmediate);measured=true;},initialQuality:()=>measured?1080:240};
  const context={window:{PlezyAPI:api,PlezyBandwidth:bandwidth},URL,fetch:async url=>{urls.push(url);return {ok:true,json:async()=>({duration:600})};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/'+variant+'playback.js'),'utf8'),context);
  await context.window.PlezyPlayback.negotiate({Id:'stremio~movie~tt123',stremio:true});assert.match(urls.at(-1),/quality=1080/);
 }
});

test('Stremio playback uses every available link without contacting Jellyfin',async()=>{
 for (const variant of ['', 'tv/']) {
  const api={stremio:async()=>({streams:[{url:'/api/stremio/media/first',hls:false},{url:'/api/stremio/media/second',hls:false},{url:'/api/stremio/media/third',hls:false}]}),jf:()=>{throw Error('Jellyfin must not be used');}};
  const context={window:{PlezyAPI:api},URL,fetch:async()=>({ok:true,json:async()=>({duration:8000})})};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/'+variant+'playback.js'),'utf8'),context);
  const p=context.window.PlezyPlayback,item={Id:'stremio~movie~tt123',stremio:true};
  assert.equal((await p.negotiate(item)).url.split('?')[0],'/api/stremio/hls/first/master.m3u8');
  assert.equal((await p.negotiate(item,{force:true})).url.split('?')[0],'/api/stremio/hls/second/master.m3u8');
  const last=await p.negotiate(item,{force:true});assert.equal(last.url.split('?')[0],'/api/stremio/hls/third/master.m3u8');assert.equal(last.hasMore,false);
  assert.equal(last.source.DefaultAudioStreamIndex,1);
  assert.deepEqual([...last.source.MediaStreams.map(s=>s.Language)],['fra','eng']);
  await assert.rejects(()=>p.negotiate(item,{force:true}),/Aucun autre/);
  const compat=await p.negotiate(item,{force:'compatible'});assert.match(compat.url,/\/api\/stremio\/hls\/first\/master\.m3u8\?fallback=1/);
  const en=await p.negotiate(item,{audio:2});assert.match(en.url,/lang=en/);
 }
});
