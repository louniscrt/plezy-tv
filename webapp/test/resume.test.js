const {test}=require('node:test');
const assert=require('node:assert/strict');
const {latest,load}=require('../public/resume');
const ep=(number,date,series='terminal-list')=>({Id:'episode-'+series+number,Type:'Episode',SeriesId:series,SeriesName:'The Terminal List',ParentIndexNumber:1,IndexNumber:number,UserData:{LastPlayedDate:date,PlaybackPositionTicks:number*10000000}});

test('resume keeps episode 8 instead of episode 1 when it was watched later, without changing history',()=>{
 const one=ep(1,'2026-11-01T12:00:00Z'),eight=ep(8,'2026-11-04T12:00:00Z');
 const input=[one,eight],before=JSON.stringify(input);
 assert.deepEqual(latest(input),[eight]);assert.equal(JSON.stringify(input),before);
});
test('rewatching an earlier episode wins by last playback date, across seasons too',()=>{
 const eight=ep(8,'2026-11-01T12:00:00Z'),one=ep(1,'2026-11-04T12:00:00Z');
 eight.ParentIndexNumber=2;
 assert.deepEqual(latest([eight,one]),[one]);
});
test('absent or equal dates use episode order; distinct series and movies are retained',()=>{
 const one=ep(1),eight=ep(8),other=ep(2,undefined,'other-series');
 const movie={Id:'film',Type:'Movie',Name:'The Terminal List'},duplicate={...movie};
 assert.deepEqual(latest([one,eight,other,movie,duplicate]),[eight,other,movie]);
});
test('series UUID formatting and missing series IDs do not create duplicate cards',()=>{
 const one=ep(1,undefined,'AA-BB'),eight=ep(8,undefined,'aabb');
 assert.equal(latest([one,eight]).length,1);
 delete one.SeriesId;delete eight.SeriesId;
 assert.deepEqual(latest([one,eight]),[eight]);
});
test('resume fetches a larger pool then limits unique cards, so duplicate episodes cannot crowd out movies',async()=>{
 let options;
 const A={config:{user:'viewer'},fields:'MediaSources',jf:async(route,value)=>{
  assert.equal(route,'/Users/viewer/Items/Resume');options=value;
  return {Items:[...Array.from({length:25},(_,i)=>ep(i+1)),...Array.from({length:22},(_,i)=>({Id:'m'+i,Type:'Movie'}))]};
 }};
 const result=await load(A);assert.equal(options.params.Limit,100);
 assert.equal(result.length,20);assert.equal(result[0].IndexNumber,25);
 assert.equal(result.filter(i=>i.Type==='Episode').length,1);
});
