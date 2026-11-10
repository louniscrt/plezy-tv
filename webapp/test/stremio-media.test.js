const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chooseAudio,encoderArguments}=require('../stremio-media');
test('French audio is selected even when English is the first default track',()=>{
 const streams=[{index:0,codec_type:'video',codec_name:'h264',width:1920,pix_fmt:'yuv420p'},{index:1,codec_type:'audio',tags:{language:'eng'}},{index:2,codec_type:'audio',tags:{language:'fra'}}];
 assert.equal(chooseAudio(streams).index,2);
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
 for(const transfer of ['smpte2084','arib-std-b67']){
  const args=segmentArguments({streams:[{index:0,codec_type:'video',color_transfer:transfer},{index:1,codec_type:'audio',tags:{language:'fra'}}]},'http://127.0.0.1/media',0,6,'/tmp/out.ts',720);
  assert.ok(args[args.indexOf('-vf')+1].includes('tonemap=mobius'));assert.ok(args.includes('bt709'));
 }
});
