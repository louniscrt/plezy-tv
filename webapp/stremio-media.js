'use strict';
const {spawn} = require('node:child_process');
const probes = new Map();
const resolvedUrls = new Map();
let active = 0;

async function resolveDirectUrl(url, identity = url) {
  if (!url || !/^https:\/\//i.test(url)) return url;
  const hit = resolvedUrls.get(identity);
  if (hit && hit.until > Date.now()) return hit.promise;
  if (resolvedUrls.size >= 512) resolvedUrls.delete(resolvedUrls.keys().next().value);
  const promise = (async () => {
    let current = url;
    for (let hop = 0; hop < 3; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const res = await fetch(current, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual', signal: ctrl.signal });
        res.body?.cancel().catch(() => {});
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          const next = new URL(loc, current).href;
          if (/^https:\/\//i.test(next)) {
            current = next;
            if (/\.real-debrid\.com\/|\.debrid\.it\/|\.alldebrid\./i.test(current)) break;
            continue;
          }
        }
        break;
      } catch {
        break;
      } finally {
        clearTimeout(timer);
      }
    }
    return current;
  })();
  resolvedUrls.set(identity, { until: Date.now() + 1800000, promise });
  return promise;
}

function isFrenchTrack(s) {
  const lang = s?.tags?.language || '';
  const title = s?.tags?.title || '';
  return /^(fr|fra|fre|french|francais|français)(?:[-_]|$)/i.test(lang) || /\b(french|français|francais|vff|vfq|vfi|vf|truefrench)\b/i.test(title);
}

function isEnglishTrack(s) {
  const lang = s?.tags?.language || '';
  const title = s?.tags?.title || '';
  return /^(en|eng|english|anglais)(?:[-_]|$)/i.test(lang) || /\b(english|anglais|eng|vo)\b/i.test(title);
}

function listAudioTracks(streams = []) {
  const audio = (streams || []).filter(s => s.codec_type === 'audio');
  const fr = audio.find(isFrenchTrack);
  const en = audio.find(isEnglishTrack);
  const tracks = [];
  if (fr) tracks.push({ index: fr.index, language: 'fra', code: 'fr', label: 'Français (Principal)', isDefault: true });
  if (en && en.index !== fr?.index) tracks.push({ index: en.index, language: 'eng', code: 'en', label: 'Anglais', isDefault: !fr });
  return { audio, fr, en, tracks };
}

function chooseAudio(streams, options = {}) {
  const opts = typeof options === 'string' ? { lang: options } : (options || {});
  const lang = String(opts.lang || 'fr').toLowerCase();
  const allowFallback = Boolean(opts.allowFallback);
  const audio = (streams || []).filter(s => s.codec_type === 'audio');
  if (!audio.length) throw new Error('Aucune piste française identifiée dans ce fichier.');
  const french = audio.find(isFrenchTrack);
  const english = audio.find(isEnglishTrack);
  if (lang === 'en' || lang === 'eng') {
    if (english) return english;
    const alt = audio.find(s => s.index !== french?.index);
    if (alt) return alt;
    if (allowFallback || audio.length >= 1) return audio[0];
  }
  if (french) return french;
  if (audio.length === 1 && (!audio[0].tags?.language || /^(und|unknown)$/i.test(audio[0].tags.language))) return audio[0];
  if (allowFallback) {
    const untagged = audio.find(s => !s.tags?.language || /^(und|unknown)$/i.test(s.tags.language));
    return untagged || english || audio[0];
  }
  throw new Error('Aucune piste française identifiée dans ce fichier.');
}

