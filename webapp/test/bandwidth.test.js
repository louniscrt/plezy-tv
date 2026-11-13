const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(connection={},options={}){
 const storage=new Map();
 const window={navigator:{connection},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},...options};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/bandwidth.js'),'utf8'),{window,URL,AbortController,setTimeout,clearTimeout});
 return window.PlezyBandwidth;
}
test('connection hints select a starting quality without locking a fast viewer below HD',()=>{
 assert.equal(fixture({saveData:true}).initialQuality(),240);assert.equal(fixture({saveData:true}).autoCap(),0);
 for(const connection of [{effectiveType:'2g'},{downlink:.4}]){const b=fixture(connection);assert.equal(b.initialQuality(),240);assert.equal(b.autoCap(),-1);}
 const slow=fixture({downlink:.75,effectiveType:'3g'});assert.equal(slow.initialQuality(),360);assert.equal(slow.autoCap(),-1);
 assert.equal(fixture().initialQuality(),720);assert.equal(fixture({downlink:10,effectiveType:'4g'}).initialQuality(),1080);
 assert.equal(fixture({saveData:true}).initialQuality(12000000),1080);
});
test('actual download speed overrides misleading browser hints and is reused',async()=>{
 let now=1000,calls=0;
 const b=fixture({downlink:.4,effectiveType:'3g'},{performance:{now:()=>now},fetch:async()=>{calls++;return {ok:true,arrayBuffer:async()=>{now+=20;return new ArrayBuffer(131072);}};}});
 await b.prepare();assert.equal(b.initialQuality(),1080);assert.equal(b.autoCap(),-1);assert.equal(b.economical(),false);assert.ok(b.initialBandwidth()>40000000);
 await b.prepare();assert.equal(calls,1);
});
test('an actually slow download still starts economically without a permanent cap',async()=>{
 let now=1000;
 const b=fixture({downlink:10},{performance:{now:()=>now},fetch:async()=>({ok:true,arrayBuffer:async()=>{now+=2000;return new ArrayBuffer(131072);}})});
 await b.prepare();assert.equal(b.initialQuality(),240);assert.equal(b.autoCap(),-1);assert.equal(b.economical(),true);
});
test('data saver is remembered and reduces public TMDB images without rewriting other sources',()=>{
 const b=fixture();b.save(400000);assert.equal(b.preference(),400000);assert.equal(b.economical(),true);
 assert.equal(b.imageUrl('https://image.tmdb.org/t/p/original/poster.jpg','Primary',500),'https://image.tmdb.org/t/p/w154/poster.jpg');
 assert.equal(b.imageUrl('https://image.tmdb.org/t/p/w1280/backdrop.jpg','Backdrop',1600),'https://image.tmdb.org/t/p/w300/backdrop.jpg');
 assert.equal(b.imageUrl('https://other.test/original.jpg?token=fixture','Backdrop',1600),'https://other.test/original.jpg?token=fixture');
 b.save(123);assert.equal(b.preference(),0);
});
test('server preparation time is excluded from ABR samples without changing shared fragment statistics',()=>{
 const b=fixture();
 class Base{
  constructor(){this.samples=[];}
  onFragLoaded(event,data){this.samples.push(data.frag.stats.loading.first-data.frag.stats.loading.start);if(data.frag.bitrateTest)this.onFragBuffered(event,data);}
  onFragBuffered(event,data){const stats=data.frag.stats;this.samples.push(stats.parsing.end-stats.loading.start-200);}
 }
 const Controller=b.abrController({DefaultConfig:{abrController:Base}}),controller=new Controller();
 const stats={loading:{start:1000,first:8200,end:8350},parsing:{end:8370}};
 const data={frag:{stats,bitrateTest:true},networkDetails:{getResponseHeader:()=> 'plezy;dur=7000'}};
 controller.onFragLoaded('loaded',data);controller.onFragBuffered('buffered',data);
 assert.deepEqual(controller.samples,[200,170,170]);assert.equal(stats.loading.start,1000);
});
test('emergency network checks wait for response bytes instead of abandoning an encoding job',()=>{
 let next=0,checks=0;const timers=new Map();
 const setInterval=fn=>{timers.set(++next,fn);return next;},clearInterval=id=>timers.delete(id);
 const window={navigator:{},localStorage:{getItem:()=>null}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/bandwidth.js'),'utf8'),{window,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval});
 class Base{
  ignoreFragment(){return false;}clearTimer(){clearInterval(this.timer);}
  onFragLoading(){this.clearTimer();this.timer=setInterval(()=>checks++);}
 }
 const Controller=window.PlezyBandwidth.abrController({DefaultConfig:{abrController:Base}}),controller=new Controller();
 const stats={loading:{first:0}};controller.onFragLoading('loading',{frag:{stats}});
 [...timers.values()][0]();assert.equal(checks,0);
 stats.loading.first=8200;[...timers.values()][0]();assert.equal(checks,0);assert.equal(timers.size,1);
 [...timers.values()][0]();assert.equal(checks,1);controller.clearTimer();
});
test('the first bandwidth sample is ready when the next fragment is chosen',()=>{
 const b=fixture(),samples=[];
 class Base{
  constructor(){this.bwEstimator={sample:(ms,bytes)=>samples.push([ms,bytes])};}
  ignoreFragment(){return false;}getBwEstimate(){return 50000000;}onFragLoaded(){}
 }
 const Controller=b.abrController({DefaultConfig:{abrController:Base}}),controller=new Controller();
 const stats={loaded:1000000,loading:{start:1000,first:8200,end:8350}};
 controller.onFragLoaded('loaded',{frag:{stats},networkDetails:{getResponseHeader:()=> 'plezy;dur=7000'}});
 assert.deepEqual(samples,[[150,1000000]]);assert.equal(stats.bwEstimate,50000000);assert.equal(stats.loading.start,1000);
});
test('service worker installation does not download unused assets and public assets are reused',async()=>{
 const handlers={},cached=new Map();let fetches=0;
 const self={location:{origin:'http://app'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const caches={match:async key=>cached.get(key),open:async()=>({put:async(key,value)=>cached.set(key,value)}),keys:async()=>[]};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),{self,caches,URL,fetch:async()=>{fetches++;return new Response('asset');}});
 await new Promise(resolve=>handlers.install({waitUntil:promise=>promise.then(resolve)}));assert.equal(fetches,0);
 async function request(url){const pending=[];let response;handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:value=>response=value,waitUntil:value=>pending.push(value)});if(!response)return;const result=await response;await Promise.all(pending);return result;}
 await request('http://app/player.js?v=slow1');await request('http://app/player.js?v=slow1');assert.equal(fetches,1);
 await request('http://app/player.js?v=slow2');assert.equal(fetches,2);
 assert.equal(await request('http://app/api/stremio/streams?id=private'),undefined);
 assert.equal(await request('http://app/proxy?url=private'),undefined);
});
