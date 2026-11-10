const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createPairing}=require('../pairing');
async function fixture(callback) {
  let time=Date.now(),calls=[];
  const handler=createPairing({now:()=>time,transport:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/local'))return new Response('{"id":7}',{headers:{'set-cookie':'connect.sid=phone-session; HttpOnly; Path=/'}});
    if(options.headers['X-Api-Key']==='valid-key'||options.headers.Cookie?.includes('phone-session'))return new Response('{"id":7,"displayName":"Compte test"}');
    return new Response('{}',{status:401});
  }});
  const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://local')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,{token,body,method=body?'POST':'GET',origin}={})=>{
    const response=await fetch(base+'/api/seerr-pair'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,headers:response.headers,data:await response.json()};
  };
  const start=async()=>{
    const result=await request('',{body:{server:'http://seerr.test'}});
    const pair=result.data,phone=new URL(pair.phoneUrl),params=new URLSearchParams(phone.hash.slice(1));
    return {...pair,phoneToken:params.get('key')};
  };
  try{await callback({request,start,calls,advance:ms=>{time+=ms;}});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('QR : secrets séparés, durée limitée et aucune clé API encodée',()=>fixture(async({start,request})=>{
  const pair=await start();assert.ok(pair.phoneToken);assert.ok(!pair.phoneUrl.includes(pair.pollToken));assert.match(pair.code,/^\d{6}$/);
  const info=await request('/'+pair.id+'/phone',{token:pair.phoneToken});assert.equal(info.status,200);assert.equal(info.data.code,pair.code);assert.equal(info.data.pollToken,undefined);assert.equal(info.data.credentials,undefined);
  assert.equal((await request('/'+pair.id,{token:pair.phoneToken})).status,403);
}));
test('Clé saisie sur le téléphone : vérifiée et transmise une seule fois à la TV',()=>fixture(async({start,request})=>{
  const pair=await start(),path='/'+pair.id;
  const accepted=await request(path+'/phone',{token:pair.phoneToken,body:{server:'http://seerr.test',key:'valid-key'}});
  assert.equal(accepted.status,200);assert.equal(accepted.data.credentials,undefined);
  const result=await request(path,{token:pair.pollToken});assert.equal(result.data.credentials.key,'valid-key');assert.equal(result.headers.get('cache-control'),'no-store');
  const repeated=await request(path,{token:pair.pollToken});assert.equal(repeated.data.state,'consumed');assert.equal(repeated.data.credentials,undefined);
}));
test('Compte local : seule la session est transférée, jamais le mot de passe',()=>fixture(async({start,request})=>{
  const pair=await start(),path='/'+pair.id;
  const result=await request(path+'/phone',{token:pair.phoneToken,body:{server:'http://seerr.test',email:'user@example.test',password:'phone-secret'}});
  assert.equal(result.status,200);
  const poll=await request(path,{token:pair.pollToken});assert.equal(poll.data.credentials.cookie,'connect.sid=phone-session');assert.equal(poll.data.credentials.key,'');assert.ok(!JSON.stringify(poll.data).includes('phone-secret'));
}));
test('Annulation et expiration empêchent de récupérer une connexion',()=>fixture(async({start,request,advance})=>{
  const cancelled=await start();assert.equal((await request('/'+cancelled.id,{token:cancelled.pollToken,method:'DELETE'})).status,200);
  assert.equal((await request('/'+cancelled.id+'/phone',{token:cancelled.phoneToken})).status,410);
  const expired=await start();advance(300001);assert.equal((await request('/'+expired.id,{token:expired.pollToken})).status,410);
}));
test('Clé invalide, tentatives limitées, accès tiers et origine étrangère refusés',()=>fixture(async({start,request})=>{
  const pair=await start(),path='/'+pair.id;
  assert.equal((await request(path+'/phone',{token:'wrong'})).status,403);
  assert.equal((await request('',{body:{},origin:'https://untrusted.test'})).status,403);
  for(let i=0;i<5;i++)assert.equal((await request(path+'/phone',{token:pair.phoneToken,body:{server:'http://seerr.test',key:'wrong-key'}})).status,400);
  assert.equal((await request(path+'/phone',{token:pair.phoneToken,body:{server:'http://seerr.test',key:'valid-key'}})).status,429);
  assert.equal((await request(path,{token:pair.pollToken})).data.state,'waiting');
}));
