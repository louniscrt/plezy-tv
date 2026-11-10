const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
class Node {
 constructor(){this.hidden=false;this.textContent='';this.style={};this.dataset={};this.attributes={};this.children=[];this.value='1';const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:c=>classes.has(c)?classes.delete(c):classes.add(c)};}
 replaceChildren(...nodes){this.children=nodes;} append(...nodes){this.children.push(...nodes);}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k]??null;}
 removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';}
 blur(){} focus(){} contains(node){return node===this || this.children.some(child=>child.contains?.(node));} closest(){return null;}
}
function fixture(negotiate,variant='',options={}){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 $('modal').hidden=true;
 let now=0,timerId=0;const timers=new Map(),observers=new Map();
 class Observer{constructor(callback){this.callback=callback;}observe(node){observers.set(node,this.callback);}}
 const tick=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}};
 const artwork=[];
 const video=$('video');Object.assign(video,{paused:true,currentTime:0,duration:734,volume:1,buffered:{length:0},canPlayType:options.canPlayType||(()=> 'probably'),load(){},play:async function(){this.paused=false;this.onplay?.();this.onplaying?.();},pause(){this.paused=true;this.onpause?.();}});
 let currentScreen='detail';
 const ui={$,action:(label,callback)=>Object.assign(new Node(),{label,callback}),text:(id,v)=>$(id).textContent=v||'',toast(){},run:async fn=>fn(),el:()=>new Node(),show:s=>{currentScreen=s;},navigate(){},modal(){},closeModal(){},get screen(){return currentScreen;}};
 const api={config:{server:'http://server',token:'test',user:'u'},image:()=>'',device:'device',jf:async()=>({}),details:async item=>item,proxy:url=>'/proxy?url='+encodeURIComponent(url),endpoint:(base,route)=>base+route};
 const context={window:{PlezyAPI:api,PlezyUI:ui,PlezyPlayback:{negotiate},Hls:options.Hls,MutationObserver:Observer,addEventListener(){}},Hls:options.Hls,MutationObserver:Observer,document:{head:new Node(),getElementById:$,querySelectorAll:()=>artwork,addEventListener(){},activeElement:null,fullscreenElement:null},console:{info(){},warn(){}},setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},AbortController,AbortSignal,matchMedia:()=>({matches:false}),Date,URL};
 const events=[];context.Event=Event;context.window.dispatchEvent=event=>events.push(event.type);
 if(options.jf)api.jf=options.jf;
 if(options.resume)context.window.PlezyResume=options.resume;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/'+variant+'player.js'),'utf8'),context);
 return {player:context.window.PlezyPlayer,video,$,ui,tick,artwork,events,document:context.document,setModal:hidden=>{$('modal').hidden=hidden;observers.get($('modal'))?.();}};
}

test('Web and TV refresh resume only after Jellyfin acknowledges the stopped position',async()=>{
 for(const variant of ['', 'tv/']){
  let saved;const source={Id:'source'};
  const f=fixture(async()=>({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source}),variant,{jf:route=>route.endsWith('/Stopped')?new Promise(resolve=>saved=resolve):Promise.resolve({})});
  await f.player.start({Id:'film',Name:'Film',MediaSources:[source]});await f.video.onloadedmetadata();
  f.video.currentTime=25;f.player.stop();
  assert.deepEqual(f.events,[]);saved({});await new Promise(setImmediate);
  assert.deepEqual(f.events,['plezy:playback-stopped']);
 }
});

