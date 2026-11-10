/* Stockage vidéo en flux dans le système de fichiers privé du navigateur (OPFS). */
(() => {
  const A = window.PlezyAPI, C = A.config;
  const key = () => `plezy.web.downloads.${C.server}:${C.user}`;
  const list = () => A.read(key(), []);
  const pending = new Map();
  const supported = () => !!(window.isSecureContext && navigator.storage?.getDirectory && navigator.serviceWorker?.controller);
  async function download(item) {
    if (item.demo || item.seerr || item.Type === 'Series') throw new Error('Ouvrez un film ou un épisode de votre bibliothèque pour le télécharger.');
    if (!supported()) throw new Error('Le téléchargement hors connexion nécessite HTTPS ou localhost et un navigateur compatible avec le stockage local.');
    if (list().some(i => i.Id === item.Id)) throw new Error('Ce titre est déjà téléchargé sur cet appareil.');
    if (pending.has(item.Id)) throw new Error('Téléchargement déjà en cours.');
    const controller = new AbortController(); pending.set(item.Id, controller);
    const storageKey = key(); let fileId, dir, writer;
    try {
      const root = await navigator.storage.getDirectory();
      dir = await root.getDirectoryHandle('plezy-downloads', { create: true });
      const full = await A.details(item), source = full.MediaSources?.[0];
      const container = source?.Container?.toLowerCase();
      if (!['mp4','m4v','webm'].includes(container)) throw new Error('Téléchargez une version MP4 ou WebM compatible avec votre navigateur depuis Jellyfin.');
      fileId = crypto.randomUUID() + (container === 'webm' ? '.webm' : '.mp4');
      const url = A.proxy(A.endpoint(C.server, `/Videos/${item.Id}/stream`, { Static: true, MediaSourceId: source.Id, api_key: C.token }));
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Le téléchargement a été refusé par Jellyfin.');
      const size = Number(response.headers.get('content-length') || source.Size || 0);
      const estimate = await navigator.storage.estimate();
      if (size && estimate.quota && size > estimate.quota - (estimate.usage || 0)) throw new Error('Espace disponible insuffisant sur cet appareil.');
      const file = await dir.getFileHandle(fileId, { create: true }); writer = await file.createWritable();
      // Sauvegarder aussi la fiche et son illustration, sans conserver d'URL avec jeton.
      let artwork = '';
      try { const image = await fetch(A.image(full, 'Backdrop', 780), { signal: controller.signal }); if (image.ok) { const blob = await image.blob(); artwork = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); }); } } catch { /* Illustration facultative. */ }
      await response.body.pipeTo(writer, { signal: controller.signal }); writer = null;
      const record = { ...full, offline: true, offlineFile: fileId, offlineType: container === 'webm' ? 'video/webm' : 'video/mp4', art: artwork, downloadedAt: Date.now() };
      const existing = A.read(storageKey, []); existing.push(record); localStorage.setItem(storageKey, JSON.stringify(existing));
      window.PlezyUI.toast('Téléchargement terminé : ' + full.Name);
    } catch (error) {
      if (writer) await writer.abort().catch(() => {});
      if (dir && fileId) await dir.removeEntry(fileId).catch(() => {});
      if (error.name === 'AbortError') throw new Error('Téléchargement annulé.');
      throw error;
    } finally { pending.delete(item.Id); }
  }
  async function remove(item) {
    const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('plezy-downloads');
    await dir.removeEntry(item.offlineFile).catch(error => { if (error.name !== 'NotFoundError') throw error; });
    localStorage.setItem(key(), JSON.stringify(list().filter(i => i.offlineFile !== item.offlineFile)));
  }
  window.PlezyOffline = { list, download, remove, supported, pending, cancel: id => pending.get(id)?.abort() };
})();
