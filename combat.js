/* Weapon-specific, bounded combat choreography. No damage calculation lives here. */
(()=>{'use strict';
const props={
 brick:'<path d="M2 8 31 2 45 11 16 18Z" fill="#df9768"/><path d="M2 8v15l14 9V18Z" fill="#9d4935"/><path d="M16 18 45 11v15L16 32Z" fill="#bd6448"/><path d="m21 21 6-2m6-1 6-2" stroke="#763b2c" stroke-width="2"/>',
 bat:'<path d="M5 35 27 5q8-7 13 0l-1 6L13 40Z" fill="#bd925d" stroke="#382a20" stroke-width="2"/><path d="m7 33 7 5m-4-9 7 5" stroke="#62513e" stroke-width="3"/>',
 bar:'<path d="M7 39 31 10q7-10 11-2l-1 7" fill="none" stroke="#bac2c9" stroke-width="7"/><path d="M8 38 31 11" stroke="#59636c" stroke-width="2"/>',
 chain:'<g fill="none" stroke="#bec6ce" stroke-width="3"><ellipse cx="8" cy="34" rx="6" ry="8"/><ellipse cx="16" cy="26" rx="6" ry="8"/><ellipse cx="24" cy="18" rx="6" ry="8"/><ellipse cx="32" cy="10" rx="6" ry="8"/></g>',
 mace:'<path d="m8 40 22-25" stroke="#86633b" stroke-width="7"/><path d="m23 4 8 3 8-3 2 10 6 6-10 5-7 9-6-9-10-4 6-8Z" fill="#eac460" stroke="#78552a" stroke-width="2"/>'};
async function play({type='fist',damage=0,scene,raid=false}={}){
 if(!scene||!scene.isConnected)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('lowfx');
 const hero=scene.querySelector('#hero,.uhy-layer-avatar'),boss=scene.querySelector('#boss,.uhy-raid-art');
 const layer=document.createElement('div');layer.className='combat-layer';layer.setAttribute('aria-hidden','true');scene.append(layer);
 const sr=scene.getBoundingClientRect(),br=boss?.getBoundingClientRect(),hr=hero?.getBoundingClientRect();
 const tx=br?(br.left+br.width*.5-sr.left):sr.width*.72,ty=br?(br.top+br.height*(type==='leg'?.75:.42)-sr.top):sr.height*.4;
 const sx=hr?(hr.left+hr.width*.7-sr.left):sr.width*.22,sy=hr?(hr.top+hr.height*.5-sr.top):sr.height*.55;
 const animations=[],timers=[];let finished=false;
 const finish=()=>{if(finished)return;finished=true;timers.forEach(clearTimeout);animations.forEach(a=>a.cancel());hero?.classList.remove('combat-'+type);layer.remove();};
 const duration=reduced?180:760,impact=reduced?0:type==='brick'?410:320;
 const animate=(el,frames,options)=>{if(el&&!reduced)animations.push(el.animate(frames,options))};
 hero?.classList.add('combat-'+type);
 if(!reduced){window.UHY?.playCombatSound(type,'swing');const travel=type==='brick'?'-4px 0':`${Math.max(12,tx-sx-(hr?.width||80)*.25)}px 0`;animate(hero,[{translate:'0 0'},{translate:travel,offset:.38,easing:'ease-out'},{translate:travel,offset:.59},{translate:'0 0'}],{duration,easing:'linear'});}

 if(props[type]){const prop=document.createElementNS('http://www.w3.org/2000/svg','svg');prop.setAttribute('viewBox','0 0 50 46');prop.classList.add('combat-prop');prop.innerHTML=props[type];prop.style.left=sx+'px';prop.style.top=sy+'px';layer.append(prop);
  if(reduced){prop.style.left=(tx-20)+'px';prop.style.top=(ty-20)+'px';}
  else if(type==='brick')animate(prop,[{transform:'translate(-20px,-20px) rotate(-30deg)',opacity:1},{transform:`translate(${(tx-sx)*.5-20}px,${ty-sy-55}px) rotate(90deg)`,offset:.5},{transform:`translate(${tx-sx-20}px,${ty-sy-20}px) rotate(200deg)`,opacity:1}],{duration:impact,fill:'forwards',easing:'linear'});
  else animate(prop,[{transform:'translate(-20px,-20px) rotate(-70deg)',opacity:0},{transform:'translate(0,-30px) rotate(-45deg)',opacity:1,offset:.2},{transform:`translate(${tx-sx-20}px,${ty-sy-20}px) rotate(45deg)`,opacity:1,offset:.44},{transform:'translate(-20px,-20px)',opacity:0}],{duration,fill:'forwards'});
 }
 return new Promise(resolve=>{
  timers.push(setTimeout(()=>{if(!scene.isConnected)return;window.UHY?.playCombatSound(type,'impact');
   const burst=document.createElement('span');burst.className='combat-impact';burst.style.left=tx+'px';burst.style.top=ty+'px';burst.textContent=type==='brick'?'✦':'✧';layer.append(burst);
   const label=document.createElement('span');label.className='combat-damage';label.style.left=tx+'px';label.style.top=(ty-20)+'px';label.textContent=damage?'−'+Math.round(damage).toLocaleString('uk-UA'):'Влучання';layer.append(label);
   animate(boss,[{translate:'0 0',rotate:'0deg'},{translate:'7px 0',rotate:'3deg',offset:.25},{translate:'-2px 0',rotate:'-1deg',offset:.65},{translate:'0 0',rotate:'0deg'}],{duration:310,easing:'ease-out'});
   if(type==='brick'&&!reduced)for(let i=0;i<5;i++){const chip=document.createElement('i');chip.className='combat-chip';chip.style.left=tx+'px';chip.style.top=ty+'px';layer.append(chip);animate(chip,[{transform:'translate(0,0)',opacity:1},{transform:`translate(${(i-2)*13}px,${25+i*5}px) rotate(${i*80}deg)`,opacity:0}],{duration:330,fill:'forwards'})}
  },impact));
  timers.push(setTimeout(()=>{finish();resolve()},duration+100));
 });
}
window.UHYCombat={play};
})();
