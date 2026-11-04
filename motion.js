(()=>{'use strict';
const modes={gear:'wave',shop:'play',path:'walk',street:'walk',world:'walk',office:'work',career:'work',work:'work',boss:'fight',brigade:'fight',casino:'play',market:'play',wheel:'play',friends:'wave',yard:'wave',weekly:'proud',leaderboard:'proud',roof:'proud',news:'watch',account:'idle',home:'idle',housing:'idle'};
const activeTimers=new WeakMap();
function modeFor(key){return key.startsWith('tcc')?'watch':modes[key]||'idle'}
function decorate(el){
 const key=el.dataset.kind?.startsWith('tcc')?el.dataset.kind:(el.dataset.section||el.dataset.kind||'profile');
 if(el.dataset.motionKey===key)return;
 el.dataset.motionKey=key;el.dataset.motion=modeFor(key);
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.documentElement.classList.contains('lowfx')){
  const bg=el.querySelector('.uhy-layer-bg,.lyr.bg,.uhy-profile-room');
  if(bg?.animate)bg.animate([{opacity:.35,transform:'scale(1.025)'},{opacity:1,transform:'scale(1)'}],{duration:420,easing:'ease-out'});
 }
}
let queued=false;
function scan(){queued=false;document.querySelectorAll('#scene,.uhy-modal-scene,.uhy-profile-scene').forEach(decorate)}
function queue(){if(!queued){queued=true;requestAnimationFrame(scan)}}
const observer=new MutationObserver(queue);
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-kind','data-section']});scan();
document.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 const action=button.dataset.wact||button.dataset.act||'';
 const mode=/fight|bhit|hit/i.test(action)?'fight':/shift|gig|workCollect|apply|search/.test(action)?'work':/spin|daily/.test(action)?'play':/tccTry|escape|bribe|rescue/.test(action)?'walk':/equip|buy|look|food/.test(action)?'wave':null;
 if(!mode)return;
 const panel=document.getElementById('socialPanel');const scene=panel?.style.display==='flex'?panel.querySelector('.uhy-modal-scene'):document.getElementById('scene');
 if(!scene)return;clearTimeout(activeTimers.get(scene));scene.dataset.motion=mode;
 activeTimers.set(scene,setTimeout(()=>{scene.dataset.motion=modeFor(scene.dataset.section||scene.dataset.kind||'home')},2200));
},true);
document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('motion-paused',document.hidden));
})();
