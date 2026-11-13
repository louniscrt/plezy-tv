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

function listSubtitleTracks(streams = []) {
  const textCodecs = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
  const subs = (streams || []).filter(s => s.codec_type === 'subtitle' && (!s.codec_name || textCodecs.has(String(s.codec_name).toLowerCase())));
  return subs.map(s => {
    const lang = String(s.tags?.language || s.tags?.LANGUAGE || 'und').toLowerCase();
    const rawTitle = String(s.tags?.title || s.tags?.TITLE || '').trim();
    const isForced = s.disposition?.forced === 1 || /forc[eé]|forced/i.test(rawTitle);
    const isSdh = s.disposition?.hearing_impaired === 1 || /sdh|malentendant/i.test(rawTitle);
    const isFr = /^(fr|fra|fre|french)/i.test(lang) || /french|français|vf|vff|vfq/i.test(rawTitle);
    const isEn = /^(en|eng|english)/i.test(lang) || /english|anglais/i.test(rawTitle);
    const baseLang = isFr ? 'Français' : isEn ? 'Anglais' : (lang !== 'und' ? lang.toUpperCase() : `Piste ${s.index}`);
    const kind = isForced ? 'forcé' : isSdh ? 'malentendants' : 'complet';
    let label;
    if (rawTitle && !/^(subtitles?|sous-titres?|french|anglais|english|fra|fre|eng)$/i.test(rawTitle)) {
      label = rawTitle.toLowerCase().includes(baseLang.toLowerCase()) ? rawTitle : `${baseLang} (${rawTitle})`;
    } else {
      label = `${baseLang} (${kind})`;
    }
    return {
      index: s.index,
      code: isFr ? 'fr' : isEn ? 'en' : lang,
      language: isFr ? 'fra' : isEn ? 'eng' : lang,
      label,
      isFrench: isFr,
      isEnglish: isEn,
      isForced,
      isSdh
    };
  });
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

function extractChapters(info) {
  const raw = Array.isArray(info?.chapters) ? info.chapters : [];
  if (!raw.length) return { chapters: [], intro: null };
  const chapters = raw.map((c, idx) => {
    const startSec = Number(c.start_time) || 0;
    const endSec = Number(c.end_time) || 0;
    const title = String(c.tags?.title || c.tags?.TITLE || `Chapitre ${idx + 1}`).trim();
    return { Name: title, StartPositionTicks: Math.round(startSec * 10000000), start: startSec, end: endSec };
  }).filter(c => Number.isFinite(c.start) && c.end > c.start);
  let intro = null;
  const named = chapters.find(c => c.start < 360 && (c.end - c.start) >= 12 && (c.end - c.start) <= 140 && /(intro|opening|\bop\b|g[eé]n[eé]rique|theme|cr[eé]dit)/i.test(c.Name) && !/(end|outro|closing|\bed\b)/i.test(c.Name));
  if (named) {
    intro = { start: Math.max(0, Math.floor(named.start)), end: Math.ceil(named.end) };
  } else if (chapters.length >= 3 && (Number(info?.format?.duration) || 0) <= 5400) {
    const candidate = chapters.find((c, i) => {
      const len = c.end - c.start;
      const next = chapters[i + 1];
      return c.start <= 240 && len >= 25 && len <= 100 && next && (next.end - next.start) > 120;
    });
    if (candidate) intro = { start: Math.max(0, Math.floor(candidate.start)), end: Math.ceil(candidate.end) };
  }
  return { chapters: chapters.map(({ Name, StartPositionTicks }) => ({ Name, StartPositionTicks })), intro };
}

function rawProbe(source, identity = source) {
  const hit=probes.get(identity);if(hit && hit.until>Date.now())return hit.promise;
  if(probes.size>=256)probes.delete(probes.keys().next().value);
  const promise=new Promise((resolve,reject)=>{
    const child=spawn('ffprobe',['-v','error','-rw_timeout','15000000','-probesize','2000000','-analyzeduration','2000000','-show_streams','-show_format','-show_chapters','-of','json',source],{stdio:['ignore','pipe','ignore']});
    let text='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Analyse vidéo trop longue.'));},20000);
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
    // Only warm metadata here: the selected resume position and quality are not
    // known until the browser probe. Encoding segment zero wastes the startup CPU.
    .then(src => rawProbe(src, idKey))
    .catch(() => {});
}

