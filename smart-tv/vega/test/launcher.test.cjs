const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../assets/launcher.html'),'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function launch(saved,settings=false,bridge=true) {
  const nodes=Object.fromEntries(['status','form','server','error','browserHelp'].map(id=>[id,{hidden:true,value:'',focus(){}}]));
  const messages=[], storage=new Map(saved?[['plezy.tv.server',saved]]:[]);
  const context={URL,location:{hash:settings?'#settings':''},document:{getElementById:id=>nodes[id]},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    window:bridge?{ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))}}:{}};
  vm.runInNewContext(script,context);
  return {nodes,messages,storage,context,submit(value){nodes.server.value=value;nodes.form.onsubmit({preventDefault(){}});}};
}
test('Fichier ouvert dans un navigateur : affiche un accès à Plezy, sans exception',()=>{
  const app=launch(undefined,false,false);assert.equal(app.nodes.browserHelp.hidden,false);assert.equal(app.messages.length,0);
});
test('Pont Vega disponible après le chargement : le lanceur peut être relancé',()=>{
  const app=launch(undefined,false,false);
  app.context.window.ReactNativeWebView={postMessage:value=>app.messages.push(JSON.parse(value))};
  app.context.window.PlezyLauncher.start();
  assert.equal(app.messages[0].url,'http://192.168.1.253:8081/');assert.equal(app.nodes.browserHelp.hidden,true);
});
test('Premier lancement : ouvre Plezy via le TP-Link',()=>{
  assert.deepEqual(launch().messages,[{type:'open-server',url:'http://192.168.1.253:8081/'}]);
});
test('Réouverture : utilise la dernière adresse enregistrée',()=>{
  assert.equal(launch('https://plezy.example/').messages[0].url,'https://plezy.example/');
});
test('Mise à jour : remplace l’ancienne adresse locale par celle du TP-Link',()=>{
  const app=launch('http://192.168.0.89:8081/');
  assert.equal(app.storage.get('plezy.tv.server'),'http://192.168.1.253:8081/');
  assert.equal(app.messages[0].url,'http://192.168.1.253:8081/');
});
test('Réglages : normalise et conserve une adresse HTTPS',()=>{
  const app=launch(undefined,true);assert.equal(app.nodes.form.hidden,false);assert.equal(app.messages.length,0);
  app.submit('https://plezy.example');assert.equal(app.storage.get('plezy.tv.server'),'https://plezy.example/');
  assert.equal(app.messages[0].url,'https://plezy.example/');
});
test('Réglages : conserve le serveur LAN HTTP autorisé',()=>{
  const app=launch(undefined,true);app.submit('http://192.168.0.89:8081');
  assert.equal(app.messages[0].url,'http://192.168.0.89:8081/');
});
test('Réglages : accepte l’adresse du TP-Link côté Bbox',()=>{
  const app=launch(undefined,true);app.submit('192.168.1.253:8081');
  assert.equal(app.storage.get('plezy.tv.server'),'http://192.168.1.253:8081/');
  assert.equal(app.messages[0].url,'http://192.168.1.253:8081/');
});
test('Une autre adresse HTTP affiche une erreur explicite',()=>{
  const app=launch(undefined,true);app.submit('http://192.168.0.10:8081');
  assert.equal(app.messages.length,0);assert.match(app.nodes.error.textContent,/HTTPS/);
});
test('Une adresse contenant des identifiants ou une requête est refusée',()=>{
  for(const url of ['https://user:secret@plezy.example/','https://plezy.example/?token=secret','javascript:alert(1)']){
    const app=launch(undefined,true);app.submit(url);assert.equal(app.messages.length,0);assert.ok(app.nodes.error.textContent);
  }
});
