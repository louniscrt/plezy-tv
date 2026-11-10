const {test}=require('node:test');
const assert=require('node:assert/strict');
const {select}=require('../public/tv/resume-motion');
function fixture(){
 const animations=[],selected=new Set([0]);
 const cards=[0,1,2,3].map(index=>({
  classList:{contains:()=>selected.has(index),toggle:(_,on)=>on?selected.add(index):selected.delete(index)},
  getBoundingClientRect(){let left=0;for(let i=0;i<index;i++)left+=(selected.has(i)?448:168)+15;return {left,right:left+(selected.has(index)?448:168),width:selected.has(index)?448:168};},
  animate(frames,options){const animation={cancelled:false,cancel(){this.cancelled=true;}};animations.push({frames,options,animation});return animation;}
 }));
 const parentElement={querySelectorAll:()=>cards};cards.forEach(c=>c.parentElement=parentElement);
 return {cards,selected,animations};
}
test('TV card selection commits one layout and animates transforms only for visible cards',()=>{
 const f=fixture();select(f.cards[1],{width:800,reduced:false});
 assert.deepEqual([...f.selected],[1]);assert.ok(f.animations.length>0);
 for(const {frames,options} of f.animations){assert.equal(options.duration,180);assert.match(frames[0].transform,/translateX.*scaleX/);assert.equal(frames[1].transform,'none');assert.ok(!('width' in frames[0]));}
});
test('rapid navigation cancels old transitions; reduced motion still selects the right episode',()=>{
 const f=fixture();select(f.cards[1],{width:1280,reduced:false});
 const previous=f.animations.map(a=>a.animation);
 select(f.cards[2],{width:1280,reduced:false});assert.ok(previous.every(a=>a.cancelled));
 const count=f.animations.length;select(f.cards[3],{width:1280,reduced:true});
 assert.deepEqual([...f.selected],[3]);assert.equal(f.animations.length,count);
});
