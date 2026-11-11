const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createStore } = require('../PlezyTV-VegaOS/bundle/profiles.js');
function fixture() {
 const data = new Map();
 const storage = { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v) };
 let response = { ok: true, json: async () => ({}) };
 let last;
 const request = async (url, options) => { last = { url, options }; return response; };
 return { data, storage, store: createStore(storage, request), request, reply: value => response = value, last: () => last };
}
const alice = { server: 'https://jellyfin.test', user: 'a', token: 'token-a', name: 'Alice' };
test('profiles survive reload and token renewal without duplicates', () => {
 const f = fixture(); f.store.remember(alice);
 f.store.remember({ ...alice, user: 'b', token: 'token-b', name: 'Bob' });
 const reloaded = createStore(f.storage, f.request);
 assert.equal(reloaded.list().length, 2);
 reloaded.remember({ ...alice, token: 'renewed' });
 assert.equal(reloaded.list().length, 2);
 assert.equal(reloaded.list().find(p => p.user === 'a').token, 'renewed');
});
test('login sends password only to authentication and does not save before activation', async () => {
 const f = fixture(); f.store.remember(alice);
 f.reply({ ok: true, json: async () => ({ AccessToken: 'token-b', User: { Id: 'b', Name: 'Bob' } }) });
 const p = await f.store.login('https://jellyfin.test/', 'Bob', 'not-persisted');
 assert.equal(f.last().url, 'https://jellyfin.test/Users/AuthenticateByName');
 assert.equal(f.last().options.headers['X-Emby-Token'], undefined);
 assert.equal(f.store.list().length, 1);
 f.store.remember(p);
 assert.equal(f.store.list().length, 2);
 assert.ok(!JSON.stringify([...f.data]).includes('not-persisted'));
});
test('selection validates only the selected token and rejects another identity', async () => {
 const f = fixture(); f.store.remember(alice);
 f.reply({ ok: true, json: async () => ({ Id: 'wrong', Name: 'Other' }) });
 await assert.rejects(f.store.validate(alice), /correspond/);
 assert.equal(f.last().options.headers['X-Emby-Token'], alice.token);
 assert.equal(f.store.list()[0].token, alice.token);
 f.reply({ ok: true, json: async () => ({ Id: 'a', Name: 'Alice' }) });
 assert.equal((await f.store.validate(alice)).user, 'a');
});
test('failed authentication preserves saved profiles', async () => {
 const f = fixture(); f.store.remember(alice);
 const before = JSON.stringify([...f.data]);
 f.reply({ ok: false, status: 401 });
 await assert.rejects(f.store.login(alice.server, 'Bob', 'wrong'), /refus/);
 await assert.rejects(f.store.validate(alice), /expir/);
 assert.equal(JSON.stringify([...f.data]), before);
});
test('invalid server addresses and corrupt storage are rejected safely', async () => {
 const f = fixture();
 f.data.set('plezy_vega_profiles_v1', '{broken');
 assert.deepEqual(f.store.list(), []);
 await assert.rejects(f.store.login('https://user:secret@example.test', 'Bob', 'pw'), /invalide/);
 assert.throws(() => f.store.remember({ ...alice, server: 'file:///tmp/test' }), /invalide/);
});
test('Vega loads profile modules, original right header avatar and scoped remote navigation', () => {
 const html = fs.readFileSync('PlezyTV-VegaOS/bundle/index.html', 'utf8');
 const app = fs.readFileSync('PlezyTV-VegaOS/bundle/app.js', 'utf8');
 const ui = fs.readFileSync('PlezyTV-VegaOS/bundle/profile-ui.js', 'utf8');
 assert.ok(html.indexOf('id="profile-button"') > html.indexOf('id="nav-container"'));
 for (const src of ['profiles.js', 'app.js', 'profile-ui.js']) assert.ok(html.includes(`src="${src}"`));
 assert.ok(app.includes("['profile-modal', 'subtitles-panel'"));
 assert.ok(app.includes("localStorage.removeItem('plezy_seerr_key')"));
 assert.ok(ui.includes('ticket === generation'));
 assert.ok(ui.includes("add.setAttribute('aria-label', 'Connecter un autre profil')"));
 assert.ok(!ui.includes('innerHTML'));
});

test('Vega TV includes Netflix startup profiles screen and restored next episode button', () => {
 const html = fs.readFileSync('PlezyTV-VegaOS/bundle/index.html', 'utf8');
 const app = fs.readFileSync('PlezyTV-VegaOS/bundle/app.js', 'utf8');
 const profiles = require('../PlezyTV-VegaOS/bundle/profiles.js');

 assert.ok(html.includes('id="screen-profiles"'));
 assert.ok(html.includes('Qui est-ce ?'));
 assert.ok(html.includes('id="btnManageProfiles"'));
 assert.ok(html.includes('id="btn-player-next"'));
 assert.ok(html.includes('next-toggle'));

 assert.ok(app.includes('playNext'));
 assert.ok(app.includes('togglePlay'));
 assert.ok(app.includes('seekRelative'));

 assert.equal(profiles.DEFAULT_PROFILES.length, 4);
 const names = profiles.DEFAULT_PROFILES.map(p => p.name);
 assert.deepEqual(names, ['Djey', 'Karine', 'Lounis', 'Timéo']);

 for (const id of ['djey', 'karine', 'lounis', 'timeo']) {
   const svg = profiles.getAvatarSvg(id);
   assert.ok(svg.includes('<svg'));
 }
});