test('TV native HLS avoids a duplicate JS buffer and falls back once to a bounded MSE buffer',async()=>{
 const instances=[];
 class Hls{static isSupported(){return true;}static Events={MANIFEST_PARSED:'manifest',FRAG_BUFFERED:'fragment',ERROR:'error'};constructor(config){this.config=config;instances.push(this);}on(){}attachMedia(){}loadSource(){}destroy(){}}
 const source={Id:'s'},requests=[];
 const f=fixture(async(item,options)=>{requests.push(options);return {url:'http://server/master.m3u8',hls:true,method:'DirectStream',source};},'tv/',{Hls});
 await f.player.start({Id:'film',Name:'Film',MediaSources:[source]});
 assert.equal(instances.length,0);assert.match(f.video.src,/master/);
 f.video.onerror();await new Promise(setImmediate);
 assert.equal(instances.length,1);assert.equal(requests.at(-1).force,false);
 assert.equal(instances[0].config.backBufferLength,0);assert.ok(instances[0].config.maxBufferSize<=24000000);assert.ok(instances[0].config.maxBufferLength<=12);
 f.video.onerror();await new Promise(setImmediate);assert.equal(instances.length,1);assert.equal(f.$('screen-player').dataset.state,'error');f.player.stop();
});

test('TV restarting a resumed HLS movie negotiates at zero without forcing video re-encoding',async()=>{
 const requests=[],source={Id:'s'};
 const f=fixture(async(item,options)=>{requests.push(options);return {url:'http://server/master.m3u8',hls:true,method:'DirectStream',offset:options.start,source};},'tv/');
 await f.player.start({Id:'film',Name:'Film',RunTimeTicks:9000000000,MediaSources:[source],UserData:{PlaybackPositionTicks:3000000000}});
 await f.video.onloadedmetadata();
 f.video.currentTime=20;
 f.$('pRestart').onclick();await new Promise(setImmediate);
 assert.equal(requests.at(-1).start,0);assert.equal(requests.at(-1).force,false);
 assert.match(f.video.src,/master/);assert.equal(f.ui.screen,'player');f.player.stop();
});

test('Web and TV HLS resume seek the video itself on a complete timeline',async()=>{
 for (const variant of ['', 'tv/']) {
  const f=fixture(async()=>({url:'http://server/master.m3u8',hls:true,offset:0,method:'DirectStream'}),variant);
  await f.player.start({Id:'film',Name:'Film',RunTimeTicks:7340000000,MediaSources:[{Id:'s'}],UserData:{PlaybackPositionTicks:3000000000}});
  await f.video.onloadedmetadata();
  assert.equal(f.video.currentTime,300);
  assert.equal(f.video.paused,false);
  f.player.stop();
 }
});

test('TV releases catalog artwork during playback and restores the same cards when leaving',async()=>{
 const f=fixture(undefined,'tv/'),image=new Node();image.isConnected=true;image.setAttribute('src','http://server/poster.jpg');f.artwork.push(image);
 await f.player.start({Id:'demo',Name:'Test',demo:true});assert.match(image.getAttribute('src'),/^data:image\/gif/);
 f.player.stop();assert.equal(image.getAttribute('src'),'http://server/poster.jpg');
});

test('Web and TV controls hide at exactly three seconds even with focus, without pausing the film',async()=>{
 for(const variant of ['', 'tv/']){
 const f=fixture(undefined,variant);await f.player.start({Id:'demo',Name:'Test',demo:true});await f.video.onloadedmetadata();
 f.document.activeElement=f.$('pPlay');f.$('screen-player').contains=()=>true;
 f.tick(2999);assert.equal(f.$('playerUi').classList.contains('hide'),false);
 f.tick(1);assert.equal(f.$('playerUi').classList.contains('hide'),true);assert.equal(f.video.paused,false);
 assert.equal(f.document.activeElement,f.$('pPlay'));f.player.stop();
 }
});

