const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const assets = path.join(root,'../app/src/main/assets');
const css = fs.readFileSync(path.join(assets,'tv.css'),'utf8');
const js = fs.readFileSync(path.join(assets,'tv.js'),'utf8');
const qrCode = fs.readFileSync(path.join(root,'../../webapp/public/vendor/qrcode.js'),'utf8');
const shared = ['seerr-session.js','refresh.js','seerr-pairing.js'].map(name=>fs.readFileSync(path.join(root,'../../webapp/public',name),'utf8')).join('\n;\n');
const bridge = `
if(!window.__plezyVega){
  window.__plezyVega=true;
  window.addEventListener('plezy:library-refreshed',()=>window.ReactNativeWebView.postMessage('{"type":"library-refreshed"}'));
  document.addEventListener('keydown',event=>{
    if(['Escape','GoBack','BrowserBack'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();
      if(!window.PlezyTV?.back())window.ReactNativeWebView.postMessage('{"type":"exit"}');
    }
  },true);
  if(navigator.mediaSession){
    for(const [action,command] of Object.entries({play:'play',pause:'pause',seekbackward:'rewind',seekforward:'forward',nexttrack:'next',stop:'stop'})){
      try{navigator.mediaSession.setActionHandler(action,()=>window.PlezyTV?.media(command));}catch{}
    }
  }
}
`;
const script = `(()=>{
  // Media loads can also produce native load events. Never validate/inject a
  // video resource or the PC page as though it were the TV document.
  if(!/\\/tv\\/index\\.html\\/?$/.test(location.pathname))return;
  if(window.__plezyVegaReady || window.__plezyVegaPending)return;
  window.__plezyVegaPending=true;
  let attempts=0;
  function start(){
  if(!window.PlezyUI){
    if(attempts++<40){setTimeout(start,250);return;}
    window.__plezyVegaPending=false;
    window.ReactNativeWebView.postMessage('{"type":"invalid-app"}');return;
  }
  let style=document.getElementById('plezy-tv-style');
  if(!style){style=document.createElement('style');style.id='plezy-tv-style';document.head.appendChild(style);}
  style.textContent=${JSON.stringify(css)};
  ${bridge}
  ${js}
  ${qrCode}
  window.qrcode=qrcode;
  ${shared}
  const video=document.getElementById('video');if(video)video.disableRemotePlayback=true;
  window.__plezyVegaReady=true;window.__plezyVegaPending=false;
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready',session:!!window.PlezyAPI.keepSeerrAlive,refresh:window.PlezyRefresh?.interval}));
  }
  start();
})();true;`;
fs.writeFileSync(path.join(root,'src/injection.json'),JSON.stringify(script));
fs.mkdirSync(path.join(root,'assets/image'),{recursive:true});
fs.copyFileSync(path.join(root,'../../webapp/public/icon-512.png'),path.join(root,'assets/image/icon.png'));
fs.copyFileSync(path.join(root,'../app/src/main/res/drawable-nodpi/tv_banner.png'),path.join(root,'assets/banner.png'));
fs.copyFileSync(path.join(root,'../../webapp/public/vendor/qrcode.LICENSE.txt'),path.join(root,'assets/qrcode.LICENSE.txt'));
console.log('Vega: thème sombre et navigation copiés depuis les sources APK.');