function encoderArguments(info, source, start = 0, options = {}) {
  const video = info.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('Aucune piste vidéo.');
  const audio = chooseAudio(info.streams, options);
  const langCode = String(options?.lang || 'fr').toLowerCase() === 'en' ? 'eng' : 'fra';
  return ['-hide_banner','-loglevel','error','-nostdin',...(start > 0 ? ['-ss',String(start)] : []),'-rw_timeout','12000000','-i',source,
    '-map','0:'+video.index,'-map','0:'+audio.index,'-sn','-dn',
    ...(video.codec_name === 'h264' && (video.width || 0) <= 3840 && (video.height || 0) <= 2160 && (video.pix_fmt || 'yuv420p') === 'yuv420p' ? ['-c:v','copy'] : ['-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-vf',"scale=w='min(1920,iw)':h=-2",'-pix_fmt','yuv420p','-crf','20','-threads','2']),
    '-c:a','aac','-ac','2','-ar','48000','-metadata:s:a:0','language='+langCode,
    '-avoid_negative_ts','make_zero','-movflags','frag_keyframe+empty_moov+default_base_moof','-frag_duration','1000000','-f','mp4','pipe:1'];
}

function rawProbe(source, identity = source) {
  const hit=probes.get(identity);if(hit && hit.until>Date.now())return hit.promise;
  if(probes.size>=256)probes.delete(probes.keys().next().value);
  const promise=new Promise((resolve,reject)=>{
    const child=spawn('ffprobe',['-v','error','-rw_timeout','8000000','-probesize','2500000','-analyzeduration','2500000','-show_streams','-show_format','-of','json',source],{stdio:['ignore','pipe','ignore']});
    let text='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Analyse vidéo trop longue.'));},7500);
    child.stdout.on('data',chunk=>{text+=chunk;if(text.length>1048576){child.kill('SIGKILL');reject(new Error('Métadonnées trop volumineuses.'));}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Adaptation vidéo indisponible.'));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Source vidéo indisponible.'));try{const data=JSON.parse(text);if(!(data.streams||[]).some(s=>s.codec_type==='audio'))throw new Error('Sans audio');resolve(data);}catch{reject(new Error('Aucune piste française lisible identifiée.'));}});
  }).catch(error=>{probes.delete(identity);throw error;});
  probes.set(identity,{until:Date.now()+600000,promise});return promise;
}

async function probe(source, identity = source, options = {}) {
  const resolved = await resolveDirectUrl(source, identity);
  const data = await rawProbe(resolved, identity);
  chooseAudio(data.streams || [], options);
  return data;
}

function warmProbe(ticketId, identity, options = {}) {
  const directUrl = options.upstreamUrl && /^https:\/\//i.test(options.upstreamUrl) && !options.hasCustomHeaders ? options.upstreamUrl : null;
  const fallbackSource = `http://127.0.0.1:${Number(process.env.PORT || 8090)}/api/stremio/media/${ticketId}`;
  const idKey = identity || directUrl || fallbackSource;
  resolveDirectUrl(directUrl || fallbackSource, idKey)
    .then(async src => {
      const info = await rawProbe(src, idKey);
      if (Number(info.format?.duration) > 0 && encoders < 3) {
        createSegment(info, src, idKey, 0, 1080, { lang: 'fr', allowFallback: true }).catch(() => {});
      }
    })
    .catch(() => {});
}

