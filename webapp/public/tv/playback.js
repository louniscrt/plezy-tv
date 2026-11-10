/* Négociation Jellyfin : utiliser le flux choisi par le serveur pour ce navigateur. */
(() => {
  const A = window.PlezyAPI;
  const stremioIndices = new Map();
  function profile({ mp4 = true, webm = true, hevc = false, bitrate = 120000000 } = {}) {
    return {
      Name: 'Plezy TV', MaxStreamingBitrate: bitrate, MaxStaticBitrate: bitrate,
      DirectPlayProfiles: [
        ...(mp4 ? [{ Type: 'Video', Container: 'mp4,m4v,mov', VideoCodec: 'h264', AudioCodec: 'aac,mp3' }] : []),
        ...(mp4 && hevc ? [{ Type: 'Video', Container: 'mp4,m4v,mov', VideoCodec: 'hevc', AudioCodec: 'aac,mp3' }] : []),
        ...(webm ? [{ Type: 'Video', Container: 'webm', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'opus,vorbis' }] : [])
      ],
      TranscodingProfiles: [{ Type: 'Video', Context: 'Streaming', Protocol: 'hls', Container: hevc ? 'mp4' : 'ts', VideoCodec: hevc ? 'h264,hevc' : 'h264', AudioCodec: 'aac', MaxAudioChannels: '2', MinSegments: 2, SegmentLength: 4, BreakOnNonKeyFrames: false }],
      CodecProfiles: [{ Type: 'Video', Codec: 'h264', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: true }] }],
      SubtitleProfiles: ['srt','vtt','ass','ssa','sub','pgssub','dvdsub'].map(Format => ({ Format, Method: 'Encode' }))
    };
  }
  function absolute(value, params = {}) {
    const base = A.config.server.replace(/\/$/, '') + '/';
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Le serveur a retourné une adresse de lecture invalide.');
    if (url.origin === new URL(base).origin) {
      if (!url.searchParams.has('api_key') && !url.searchParams.has('ApiKey')) url.searchParams.set('api_key', A.config.token);
      for (const [key, val] of Object.entries(params)) if (val !== undefined && val !== null) url.searchParams.set(key, val);
    }
    return url.href;
  }
  async function negotiate(item, { force = false, start = 0, audio, subtitle = -1, bitrate = 0, mp4 = true, webm = true, hevc = false, signal } = {}) {
    if (item.stremio) {
      const result = await A.stremio('streams', { id: item.Id }, signal);
      const wantEnglish = audio === 2;
      const primary = result.streams || [];
      const fallback = (result.fallbackStreams || []).map(s => ({ ...s, fallback: true }));
      const english = (result.englishStreams || []).map(s => ({ ...s, lang: 'en', fallback: true }));
      const prevIndex = stremioIndices.get(item.Id) || 0;
      const currentStream = primary[prevIndex] || primary[0];
      const candidates = wantEnglish
        ? [...(currentStream ? [{ ...currentStream, lang: 'en', fallback: true }] : []), ...english.filter(s => s.url !== currentStream?.url), ...primary.filter(s => s.url !== currentStream?.url).map(s => ({ ...s, lang: 'en', fallback: true }))]
        : [...primary, ...fallback];
      const index = force === 'seek'
        ? prevIndex
        : force === 'compatible'
          ? 0
          : force
            ? prevIndex + 1
            : 0;
      stremioIndices.set(item.Id, index);
      if (stremioIndices.size > 200) stremioIndices.delete(stremioIndices.keys().next().value);
      const chosen = candidates[index];
      if (!chosen) throw new Error('Aucun autre lien de lecture disponible. Vérifiez vos addons Real-Debrid.');
      const useFallback = Boolean(chosen.fallback || force === 'compatible' || wantEnglish);
      const probeParts = ['probe=1', ...(start > 0 ? [`start=${Math.floor(start)}`] : []), ...(wantEnglish ? ['lang=en'] : []), ...(useFallback ? ['fallback=1'] : [])];
      let response = await fetch(`${chosen.url}?${probeParts.join('&')}`, { signal });
      let forcedCompatible = false;
      if (!response.ok) {
        if (index + 1 < candidates.length) return negotiate(item, { force: true, start, audio, subtitle, bitrate, mp4, webm, hevc, signal });
        if (!useFallback) {
          response = await fetch(`${chosen.url}?${[...probeParts, 'fallback=1'].join('&')}`, { signal });
          forcedCompatible = response.ok;
        }
        if (!response.ok) throw new Error('Aucune piste française lisible disponible. Utilisez Télécharger via Seerr dans Plus d’options.');
      }
      const info = await response.json();
      if (wantEnglish && info && info.hasEnglishAudio === false && index === 0 && candidates.length > 1) {
        return negotiate(item, { force: true, start, audio, subtitle, bitrate, mp4, webm, hevc, signal });
      }
      if (Array.isArray(info?.chapters) && info.chapters.length && !item.Chapters?.length) item.Chapters = info.chapters;
      const hlsParts = [...(wantEnglish ? ['lang=en'] : []), ...(useFallback || forcedCompatible ? ['fallback=1'] : [])];
      const hlsQuery = hlsParts.length ? `?${hlsParts.join('&')}` : '';
      const subStreams = [];
      const mediaTicketMatch = /\/api\/stremio\/(?:media|hls)\/([a-f0-9]{48})/.exec(chosen.url);
      const mediaTicketId = mediaTicketMatch ? mediaTicketMatch[1] : '';
      if (mediaTicketId && Array.isArray(info?.subtitleTracks) && info.subtitleTracks.length) {
        for (const s of info.subtitleTracks) {
          subStreams.push({
            Type: 'Subtitle',
            Index: 200 + s.index,
            Language: s.language || s.code,
            DisplayTitle: s.label,
            DeliveryUrl: `/api/stremio/subtitles/${mediaTicketId}.vtt?stream=${s.index}`
          });
        }
      }
      for (const s of result.subtitles || []) {
        if (!subStreams.some(sub => sub.Language === (s.language || s.lang))) {
          subStreams.push({
            Type: 'Subtitle',
            Index: 100 + (s.index || subStreams.length),
            Language: s.language || s.lang,
            DisplayTitle: s.label,
            DeliveryUrl: s.url
          });
        }
      }
      const mediaStreams = [
        { Type: 'Audio', Index: 1, Language: 'fra', DisplayTitle: 'Français (Principal)', IsDefault: true },
        { Type: 'Audio', Index: 2, Language: 'eng', DisplayTitle: 'Anglais', IsDefault: false },
        ...subStreams
      ];
      return {
        url: chosen.url.replace('/media/', '/hls/') + '/master.m3u8' + hlsQuery,
        hls: true,
        duration: info.duration,
        chapters: info.chapters,
        intro: info.intro,
        hasMore: index + 1 < candidates.length,
        method: 'DirectPlay',
        offset: 0,
        source: { Id: item.Id, DefaultAudioStreamIndex: 1, MediaStreams: mediaStreams }
      };
    }
    const direct = !force && !bitrate && audio === undefined && subtitle < 0;
    const response = await A.jf(`/Items/${item.Id}/PlaybackInfo`, {
      method: 'POST', params: { UserId: A.config.user }, signal,
      body: {
        UserId: A.config.user, MediaSourceId: item.MediaSources?.[0]?.Id,
        // Request a complete timeline. The TV player seeks to the saved position.
        StartTimeTicks: 0, AudioStreamIndex: audio, SubtitleStreamIndex: subtitle,
        MaxStreamingBitrate: bitrate || 120000000, EnableDirectPlay: direct, EnableDirectStream: !force,
        EnableTranscoding: true, AllowVideoStreamCopy: !force, AllowAudioStreamCopy: !force,
        AutoOpenLiveStream: true, IsPlayback: true,
        DeviceProfile: profile({ mp4, webm, hevc, bitrate: bitrate || 120000000 })
      }
    });
    if (response.ErrorCode || !response.MediaSources?.length) throw new Error(response.ErrorCode === 'NotAllowed' ? 'Ce compte n’est pas autorisé à lire ce titre.' : 'Jellyfin ne propose aucun flux compatible. Vérifiez les droits de lecture et de transcodage de ce compte.');
    const sources = response.MediaSources;
    const source = sources.find(s => direct && s.SupportsDirectPlay) || sources.find(s => s.TranscodingUrl) || sources.find(s => direct && s.DirectStreamUrl) || sources[0];
    const params = { DeviceId: A.device, PlaySessionId: response.PlaySessionId };
    if (source.LiveStreamId) params.LiveStreamId = source.LiveStreamId;
    if (direct && source.SupportsDirectPlay) {
      const url = source.DirectStreamUrl || A.endpoint(A.config.server, `/Videos/${item.Id}/stream.${source.Container || 'mp4'}`, { Static: true, MediaSourceId: source.Id });
      return { source, session: response.PlaySessionId, method: 'DirectPlay', hls: false, offset: 0, url: absolute(url, params) };
    }
    if (source.TranscodingUrl) {
      const url = absolute(source.TranscodingUrl, params);
      const hls = /\.m3u8(?:\?|$)/i.test(url) || source.TranscodingSubProtocol?.toLowerCase() === 'hls';
      return { source, session: response.PlaySessionId, method: source.TranscodingUrl.includes('VideoCodec=copy') ? 'DirectStream' : 'Transcode', hls, offset: 0, url };
    }
    if (direct && source.DirectStreamUrl) {
      const url = absolute(source.DirectStreamUrl, params);
      return { source, session: response.PlaySessionId, method: 'DirectStream', hls: /\.m3u8(?:\?|$)/i.test(url), offset: 0, url };
    }
    throw new Error('Jellyfin ne peut pas préparer ce média. Activez le transcodage ou utilisez une version compatible avec le navigateur.');
  }
  window.PlezyPlayback = { profile, negotiate, absolute };
})();
