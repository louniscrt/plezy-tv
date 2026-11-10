const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createServer}=require('../server');

test('le navigateur garde sa présentation et seule la page TV charge le nouveau design',async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const origin='http://127.0.0.1:'+server.address().port;
  const web=await (await fetch(origin+'/')).text();
  const tv=await (await fetch(origin+'/tv/index.html')).text();
  assert.ok(!web.includes('plezy-cinema'));assert.ok(!web.includes('cinema.css'));
  assert.ok(!web.includes('id="pRestart"'));assert.ok(!web.includes('id="dBrowse"'));
  assert.ok(tv.includes('plezy-tv-build'));assert.ok(tv.includes('tv/cinema.css'));
  assert.ok(tv.includes('id="pRestart"'));assert.ok(tv.includes('id="dBrowse"'));
  const base=new URL(tv.match(/<base href="([^"]+)"/)[1],origin+'/tv/index.html');
  for(const script of tv.matchAll(/<script src="([^"]+)"/g)){
   const response=await fetch(new URL(script[1],base));assert.equal(response.status,200,script[1]);
  }
  assert.equal(new URL('api.js',base).href,origin+'/api.js');
  assert.equal((await fetch(origin+'/tv/cinema.css')).status,200);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('Quick Connect et les réglages Seerr restent identiques dans les deux interfaces',()=>{
 const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8').replaceAll('\r\n','\n');
 const web=read('app.js'),tv=read('tv/app.js');
 for(const [start,end] of [['  function seerrSettings()','  async function installHelp'],['  async function login()','  async function boot()']]){
  assert.equal(web.slice(web.indexOf(start),web.indexOf(end)),tv.slice(tv.indexOf(start),tv.indexOf(end)));
 }
});
