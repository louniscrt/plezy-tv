const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chooseAudio,encoderArguments}=require('../stremio-media');
test('data saver advertises 240p and encodes a small independently decodable segment',()=>{
 const {spawnSync}=require('node:child_process');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {segmentArguments,masterPlaylist}=require('../stremio-media');
 assert.match(masterPlaylist('opaque'),/BANDWIDTH=420000.*RESOLUTION=426x240/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plezy-240p-'));
 function exec(binary,args){const result=spawnSync(binary,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;}
 try{
  const input=path.join(dir,'source.mp4'),output=path.join(dir,'segment.ts');
  exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=960x540:rate=30','-f','lavfi','-i','sine=sample_rate=48000','-t','7','-c:v','libx264','-preset','ultrafast','-threads','2','-c:a','aac','-metadata:s:a:0','language=fra',input]);
  const probe=file=>JSON.parse(exec('ffprobe',['-v','error','-show_streams','-of','json',file]));
  exec('ffmpeg',segmentArguments(probe(input),input,0,6,output,240));
  const video=probe(output).streams.find(s=>s.codec_type==='video');
  assert.ok(video.height<=240);assert.ok(fs.statSync(output).size<330000);
  exec('ffmpeg',['-v','error','-i',output,'-f','null','-']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('One encoder generates three exact segments and serves the following requests from that batch',async()=>{
 const {spawnSync}=require('node:child_process');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {createSegment}=require('../stremio-media');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plezy-batch-test-'));
 const produced=[];
 function exec(binary,args){const r=spawnSync(binary,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
 try{
  const input=path.join(dir,'source.mp4');
  exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=sample_rate=48000','-t','20','-c:v','libx264','-threads','2','-g','250','-keyint_min','250','-sc_threshold','0','-c:a','aac','-metadata:s:a:0','language=fra',input]);
  const probe=file=>JSON.parse(exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  const info=probe(input),identity='batch-'+dir;
  for(const index of [1,2,3]){
   const file=await createSegment(info,input,identity,index,480,{priority:true});produced.push(file);
   const video=probe(file).streams.find(s=>s.codec_type==='video');
   assert.ok(Math.abs(Number(video.start_time)-index*6)<0.15);
   assert.ok(Math.abs(Number(video.duration)-Math.min(6,20-index*6))<0.15);
  }
  const prefixes=produced.map(file=>file.replace(/-\d+\.ts$/,''));
  assert.equal(new Set(prefixes).size,1,'subsequent requests reuse the same encoder batch');
  fs.unlinkSync(produced[0]);
  const repaired=await createSegment(info,input,identity,1,480,{priority:true});produced.push(repaired);
  assert.notEqual(repaired,produced[0]);assert.ok(fs.statSync(repaired).size>0);
  // Let the bounded batch finish before removing its input fixture.
  await new Promise(resolve=>setTimeout(resolve,1000));
 }finally{
  produced.forEach(file=>fs.rmSync(file,{force:true}));fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('HLS segments keep exact boundaries when source keyframes are ten seconds apart',()=>{
 const {spawnSync}=require('node:child_process');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {segmentArguments}=require('../stremio-media');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'plezy-timeline-'));
 function exec(binary,args){const r=spawnSync(binary,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
 try{
  const input=path.join(dir,'source.mp4');
  exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=sample_rate=48000','-t','20','-c:v','libx264','-threads','2','-g','250','-keyint_min','250','-sc_threshold','0','-c:a','aac','-metadata:s:a:0','language=fra',input]);
  const probe=file=>JSON.parse(exec('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));
  const info=probe(input);
  for(const start of [0,6,12]){
   const output=path.join(dir,`${start}.ts`);
   exec('ffmpeg',segmentArguments(info,input,start,6,output,1080));
   const result=probe(output);
   const video=result.streams.find(s=>s.codec_type==='video');
   assert.ok(Math.abs(Number(video.start_time)-start)<0.15,`segment ${start} starts at ${video.start_time}`);
   assert.ok(Math.abs(Number(video.duration)-6)<0.15,`segment ${start} lasts ${video.duration}`);
   exec('ffmpeg',['-v','error','-i',output,'-f','null','-']);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('French audio is selected even when English is the first default track',()=>{
 const streams=[{index:0,codec_type:'video',codec_name:'h264',width:1920,pix_fmt:'yuv420p'},{index:1,codec_type:'audio',tags:{language:'eng'}},{index:2,codec_type:'audio',tags:{language:'fra'}}];
 assert.equal(chooseAudio(streams).index,2);
 assert.equal(chooseAudio(streams,{lang:'en'}).index,1);
 const args=encoderArguments({streams},'http://127.0.0.1/media',60);assert.ok(args.includes('0:2'));assert.ok(args.includes('copy'));assert.ok(args.includes('aac'));assert.ok(args.includes('60'));assert.ok(!args.includes('0:1'));
});
test('Known English-only and ambiguous multiple audio tracks never become a French stream',()=>{
 assert.throws(()=>chooseAudio([{index:1,codec_type:'audio',tags:{language:'eng'}}]),/française/);
 assert.throws(()=>chooseAudio([{index:1,codec_type:'audio'},{index:2,codec_type:'audio'}]),/française/);
 assert.equal(chooseAudio([{index:1,codec_type:'audio',tags:{language:'und'}}]).index,1);
});
test('HEVC and 10-bit video are adapted to H264 for browsers',()=>{
 for(const video of [{codec_name:'hevc',pix_fmt:'yuv420p10le'},{codec_name:'h264',pix_fmt:'yuv420p10le'}]){
  const args=encoderArguments({streams:[{...video,index:0,codec_type:'video'},{index:1,codec_type:'audio',tags:{language:'fre'}}]},'http://127.0.0.1/media');
  assert.ok(args.includes('libx264'));assert.ok(args.includes('yuv420p'));assert.ok(args.includes('2'));
 }
});

test('Adaptive HLS provides safe 360p/480p/720p variants and a seekable complete VOD timeline',()=>{
 const {masterPlaylist,vodPlaylist,segmentArguments}=require('../stremio-media');
 const master=masterPlaylist('opaque');for(const q of [360,480,720])assert.ok(master.includes('quality-'+q+'.m3u8'));
 assert.ok(master.includes('avc1.42E01F,mp4a.40.2'));
 const playlist=vodPlaylist('opaque',14,480);assert.ok(playlist.includes('#EXT-X-PLAYLIST-TYPE:VOD'));assert.ok(playlist.includes('#EXTINF:2.000,'));assert.ok(playlist.includes('segment-480-2.ts'));assert.ok(playlist.endsWith('#EXT-X-ENDLIST\n'));
 assert.throws(()=>vodPlaylist('opaque',Infinity));
 const info={streams:[{index:0,codec_type:'video'},{index:1,codec_type:'audio',tags:{language:'fra'}}]};
 for(const q of [360,480,720]){const args=segmentArguments(info,'http://127.0.0.1/media',120,6,'/tmp/segment.ts',q);assert.ok(args.includes('baseline'));assert.ok(args.includes('3.1'));assert.ok(args.includes('yuv420p'));assert.ok(args.includes('aac_low'));assert.ok(args.includes('mpegts'));assert.ok(args.includes('120'));assert.ok(!args.includes('copy'));}
});

test('HDR transfer functions are tone mapped to SDR for older televisions',()=>{
 const {segmentArguments}=require('../stremio-media');
 for(const transfer of ['smpte2084','arib-std-b67'])for(const quality of [720,1080]){
  const args=segmentArguments({streams:[{index:0,codec_type:'video',color_transfer:transfer},{index:1,codec_type:'audio',tags:{language:'fra'}}]},'http://127.0.0.1/media',0,6,'/tmp/out.ts',quality);
  assert.ok(args[args.indexOf('-vf')+1].includes('tonemap=mobius'));assert.ok(args.includes('bt709'));
 }
});
