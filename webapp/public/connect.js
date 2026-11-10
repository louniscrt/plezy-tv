(()=>{
  const $=id=>document.getElementById(id),params=new URLSearchParams(location.hash.slice(1));
  const id=params.get('id'),token=params.get('key');
  const path='/api/seerr-pair/'+encodeURIComponent(id||'')+'/phone';
  function message(text,kind='error'){$('message').textContent=text;$('message').className=kind;}
  async function request(method='GET',body) {
    const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(35000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Connexion indisponible.');return result;
  }
  $('method').onchange=()=>{$('keyFields').hidden=$('method').value!=='key';$('accountFields').hidden=$('method').value!=='account';};
  $('pairForm').onsubmit=async event=>{
    event.preventDefault();$('submit').disabled=true;message('Connexion à Seerr…','');
    try {
      const mode=$('method').value;
      const result=await request('POST',{server:$('server').value.trim(),...(mode==='key'?{key:$('key').value.trim()}:{email:$('email').value.trim(),password:$('password').value})});
      $('key').value=$('password').value='';$('pairForm').hidden=true;
      $('intro').textContent='Vous pouvez revenir à votre téléviseur.';
      message('Seerr est connecté. Plezy va récupérer la connexion sur votre TV.','success');
      history.replaceState(null,'',location.pathname);
    } catch(error){message(error.name==='TypeError'?'Serveur inaccessible. Vérifiez votre réseau Wi-Fi.':error.message);$('submit').disabled=false;}
  };
  (async()=>{
    try {
      if(!id||!token)throw new Error('Scannez le QR code affiché dans Plezy sur votre TV.');
      const info=await request();
      $('intro').textContent='Vérifiez le code ci-dessous, puis connectez Seerr. Vous n’aurez rien à saisir à la télécommande.';
      $('pairCode').textContent=info.code.slice(0,3)+' '+info.code.slice(3);$('server').value=info.server||'';$('pairForm').hidden=false;
    }catch(error){$('intro').textContent='Connexion indisponible';message(error.message);}
  })();
})();