test('TV activity restarts the timer; settings and pause keep controls visible',async()=>{
 const f=fixture(undefined,'tv/');await f.player.start({Id:'demo',Name:'Test',demo:true});await f.video.onloadedmetadata();
 f.tick(2000);f.$('screen-player').onpointermove();f.tick(2000);assert.equal(f.$('playerUi').classList.contains('hide'),false);
 f.tick(1000);assert.equal(f.$('playerUi').classList.contains('hide'),true);
 f.setModal(false);f.tick(5000);assert.equal(f.$('playerUi').classList.contains('hide'),false);
 f.setModal(true);f.tick(2999);assert.equal(f.$('playerUi').classList.contains('hide'),false);
 f.tick(1);assert.equal(f.$('playerUi').classList.contains('hide'),true);
 f.video.pause();f.tick(6000);assert.equal(f.$('playerUi').classList.contains('hide'),false);f.player.stop();
});
test('demo playback starts, pauses with title information, resumes and seeks by ten seconds',async()=>{
 const f=fixture();await f.player.start({Id:'demo',Name:'Test',demo:true,Overview:'Description',UserData:{PlaybackPositionTicks:200000000}});
 await f.video.onloadedmetadata();assert.equal(f.video.paused,false);assert.equal(f.$('screen-player').dataset.state,'playing');assert.equal(f.video.currentTime,20);
 f.$('pPlay').onclick({currentTarget:f.$('pPlay')});assert.equal(f.video.paused,true);assert.equal(f.$('pPauseInfo').hidden,false);assert.equal(f.$('pPauseTitle').textContent,'Test');
 f.$('pFwd').onclick();assert.equal(f.video.currentTime,30);f.$('pRew').onclick();assert.equal(f.video.currentTime,20);
 await f.$('pPlay').onclick({currentTarget:f.$('pPlay')});assert.equal(f.video.paused,false);f.player.stop();assert.equal(f.ui.screen,'detail');
});

test('quick language choice uses real stream indices and keeps the playback position',async()=>{
 const requests=[];
 const source={Id:'s',DefaultAudioStreamIndex:2,MediaStreams:[{Type:'Audio',Index:2,Language:'fra',DisplayTitle:'Français'},{Type:'Audio',Index:5,Language:'eng',DisplayTitle:'English'},{Type:'Subtitle',Index:9,Language:'fra',DisplayTitle:'Français'}]};
 const f=fixture(async(item,options)=>{requests.push(options);return {url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source};},'tv/');
 await f.player.start({Id:'film',Name:'Film',MediaSources:[source]});await f.video.onloadedmetadata();
 f.video.currentTime=127;
 const choices=f.$('pLanguages').children;
 assert.equal(choices.length,4);assert.equal(choices[0].attributes['aria-pressed'],'true');
 await choices[1].callback();
 assert.equal(requests.at(-1).audio,5);assert.equal(requests.at(-1).subtitle,9);assert.equal(requests.at(-1).start,127);
 assert.match(choices[1].label,/anglais avec sous-titres/);
 await choices[2].callback();
 assert.equal(requests.at(-1).audio,2);assert.equal(requests.at(-1).subtitle,9);assert.equal(requests.at(-1).start,127);
 assert.equal(f.$('pLanguages').children[2].attributes['aria-pressed'],'true');
 f.player.stop();
});
test('negotiation errors become an actionable error state with retry buttons',async()=>{
 const f=fixture(async()=>{throw new Error('Aucun flux compatible');});
 await f.player.start({Id:'film',Name:'Film',MediaSources:[{Id:'s'}]});
 assert.equal(f.$('screen-player').dataset.state,'error');assert.equal(f.$('pNoticeText').textContent,'Aucun flux compatible');assert.equal(f.$('pRecovery').hidden,false);assert.equal(f.$('pSpinner').hidden,true);
});
test('leaving the player cancels a pending negotiation and ignores its late response',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));
 const loading=f.player.start({Id:'film',Name:'Film',MediaSources:[{Id:'s'}]});
 f.player.stop();resolve({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source:{Id:'s'}});await loading;
 assert.equal(f.ui.screen,'detail');assert.equal(f.video.src,'');assert.equal(f.video.paused,true);
});


test('Web and TV completion hides the finished item and refreshes after the stopped report',async()=>{
 for(const variant of ['', 'tv/']){
  const calls=[];let acknowledge;
  const source={Id:'source'};
  const f=fixture(async()=>({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source}),variant,{
   resume:{restore:(A,item)=>calls.push('restore:'+item.Id),complete:(A,item)=>calls.push('complete:'+item.Id)},
   jf:route=>route.endsWith('/Stopped')?new Promise(resolve=>acknowledge=resolve):Promise.resolve({})
  });
  await f.player.start({Id:'film',Name:'Film',MediaSources:[source]});await f.video.onloadedmetadata();
  assert.ok(calls.includes('restore:film'));
  f.video.onended();assert.ok(calls.includes('complete:film'));
  assert.deepEqual(f.events,[]);
  acknowledge({});await new Promise(setImmediate);
  assert.ok(f.events.includes('plezy:playback-stopped'));
 }
});