async function browserMedia(req,res,ticketId,{start=0,probeOnly=false,identity,lang='fr',allowFallback=false,upstreamUrl,hasCustomHeaders}={}) {
  if(!probeOnly && active>=4){res.writeHead(429,{'Retry-After':'2'});return res.end('Plusieurs lectures sont déjà en cours.');}
  if(!probeOnly) active++;
  let child,closed=false;
  const finish=()=>{if(closed)return;closed=true;if(!probeOnly)active--;if(child&&!child.killed)child.kill('SIGKILL');};
  res.once('close',finish);
  try{
    const directUrl = upstreamUrl && /^https:\/\//i.test(upstreamUrl) && !hasCustomHeaders ? upstreamUrl : null;
    const rawSource = directUrl || `http://127.0.0.1:${Number(process.env.PORT||8090)}/api/stremio/media/${ticketId}`;
    const source = await resolveDirectUrl(rawSource, identity || rawSource);
    const info=await probe(source,identity,{lang,allowFallback});if(closed)return;
    if(probeOnly){
      const dur=Number(info.format?.duration)||0;
      if(dur>0 && encoders<3){
        const startIdx=Math.max(0,Math.floor((Number(start)||0)/6));
        createSegment(info,source,identity,startIdx,1080,{lang,allowFallback}).catch(()=>{});
        if((startIdx+1)*6<dur && encoders<3)createSegment(info,source,identity,startIdx+1,1080,{lang,allowFallback}).catch(()=>{});
      }
      const {fr,en,tracks}=listAudioTracks(info.streams||[]);
      const selected=chooseAudio(info.streams||[],{lang,allowFallback});
      const selectedLang=isEnglishTrack(selected)&&!isFrenchTrack(selected)?'en':'fr';
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({
        duration:Number(info.format?.duration)||0,
        audioLanguage:selectedLang,
        hasFrenchAudio:Boolean(fr),
        hasEnglishAudio:Boolean(en||(info.streams||[]).filter(s=>s.codec_type==='audio').length>1),
        audioTracks:tracks
      }));
      return;
    }
    const args=encoderArguments(info,source,start,{lang,allowFallback});
    child=spawn('ffmpeg',args,{stdio:['ignore','pipe','ignore']});
    child.once('error',()=>{if(!res.headersSent){res.writeHead(502);res.end('Adaptation vidéo indisponible.');}else res.destroy();});
    child.once('close',code=>{if(closed)return;if(code===0)res.end();else if(!res.headersSent){res.writeHead(502);res.end('Source française indisponible.');}else res.destroy();});
    let sent=false;
    child.stdout.on('data',()=>{if(!sent){sent=true;res.writeHead(200,{'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'none'});}});
    child.stdout.pipe(res,{end:false});
  }catch{if(!closed){res.writeHead(422,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Aucune piste française lisible disponible pour ce lien.'}));}}
}
async function subtitleMedia(req, res, ticketId, { lang = 'fr', identity, upstreamUrl, hasCustomHeaders } = {}) {
  const sendEmpty = () => {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=600', 'Access-Control-Allow-Origin': '*' });
    res.end(req.method === 'HEAD' ? undefined : 'WEBVTT\n\n');
  };
  try {
    const directUrl = upstreamUrl && /^https:\/\//i.test(upstreamUrl) && !hasCustomHeaders ? upstreamUrl : null;
    const rawSource = directUrl || `http://127.0.0.1:${Number(process.env.PORT || 8090)}/api/stremio/media/${ticketId}`;
    const source = await resolveDirectUrl(rawSource, identity || rawSource);
    const info = await rawProbe(source, identity || source);
    if (res.destroyed) return;
    const textCodecs = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
    const subs = (info.streams || []).filter(s => s.codec_type === 'subtitle' && (!s.codec_name || textCodecs.has(String(s.codec_name).toLowerCase())));
    const target = lang === 'en'
      ? (subs.find(isEnglishTrack) || subs.find(s => !isFrenchTrack(s)))
      : (subs.find(isFrenchTrack) || subs[0]);
    if (!target) return sendEmpty();
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-rw_timeout', '10000000', '-i', source, '-map', '0:' + target.index, '-f', 'webvtt', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.stdout.on('data', chunk => { if (out.length < 2 * 1024 * 1024) out += chunk.toString('utf8'); });
    child.once('error', () => { clearTimeout(timer); sendEmpty(); });
    child.once('close', () => {
      clearTimeout(timer);
      if (res.headersSent || res.destroyed) return;
      const body = out.trim().startsWith('WEBVTT') ? out : 'WEBVTT\n\n';
      res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  } catch {
    sendEmpty();
  }
}
module.exports={browserMedia,chooseAudio,encoderArguments,warmProbe,listAudioTracks,subtitleMedia};

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const segmentCache=new Map();
let segmentDirectory;
let encoders=0;const encoderQueue=[];
function vodPlaylist(ticketId,duration,quality=720,querySuffix='') {
  if(!Number.isFinite(duration)||duration<=0||duration>604800)throw new Error('Durée invalide');
  const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-INDEPENDENT-SEGMENTS'];
  for(let start=0,index=0;start<duration;start+=6,index++)lines.push('#EXTINF:'+Math.min(6,duration-start).toFixed(3)+',',`/api/stremio/hls/${ticketId}/segment-${quality}-${index}.ts${querySuffix}`);
  lines.push('#EXT-X-ENDLIST');return lines.join('\n')+'\n';
}
function masterPlaylist(ticketId,querySuffix='') {
  return ['#EXTM3U','#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,AVERAGE-BANDWIDTH=4500000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="avc1.640028,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-1080.m3u8${querySuffix}`,
    '#EXT-X-STREAM-INF:BANDWIDTH=3300000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-720.m3u8${querySuffix}`,
    '#EXT-X-STREAM-INF:BANDWIDTH=1700000,AVERAGE-BANDWIDTH=1400000,RESOLUTION=854x480,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-480.m3u8${querySuffix}`,
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=750000,RESOLUTION=640x360,FRAME-RATE=30.000,CODECS="avc1.42E01F,mp4a.40.2"',`/api/stremio/hls/${ticketId}/quality-360.m3u8${querySuffix}`,''].join('\n');
}
function segmentArguments(info,source,start,length,destination,quality=1080,options={}) {
  const video=info.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
  if(!video)throw new Error('Aucune vidéo');const audio=chooseAudio(info.streams,options);
  const langCode=String(options?.lang||'fr').toLowerCase()==='en'?'eng':'fra';
  const profile = {
    360:[640,650,800,1600,96],
    480:[854,1200,1500,3000,128],
    720:[1280,2500,3000,6000,128],
    1080:[1920,4500,6000,12000,192],
    2160:[2560,7500,9500,19000,192]
  }[quality];
  if(!profile)throw new Error('Qualité invalide');
  const scaling=`scale=w='min(${profile[0]},iw)':h='min(${quality},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=fast_bilinear`;
  const hdr = quality <= 720 && ['smpte2084','arib-std-b67'].includes(video.color_transfer);
  const filters=scaling+(hdr?',zscale=transfer=linear:npl=100,format=gbrpf32le,tonemap=mobius:desat=0,zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,format=yuv420p':'');
  const vProfile = quality >= 1080 ? 'high' : 'baseline';
  const vLevel = quality >= 2160 ? '5.1' : quality >= 1080 ? '4.1' : '3.1';
  const threads = quality >= 1080 ? '0' : '4';
  return ['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(start),'-rw_timeout','12000000','-i',source,'-t',String(length),
    '-map','0:'+video.index,'-map','0:'+audio.index,'-sn','-dn',
    '-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-profile:v',vProfile,'-level:v',vLevel,'-pix_fmt','yuv420p',
    '-vf',filters,'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',...(quality <= 720 ? ['-r','30','-g','180','-keyint_min','180'] : ['-g','144','-keyint_min','144']),
    '-sc_threshold','0','-b:v',profile[1]+'k','-maxrate',profile[2]+'k','-bufsize',profile[3]+'k','-threads',threads,
    '-c:a','aac','-profile:a','aac_low','-b:a',profile[4]+'k','-ac','2','-ar','48000','-af','aresample=async=1:first_pts=0','-metadata:s:a:0','language='+langCode,
    '-muxdelay','0','-muxpreload','0','-output_ts_offset',String(start),'-mpegts_flags','+resend_headers','-f','mpegts',destination];
}
async function createSegment(info,source,identity,index,quality=1080,options={}) {
  const langKey=String(options?.lang||'fr').toLowerCase()==='en'?'en':'fr';
  const key=identity+':'+langKey+':'+quality+':'+index;const existing=segmentCache.get(key);
  if(existing){segmentCache.delete(key);segmentCache.set(key,existing);return existing;}
  const promise=(async()=>{
    if(encoders>=3){if(encoderQueue.length>=24)throw new Error('Serveur occupé');await new Promise(resolve=>encoderQueue.push(resolve));}
    encoders++;
    let file;
    try{
      if(!segmentDirectory)segmentDirectory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'plezy-hls-')).catch(()=>fs.promises.mkdtemp('/dev/shm/plezy-hls-'));
      file=path.join(segmentDirectory,crypto.randomBytes(16).toString('hex')+'.ts');
      const duration=Number(info.format?.duration);const start=index*6;
      if(!Number.isFinite(duration)||start>=duration)throw new Error('Segment invalide');
      await new Promise((resolve,reject)=>{
        const child=spawn('ffmpeg',segmentArguments(info,source,start,Math.min(6,duration-start),file,quality,options),{stdio:'ignore'});
        const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Adaptation trop longue'));},35000);
        child.once('error',()=>{clearTimeout(timer);reject(new Error('Adaptation indisponible'));});
        child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Source française indisponible'));});
      });
      return file;
    }catch(error){if(file)await fs.promises.unlink(file).catch(()=>{});throw error;}
    finally{encoders--;encoderQueue.shift()?.();}
  })().catch(error=>{segmentCache.delete(key);throw error;});
  segmentCache.set(key,promise);
  while(segmentCache.size>96){const oldest=segmentCache.keys().next().value;if(oldest===key)break;const file=segmentCache.get(oldest);segmentCache.delete(oldest);file.then(name=>fs.promises.unlink(name).catch(()=>{})).catch(()=>{});}
  return promise;
}
async function hlsMedia(req,res,ticketId,segmentIndex,identity,quality=1080,master=false,options={}) {
  try{
    const directUrl = options.upstreamUrl && /^https:\/\//i.test(options.upstreamUrl) && !options.hasCustomHeaders ? options.upstreamUrl : null;
    const rawSource = directUrl || `http://127.0.0.1:${Number(process.env.PORT||8090)}/api/stremio/media/${ticketId}`;
    const source = await resolveDirectUrl(rawSource, identity || rawSource);
    const info=await probe(source,identity,options);if(res.destroyed)return;
    const params=new URLSearchParams();
    if(options.lang==='en')params.set('lang','en');
    if(options.allowFallback)params.set('fallback','1');
    const querySuffix=params.toString()?`?${params.toString()}`:'';
    if(segmentIndex===undefined){
      const duration=Number(info.format?.duration);
      const playlist=master ? masterPlaylist(ticketId,querySuffix) : vodPlaylist(ticketId,duration,quality,querySuffix);
      const warmQ=master ? 1080 : quality;
      if(duration>0){
        if(encoders<3)createSegment(info,source,identity,0,warmQ,options).catch(()=>{});
        if(encoders<3 && duration>6)createSegment(info,source,identity,1,warmQ,options).catch(()=>{});
      }
      res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?undefined:playlist);
    }
    const duration=Number(info.format?.duration);
    if(!Number.isSafeInteger(segmentIndex)||segmentIndex<0||segmentIndex*6>=duration){res.writeHead(404);return res.end();}
    const file=await createSegment(info,source,identity,segmentIndex,quality,options);if(res.destroyed)return;
    for(let ahead=1;ahead<=4;ahead++){
      if(encoders<3 && (segmentIndex+ahead)*6<duration){
        createSegment(info,source,identity,segmentIndex+ahead,quality,options).catch(()=>{});
      }
    }
    const stat=await fs.promises.stat(file);res.writeHead(200,{'Content-Type':'video/mp2t','Content-Length':stat.size,'Cache-Control':'private, max-age=60'});
    if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.destroyed&&!res.headersSent){res.writeHead(422,{'Cache-Control':'no-store'});res.end('Source française indisponible pour cet appareil.');}}
}
module.exports.hlsMedia=hlsMedia;
module.exports.vodPlaylist=vodPlaylist;
module.exports.segmentArguments=segmentArguments;
module.exports.masterPlaylist=masterPlaylist;
