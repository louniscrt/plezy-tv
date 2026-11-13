const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createStremio, encodeId } = require('../stremio');

test('Stremio kiosk sync keeps the auth key server-side and loads the synced addon', async () => {
  const calls = [];
  const engine = createStremio({
    config: { authKey: 'fake-auth', metadataManifest: false, addons: [] },
    fetchJSON: async (url, headers, options) => {
      calls.push({url, headers, options});
      if (url === 'https://api.strem.io/api/addonCollectionGet') {
        return { result: { addons: [{ transportUrl: 'https://addon.test/private/manifest.json' }] } };
      }
      if (url.endsWith('/manifest.json')) return { resources: ['stream'], types: ['movie'] };
      if (url.includes('/stream/')) return { streams: [{url:'https://cdn.test/video.mp4',name:'MULTI VFF 1080p'}] };
      throw new Error('Unexpected request');
    }
  });
  assert.equal(engine.enabled, false);
  assert.equal(await engine.syncAddons(), true);
  assert.equal(engine.enabled, true);
  assert.equal(await engine.syncAddons(), true);
  assert.equal(calls.filter(c => c.url.includes('addonCollectionGet')).length, 1);
  assert.equal(calls[0].options.body.authKey, 'fake-auth');
  const streams = await engine.streams(encodeId('movie', 'tt1234567'));
  assert.ok(streams.length);
  assert.ok(calls.some(c => c.url.startsWith('https://addon.test/private/stream/')));
});

test('TV bridge receives absolute media and French subtitle URLs, with HTML fallback', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/tv/playback.js'), 'utf8');
  const calls = [];
  const window = {
    PlezyAPI: { stremio: async () => ({
      streams: [{url:'/api/stremio/media/fixture'}],
      subtitles: [{language:'fre',url:'/api/stremio/subtitles/fixture.vtt'}]
    }) },
    AndroidBridge: {playVideo: (...args) => calls.push(args)}
  };
  vm.runInNewContext(source, {window, URL, location:{href:'https://plezy.test/tv/' }});
  assert.equal(await window.PlezyPlayback.tryNativePlayback({Id:'film',Name:'Film',stremio:true}), true);
  assert.deepEqual(calls[0], ['https://plezy.test/api/stremio/media/fixture','Film','https://plezy.test/api/stremio/subtitles/fixture.vtt']);
  delete window.AndroidBridge;
  assert.equal(await window.PlezyPlayback.tryNativePlayback({Id:'film',stremio:true}), false);
  window.AndroidBridge = {playVideo: () => {throw new Error('unavailable');}};
  assert.equal(await window.PlezyPlayback.tryNativePlayback({Id:'film',stremio:true}), false);
});

test('TV remote normalizes D-pad key codes and maintains focused class', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/tv/navigation.js'), 'utf8');
  const handlers = {}, classes = new Set(), removed = [];
  const card = {
    classList:{add: name=>classes.add(name),remove:name=>{classes.delete(name);removed.push(name);}},
    closest:()=>card, disabled:false, getClientRects:()=>[{}], click:()=>{card.clicked=true;}
  };
  const document = {
    activeElement:card,
    addEventListener:(name,fn)=>{handlers[name]=fn;},
    querySelectorAll:()=>[card],
    getElementById:()=>null
  };
  const window = {};
  vm.runInNewContext(source, {window, document});
  handlers.focusin({target:card});
  assert.ok(classes.has('focused'));
  handlers.focusout({target:card});
  assert.ok(!classes.has('focused'));
  let prevented=false;
  handlers.keydown({key:'Unidentified',keyCode:23,target:{tagName:'BUTTON'},preventDefault:()=>{prevented=true;}});
  assert.equal(card.clicked,true); assert.equal(prevented,true);
});
