const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function client(storage = new Map()) {
  let response = { Id: 'one' }, status = 200, lastHeaders;
  const context = { window: {}, URL, URLSearchParams, AbortSignal, crypto: { randomUUID: () => 'test-device' }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, fetch: async (url, options) => { lastHeaders = options.headers; return new Response(JSON.stringify(response), { status }); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/api.js'), 'utf8'), context);
  return { A: context.window.PlezyAPI, storage, reply: (value, code = 200) => { response = value; status = code; }, headers: () => lastHeaders };
}
test('profiles persist distinct authenticated sessions without passwords', () => {
  const { A, storage } = client();
  A.session('https://jellyfin.test', { AccessToken: 'token-one', User: { Id: 'one', Name: 'Alice' } });
  A.session('https://jellyfin.test', { AccessToken: 'token-two', User: { Id: 'two', Name: 'Bob' } });
  assert.equal(A.profiles().length, 2);
  assert.equal(A.profiles()[0].token, 'token-one');
  assert.equal(storage.get('plezy.web.profiles').includes('password'), false);
  A.rememberProfile();
  assert.equal(A.profiles().length, 2);
});
test('profile selection validates its own token and clears Seerr credentials', async () => {
  const { A, headers } = client();
  A.session('https://jellyfin.test', { AccessToken: 'token-one', User: { Id: 'one', Name: 'Alice' } });
  A.session('https://jellyfin.test', { AccessToken: 'token-two', User: { Id: 'two', Name: 'Bob' } });
  A.config.seerrCookie = 'private-cookie';
  await A.selectProfile('https://jellyfin.test', 'one');
  assert.equal(A.config.user, 'one');
  assert.equal(A.config.token, 'token-one');
  assert.match(headers().Authorization, /Token="token-one"/);
  assert.equal(A.config.seerrCookie, '');
});
test('expired or mismatched sessions do not activate another profile', async () => {
  const { A, reply } = client();
  A.session('https://jellyfin.test', { AccessToken: 'token-one', User: { Id: 'one', Name: 'Alice' } });
  A.session('https://jellyfin.test', { AccessToken: 'token-two', User: { Id: 'two', Name: 'Bob' } });
  reply({}, 401);
  await assert.rejects(A.selectProfile('https://jellyfin.test', 'one'));
  assert.equal(A.config.user, 'two');
  reply({ Id: 'someone-else' });
  await assert.rejects(A.selectProfile('https://jellyfin.test', 'one'));
  assert.equal(A.config.token, 'token-two');
  A.removeProfile('https://jellyfin.test', 'one');
  assert.equal(A.profiles().length, 1);
  A.removeProfile('https://jellyfin.test', 'two');
  assert.equal(A.profiles().length, 0);
  assert.equal(A.config.user, '');
  A.rememberProfile();
  assert.equal(A.profiles().length, 0);
});

test('saved profiles survive reload, additional login and token renewal', async () => {
 const first=client();
 first.A.session('https://jellyfin.test',{AccessToken:'one',User:{Id:'one',Name:'Alice'}});
 const second=client(first.storage);
 second.reply({AccessToken:'two',User:{Id:'two',Name:'Bob'}});
 await second.A.login('https://jellyfin.test','Bob','secret-not-saved');
 assert.equal(second.A.profiles().length,2);
 const third=client(first.storage);
 assert.equal(third.A.config.user,'two');
 third.A.session('https://jellyfin.test',{AccessToken:'renewed',User:{Id:'one',Name:'Alice'}});
 assert.equal(third.A.profiles().length,2);
 assert.equal(third.A.profiles().find(p=>p.user==='one').token,'renewed');
 assert.ok(!JSON.stringify([...first.storage]).includes('secret-not-saved'));
});
test('failed additional login preserves active and saved sessions',async()=>{
 const {A,reply}=client();
 A.session('https://jellyfin.test',{AccessToken:'one',User:{Id:'one',Name:'Alice'}});
 const before=JSON.stringify(A.profiles());reply({},401);
 await assert.rejects(A.login('https://other.test','Bob','wrong'));
 assert.equal(A.config.user,'one');assert.equal(A.config.server,'https://jellyfin.test');
 assert.equal(JSON.stringify(A.profiles()),before);
});
