const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {televisionUrl,isTelevisionPage,isWebEntry,isDocumentError,retryUrl}=require('../src/navigation');
const server='http://192.168.0.89:8081/';
test('retry canonicalizes root and already-TV addresses without appending duplicate paths',()=>{
 for(const suffix of ['', 'index.html#main', 'tv/', 'tv/index.html#player','tv/index.html/?v=1']){
  assert.equal(televisionUrl(server+suffix),server+'tv/index.html');
 }
 assert.equal(televisionUrl('https://example.org/plezy/tv/index.html#player'),'https://example.org/plezy/tv/index.html');
});
test('media and root web documents cannot be mistaken for the TV page',()=>{
 assert.equal(isTelevisionPage(server+'tv/index.html#player',server),true);
 for(const url of [server,server+'index.html',server+'proxy?url=movie.m3u8','http://other/tv/index.html'])assert.equal(isTelevisionPage(url,server),false);
 assert.equal(isWebEntry(server+'index.html#main',server),true);
 assert.equal(isWebEntry(server+'proxy?url=movie',server),false);
});
test('each retry navigates to a fresh TV URI and remains recognizable as the TV document',()=>{
 const first=retryUrl(server,1),second=retryUrl(server,2);
 assert.notEqual(first,second);
 assert.equal(new URL(first).pathname,'/tv/index.html');
 assert.equal(new URL(second).pathname,'/tv/index.html');
 assert.equal(isTelevisionPage(first,server),true);
 assert.equal(isTelevisionPage(second,server),true);
 assert.equal(new URL(second).origin,new URL(server).origin);
});
test('media errors stay inside the player rather than covering the app with the native error screen',()=>{
 const uri=televisionUrl(server);
 assert.equal(isDocumentError({url:server+'proxy?url=movie.m3u8',isMainFrame:true},uri),false);
 assert.equal(isDocumentError({url:uri,isMainFrame:false},uri),false);
 assert.equal(isDocumentError({url:uri+'#player',isMainFrame:true},uri),true);
 assert.equal(isDocumentError({url:uri},uri),true);
});
test('bootstrap ignores media documents and waits for deferred application scripts',()=>{
 const script=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/injection.json'),'utf8'));
 for(const pathname of ['/proxy','/index.html','/tv/index.html']){
  const messages=[],timers=[];
  const window={ReactNativeWebView:{postMessage:s=>messages.push(s)}};
  vm.runInNewContext(script,{window,location:{pathname},setTimeout:fn=>timers.push(fn)});
  assert.equal(messages.length,0);
  assert.equal(timers.length,pathname==='/tv/index.html'?1:0);
 }
});
test('bootstrap reports a genuinely missing TV app only after the bounded startup wait',()=>{
 const script=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/injection.json'),'utf8'));
 const messages=[],timers=[],delays=[];
 const window={ReactNativeWebView:{postMessage:s=>messages.push(JSON.parse(s))}};
 vm.runInNewContext(script,{window,location:{pathname:'/tv/index.html'},setTimeout:(fn,ms)=>{timers.push(fn);delays.push(ms);}});
 while(timers.length)timers.shift()();
 assert.equal(delays.reduce((a,b)=>a+b,0),10000);
 assert.deepEqual(messages,[{type:'invalid-app'}]);
 assert.equal(window.__plezyVegaPending,false);
});
