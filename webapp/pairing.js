const crypto=require('node:crypto');
const os=require('node:os');
const {mergeCookies}=require('./public/seerr-session');
const TTL=5*60*1000;
function createPairing({now=Date.now,transport=fetch}={}) {
  const pairs=new Map();
  const secret=()=>crypto.randomBytes(24).toString('base64url');
  const authorized=(req,token)=>req.headers.authorization==='Bearer '+token;
  function json(res,status,data) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache'});
    res.end(JSON.stringify(data));
  }
  function body(req) {
    return new Promise((resolve,reject)=>{
      let data='',length=0,failed=false;
      req.on('data',chunk=>{length+=chunk.length;if(length>16384){if(!failed)reject(Object.assign(new Error('Formulaire trop volumineux.'),{status:413}));failed=true;}else if(!failed)data+=chunk;});
      req.on('end',()=>{if(failed)return;try{resolve(JSON.parse(data||'{}'));}catch{reject(Object.assign(new Error('Formulaire invalide.'),{status:400}));}});
      req.on('error',reject);
    });
  }
  function normalize(value) {
    if(typeof value!=='string' || value.length>2048) throw new Error('Adresse Seerr invalide.');
    const url=new URL(/^https?:\/\//i.test(value)?value:'http://'+value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('Adresse Seerr invalide.');
    return url.href.replace(/\/$/,'');
  }
  function phoneBase(req) {
    const base=new URL('http://'+req.headers.host);
    if(req.headers['x-forwarded-proto']==='https') base.protocol='https:';
    if(['localhost','127.0.0.1','[::1]'].includes(base.hostname)) {
      const ips=Object.values(os.networkInterfaces()).flat().filter(i=>i && i.family==='IPv4' && !i.internal).map(i=>i.address);
      base.hostname=ips.find(ip=>ip.startsWith('192.168.'))||ips[0]||base.hostname;
    }
    return base.origin;
  }
  async function verify(input) {
    const server=normalize(input.server),key=typeof input.key==='string'?input.key.trim():'';
    let cookie='';
    if(!key) {
      if(typeof input.email!=='string'||typeof input.password!=='string'||!input.email.trim()||!input.password) throw new Error('Indiquez une clé API ou les identifiants du compte Seerr.');
      const response=await transport(server+'/api/v1/auth/local',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email:input.email.trim(),password:input.password}),signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('Connexion Seerr refusée. Vérifiez les identifiants.');
      const updates=response.headers.getSetCookie?.()||[];
      cookie=mergeCookies('',updates.map(value=>value.split(';')[0]).join('; '));
      await response.body?.cancel();
      if(!cookie) throw new Error('Seerr n’a pas fourni de session. Vous pouvez utiliser sa clé API.');
    }
    const response=await transport(server+'/api/v1/auth/me',{headers:{Accept:'application/json',...(key?{'X-Api-Key':key}:{Cookie:cookie})},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok) {await response.body?.cancel();throw new Error('Connexion Seerr refusée. Vérifiez la clé API ou le compte.');}
    const user=await response.json();
    if(!user || !user.id) throw new Error('Cette adresse ne fournit pas une connexion Seerr valide.');
    const updates=response.headers.getSetCookie?.()||[];
    cookie=mergeCookies(cookie,updates.map(value=>value.split(';')[0]).join('; '));
    return {credentials:{server,key,cookie},name:String(user.displayName||user.username||'Votre compte').slice(0,100)};
  }
  return async function handle(req,res,url) {
    try {
      for(const [id,pair] of pairs) if(pair.expires<=now()) pairs.delete(id);
      if(req.headers['sec-fetch-site']==='cross-site' || req.headers.origin && !['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin)) return json(res,403,{error:'Origine refusée.'});
      if(url.pathname==='/api/seerr-pair' && req.method==='POST') {
        if(pairs.size>=64) return json(res,429,{error:'Trop de connexions en attente. Réessayez dans quelques minutes.'});
        const input=await body(req),id=secret(),poll=secret(),phone=secret();
        const pair={poll,phone,server:input.server?normalize(input.server):'',expires:now()+TTL,code:String(crypto.randomInt(100000,1000000)),attempts:0,busy:false,state:'waiting'};
        pairs.set(id,pair);
        return json(res,201,{id,pollToken:poll,expires:pair.expires,code:pair.code,phoneUrl:phoneBase(req)+'/connect.html#id='+id+'&key='+phone});
      }
      const match=url.pathname.match(/^\/api\/seerr-pair\/([\w-]+)(\/phone)?$/);
      if(!match) return json(res,404,{error:'Connexion introuvable.'});
      const pair=pairs.get(match[1]);
      if(!pair) return json(res,410,{error:'Ce QR code a expiré. Affichez-en un nouveau sur la TV.'});
      if(!authorized(req,match[2]?pair.phone:pair.poll)) return json(res,403,{error:'Code de connexion invalide.'});
      if(match[2]) {
        if(pair.state!=='waiting') return json(res,409,{error:'Cette connexion a déjà été utilisée.'});
        if(req.method==='GET') return json(res,200,{code:pair.code,expires:pair.expires,server:pair.server});
        if(req.method!=='POST') return json(res,405,{error:'Méthode non autorisée.'});
        if(pair.busy) return json(res,409,{error:'Connexion en cours…'});
        if(pair.attempts>=5) return json(res,429,{error:'Trop de tentatives. Affichez un nouveau QR code sur la TV.'});
        pair.busy=true;pair.attempts++;
        try {
          const input=await body(req),result=await verify(input);
          if(pairs.get(match[1])!==pair || pair.expires<=now()) return json(res,410,{error:'QR code expiré ou annulé. Recommencez depuis la TV.'});
          pair.result=result;pair.state='ready';
          return json(res,200,{state:'ready',name:result.name});
        } finally {pair.busy=false;}
      }
      if(req.method==='DELETE') {pairs.delete(match[1]);return json(res,200,{state:'cancelled'});}
      if(req.method!=='GET') return json(res,405,{error:'Méthode non autorisée.'});
      if(pair.state==='ready') {
        const result=pair.result;delete pair.result;pair.state='consumed';
        return json(res,200,{state:'ready',...result});
      }
      return json(res,200,{state:pair.state,expires:pair.expires});
    } catch(error) {
      if(!res.writableEnded) json(res,error.status||400,{error:error.name==='TypeError'||error.name==='TimeoutError'?'Seerr est inaccessible. Vérifiez son adresse et sa connexion.':error.message});
    }
  };
}
module.exports={createPairing};