test('TV intro suggestion uses explicit boundaries and seeks to the intro end',async()=>{
 const source={Id:'s'};
 const f=fixture(async()=>({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source}),'tv/');
 await f.player.start({Id:'ep',Name:'Episode',Type:'Episode',MediaSources:[source],MediaSegments:[{Type:'Intro',StartTicks:100000000,EndTicks:400000000}]});
 await f.video.onloadedmetadata();
 const prompts=f.$('screen-player').children.find(n=>n.attributes['aria-label']==='Suggestions de lecture');
 const [skip]=prompts.children;
 f.video.currentTime=5;f.video.ontimeupdate();assert.equal(skip.hidden,true);
 f.video.currentTime=15;f.video.ontimeupdate();assert.equal(skip.hidden,false);assert.equal(prompts.hidden,false);
 await skip.callback();assert.equal(f.video.currentTime,40);
 f.video.ontimeupdate();assert.equal(skip.hidden,true);
 f.player.stop();assert.equal(prompts.hidden,true);
});

test('TV does not guess an intro and offers the actual next episode near the end',async()=>{
 const source={Id:'s'},episodes=[{Id:'one',Name:'One',Type:'Episode',MediaSources:[source]},{Id:'two',Name:'Two',Type:'Episode',MediaSources:[source]}];
 const f=fixture(async()=>({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source}),'tv/');
 await f.player.start(episodes[0],episodes);await f.video.onloadedmetadata();
 const prompts=f.$('screen-player').children.find(n=>n.attributes['aria-label']==='Suggestions de lecture');
 const [skip,next,dismiss]=prompts.children;
 f.video.currentTime=20;f.video.ontimeupdate();assert.equal(skip.hidden,true);assert.equal(next.hidden,true);
 f.video.currentTime=710;f.video.ontimeupdate();assert.equal(next.hidden,false);
 await dismiss.callback();assert.equal(prompts.hidden,true);
 f.video.ontimeupdate();assert.equal(next.hidden,true);
 await f.player.start(episodes[0],episodes);await f.video.onloadedmetadata();
 f.video.currentTime=710;f.video.ontimeupdate();await next.callback();
 assert.equal(f.$('pTitle').textContent,'Two');
 await f.video.onloadedmetadata();f.video.currentTime=710;f.video.ontimeupdate();assert.equal(next.hidden,true);
 f.player.stop();
});

test('Web and TV show Netflix-style intro and next-episode popups; Real-Debrid episodes get a standard intro window',async()=>{
 for(const variant of ['','tv/']){
  const source={Id:'s'},episodes=[{Id:'one',Name:'One',Type:'Episode',stremio:true,MediaSources:[source]},{Id:'two',Name:'Two',Type:'Episode',IndexNumber:2,MediaSources:[source]}];
  const f=fixture(async()=>({url:'http://server/movie.mp4',hls:false,method:'DirectPlay',source}),variant);
  await f.player.start(episodes[0],episodes);await f.video.onloadedmetadata();
  const prompts=f.$('screen-player').children.find(n=>n.attributes['aria-label']==='Suggestions de lecture');
  const [skip,next]=prompts.children;
  f.video.currentTime=1;f.video.ontimeupdate();assert.equal(skip.hidden,true);
  f.video.currentTime=30;f.video.ontimeupdate();assert.equal(skip.hidden,false);
  await skip.callback();assert.equal(f.video.currentTime,90);
  f.video.currentTime=710;f.video.ontimeupdate();assert.equal(next.hidden,false);assert.match(next.textContent,/Épisode suivant/);
 }
});
