/* Ухилянт 3D — additive renderer. Does not modify saves or authentication. */
(()=>{'use strict';
const sceneEl=document.getElementById('scene');if(!sceneEl)return;
const style=document.createElement('style');style.textContent=`
#scene{min-height:230px;background:#141a20!important;isolation:isolate}#scene .u3-layer{position:absolute;inset:0;z-index:2;pointer-events:auto}#scene .u3-layer canvas{display:block;width:100%;height:100%;touch-action:pan-y}#scene .bubble{z-index:4;pointer-events:none}#scene .u3-tag{position:absolute;bottom:8px;left:10px;z-index:5;color:#d8e4ec;background:#0c121bc9;border:1px solid #ffffff24;border-radius:8px;padding:5px 8px;font:11px system-ui;pointer-events:none}#scene>svg{opacity:0!important}#scene.u3-fallback>svg{opacity:1!important}#scene.u3-fallback .u3-layer{display:none}@media(min-width:900px){#scene{min-height:390px;aspect-ratio:1.35!important}}`;
document.head.appendChild(style);
const layer=document.createElement('div');layer.className='u3-layer';sceneEl.appendChild(layer);
const tag=document.createElement('div');tag.className='u3-tag';tag.textContent='3D • перетягни для повороту';sceneEl.appendChild(tag);
new MutationObserver(()=>{if(layer.parentNode!==sceneEl)sceneEl.appendChild(layer);if(tag.parentNode!==sceneEl)sceneEl.appendChild(tag)}).observe(sceneEl,{childList:true});
let T,renderer,world,camera,actor,gearMeshes=[],lastSig='',lastFrame=0,angle=0,dragX=null,clock=0;
let skyLight,sunLight,streetLamps=[],stars=[],clouds=[],environment=null,dayMode='';
const hourPlus2=()=>new Date(Date.now()+2*3600000).getUTCHours();
const isNight=()=>{const h=hourPlus2();return h<6||h>=20};
function fail(){sceneEl.classList.add('u3-fallback');tag.textContent='2D режим';}
function init(){try{
 T=window.THREE;if(!T)throw Error('Three.js unavailable');
 renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;layer.appendChild(renderer.domElement);
 world=new T.Scene();world.background=new T.Color('#a7b5b1');world.fog=new T.Fog('#9ba7a0',14,34);
 camera=new T.PerspectiveCamera(35,2,.1,65);camera.position.set(0,2.1,7.7);camera.lookAt(0,1.2,0);
 skyLight=new T.HemisphereLight('#d6e3ef','#594636',2.1);world.add(skyLight);
 sunLight=new T.DirectionalLight('#ffdb9b',3);sunLight.position.set(-5,8,5);sunLight.castShadow=true;sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.camera.left=-8;sunLight.shadow.camera.right=8;sunLight.shadow.camera.top=8;sunLight.shadow.camera.bottom=-8;world.add(sunLight);
 environment=new T.Group();world.add(environment);
 const floor=mesh(new T.PlaneGeometry(70,70),'#454a42');floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;environment.add(floor);
 // Hand-painted noir townscape: layered brick buildings, windows, lamps, trees and street furniture.
 const colors=['#464a47','#595147','#3e4d50','#645548','#3e4443','#545047'];
 for(let i=0;i<13;i++){
  const x=-15+i*2.5,h=3.8+(i*7%5)*.6,z=-8-(i%3)*2;
  const building=mesh(new T.BoxGeometry(2.2,h,1.8),colors[i%colors.length]);building.position.set(x,h/2,z);environment.add(building);
  const roof=mesh(new T.BoxGeometry(2.4,.18,2.05),'#272d2e');roof.position.set(x,h+.05,z);environment.add(roof);
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){
   const win=mesh(new T.BoxGeometry(.46,.58,.035),'#c5a16d');win.position.set(x+(col-.5)*.92,.95+row*.9,z+.93);environment.add(win);win.userData.window=true;streetLamps.push(win);
   const frame=mesh(new T.BoxGeometry(.05,.63,.05),'#24292a');frame.position.set(win.position.x,win.position.y,win.position.z+.03);environment.add(frame);
  }
 }
 for(let i=0;i<9;i++){
  const x=-11+i*2.9,z=-4.3-(i%2)*.8;
  const trunk=mesh(new T.CylinderGeometry(.13,.2,1.6,7),'#493a2e');trunk.position.set(x,.8,z);environment.add(trunk);
  for(let j=0;j<3;j++){const leaves=mesh(new T.IcosahedronGeometry(.9-j*.12,1),j%2?'#34473a':'#42533d');leaves.position.set(x,1.65+j*.48,z);environment.add(leaves)}
 }
 for(const x of [-4.8,4.8]){
  const pole=mesh(new T.CylinderGeometry(.055,.07,3.5,10),'#282d2d');pole.position.set(x,1.75,-1.9);environment.add(pole);
  const bulb=mesh(new T.SphereGeometry(.17,12,10),'#ffce7a');bulb.position.set(x,3.5,-1.9);environment.add(bulb);streetLamps.push(bulb);
  const light=new T.PointLight('#ffb961',0,5);light.position.copy(bulb.position);world.add(light);bulb.userData.lamp=light;
 }
 for(let i=0;i<26;i++){const star=mesh(new T.SphereGeometry(.022,5,4),'#fff0cb');star.position.set(-15+(i*37%31),5+(i*13%9),-14);environment.add(star);stars.push(star)}
 for(let i=0;i<4;i++){const cloud=mesh(new T.SphereGeometry(1.2,9,7),'#d0bba0');cloud.scale.set(2.4,.28,.7);cloud.position.set(-10+i*5,7+i%2,-12);environment.add(cloud);clouds.push(cloud)}
 updateDayNight(true);
 actor=new T.Group();world.add(actor);actor.position.y=.03;
 renderer.domElement.addEventListener('pointerdown',e=>{dragX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(dragX!==null){angle+=(e.clientX-dragX)*.008;dragX=e.clientX}});renderer.domElement.addEventListener('pointerup',()=>dragX=null);renderer.domElement.addEventListener('pointercancel',()=>dragX=null);
 window.addEventListener('resize',resize);resize();updateModel();requestAnimationFrame(frame);
 }catch(e){console.warn('3D renderer fallback',e);fail()}}
function mat(c,rough=.82,metal=.02){return new T.MeshStandardMaterial({color:c,roughness:rough,metalness:metal})}
function mesh(geo,color){const o=new T.Mesh(geo,mat(color));o.castShadow=true;o.receiveShadow=true;return o}
function part(g,geo,color,x,y,z,rx=0,ry=0,rz=0){const m=mesh(geo,color);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);g.add(m);return m}
const sphere=(a,b,c)=>new T.SphereGeometry(1,20,14).scale(a,b,c);
const cyl=(a,b,h)=>new T.CylinderGeometry(a,b,h,16);
function state(){let s={look:{skin:1,hair:0},eq:{body:'body0',legs:'legs0',shoes:'shoes0',head:'head0'}};try{const raw=JSON.parse(localStorage.getItem('vtikach_v1')||'null');if(raw?.d)s={...s,...raw.d}}catch(_){}return s}
function updateModel(){if(!actor)return;const s=state();const sig=JSON.stringify([s.look,s.eq]);if(sig===lastSig)return;lastSig=sig;while(actor.children.length){let c=actor.children.pop();c.parent=null;c.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()})}
 const skins=['#f0c7a4','#d9a47c','#aa7150','#72472f'];const hairs=['#201a17','#65452a','#c8a15b','#a5452c','#757b82'];const skin=skins[s.look?.skin]||skins[1],hair=hairs[s.look?.hair]||hairs[0];
 const bodyCols=['#889caf','#455b6e','#c86e27','#a7ad48','#344457','#594d6d','#d5aa37'];const legCols=['#637184','#3b4555','#355f86','#586448','#292e39','#43445e','#c59b36'];const shoeCols=['#687481','#e5e8e8','#4379bd','#71513c','#20242b','#543c31','#d6ae41'];
 const ix=(k)=>Math.max(0,Math.min(6,Number(String(s.eq?.[k]||'').replace(/\D/g,''))||0));let bc=bodyCols[ix('body')],lc=legCols[ix('legs')],sc=shoeCols[ix('shoes')];
 const torso=part(actor,sphere(.52,.68,.28),bc,0,1.83,0);torso.scale.x=1.08;
 part(actor,sphere(.38,.2,.27),bc,0,2.34,0);
 part(actor,cyl(.17,.19,.23),skin,0,2.52,0);
 const head=part(actor,sphere(.29,.38,.26),skin,0,2.84,.025);
 part(actor,sphere(.22,.095,.24),hair,0,3.145,-.015);
 part(actor,sphere(.11,.14,.08),skin,0,2.8,.27);
 for(const side of [-1,1]){
  part(actor,sphere(.055,.035,.02),'#282019',side*.115,2.87,.251);
  part(actor,sphere(.09,.13,.08),skin,side*.30,2.83,0);
  const shoulder=part(actor,sphere(.19,.21,.22),bc,side*.55,2.22,0);
  part(actor,cyl(.13,.16,.76),bc,side*.67,1.79,0,0,0,side*.13);
  part(actor,sphere(.125,.16,.12),skin,side*.73,1.37,.02);
  part(actor,cyl(.20,.16,.93),lc,side*.23,.84,0,0,0,side*-.03);
  part(actor,sphere(.21,.12,.37),sc,side*.23,.18,.14);
 }
 // Face detail: brow, eyes, nose and optional beard from online profile.
 for(const side of [-1,1])part(actor,new T.BoxGeometry(.13,.028,.035),hair,side*.13,2.99,.244,0,0,side*.1);
 part(actor,sphere(.07,.045,.025),'#7b493d',0,2.68,.265);
 if(ix('body')===1||ix('body')===2){part(actor,new T.BoxGeometry(.08,.43,.035),'#30343b',0,1.89,.29)}
 if(ix('body')===3){for(const y of [1.73,2.03])part(actor,new T.BoxGeometry(.92,.06,.025),'#d9dfb4',0,y,.285)}
 if(ix('head')>0){const cap=part(actor,sphere(.31,.13,.28),ix('head')===6?'#e3b52d':'#364757',0,3.16,0);if(ix('head')===1)part(actor,new T.BoxGeometry(.4,.045,.22),'#34404b',0,3.13,.25)}
 const online=window.__uh3Look;if(online){if(online.beard&&online.beard!=='none'){part(actor,sphere(.24,online.beard==='full'?.22:.1,.19),hair,0,2.59,.135)}if(online.hair==='long')part(actor,sphere(.3,.26,.28),hair,0,3.15,-.12)}
 // A held prop if the player equipped an in-game weapon.
 const weapon=window.__uh3Weapon;if(weapon){const col=weapon==='bat'||weapon==='legend'?'#9c6940':'#6f8495';const handle=part(actor,cyl(.045,.06,.74),col,.86,1.18,.16,0,0,-.3);if(weapon==='knife')handle.scale.set(.65,.55,.65)}
}
function updateDayNight(force=false){if(!world)return;const night=isNight();const next=night?'night':'day';if(!force&&dayMode===next)return;dayMode=next;
 const h=hourPlus2();const dawn=h>=6&&h<9,dusk=h>=17&&h<20;
 const sky=night?'#0b1523':dawn?'#ba9579':dusk?'#9d6753':'#9db9c2';
 world.background.set(sky);world.fog.color.set(sky);
 skyLight.intensity=night?.42:2.0;skyLight.color.set(night?'#6e8bb2':'#f2e8cf');
 sunLight.intensity=night?.25:dawn||dusk?1.7:3.1;sunLight.color.set(night?'#a5b7d3':dusk?'#f4a36e':'#fff0d1');
 for(const win of streetLamps){if(win.userData.lamp){win.userData.lamp.intensity=night?1.5:0;win.material.color.set(night?'#ffcb79':'#7b7264')}else win.material.color.set(night?'#ffd38b':'#53616b')}
 for(const star of stars)star.visible=night;
 for(const cloud of clouds){cloud.visible=!night;cloud.material.color.set(dusk?'#b38a79':'#e2d5bc')}
 document.documentElement.dataset.gameTime=next;
 const tag=document.querySelector('#scene .u3-tag');if(tag)tag.textContent=(night?'🌙 Ніч':'☀ День')+' · UTC+2 · 3D';
}
function resize(){if(!renderer)return;const w=layer.clientWidth,h=layer.clientHeight;if(w<1||h<1)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
function frame(t){requestAnimationFrame(frame);if(!renderer||document.hidden)return;const dt=Math.min(.06,(t-lastFrame)/1000||.016);lastFrame=t;clock+=dt;if(Math.floor(clock)%10===0)updateDayNight();for(let i=0;i<clouds.length;i++)clouds[i].position.x+=dt*(.08+i*.015);if(clouds.length&&clouds[0].position.x>13)clouds.forEach((c,i)=>c.position.x=-13+i*4);const s=state();const sig=JSON.stringify([s.look,s.eq]);if(sig!==lastSig)updateModel();actor.rotation.y=angle+Math.sin(clock*.35)*.07;actor.position.y=.035+Math.sin(clock*1.9)*.027;actor.rotation.z=Math.sin(clock*.85)*.008;renderer.render(world,camera)}
// Sync optional cosmetic equipment from the existing authenticated world endpoint.
async function refreshOnline(){try{const a=JSON.parse(localStorage.getItem('vt_net')||'null');if(!a?.id||!a?.key)return;const r=await fetch('/api/world',{headers:{'x-id':a.id,'x-key':a.key}});const d=await r.json();if(d.ok){window.__uh3Look=d.world?.look;window.__uh3Weapon=d.world?.equipped?.weapon;updateModel()}}catch(_){}}
setInterval(refreshOnline,30000);setInterval(()=>{lastSig='';updateModel()},5000);
const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.min.js';script.onload=()=>{init();refreshOnline()};script.onerror=fail;document.head.appendChild(script);
})();
