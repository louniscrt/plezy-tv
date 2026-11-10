const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(variant){
 let current,booted=0,activated=0;
 const nodes=new Map();
 const el=(tag,cls='',text='')=>({tag,cls,textContent:text,children:[],attributes:{},isConnected:false,append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;}});
 const $=id=>{if(!nodes.has(id))nodes.set(id,el('div'));return nodes.get(id);};
 const visit=(node,value)=>{node.isConnected=value;for(const child of node.children)visit(child,value);};
 const C={server:'https://test',user:'alice',name:'Alice'};
 const profiles=[{server:C.server,user:'alice',name:'Alice'},{server:C.server,user:'bob',name:'Bob'}];
 const A={rememberProfile(){},profiles:()=>profiles,normalize:s=>s,request:async()=>({AccessToken:'new',User:{Id:'charlie',Name:'Charlie'}}),session(){activated++;},selectProfile:async(s,u)=>{C.user=u;},removeProfile(){}};
 const modal=(title,children)=>{if(current)current.children.forEach(n=>visit(n,false));current={title,children};children.forEach(n=>visit(n,true));$('modal').hidden=false;};
 const closeModal=()=>{$('modal').hidden=true;current?.children.forEach(n=>visit(n,false));};
 const context={A,C,$,el,modal,closeModal,settings(){},field:(label,value,type)=>({node:el('label','',label),input:{value,type}}),action:(label,callback,cls)=>Object.assign(el('button',cls,label),{callback}),boot:async()=>{booted++;},requested:new Set(),window:{PlezyOffline:{pending:new Map()}},qcVersion:0,pageVersion:0,detailVersion:0,searchVersion:0};
 const source=fs.readFileSync(path.join(__dirname,'../public',variant,'app.js'),'utf8');
 const start=source.indexOf('  function chooseProfile('),end=source.indexOf("  $('bbInfo').onclick",start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end),context);
 return {A,C,$,get current(){return current;},get booted(){return booted;},get activated(){return activated;},closeModal};
}
for(const variant of ['', 'tv']){
 test(variant+' avatar opens profile menu, saved users and ellipsis below the grid',async()=>{
  const f=fixture(variant);f.$('btnProfile').onclick();
  assert.equal(f.current.children[0].textContent,'Changer de profil');
  f.current.children[0].callback();
  assert.equal(f.current.title,'Qui est-ce ?');
  const [grid,extra]=f.current.children;
  assert.equal(grid.children.length,2);
  assert.equal(grid.children[0].attributes['aria-current'],'true');
  assert.equal(extra.children[0].textContent,'...');
  await grid.children[1].callback();assert.equal(f.C.user,'bob');assert.equal(f.booted,1);
 });
 test(variant+' additional connection activates only while its form remains open',async()=>{
  const f=fixture(variant);f.$('btnProfile').onclick();f.current.children[0].callback();
  f.current.children[1].children[0].callback();
  assert.equal(f.current.title,'Connecter un autre profil');
  let finish;f.A.request=()=>new Promise(resolve=>finish=resolve);
  const pending=f.current.children[4].callback();
  f.closeModal();finish({AccessToken:'new',User:{Id:'charlie'}});await pending;
  assert.equal(f.activated,0);assert.equal(f.C.user,'alice');
  f.$('btnProfile').onclick();f.current.children[0].callback();f.current.children[1].children[0].callback();
  f.A.request=async()=>({AccessToken:'new',User:{Id:'charlie'}});
  await f.current.children[4].callback();assert.equal(f.activated,1);assert.equal(f.booted,1);
 });
}


test('TV startup requires a saved profile selection before opening the catalogue',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/tv/app.js'),'utf8');
 const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',focus(){}});return nodes.get(id);};
 let choices=0,navigated=0;
 const context={profileRequired:true,$,lastFocus:null,C:{name:'Alice'},text(){},chooseProfile(){choices++;},navigate:async()=>{navigated++;}};
 const close=source.slice(source.indexOf('  function closeModal()'),source.indexOf('  function modal('));
 const show=source.slice(source.indexOf('  function show('),source.indexOf('  function closeModal()'));
 const boot=source.match(/  async function boot\(\) \{[^\n]+/)[0];
 vm.createContext(context);vm.runInContext(close+'\n'+show+'\n'+boot,context);
 vm.runInContext('closeModal(); show("main");',context);
 assert.equal($('modal').hidden,false);assert.equal(choices,1);assert.equal(navigated,0);
 await vm.runInContext('boot()',context);
 assert.equal(context.profileRequired,false);assert.equal($('modal').hidden,true);assert.equal(navigated,1);
 assert.match(source,/profileRequired = A\.profiles\(\)\.length > 0/);
 assert.match(source,/if \(profileRequired\) chooseProfile\(\)/);
});
