/* Préférences locales et démarrage adapté aux petites connexions. */
(() => {
  const key = 'plezy.web.videoBitrate';
  let measuredMbps, measuredAt = 0, measurement;
  const clock = () => window.performance?.now?.() ?? Date.now();
  const estimate = () => Date.now() - measuredAt < 180000 ? measuredMbps : undefined;
  const allowed = [0,400000,800000,1500000,4000000,8000000,12000000,20000000];
  function preference() {
    try { const value = Number(window.localStorage?.getItem(key) || 0); return allowed.includes(value) ? value : 0; } catch { return 0; }
  }
  function save(value) { try { window.localStorage?.setItem(key, String(allowed.includes(value) ? value : 0)); } catch {} }
  function connection() { return window.navigator?.connection || window.navigator?.mozConnection || window.navigator?.webkitConnection || {}; }
  async function prepare(signal) {
    if (estimate() !== undefined || connection().saveData || typeof window.fetch !== 'function') return;
    if (measurement) return measurement;
    measurement = (async () => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) return;
      signal?.addEventListener('abort', abort, {once:true});
      const timer = setTimeout(abort, 3000);
      try {
        const response = await window.fetch('/api/network-test', { cache:'no-store', signal:controller.signal });
        const start = clock();
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        if (data.byteLength !== 131072 || controller.signal.aborted) return;
        measuredMbps = data.byteLength * 8 / Math.max(20, clock() - start) / 1000;
        measuredAt = Date.now();
      } catch { /* A failed test does not prevent playback or force a low-quality cap. */ }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    })().finally(() => { measurement = null; });
    return measurement;
  }
  function economical() {
    const c = connection(), selected = preference(), rate = estimate();
    return Boolean(c.saveData || selected > 0 && selected <= 800000 || (rate !== undefined ? rate < 1.5 : /^(slow-)?2g$/.test(c.effectiveType || '') || c.downlink > 0 && c.downlink < 1.5));
  }
  function initialQuality(bitrate = 0) {
    if (bitrate > 0) return bitrate <= 500000 ? 240 : bitrate <= 1000000 ? 360 : bitrate <= 2000000 ? 480 : bitrate <= 5000000 ? 720 : bitrate < 18000000 ? 1080 : 2160;
    const c = connection(), rate = estimate();
    if (c.saveData) return 240;
    if (rate !== undefined) return rate >= 8 ? 1080 : rate >= 5 ? 720 : rate >= 2 ? 480 : rate >= .9 ? 360 : 240;
    if (c.downlink >= 8) return 1080;
    if (c.downlink >= 3) return 720;
    if (c.downlink >= 1.5) return 480;
    if (/^(slow-)?2g$/.test(c.effectiveType || '') || c.downlink > 0 && c.downlink < .65) return 240;
    return c.downlink > 0 ? 360 : 720;
  }
  // Browser connection hints may be rounded or reflect server delays. Only an
  // explicit browser data-saving preference imposes a permanent automatic cap.
  function autoCap() { return connection().saveData ? 0 : -1; }
  function initialBandwidth() {
    const rate = estimate();
    return rate !== undefined ? Math.max(200000, Math.min(300000000, rate * 1000000)) : 15000000;
  }
  const abrClasses = new WeakMap();
  function abrController(Hls) {
    const Base = Hls.DefaultConfig?.abrController;
    if (!Base) return undefined;
    if (abrClasses.has(Hls)) return abrClasses.get(Hls);
    class PreparedMediaAbr extends Base {
      constructor(...args) { super(...args); this.preparation = new WeakMap(); this.normalized = new WeakSet(); }
      networkTiming(data, callback) {
        const stats = data.part?.stats || data.frag?.stats;
        const duration = stats && this.preparation.get(stats);
        if (!stats || !duration || this.normalized.has(stats)) return callback();
        const start = stats.loading.start;
        this.normalized.add(stats);
        stats.loading.start = Math.min(stats.loading.first, start + duration);
        try { return callback(); }
        finally { stats.loading.start = start; this.normalized.delete(stats); }
      }
      onFragLoaded(event, data) {
        const stats = data.part?.stats || data.frag?.stats;
        let timing;
        try { timing = data.networkDetails?.getResponseHeader?.('Server-Timing') || data.networkDetails?.headers?.get?.('Server-Timing'); } catch {}
        const match = /(?:^|,)\s*plezy;dur=([\d.]+)/.exec(timing || '');
        if (stats && match && Number.isFinite(Number(match[1]))) this.preparation.set(stats, Number(match[1]));
        const result = this.networkTiming(data, () => super.onFragLoaded(event, data));
        // The stream controller can choose the next fragment before buffering
        // completes. Supply its first real network sample now, not after that choice.
        if (stats?.loaded > 0 && !stats.aborted && !this.ignoreFragment(data.frag) && this.bwEstimator?.sample) {
          this.bwEstimator.sample(Math.max(20, stats.loading.end - stats.loading.first), stats.loaded);
          stats.bwEstimate = this.getBwEstimate();
        }
        return result;
      }
      onFragBuffered(event, data) { return this.networkTiming(data, () => super.onFragBuffered(event, data)); }
      onFragLoading(event, data) {
        super.onFragLoading(event, data);
        if (this.ignoreFragment(data.frag)) return;
        this.clearTimer();
        const stats = data.part?.stats || data.frag.stats;
        // The server may still be encoding. Start network-abandonment checks
        // only once response bytes exist, rather than cancelling that useful work.
        this.timer = setInterval(() => {
          if (stats.aborted) this.clearTimer();
          else if (stats.loading.first > 0) super.onFragLoading(event, data);
        }, 100);
      }
    }
    abrClasses.set(Hls, PreparedMediaAbr);
    return PreparedMediaAbr;
  }
  function imageWidth(width, type) {
    return Math.min(width || 780, type === 'Backdrop' ? economical() ? 300 : 1600 : economical() ? 154 : 780);
  }
  function imageUrl(value, type, width) {
    try {
      const url = new URL(value);
      if (url.hostname === 'image.tmdb.org' && /^\/t\/p\/(?:original|w\d+)\//.test(url.pathname)) {
        const target = imageWidth(width, type);
        const sizes = type === 'Backdrop' ? [300,780,1280] : [92,154,185,342,500,780];
        url.pathname = url.pathname.replace(/^\/t\/p\/[^/]+\//, '/t/p/w' + (sizes.find(size => size >= target) || sizes.at(-1)) + '/');
      }
      return url.href;
    } catch { return value; }
  }
  window.PlezyBandwidth = { preference, save, prepare, economical, initialQuality, autoCap, initialBandwidth, abrController, imageWidth, imageUrl };
})();
