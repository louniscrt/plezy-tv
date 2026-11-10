const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(storage=new Map()) {
  const context={module:{exports:{}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/resume.js'),'utf8'),context);
  return {R:context.module.exports,A:{config:{server:'https://server',user:'alice'}},storage};
}
const movie={Id:'film',Type:'Movie',UserData:{PlaybackPositionTicks:100}};
const episode=(n)=>({Id:'ep'+n,Type:'Episode',SeriesId:'series',IndexNumber:n,UserData:{PlaybackPositionTicks:100,LastPlayedDate:`2026-11-0${n}T10:00:00Z`}});
test('manual removal survives reload without altering media or server history',()=>{
  const {R,A,storage}=fixture(),before=JSON.stringify(movie);
  R.remove(A,movie);
  assert.equal(R.visible(A,[movie]).length,0);
  assert.equal(fixture(storage).R.visible(A,[movie]).length,0);
  assert.equal(JSON.stringify(movie),before);
});
test('manual series removal hides all its episodes but not another programme',()=>{
  const {R,A}=fixture();R.remove(A,{Id:'series',Type:'Series'});
  assert.equal(R.visible(A,[episode(1),episode(2),movie]).length,1);
  assert.equal(R.visible(A,[episode(1),movie])[0].Id,'film');
});
test('finished latest episode does not resurrect an older episode; next watched episode can appear',()=>{
  const {R,A}=fixture();R.complete(A,episode(2));
  assert.equal(R.visible(A,[episode(1),episode(2)]).length,0);
  assert.equal(R.visible(A,[episode(1),episode(2),episode(3)])[0].Id,'ep3');
});
test('completed movies and watched programmes disappear, explicit replay restores eligibility',()=>{
  const {R,A}=fixture();R.complete(A,movie);
  assert.equal(R.visible(A,[movie]).length,0);
  R.restore(A,movie);assert.equal(R.visible(A,[movie]).length,1);
  assert.equal(R.visible(A,[{...movie,UserData:{Played:true}}]).length,0);
  R.remove(A,episode(1));R.restore(A,episode(2));
  assert.equal(R.visible(A,[episode(2)]).length,1);
});
test('hidden programmes are isolated by user and server',()=>{
  const {R,A}=fixture();R.remove(A,movie);
  A.config.user='bob';assert.equal(R.visible(A,[movie]).length,1);
  A.config.user='alice';A.config.server='https://another';assert.equal(R.visible(A,[movie]).length,1);
});
test('resume load applies removal before its twenty card limit',async()=>{
  const {R,A}=fixture();R.remove(A,movie);
  A.jf=async()=>({Items:[movie,episode(1)]});
  const result=await R.load(A);assert.equal(result.length,1);assert.equal(result[0].Id,'ep1');
});

test('TV reset waits for acknowledgement before hiding and preserves favourites',async()=>{
 const {R,A}=fixture();const item={...movie,UserData:{PlaybackPositionTicks:100,IsFavorite:true}};
 let finish,call;A.jf=(route,options)=>{call={route,options};return new Promise(resolve=>finish=resolve);};
 const pending=R.resetAndRemove(A,item);
 assert.equal(call.route,'/Users/alice/PlayedItems/film');assert.equal(call.options.method,'DELETE');
 assert.equal(R.visible(A,[item]).length,1);assert.equal(item.UserData.PlaybackPositionTicks,100);
 finish({});await pending;
 assert.equal(item.UserData.PlaybackPositionTicks,0);assert.equal(item.UserData.IsFavorite,true);
 assert.equal(item.UserData.Played,false);assert.equal(R.visible(A,[item]).length,0);
});
test('TV reset failure leaves progress and resume visibility unchanged',async()=>{
 const {R,A}=fixture();const item={...movie,UserData:{PlaybackPositionTicks:100}};
 A.jf=async()=>{throw new Error('Serveur indisponible');};
 await assert.rejects(R.resetAndRemove(A,item),/Serveur indisponible/);
 assert.equal(item.UserData.PlaybackPositionTicks,100);assert.equal(R.visible(A,[item]).length,1);
});
test('TV series removal resets only the selected episode, never the series or other episodes',async()=>{
 const {R,A}=fixture();const selected=episode(2),other=episode(1);let route;
 A.jf=async value=>{route=value;return {};};
 await R.resetAndRemove(A,{Id:'series',Type:'Series'},selected);
 assert.equal(route,'/Users/alice/PlayedItems/ep2');assert.equal(selected.UserData.PlaybackPositionTicks,0);
 assert.equal(other.UserData.PlaybackPositionTicks,100);assert.equal(R.visible(A,[selected,other,movie]).length,1);
});
test('TV series without an available episode cannot erase a whole series',async()=>{
 const {R,A}=fixture();let calls=0;A.jf=async()=>{calls++;};
 await assert.rejects(R.resetAndRemove(A,{Id:'series',Type:'Series'}),/indisponible/);assert.equal(calls,0);
});
test('TV Stremio reset writes zero position through its local history route',async()=>{
 const {R,A}=fixture();const item={Id:'stremio~movie~film',Type:'Movie',UserData:{PlaybackPositionTicks:100,IsFavorite:true}};
 let call;A.jf=async(route,options)=>{call={route,options};return {};};
 await R.resetAndRemove(A,item);
 assert.equal(call.route,'/Sessions/Playing/Progress');assert.equal(call.options.body.PositionTicks,0);
 assert.equal(call.options.body.ItemId,item.Id);assert.equal(item.UserData.PlaybackPositionTicks,0);assert.equal(item.UserData.IsFavorite,true);
});
test('TV reset never hides a programme for a profile selected during the request',async()=>{
 const {R,A}=fixture();const item={...movie,UserData:{PlaybackPositionTicks:100}};
 let finish;A.jf=()=>new Promise(resolve=>finish=resolve);
 const pending=R.resetAndRemove(A,item);A.config.user='bob';finish({});
 await assert.rejects(pending,/profil a changé/);assert.equal(R.visible(A,[item]).length,1);
 A.config.user='alice';assert.equal(R.visible(A,[item]).length,1);
});
