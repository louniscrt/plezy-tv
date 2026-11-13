// Keep retries and document events on the dedicated TV page, on the same origin.
const clean = url => String(url || '').split(/[?#]/)[0].replace(/\/+$/, '');
const origin = url => String(url || '').match(/^https?:\/\/[^/?#]+/i)?.[0].toLowerCase();
const televisionUrl = url => clean(url).replace(/\/(?:tv\/)?index\.html$/i, '').replace(/\/tv$/i, '') + '/tv/index.html';
const retryUrl = (server, serial) => televisionUrl(server) + '?tvRetry=' + serial;
const isTelevisionPage = (url, server) => origin(url) === origin(server) && clean(url) === televisionUrl(server);
const isWebEntry = (url, server) => {
  const base = televisionUrl(server).replace(/\/tv\/index\.html$/, '');
  return origin(url) === origin(server) && [base, base + '/index.html'].includes(clean(url));
};
const isDocumentError = (event, uri) => event.isMainFrame !== false &&
  (!event.url ? event.isMainFrame === true : clean(event.url) === clean(uri));
module.exports = {origin, televisionUrl, isTelevisionPage, isWebEntry, isDocumentError, retryUrl};
