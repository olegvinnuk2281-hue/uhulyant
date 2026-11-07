/* Action feedback uses the player's own character art; rewards stay server-side. */
(()=>{'use strict';
 const tg=window.Telegram?.WebApp;
 const isTelegram=!!(tg&&(tg.initData||tg.initDataUnsafe?.user||(tg.platform&&tg.platform!=='unknown')))||/[&#?]tgWebApp(?:Data|Platform|Version)=/i.test(location.hash+'&'+location.search);
 document.documentElement.classList.toggle('v27-telegram',isTelegram);
 function safeHeader(){
  const safeTop=Math.max(0,Number(tg?.safeAreaInset?.top)||0),safeBottom=Math.max(0,Number(tg?.safeAreaInset?.bottom)||0);
  const content=tg?.contentSafeAreaInset;
  const compactLandscape=window.innerWidth>window.innerHeight&&window.innerHeight<600;
  // Device notches and Telegram controls occupy separate bands. A zero inset can
  // be the initial SDK value, so keep a small control band until it arrives.
  const chromeTop=isTelegram?Math.max(Number(content?.top)||0,compactLandscape?36:52):0;
  const chromeBottom=isTelegram?Math.max(0,Number(content?.bottom)||0):0;
  document.documentElement.style.setProperty('--v27-header-clearance',`calc(max(env(safe-area-inset-top, 0px), ${safeTop}px) + ${chromeTop}px)`);
  document.documentElement.style.setProperty('--v27-bottom-clearance',`calc(max(env(safe-area-inset-bottom, 0px), ${safeBottom}px) + ${chromeBottom}px)`);
  for(const side of ['left','right'])document.documentElement.style.setProperty('--v27-safe-'+side,`calc(max(env(safe-area-inset-${side}, 0px), ${Math.max(0,Number(tg?.safeAreaInset?.[side])||0)}px) + ${Math.max(0,Number(content?.[side])||0)}px)`);
 }
 safeHeader();
 ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','viewportChanged'].forEach(name=>tg?.onEvent?.(name,safeHeader));
 window.visualViewport?.addEventListener('resize',safeHeader,{passive:true});
 window.addEventListener('orientationchange',safeHeader,{passive:true});

})();

(()=>{if(!document.createElement)return;let signature='';const bar=document.createElement('div');bar.id='contextActions';bar.hidden=true;document.body.append(bar);
const tools=document.createElement('div');tools.id='compactTools';tools.innerHTML='<button data-act="smokeQuick" title="Увімкнути або прибрати сигарету">🚬 / 🚭</button><span id="saveIndicator" role="status"></span>';document.body.append(tools);
setInterval(()=>{
 const scene=document.getElementById('scene');if(scene&&tools.parentElement!==scene)scene.append(tools);
 const original=document.querySelector('#scene .scene-btns .urgent');const originals=[...document.querySelectorAll('#scene .scene-btns .urgent')];const sig=originals.map(b=>b.outerHTML).join('');
 if(sig!==signature){signature=sig;bar.replaceChildren();for(const item of originals)bar.append(item.cloneNode(true));bar.hidden=!original;document.documentElement.classList.toggle('has-context-actions',!!original)}
 document.documentElement.style.setProperty('--v27-context-height',bar.hidden?'0px':Math.ceil(bar.getBoundingClientRect().height)+'px');
 const state=document.getElementById('saveIndicator');state.textContent=!navigator.onLine?'Немає мережі':(window.UHY?.saveState?.()||'Підключення…');
},500);
})();
