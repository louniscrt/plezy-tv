const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/tv/app.js'),'utf8');
const begin=source.indexOf('      const [data, alphabetical] = await Promise.all([');
const end=source.indexOf('      const resume = data.resume.filter',begin);
assert.ok(begin>=0 && end>begin);
const snippet='(async()=>{'+source.slice(begin,end)+'return {data,all,recent};})()';
function fixture(next='MOVIES',demo=false){
 let finish,requests=0,renders=0;
 const data={movies:[{Id:'m'}],shows:[{Id:'s'}],resume:[]};
 const alpha=[{Id:'alphabetical'}];
 const context={next,C:{demo},version:1,pageVersion:1,Promise,catalog:()=>new Promise(r=>finish=()=>r(data)),A:{items:async params=>{requests++;assert.equal(params.SortBy,'SortName');return alpha;}},$:()=>({replaceChildren(){renders++;}})};
 const pending=vm.runInNewContext(snippet,context);
 return {context,pending,finish:()=>finish(),data,alpha,get requests(){return requests;},get renders(){return renders;}};
}
test('TV starts alphabetical loading before the catalogue finishes',async()=>{
 const f=fixture();assert.equal(f.requests,1);assert.equal(f.renders,0);
 f.finish();const result=await f.pending;
 assert.equal(result.all,f.alpha);assert.equal(result.data,f.data);assert.equal(f.renders,1);
});
test('TV home and demo avoid the extra query, stale results do not render',async()=>{
 for(const [next,demo] of [['HOME',false],['MOVIES',true]]){
  const f=fixture(next,demo);assert.equal(f.requests,0);f.finish();const result=await f.pending;
  assert.equal(result.all,result.recent);
 }
 const f=fixture('SERIES');f.context.pageVersion=2;f.finish();assert.equal(await f.pending,undefined);assert.equal(f.renders,0);
});
test('TV clock-only mutations skip focus work on Android and Vega; structural changes remain coalesced',()=>{
 const adapter=fs.readFileSync(path.join(__dirname,'../../smart-tv/app/src/main/assets/tv.js'),'utf8');
 const start=adapter.indexOf('  const clockLabels = new Set('),stop=adapter.indexOf('  observer.observe(document.body',start);
 assert.ok(start>=0 && stop>start);
 for(const android of [true,false]){
  let callback,frames=[],adapted=0,recovered=0;
  vm.runInNewContext('let pending=false;'+adapter.slice(start,stop),{android,Set,MutationObserver:class{constructor(fn){callback=fn;}},requestAnimationFrame:fn=>frames.push(fn),adaptMenu:()=>adapted++,recover:()=>recovered++});
  const clock={type:'childList',target:{id:'pCur'}};
  for(let i=0;i<100;i++)callback([clock]);assert.equal(frames.length,0);
  callback([clock,{type:'attributes',target:{id:'modal'}}]);
  callback([{type:'childList',target:{id:'rows'}}]);assert.equal(frames.length,1);
  frames.shift()();assert.equal(adapted,1);assert.equal(recovered,1);
  callback([{type:'childList',target:{id:'rows'}}]);assert.equal(frames.length,1);
 }
});