async function browserMedia(req,res,ticketId,{start=0,quality=360,probeOnly=false,identity,lang='fr',allowFallback=false,upstreamUrl,hasCustomHeaders}={}) {
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
        createSegment(info,source,identity,startIdx,quality,{lang,allowFallback,priority:true}).catch(()=>{});
        if((startIdx+1)*6<dur && encoders<2)createSegment(info,source,identity,startIdx+1,quality,{lang,allowFallback}).catch(()=>{});
      }
      const {fr,en,tracks}=listAudioTracks(info.streams||[]);
      const subTracks = listSubtitleTracks(info.streams || []);
      const selected=chooseAudio(info.streams||[],{lang,allowFallback});
      const selectedLang=isEnglishTrack(selected)&&!isFrenchTrack(selected)?'en':'fr';
      const {chapters,intro}=extractChapters(info);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({
        duration:Number(info.format?.duration)||0,
        audioLanguage:selectedLang,
        hasFrenchAudio:Boolean(fr),
        hasEnglishAudio:Boolean(en||(info.streams||[]).filter(s=>s.codec_type==='audio').length>1),
        audioTracks:tracks,
        subtitleTracks:subTracks,
        chapters,
        intro
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
async function subtitleMedia(req, res, ticketId, { stream, lang = 'fr', identity, upstreamUrl, hasCustomHeaders } = {}) {
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
    let target = null;
    if (stream !== undefined && stream !== null && stream !== '') {
      const idx = Number(stream);
      target = subs.find(s => s.index === idx) || (info.streams || []).find(s => s.index === idx);
    }
    if (!target) {
      target = lang === 'en'
        ? (subs.find(isEnglishTrack) || subs.find(s => !isFrenchTrack(s)))
        : (subs.find(isFrenchTrack) || subs[0]);
    }
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
module.exports={browserMedia,chooseAudio,encoderArguments,warmProbe,listAudioTracks,listSubtitleTracks,subtitleMedia};

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const segmentCache=new Map();
async function isSegmentUsable(file) {
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 188 * 3 || stat.size % 188 !== 0) return false;
    const sample = Buffer.alloc(188 * 3);
    for (const position of new Set([0, stat.size - sample.length])) {
      const { bytesRead } = await handle.read(sample, 0, sample.length, position);
      if (bytesRead !== sample.length) return false;
      for (let offset = 0; offset < sample.length; offset += 188) {
        if (sample[offset] !== 0x47 || (sample[offset + 1] & 0x80) || !(sample[offset + 3] & 0x30)) return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
let segmentDirectory;
let encoders=0;const encoderQueue=[];
function vodPlaylist(ticketId,duration,quality=720,querySuffix='') {
  if(!Number.isFinite(duration)||duration<=0||duration>604800)throw new Error('Durée invalide');
  const lines=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:6','#EXT-X-MEDIA-SEQUENCE:0','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-INDEPENDENT-SEGMENTS'];
  for(let start=0,index=0;start<duration;start+=6,index++)lines.push('#EXTINF:'+Math.min(6,duration-start).toFixed(3)+',',`/api/stremio/hls/${ticketId}/segment-${quality}-${index}.ts${querySuffix}`);
  lines.push('#EXT-X-ENDLIST');return lines.join('\n')+'\n';
}
function masterPlaylist(ticketId,querySuffix='') {
  const variants = [[240,420000,330000,426,240],[360,750000,600000,640,360],[480,1700000,1400000,854,480],[720,3300000,2800000,1280,720],[1080,10500000,8500000,1920,1080]];
  return ['#EXTM3U','#EXT-X-VERSION:3',...variants.flatMap(([quality,peak,average,width,height]) => [
    `#EXT-X-STREAM-INF:BANDWIDTH=${peak},AVERAGE-BANDWIDTH=${average},RESOLUTION=${width}x${height},FRAME-RATE=30.000,CODECS="${quality >= 1080 ? 'avc1.640029' : 'avc1.42E01F'},mp4a.40.2"`,
    `/api/stremio/hls/${ticketId}/quality-${quality}.m3u8${querySuffix}`
  ]),''].join('\n');
}
function segmentArguments(info,source,start,length,destination,quality=1080,options={}) {
  const video=info.streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
  if(!video)throw new Error('Aucune vidéo');const audio=chooseAudio(info.streams,options);
  const langCode=String(options?.lang||'fr').toLowerCase()==='en'?'eng':'fra';
  const profile = {
    240:[426,250,320,640,48],
    360:[640,500,600,1200,64],
    480:[854,1200,1500,3000,128],
    720:[1280,2500,3000,6000,128],
    1080:[1920,8000,10000,20000,192],
    2160:[3840,14000,18000,36000,192]
  }[quality];
  if(!profile)throw new Error('Qualité invalide');
  // Independent segments must start at the requested time, even between keyframes.
  // Copying from the previous keyframe overlaps adjacent six-second segments.
  const scaling=`scale=w='min(${profile[0]},iw)':h='min(${quality},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=fast_bilinear`;
  const hdr = ['smpte2084','arib-std-b67'].includes(video.color_transfer);
  const filters=scaling+(hdr?',zscale=transfer=linear:npl=100,format=gbrpf32le,tonemap=mobius:desat=0,zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,format=yuv420p':'');
  const vProfile = quality >= 1080 ? 'high' : 'baseline';
  const vLevel = quality >= 2160 ? '5.1' : quality >= 1080 ? '4.1' : '3.1';
  const threads = String(Math.max(1, Math.min(2, os.cpus()?.length || 2)));
  return ['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(start),'-rw_timeout','12000000','-probesize','1500000','-analyzeduration','1500000','-fflags','+genpts+discardcorrupt','-i',source,'-t',String(length),
    '-map','0:'+video.index,'-map','0:'+audio.index,'-sn','-dn',
    '-c:v','libx264','-preset',quality >= 720 ? 'superfast' : 'ultrafast','-tune','zerolatency','-profile:v',vProfile,'-level:v',vLevel,'-pix_fmt','yuv420p',
    '-vf',filters,'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',...(quality <= 720 ? ['-r','30','-g','180','-keyint_min','180'] : ['-g','144','-keyint_min','144']),
    '-sc_threshold','0','-b:v',profile[1]+'k','-maxrate',profile[2]+'k','-bufsize',profile[3]+'k','-threads',threads,
    '-c:a','aac','-profile:a','aac_low','-b:a',profile[4]+'k','-ac','2','-ar','48000','-af','aresample=async=1:first_pts=0','-metadata:s:a:0','language='+langCode,
    '-muxdelay','0','-muxpreload','0','-output_ts_offset',String(start),'-mpegts_flags','+resend_headers','-f','mpegts',destination];
}
async function createSegment(info,source,identity,index,quality=1080,options={}) {
  const langKey=String(options?.lang||'fr').toLowerCase()==='en'?'en':'fr';
  const key=identity+':'+langKey+':'+quality+':'+index;const existing=segmentCache.get(key);
  if(existing){
    let cachedFile;
    try { cachedFile = await existing; } catch {
      if(segmentCache.get(key) === existing) segmentCache.delete(key);
      throw new Error('Création du segment indisponible');
    }
    if(await isSegmentUsable(cachedFile)) {
      if(segmentCache.get(key) === existing) {
        segmentCache.delete(key);segmentCache.set(key,existing);
      }
      return cachedFile;
    }
    if(segmentCache.get(key) === existing) {
      segmentCache.delete(key);
      await fs.promises.unlink(cachedFile).catch(()=>{});
    }
    const attempts = options.cacheRepairAttempts || 0;
    if(attempts >= 1) throw new Error('Segment indisponible après régénération');
    return createSegment(info,source,identity,index,quality,{...options,cacheRepairAttempts:attempts+1});
  }
  const duration=Number(info.format?.duration);
  if(!Number.isFinite(duration)||index*6>=duration)throw new Error('Segment invalide');
  const count=Math.min(3,Math.ceil(duration/6)-index);
  const slots=[];
  for(let n=index;n<index+count;n++) {
    const cacheKey=identity+':'+langKey+':'+quality+':'+n;
    if(segmentCache.has(cacheKey))continue;
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    promise.catch(()=>{});
    const slot={index:n,key:cacheKey,promise,resolve,reject,settled:false};
    slots.push(slot);segmentCache.set(cacheKey,promise);
  }
  const requested=segmentCache.get(key);
  const priority=Boolean(options?.priority);
  // Keep one input connection open for three segments instead of probing and
  // seeking the remote file again every six seconds. Publish only renamed TS files.
  (async()=>{
    let acquired=false,child,watcher,timer,prefix,checking=false;
    const publish=async()=>{
      if(!prefix||checking)return;
      checking=true;
      try{for(const slot of slots){
        if(slot.settled)continue;
        const file=prefix+'-'+slot.index+'.ts';
        if(await isSegmentUsable(file)){slot.settled=true;slot.published=true;slot.resolve(file);}
      }}finally{checking=false;}
    };
    try{
      const limit=priority?2:1;
      if(encoders>=limit){
        if(encoderQueue.length>=24)throw new Error('Serveur occupé');
        await new Promise(resolve=>priority?encoderQueue.unshift(resolve):encoderQueue.push(resolve));
      }
      encoders++;acquired=true;
      if(!segmentDirectory)segmentDirectory=fs.promises.mkdtemp(path.join(os.tmpdir(),'plezy-hls-')).catch(()=>fs.promises.mkdtemp('/dev/shm/plezy-hls-'));
      const directory=await segmentDirectory;
      prefix=path.join(directory,crypto.randomBytes(16).toString('hex'));
      const args=batchArguments(info,source,index,Math.min(count*6,duration-index*6),prefix,quality,options);
      await new Promise((resolve,reject)=>{
        child=spawn('ffmpeg',args,{stdio:'ignore'});
        timer=setTimeout(()=>child.kill('SIGKILL'),60000);
        watcher=setInterval(()=>publish().catch(()=>{}),100);
        child.once('error',()=>reject(new Error('Adaptation indisponible')));
        child.once('close',code=>code===0?resolve():reject(new Error('Adaptation interrompue')));
      });
      // A polling callback can still be checking a file at process exit.
      while(checking)await new Promise(resolve=>setTimeout(resolve,10));
      await publish();
      if(slots.some(slot=>!slot.settled))throw new Error('Segment produit invalide');
    }catch(error){
      for(const slot of slots)if(!slot.settled){
        slot.settled=true;
        if(segmentCache.get(slot.key)===slot.promise)segmentCache.delete(slot.key);
        slot.reject(error);
      }
    }finally{
      clearInterval(watcher);clearTimeout(timer);
      if(acquired){encoders--;encoderQueue.shift()?.();}
      if(prefix){
        await Promise.all([prefix+'.m3u8',prefix+'.m3u8.tmp',...Array.from({length:count},(_,n)=>prefix+'-'+(index+n)+'.ts.tmp')].map(file=>fs.promises.unlink(file).catch(()=>{})));
        for(let n=index;n<index+count;n++)if(!slots.some(slot=>slot.index===n&&slot.published))await fs.promises.unlink(prefix+'-'+n+'.ts').catch(()=>{});
      }
    }
  })().catch(()=>{});
  while(segmentCache.size>96){
    const oldest=segmentCache.keys().next().value;if(oldest===key)break;
    const file=segmentCache.get(oldest);segmentCache.delete(oldest);
    file.then(name=>fs.promises.unlink(name).catch(()=>{})).catch(()=>{});
  }
  return requested;
}
function batchArguments(info,source,index,length,prefix,quality=720,options={}) {
  const args=segmentArguments(info,source,index*6,length,prefix+'.ts',quality,options);
  return args.slice(0,-5).concat([
    '-force_key_frames','expr:gte(t,n_forced*6)',
    '-f','hls','-hls_time','6','-hls_list_size','0','-hls_playlist_type','event',
    '-hls_flags','independent_segments+temp_file','-start_number',String(index),
    '-hls_segment_filename',prefix+'-%d.ts',prefix+'.m3u8'
  ]);
}

async function hlsMedia(req,res,ticketId,segmentIndex,identity,quality=1080,master=false,options={}) {
  const preparationStarted=Date.now();
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
      // The browser probe warms the requested position. A playlist must not
      // start extra encoders at zero while the user is resuming elsewhere.
      res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?undefined:playlist);
    }
    const duration=Number(info.format?.duration);
    if(!Number.isSafeInteger(segmentIndex)||segmentIndex<0||segmentIndex*6>=duration){res.writeHead(404);return res.end();}
    const file=await createSegment(info,source,identity,segmentIndex,quality,{...options,priority:true});if(res.destroyed)return;
    if(encoders<1 && encoderQueue.length===0 && (segmentIndex+1)*6<duration){
      createSegment(info,source,identity,segmentIndex+1,quality,options).catch(()=>{});
    }
    const stat=await fs.promises.stat(file);res.writeHead(200,{'Content-Type':'video/mp2t','Content-Length':stat.size,'Cache-Control':'private, max-age=60','Server-Timing':'plezy;dur='+Math.max(0,Date.now()-preparationStarted)});
    if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.destroyed&&!res.headersSent){res.writeHead(422,{'Cache-Control':'no-store'});res.end('Source française indisponible pour cet appareil.');}}
}
module.exports.hlsMedia=hlsMedia;
module.exports.vodPlaylist=vodPlaylist;
module.exports.segmentArguments=segmentArguments;
module.exports.masterPlaylist=masterPlaylist;

module.exports.batchArguments=batchArguments;
module.exports.createSegment=createSegment;
