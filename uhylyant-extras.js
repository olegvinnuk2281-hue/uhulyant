/* Uhylyant: original opt-in soundtrack, UI effects and Telegram viewport safety. */
(()=>{'use strict';
const musicKey='uhy_music_enabled_v19',sfxKey='uhy_sfx_enabled_v19';
let musicOn=false,sfxOn=false,ctx=null,timer=null,step=0;
try{musicOn=localStorage.getItem(musicKey)==='1';sfxOn=localStorage.getItem(sfxKey)==='1'}catch(e){}
// All music is original, procedural and generated on the device. No copyrighted recordings.
const melody=[52,0,55,57,59,55,52,0,50,52,55,59,55,52,48,0,52,55,59,62,59,55,52,0,50,53,55,57,53,50,48,0];
const midHz=m=>440*Math.pow(2,(m-69)/12);
function getCtx(){try{if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=new AC()}if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx}catch(e){return null}}
function tone(midi,dur=0.18,vol=.05,type='triangle',delay=0){
 const c=getCtx();if(!c)return;
 const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=midHz(midi);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,vol),t+.013);
 g.gain.exponentialRampToValueAtTime(.0001,t+Math.max(.04,dur));o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.06)
}
function musicTick(){if(!musicOn||document.hidden)return;const note=melody[step%melody.length];if(note){tone(note,.21,.027,'triangle');if(step%4===0)tone(note-12,.29,.015,'sine')};step++}
function beginMusic(){if(timer)return;getCtx();musicTick();timer=setInterval(musicTick,305)}
function stopMusic(){if(timer){clearInterval(timer);timer=null}}
function paint(){document.querySelectorAll('[data-uhy-top="music"]').forEach(b=>{b.textContent=musicOn?'♫✓':'♫';b.title=musicOn?'Вимкнути музику':'Увімкнути музику';b.setAttribute('aria-pressed',String(musicOn))});document.querySelectorAll('[data-uhy-top="sfx"]').forEach(b=>{b.textContent=sfxOn?'🔊':'🔈';b.title=sfxOn?'Вимкнути звукові ефекти':'Увімкнути звукові ефекти';b.setAttribute('aria-pressed',String(sfxOn))})}
function toggleMusic(){musicOn=!musicOn;try{localStorage.setItem(musicKey,musicOn?'1':'0')}catch(e){};if(musicOn)beginMusic();else stopMusic();paint()}
function toggleSfx(){sfxOn=!sfxOn;try{localStorage.setItem(sfxKey,sfxOn?'1':'0')}catch(e){};if(sfxOn)tone(72,.14,.04);paint()}
function sfx(name){if(!sfxOn)return;switch(name){case 'tap':tone(69,.055,.019,'sine');break;case 'start':tone(52,.16,.046);tone(59,.14,.039,'triangle',.1);break;case 'reel':tone(61,.075,.026,'square');break;case 'lose':tone(55,.16,.035);tone(50,.21,.027,'sine',.09);break;case 'win':tone(67,.13,.035);tone(71,.14,.036,'triangle',.12);tone(74,.28,.033,'triangle',.25);break;case 'jackpot':[60,64,67,72,76].forEach((x,i)=>tone(x,.2,.033,'triangle',i*.11));break;default:tone(64,.08,.016)}}
window.UHY_AUDIO={toggleMusic,toggleSfx,sfx,refresh:paint};
// Persisted preference is displayed but never bypasses browser's user-gesture requirement.
document.addEventListener('pointerdown',()=>{if(musicOn&&!timer)beginMusic()},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMusic();else if(musicOn&&ctx?.state==='running')beginMusic()});
function tgViewport(){
 const tg=window.Telegram?.WebApp;if(!tg||!tg.platform||tg.platform==='unknown')return;
 document.documentElement.classList.add('uhy-in-tg');
 const safe=tg.safeAreaInset||{},content=tg.contentSafeAreaInset||{};
 const top=Number(safe.top||0)+Number(content.top||0);
 const bottom=Math.max(0,Number(safe.bottom||0)+Number(content.bottom||0));
 const topPadding=Math.min(145,Math.max(0,top, tg.isFullscreen?52:0));
 document.documentElement.style.setProperty('--uhy-tg-top',topPadding+'px');
 document.documentElement.style.setProperty('--uhy-tg-bottom',Math.min(60,bottom)+'px');
}
try{const tg=window.Telegram?.WebApp;tg?.ready?.();tgViewport();['viewportChanged','safeAreaChanged','contentSafeAreaChanged','fullscreenChanged'].forEach(name=>tg?.onEvent?.(name,tgViewport))}catch(e){}
window.addEventListener('resize',tgViewport);
// HUD re-renders during play: sync controls without duplicating or resizing the bar.
let previous=null;const observer=new MutationObserver(()=>{const hud=document.getElementById('uhyTopActions');if(hud!==previous){previous=hud;paint()}});
const root=document.getElementById('hud')||document.body;observer.observe(root,{childList:true,subtree:true});paint();
})();
