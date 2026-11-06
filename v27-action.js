/* Action feedback uses the player's own character art; rewards stay server-side. */
(()=>{'use strict';
 const tg=window.Telegram?.WebApp;
 const isTelegram=!!(tg&&(tg.initData||tg.initDataUnsafe?.user||(tg.platform&&tg.platform!=='unknown')))||/[&#?]tgWebApp(?:Data|Platform|Version)=/i.test(location.hash+'&'+location.search);
 document.documentElement.classList.toggle('v27-telegram',isTelegram);
 function safeHeader(){
  const safeTop=Math.max(0,Number(tg?.safeAreaInset?.top)||0),safeBottom=Math.max(0,Number(tg?.safeAreaInset?.bottom)||0);
   const hasContentSafeArea=typeof tg?.isVersionAtLeast==='function'&&tg.isVersionAtLeast('8.0');
   const content=hasContentSafeArea?tg.contentSafeAreaInset:null;
  const hasContentTop=!!content&&Number.isFinite(Number(content.top)),hasContentBottom=!!content&&Number.isFinite(Number(content.bottom));
  const compactLandscape=window.innerWidth>window.innerHeight&&window.innerHeight<600;
  const top=hasContentTop?Math.max(0,Number(content.top)):isTelegram?Math.max(compactLandscape?56:92,safeTop+(compactLandscape?34:52)):safeTop;
  const bottom=hasContentBottom?Math.max(0,Number(content.bottom)):safeBottom;
  document.documentElement.style.setProperty('--v27-header-clearance',top+'px');
  document.documentElement.style.setProperty('--v27-bottom-clearance',bottom+'px');
 }
 safeHeader();
 ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','viewportChanged'].forEach(name=>tg?.onEvent?.(name,safeHeader));
 window.visualViewport?.addEventListener('resize',safeHeader,{passive:true});
 window.addEventListener('orientationchange',safeHeader,{passive:true});
 const MAP={
  gig:['work','🧰','Підробіток'],shift:['work','💼','Робоча зміна'],apply:['work','📋','Співбесіда'],accept:['work','📋','Працевлаштування'],workCollect:['work','💰','Зарплата'],nightTask:['work','🌙','Нічна справа'],euWork:['work','💻','Робота'],search:['walk','🔍','Шукаємо роботу'],quit:['work','🚶','Звільнення'],
  foodRun:['food','🍲','Їжа'],food:['food','🍲','Вечеря'],hospital:['food','❤️','Лікування'],buyEnergy:['food','⚡','Відновлення'],
  tccTry:['tcc','🚐','Спроба втечі'],escape:['tcc','🏃','Втеча'],goldFree:['tcc','🪙','Звільнення'],bribe:['tcc','🚐','Звільнення'],bransom:['tcc','🚐','Викуп'],bresc:['tcc','🚐','Загін забирає'],
  spin:['casino','🎰','Барабани'],daily:['wheel','🎡','Бонус'],wheelSpin:['wheel','🎡','Колесо'],
  equip:['outfit','🧥','Переодягаємось'],outfitBuy:['outfit','🧥','Новий одяг'],outfitWear:['outfit','🧥','Новий образ'],buy:['outfit','🛒','Покупка'],bup:['outfit','⭐','Поліпшення'],buyBron:['outfit','🛡️','Бронь'],bwp:['outfit','🏏','Купуємо зброю'],weapon:['outfit','🏏','Зброя'],
  houseBuy:['home','🏠','Нова хата'],houseEquip:['home','🏡','Переїзд'],houseClaim:['home','🏠','Заселення'],collect:['home','💰','Прибуток'],upgrade:['outfit','🛠','Покращення'],
  fight:['fight','👊','Атакуємо'],bhit:['fight','💥','Удар'],hit:['fight','💥','Удар'],
  renameSave:['outfit','✎','Новий нік'],look:['outfit','✨','Новий вигляд'],create:['outfit','🛠','Створюємо бригаду'],join:['walk','🤝','До бригади'],
  bclaim:['wheel','🎁','Забираємо нагороду'],bgive:['work','🤝','Допомагаємо'],binv:['walk','🤝','Запрошуємо друга'],brs:['outfit','🛡️','Готуємо викуп'],bme:['food','⚡','Енергія']
 };
 const SKIP=new Set(['bhit','fight','tab','bt','ct','lk','pre','setloc','locs','settings','editHero','renameOpen','editLoc','gfx','help','audioMusic','audioSounds','closeOv','back','minus','plus','fcopy','fadd','facc','fdel','rename','openSets']);
 const infer=a=>/tcc|caught|escape|rescue|bransom|bresc|bribe/i.test(a)?['tcc','🚐','Подія ТЦК']:/fight|bhit|hit|boss/i.test(a)?['fight','👊','Атака']:/work|gig|shift|job|apply|nightTask/i.test(a)?['work','💼','Робоча дія']:/food|meal|dinner|eat|hospital/i.test(a)?['food','🍲','Піклуємось про героя']:/casino|spin|wheel|daily/i.test(a)?['casino','✨','Граємо']:/outfit|wear|equip|buy|gear|bwp/i.test(a)?['outfit','🧥','Оновлення спорядження']:['walk','✨','Дія'];
 let t;
 function flash(a,button){
  if(['gig','shift'].includes(a)&&(['texts','moderation'].includes(button?.dataset.w)||/текст|модер|коментар/i.test(button?.closest('.card,.home-action-row')?.textContent||''))&&window.UHYUI?.showWorkAction){window.UHYUI.showWorkAction(button.dataset.w==='moderation'?'moderation':'texts');return}
  const [mode,icon,label]=MAP[a]||infer(a);
  if(document.documentElement.classList.contains('lowfx')||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  let el=document.querySelector('#v27-action-flash');if(!el){el=document.createElement('div');el.id='v27-action-flash';el.setAttribute('aria-live','polite');document.body.append(el)}
  el.dataset.effect=mode;
  let hero='';try{hero=window.UHY?.snapshot?.(mode==='home'?'home':mode==='fight'?'boss':mode==='tcc'?'street':mode==='outfit'?'home':'work')?.avatar||''}catch{}
  el.innerHTML=(hero?'<span class="v27-flash-hero" aria-hidden="true">'+hero+'</span>':'')+'<span class="v27-effect-symbol">'+icon+'</span><b>'+label+'</b><span class="v27-effect-particles">✧ ✦ ✧</span>';
  el.classList.remove('v27-show');void el.offsetWidth;el.classList.add('v27-show');clearTimeout(t);t=setTimeout(()=>el.classList.remove('v27-show'),1250);
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('button[data-act],button[data-wact]');if(!b||b.disabled)return;const key=b.dataset.wact||b.dataset.act;if(key&&MAP[key]&&!SKIP.has(key))flash(key,b)},true);
})();

(()=>{if(!document.createElement)return;let signature='';const bar=document.createElement('div');bar.id='contextActions';bar.hidden=true;document.body.append(bar);
const tools=document.createElement('div');tools.id='compactTools';tools.innerHTML='<button data-act="smokeQuick" title="Увімкнути або прибрати сигарету">🚬 / 🚭</button><span id="saveIndicator" role="status"></span>';document.body.append(tools);
setInterval(()=>{
 const scene=document.getElementById('scene');if(scene&&tools.parentElement!==scene)scene.append(tools);
 const original=document.querySelector('#scene .scene-btns .urgent');const originals=[...document.querySelectorAll('#scene .scene-btns .urgent')];const sig=originals.map(b=>b.outerHTML).join('');
 if(sig!==signature){signature=sig;bar.replaceChildren();for(const item of originals)bar.append(item.cloneNode(true));bar.hidden=!original;document.documentElement.classList.toggle('has-context-actions',!!original)}
 const state=document.getElementById('saveIndicator');state.textContent=!navigator.onLine?'Немає мережі':(window.UHY?.saveState?.()||'Підключення…');
},500);
})();
