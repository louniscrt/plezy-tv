(()=>{
  const A=window.PlezyAPI,U=window.PlezyUI;
  if(!A||!U||window.PlezySeerrPairing)return;
  const $=id=>document.getElementById(id);
  const style=document.createElement('style');
  style.textContent='.modal-card.seerr-qr-modal{width:min(850px,92vw);max-width:850px}.seerr-qr-layout{display:grid;grid-template-columns:minmax(240px,310px) minmax(0,1fr);gap:28px;align-items:center;margin:20px 0}.seerr-qr{background:white;padding:12px;border-radius:16px;max-width:330px}.seerr-qr svg{display:block;width:100%;height:auto;fill:#000;stroke:none}.seerr-qr-code{font-size:36px;letter-spacing:7px;margin:14px 0;color:white;font-weight:700;white-space:nowrap}.seerr-qr-text{font-size:18px;line-height:1.5;color:#ccc}.seerr-qr-status{font-size:17px;color:#bbb}.seerr-pair-phone{width:100%;margin:6px 0 18px}@media(max-width:700px){.seerr-qr-layout{grid-template-columns:1fr}.seerr-qr{width:260px;margin:auto}.seerr-qr-text{text-align:center}}';
  document.head.append(style);
  let active;
  async function request(path,options={}) {
    const response=await fetch('/api/seerr-pair'+path,{cache:'no-store',signal:AbortSignal.timeout(12000),...options});
    let result;try{result=await response.json();}catch{throw new Error('Le QR code nécessite la mise à jour du serveur Plezy Web. Installez le dernier paquet Docker.');}
    if(!response.ok){const error=new Error(result.error||'Connexion indisponible.');error.status=response.status;throw error;}return result;
  }
  function cancel() {
    if(!active)return;const previous=active;active=null;clearTimeout(previous.timer);
    if(!previous.id)return;
    fetch('/api/seerr-pair/'+previous.id,{method:'DELETE',headers:{Authorization:'Bearer '+previous.pollToken},keepalive:true}).catch(()=>{});
  }
  async function open() {
    cancel();
    const waiting=U.el('p','muted','Préparation de votre QR code…');
    U.modal('Connexion Seerr avec votre téléphone',[waiting]);
    const generation={};active=generation;
    try {
      const pair=await request('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:A.config.seerr||''})});
      if(active!==generation){fetch('/api/seerr-pair/'+pair.id,{method:'DELETE',headers:{Authorization:'Bearer '+pair.pollToken}}).catch(()=>{});return;}
      Object.assign(generation,pair);
      pair.expires=Date.now()+300000;
      $('modalCard').classList.add('seerr-qr-modal');
      const layout=U.el('div','seerr-qr-layout'),qr=U.el('div','seerr-qr'),instructions=U.el('div','seerr-qr-text');
      const generator=window.qrcode(0,'M');generator.addData(pair.phoneUrl);generator.make();qr.innerHTML=generator.createSvgTag({cellSize:5,margin:20,scalable:true});
      qr.setAttribute('role','img');qr.setAttribute('aria-label','QR code pour connecter Seerr avec votre téléphone');
      const code=U.el('div','seerr-qr-code',pair.code.slice(0,3)+' '+pair.code.slice(3));
      const status=U.el('p','seerr-qr-status','En attente de votre téléphone…');
      instructions.append(U.el('p','','Scannez ce QR code avec votre téléphone, sur le même Wi-Fi que la TV.'),code,U.el('p','','Collez la clé API ou connectez votre compte Seerr sur le téléphone.'),status);
      layout.append(qr,instructions);U.modal('Connexion Seerr avec votre téléphone',[layout]);
      async function poll() {
        if(active!==generation)return;
        if(Date.now()>=pair.expires){status.textContent='QR code expiré.';cancel();layout.after(U.action('Afficher un nouveau QR code',open,'btn btn-white'));return;}
        try {
          const result=await request('/'+pair.id,{headers:{Authorization:'Bearer '+pair.pollToken}});
          if(active!==generation)return;
          if(result.state==='ready') {
            active=null;const credentials=result.credentials;
            Object.assign(A.config,{seerr:credentials.server,seerrKey:credentials.key,seerrCookie:credentials.cookie});A.save();
            U.closeModal();U.toast('Seerr connecté avec votre téléphone');
            if(U.screen==='main')await U.navigate();return;
          }
          if(result.state==='consumed')throw new Error('Ce QR code a déjà été utilisé. Affichez-en un nouveau.');
          status.textContent='En attente · '+Math.ceil((pair.expires-Date.now())/60000)+' min restantes';
        } catch(error) {
          status.textContent=error.status===410?error.message:'Connexion interrompue, nouvelle tentative…';
          if(error.status===410){cancel();return;}
        }
        if(active===generation)generation.timer=setTimeout(poll,1800);
      }
      poll();
    }catch(error){if(active===generation){active=null;waiting.textContent=error.message;}}
  }
  const observer=new MutationObserver(()=>{
    const title=$('modalTitle')?.textContent;
    if($('modal').hidden || title!=='Connexion Seerr avec votre téléphone')$('modalCard').classList.remove('seerr-qr-modal');
    if(active && ($('modal').hidden || title!=='Connexion Seerr avec votre téléphone'))cancel();
    if(!$('modal').hidden && title==='Connexion à Seerr' && !$('seerrPairPhone')) {
      const button=U.action('Connecter Seerr avec mon téléphone',open,'btn btn-white seerr-pair-phone');button.id='seerrPairPhone';
      $('modalTitle').after(button);
    }
  });
  observer.observe($('modalCard'),{childList:true,subtree:true});observer.observe($('modal'),{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pagehide',cancel);
  window.PlezySeerrPairing={open};
})();
