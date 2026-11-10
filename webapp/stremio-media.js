'use strict';
const {spawn} = require('node:child_process');
const probes = new Map();
let active = 0;
function chooseAudio(streams) {
  const audio = streams.filter(s => s.codec_type === 'audio');
  const french = audio.find(s => /^(fr|fra|fre)(?:[-_]|$)/i.test(s.tags?.language || ''));
  if (french) return french;
  if (audio.length === 1 && (!audio[0].tags?.language || /^(und|unknown)$/i.test(audio[0].tags.language))) return audio[0];
  throw new Error('Aucune piste française identifiée dans ce fichier.');
}
function encoderArguments(info, source, start = 0) {
  const video = info.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('Aucune piste vidéo.');
  const audio = chooseAudio(info.streams);
  return ['-hide_banner','-loglevel','error','-nostdin',...(start > 0 ? ['-ss',String(start)] : []),'-rw_timeout','20000000','-i',source,
    '-map','0:'+video.index,'-map','0:'+audio.index,'-sn','-dn',
    ...(video.codec_name === 'h264' && (video.width || 0) <= 1920 && (video.height || 0) <= 1080 && (video.pix_fmt || 'yuv420p') === 'yuv420p' ? ['-c:v','copy'] : ['-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-vf',"scale=w='min(1280,iw)':h=-2",'-pix_fmt','yuv420p','-crf','23','-threads','2']),
    '-c:a','aac','-ac','2','-ar','48000','-metadata:s:a:0','language=fra',
    '-avoid_negative_ts','make_zero','-movflags','frag_keyframe+empty_moov+default_base_moof','-frag_duration','1000000','-f','mp4','pipe:1'];
}
function probe(source, identity = source) {
  const hit=probes.get(identity);if(hit && hit.until>Date.now())return hit.promise;
  if(probes.size>=128)probes.delete(probes.keys().next().value);
  const promise=new Promise((resolve,reject)=>{
    const child=spawn('ffprobe',['-v','error','-probesize','5000000','-analyzeduration','5000000','-show_streams','-show_format','-of','json',source],{stdio:['ignore','pipe','ignore']});
    let text='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Analyse vidéo trop longue.'));},20000);
    child.stdout.on('data',chunk=>{text+=chunk;if(text.length>1048576){child.kill('SIGKILL');reject(new Error('Métadonnées trop volumineuses.'));}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Adaptation vidéo indisponible.'));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Source vidéo indisponible.'));try{const data=JSON.parse(text);chooseAudio(data.streams||[]);resolve(data);}catch{reject(new Error('Aucune piste française lisible identifiée.'));}});
  }).catch(error=>{probes.delete(identity);throw error;});
  probes.set(identity,{until:Date.now()+600000,promise});return promise;
}
async function browserMedia(req,res,ticketId,{start=0,probeOnly=false,identity}={}) {
  if(active>=2){res.writeHead(429,{'Retry-After':'2'});return res.end('Deux lectures sont déjà en cours.');}
  active++;let child,closed=false;
  const finish=()=>{if(closed)return;closed=true;active--;if(child&&!child.killed)child.kill('SIGKILL');};
  res.once('close',finish);
  try{
    const source=`http://127.0.0.1:${Number(process.env.PORT||8090)}/api/stremio/media/${ticketId}`;
    const info=await probe(source,identity);if(closed)return;
    if(probeOnly){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({duration:Number(info.format?.duration)||0,audioLanguage:'fr'}));return;}
    const args=encoderArguments(info,source,start);
    child=spawn('ffmpeg',args,{stdio:['ignore','pipe','ignore']});
    child.once('error',()=>{if(!res.headersSent){res.writeHead(502);res.end('Adaptation vidéo indisponible.');}else res.destroy();});
    child.once('close',code=>{if(closed)return;if(code===0)res.end();else if(!res.headersSent){res.writeHead(502);res.end('Source française indisponible.');}else res.destroy();});
    let sent=false;
    child.stdout.on('data',()=>{if(!sent){sent=true;res.writeHead(200,{'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'none'});}});
    child.stdout.pipe(res,{end:false});
  }catch{if(!closed){res.writeHead(422,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Aucune piste française lisible disponible pour ce lien.'}));}}
}
module.exports={browserMedia,chooseAudio,encoderArguments};

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const segmentCache=new Map();
let segmentDirectory;
let encoders=0;const encoderQueue=[];
function vodPlaylist(ticketId,duration,quality=720) {
  if(!Number.isFinite(duration)||duration<=0||duration>604800)throw new Error('Durée invalide');
  const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-INDEPENDENT-SEGMENTS'];
  for(let start=0,index=0;start<duration;start+=6,index++)lines.push('#EXTINF:'+Math.min(6,duration-start).toFixed(3)+',',`/api/stremio/hls/${ticketId}/segment-${quality}-${index}.ts`);
  lines.push('#EXT-X-ENDLIST');return lines.join('\n')+'\n';
}
function masterPlaylist(ticketId) {
  return ['#EXTM3U','#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=750000,RESOLUTION=640x360,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-360.m3u8`,
    '#EXT-X-STREAM-INF:BANDWIDTH=1700000,AVERAGE-BANDWIDTH=1400000,RESOLUTION=854x480,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-480.m3u8`,
    '#EXT-X-STREAM-INF:BANDWIDTH=3300000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-720.m3u8`,''].join('\n');
}
function segmentArguments(info,source,start,length,destination,quality=720) {
  const video=info.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
  if(!video)throw new Error('Aucune vidéo');const audio=chooseAudio(info.streams);
  const profile = {360:[640,650,800,1600,96],480:[854,1200,1500,3000,128],720:[1280,2500,3000,6000,128]}[quality];
  if(!profile)throw new Error('Qualité invalide');
  const scaling=`scale=w='min(${profile[0]},iw)':h='min(${quality},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const hdr=['smpte2084','arib-std-b67'].includes(video.color_transfer);
  const filters=scaling+(hdr?',zscale=transfer=linear:npl=100,format=gbrpf32le,tonemap=mobius:desat=0,zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,format=yuv420p':'');
  return ['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(start),'-rw_timeout','20000000','-i',source,'-t',String(length),
    '-map','0:'+video.index,'-map','0:'+audio.index,'-sn','-dn',
    '-c:v','libx264','-preset','ultrafast','-profile:v','baseline','-level:v','3.1','-pix_fmt','yuv420p',
    '-vf',filters,'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-r','30',
    '-g','180','-keyint_min','180','-sc_threshold','0','-b:v',profile[1]+'k','-maxrate',profile[2]+'k','-bufsize',profile[3]+'k','-threads','2',
    '-c:a','aac','-profile:a','aac_low','-b:a',profile[4]+'k','-ac','2','-ar','48000','-metadata:s:a:0','language=fra',
    '-muxdelay','0','-muxpreload','0','-output_ts_offset',String(start),'-mpegts_flags','+resend_headers','-f','mpegts',destination];
}
async function createSegment(info,source,identity,index,quality=720) {
  const key=identity+':'+quality+':'+index;const existing=segmentCache.get(key);
  if(existing){segmentCache.delete(key);segmentCache.set(key,existing);return existing;}
  const promise=(async()=>{
    if(encoders>=2){if(encoderQueue.length>=8)throw new Error('Serveur occupé');await new Promise(resolve=>encoderQueue.push(resolve));}
    encoders++;
    let file;
    try{
      if(!segmentDirectory)segmentDirectory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'plezy-hls-'));
      file=path.join(segmentDirectory,crypto.randomBytes(16).toString('hex')+'.ts');
      const duration=Number(info.format?.duration);const start=index*6;
      if(!Number.isFinite(duration)||start>=duration)throw new Error('Segment invalide');
      await new Promise((resolve,reject)=>{
        const child=spawn('ffmpeg',segmentArguments(info,source,start,Math.min(6,duration-start),file,quality),{stdio:'ignore'});
        const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Adaptation trop longue'));},45000);
        child.once('error',()=>{clearTimeout(timer);reject(new Error('Adaptation indisponible'));});
        child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Source française indisponible'));});
      });
      return file;
    }catch(error){if(file)await fs.promises.unlink(file).catch(()=>{});throw error;}
    finally{encoders--;encoderQueue.shift()?.();}
  })().catch(error=>{segmentCache.delete(key);throw error;});
  segmentCache.set(key,promise);
  while(segmentCache.size>48){const oldest=segmentCache.keys().next().value;if(oldest===key)break;const file=segmentCache.get(oldest);segmentCache.delete(oldest);file.then(name=>fs.promises.unlink(name).catch(()=>{})).catch(()=>{});}
  return promise;
}
async function hlsMedia(req,res,ticketId,segmentIndex,identity,quality=720,master=false) {
  try{
    const source=`http://127.0.0.1:${Number(process.env.PORT||8090)}/api/stremio/media/${ticketId}`;
    const info=await probe(source,identity);if(res.destroyed)return;
    if(segmentIndex===undefined){const playlist=master ? masterPlaylist(ticketId) : vodPlaylist(ticketId,Number(info.format?.duration),quality);res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:playlist);}
    if(!Number.isSafeInteger(segmentIndex)||segmentIndex<0||segmentIndex*6>=Number(info.format?.duration)){res.writeHead(404);return res.end();}
    const file=await createSegment(info,source,identity,segmentIndex,quality);if(res.destroyed)return;
    const stat=await fs.promises.stat(file);res.writeHead(200,{'Content-Type':'video/mp2t','Content-Length':stat.size,'Cache-Control':'private, max-age=30'});
    if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.destroyed&&!res.headersSent){res.writeHead(422,{'Cache-Control':'no-store'});res.end('Source française indisponible pour cet appareil.');}}
}
module.exports.hlsMedia=hlsMedia;
module.exports.vodPlaylist=vodPlaylist;
module.exports.segmentArguments=segmentArguments;

module.exports.masterPlaylist=masterPlaylist;
