const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/detail.js'),'utf8'),context);
const D=context.window.PlezyDetail;
test('series resume retains server progress and enriches it with the selected season episode',()=>{
 const list=[{Id:'abc-def',Name:'Episode complet',MediaSources:[{Id:'source'}],UserData:{IsFavorite:true,PlaybackPositionTicks:0}}];
 const chosen=D.chooseEpisode(list,{Id:'ABCDEF',UserData:{PlaybackPositionTicks:1900000000}});
 assert.equal(chosen.Name,'Episode complet');assert.equal(chosen.MediaSources[0].Id,'source');assert.equal(chosen.UserData.PlaybackPositionTicks,1900000000);assert.equal(chosen.UserData.IsFavorite,true);
});
test('browsing another season preserves the current resume target; empty series have no play target',()=>{
 const resume={Id:'s1e6',UserData:{PlaybackPositionTicks:10}};
 assert.equal(D.chooseEpisode([{Id:'s2e1'}],resume),resume);
 assert.equal(D.chooseEpisode([],undefined),undefined);
});
test('series without a resume selects an unfinished episode before the first unplayed one',()=>{
 const list=[{Id:'1',UserData:{Played:true}},{Id:'2',UserData:{}},{Id:'3',UserData:{PlaybackPositionTicks:10}}];
 assert.equal(D.chooseEpisode(list).Id,'3');assert.equal(D.chooseEpisode(list.slice(0,2)).Id,'2');assert.equal(D.chooseEpisode(list.slice(0,1)).Id,'1');
});
test('progress handles absent durations and clamps invalid or overflowing server positions',()=>{
 assert.equal(D.progress({UserData:{PlaybackPositionTicks:10}}).visible,false);
 const p=D.progress({RunTimeTicks:65*600000000,UserData:{PlaybackPositionTicks:19*600000000}});
 assert.equal(p.label,'19 sur 65 min');assert.ok(Math.abs(p.percent-19/65*100)<.001);
 assert.equal(D.progress({RunTimeTicks:100,UserData:{PlaybackPositionTicks:200}}).percent,100);
 assert.equal(D.progress({RunTimeTicks:100,UserData:{PlaybackPositionTicks:-10}}).visible,false);
});
test('detail badges reflect actual episode streams and do not invent HD, HDR or audio description',()=>{
 assert.equal(D.facts({Type:'Movie',Name:'Sans informations'}).length,0);
 const facts=D.facts({Type:'Series',ProductionYear:2026},{episodeCount:8,episode:{MediaSources:[{MediaStreams:[{Type:'Video',Width:1920,VideoRange:'SDR'},{Type:'Audio',Codec:'ac3'}]}]}});
 assert.ok(facts.some(f=>f.text==='8 épisodes'));assert.ok(facts.some(f=>f.text==='HD'));assert.ok(!facts.some(f=>f.text==='AD'||f.text==='SDR'));
 const hdr=D.facts({Type:'Movie',MediaSources:[{MediaStreams:[{Type:'Video',Width:3840,VideoRangeType:'HDR10'},{Type:'Audio',IsAudioDescription:true}]}]});
 assert.ok(hdr.some(f=>f.text==='4K'));assert.ok(hdr.some(f=>f.text==='HDR10'));assert.ok(hdr.some(f=>f.text==='AD'));
});
