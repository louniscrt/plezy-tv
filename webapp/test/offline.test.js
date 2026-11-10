const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function offlineContext(){
 const file=new Blob(['0123456789']);
 const directory={getFileHandle:async id=>{if(id==='missing.mp4')throw new Error('missing');return {getFile:async()=>file};}};
 const context={URL,Response,Blob,navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>directory})}},self:{addEventListener:()=>{}},caches:{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),context);return context.offlineMedia;
}
test('offline player serves entire files and correct partial byte ranges without loading a whole movie',async()=>{
 const read=offlineContext();let r=await read(new Request('http://local/offline-media/test.mp4'),'test.mp4');assert.equal(r.status,200);assert.equal(await r.text(),'0123456789');
 r=await read(new Request('http://local',{headers:{range:'bytes=2-5'}}),'test.mp4');assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(r.headers.get('content-length'),'4');assert.equal(await r.text(),'2345');
 r=await read(new Request('http://local',{headers:{range:'bytes=-3'}}),'test.webm');assert.equal(r.headers.get('content-type'),'video/webm');assert.equal(await r.text(),'789');
});
test('offline player handles invalid ranges, missing files and unsafe filenames',async()=>{
 const read=offlineContext();for(const range of ['bytes=50-100','bytes=5-2','bytes=','bytes=0-1,3-4']){const r=await read(new Request('http://local',{headers:{range}}),'test.mp4');assert.equal(r.status,416,range);}
 assert.equal((await read(new Request('http://local'),'missing.mp4')).status,404);assert.equal((await read(new Request('http://local'),'../bad.mp4')).status,400);
});
