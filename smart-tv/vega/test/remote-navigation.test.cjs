const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../app/src/main/assets/tv.js'),'utf8');
function fixture({scroll=400,earlier=true,android=false}={}){
 const pane={scrollTop:scroll,scrollBy({top}){this.scrollTop=Math.max(0,this.scrollTop+top);}};
 const header={append(){}};
 const document={activeElement:null,documentElement:{classList:{add(){},contains:()=>android}},addEventListener(){},createElement(){return {setAttribute(){}};}};
 let catalogScans=0;
 const track=android?{querySelectorAll:()=>row}:null;
 const button=(name,y,isHeader=false)=>({name,isConnected:true,disabled:false,tabIndex:0,
  getBoundingClientRect(){return {left:120,right:300,top:y,bottom:y+45,width:180,height:45};},
  matches(selector){return selector==='button:not(.row-arrow)';},
  closest(selector){if(selector==='.row-track')return isHeader?null:track;if(selector==='.topbar')return isHeader?header:null;if(selector.includes('#mainScroll'))return isHeader?null:pane;return null;},
  focus(){document.activeElement=this;},scrollIntoView(){this.scrolled=true;}
 });
 const nav=button('Accueil',25,true),current=button('Current row',300),above=button('Earlier row',-400);
 const disabled=button('Disabled',300),next=button('Next card',300);
 disabled.disabled=true;
 const row=[current,disabled,next];
 const nodes=earlier?[nav,above,current]:[nav,current];
 const root={contains:n=>nodes.includes(n)||row.includes(n),querySelectorAll:()=>{catalogScans++;return nodes;}};
 const modal={hidden:true};
 document.activeElement=current;document.body={};
 document.getElementById=id=>({'mainScroll':pane,'screen-main':root,modal}[id]||null);
 document.querySelector=s=>s==='.topbar'?header:null;
 const context={window:{PlezyUI:{screen:'main'}},document,innerWidth:1280,innerHeight:720,
  getComputedStyle:()=>({display:'block',visibility:'visible'}),MutationObserver:class{observe(){}},requestAnimationFrame(){},setTimeout(){}};
 vm.runInNewContext(source,context);
 return {pane,nav,current,above,next,document,scans:()=>catalogScans,move:context.window.PlezyTV.move};
}
test('Up in a scrolled catalog chooses earlier content instead of the nearby fixed header',()=>{
 const f=fixture();f.move('ArrowUp');assert.equal(f.document.activeElement,f.above);assert.equal(f.above.scrolled,true);
});
test('Up with no preceding content scrolls to zero before another Up can enter the header',()=>{
 const f=fixture({scroll:350,earlier:false});f.move('ArrowUp');
 assert.equal(f.pane.scrollTop,0);assert.equal(f.document.activeElement,f.current);
 f.move('ArrowUp');assert.equal(f.document.activeElement,f.nav);
});
test('The header remains available immediately when the content is already at the top',()=>{
 const f=fixture({scroll:0,earlier:false});f.move('ArrowUp');assert.equal(f.document.activeElement,f.nav);
});
test('Android sideways navigation skips disabled cards and stays in the row without scanning the catalog',()=>{
 const f=fixture({android:true});
 f.move('ArrowRight');assert.equal(f.document.activeElement,f.next);
 f.move('ArrowRight');assert.equal(f.document.activeElement,f.next);
 f.move('ArrowLeft');assert.equal(f.document.activeElement,f.current);
 assert.equal(f.scans(),0);
});
