/* Claude-style game finish: shared scene for every secondary tab.
   Gameplay, economy and authentication stay inside the existing client/server. */
(()=>{'use strict';
 const map={weekly:'ТИЖНЕВА ЛІГА',profile:'ПРОФІЛЬ ГРАВЦЯ',wheel:'КОЛЕСО БОНУСІВ',housing:'МОЯ ХАТА',casino:'ВОРОНЯЧИЙ ФАРТ',world:'ВУЛИЦЯ ТА РОБОТА',career:'КАРʼЄРА',leaderboard:'ТОП ГРАВЦІВ',friends:'ДРУЗІ',news:'НОВИНИ МІСТА',account:'МІЙ АКАУНТ',brigade:'БИТВА З БОСАМИ'};
 const $=s=>document.querySelector(s);
 let active='housing',stamp='',queued=false,lastDisplayedSection='';
 function openSection(sec){
  const dock=$('#socialDock [data-sp="'+sec+'"]');
  if(dock){dock.click();return}
  if(sec==='brigade'){hideOverlay();const boss=$('#tabs [data-act="tab"][data-v="boss"]');if(boss)boss.click()}
 }
 function hideOverlay(){lastDisplayedSection='';const close=$('#spClose');if(close)close.click();else{const panel=$('#socialPanel');if(panel)panel.style.display='none'}}
 function detect(){
  const body=$('#spBody');if(!body)return active;
  const title=(body.querySelector('h2')?.textContent||'').toLowerCase();
  if(/ліга|лігу/.test(title))return 'weekly';
  if(/профіль/.test(title))return 'profile';
  if(/колесо|бонус/.test(title))return 'wheel';
  if(/казино|вороняч/.test(title))return 'casino';
  if(/хати|нерухом|житло/.test(title))return 'housing';
  if(/кар.єра|навички/.test(title))return 'career';
  if(/рейтинг|топ|лідер/.test(title))return 'leaderboard';
  if(/новини/.test(title))return 'news';
  if(/друзі/.test(title))return 'friends';
  if(/акаунт/.test(title))return 'account';
  if(/вулиця|робота/.test(title))return 'world';
  return active;
 }
 function ensureArt(){
  const box=$('#socialPanel .spbox'),body=$('#spBody');if(!box||!body)return null;
  let art=box.querySelector('.uhy-modal-scene');
  if(!art){
   art=document.createElement('div');art.className='uhy-modal-scene';
   art.setAttribute('role','img');art.setAttribute('aria-label','Рисована локація з твоїм персонажем');
   art.innerHTML='<div class="uhy-layer-bg"></div><div class="uhy-layer-avatar"></div><div class="uhy-layer-fg"></div><div class="uhy-modal-caption"></div>';
   const close=box.querySelector('#spClose');
   if(close)close.after(art);else box.prepend(art);
  }
  if(!box.querySelector('.uhy-modal-quick')){
   const quick=document.createElement('div');quick.className='uhy-modal-quick';
   [['housing','🏠 Хата'],['world','🏙 Вулиця'],['casino','🎰 Казино'],['career','💼 Робота'],['brigade','⚔ Боси'],['close','✕ Вийти']].forEach(([k,label])=>{
     const btn=document.createElement('button');btn.type='button';btn.textContent=label;
     btn.addEventListener('click',()=>{if(k==='close')hideOverlay();else openSection(k)});
     quick.appendChild(btn);
   });art.after(quick);
  }
  return art;
 }
 function tidyCasinoPaytable(){
  const body=$('#spBody');if(!body)return;
  const table=body.querySelector('.paytable');if(!table)return;
  const old=body.querySelector('.uhy-casino-payouts');
  const mobile=window.matchMedia('(max-width:700px) and (orientation:portrait)').matches;
  if(mobile&&!old){
   const wrap=document.createElement('details');wrap.className='uhy-casino-payouts';
   const summary=document.createElement('summary');summary.textContent='📜 Таблиця виплат і джекпотів';
   table.before(wrap);wrap.append(summary,table);
  }else if(!mobile&&old){old.replaceWith(table)}
 }
 function refresh(){
  queued=false;
  const panel=$('#socialPanel'),body=$('#spBody');
  if(!panel||!body||panel.style.display==='none')return;
  const art=ensureArt();if(!art||!window.UHY?.snapshot)return;
  active=detect();
  // Only change layout for casino; other screens remain untouched.
  panel.classList.toggle('uhy-casino-mode',active==='casino');
  if(active==='casino')tidyCasinoPaytable();
  if(active!==lastDisplayedSection){
   body.scrollTop=0;
   lastDisplayedSection=active;
  }
  const house=window.UHY.getHouse?.()||'shack';
  const key=active+'|'+house+'|'+(new Date().getHours()>=20?'night':'day')+'|'+(body.querySelector('h2')?.textContent||'');
  if(stamp!==key){
   try{
    const data=window.UHY.snapshot(active);
    art.querySelector('.uhy-layer-bg').innerHTML=data.background;
    art.querySelector('.uhy-layer-avatar').innerHTML=data.avatar;
    art.querySelector('.uhy-layer-fg').innerHTML=data.foreground;
    const desc=map[active]||'УХИЛЯНТ';
    art.querySelector('.uhy-modal-caption').textContent=desc;
    const sub=document.createElement('small');sub.textContent=data.name+' · твій персонаж';
    art.querySelector('.uhy-modal-caption').append(sub);
    art.dataset.section=active;
    stamp=key;
   }catch(e){console.warn('Art preview unavailable',e)}
  }
 }
 function queue(){if(queued)return;queued=true;requestAnimationFrame(refresh)}
 function install(){
  const body=$('#spBody'),box=$('#socialPanel .spbox');if(!body||!box)return;
  if(!body.dataset.uhyObserver){
   body.dataset.uhyObserver='1';
   new MutationObserver(queue).observe(body,{childList:true,subtree:false});
  }
  if(!document.body.dataset.uhyPolish){
   document.body.dataset.uhyPolish='1';
   document.addEventListener('click',e=>{
    const nav=e.target.closest?.('[data-sp]');if(nav){active=nav.dataset.sp;stamp='';queue()}
    const button=e.target.closest?.('[data-act="tab"]');if(button){stamp='';queue()}
   },true);
   document.addEventListener('click',e=>{if(e.target?.closest?.('#spClose'))lastDisplayedSection='';},true);
   window.addEventListener('resize',()=>{stamp='';queue()},{passive:true});
   window.addEventListener('focus',()=>{stamp='';queue()});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){stamp='';queue()}});
   setInterval(()=>{if($('#socialPanel')?.style.display==='flex'){stamp='';queue()}},60000);
   try{const tg=window.Telegram?.WebApp;tg?.ready?.();tg?.expand?.();if(tg?.requestFullscreen)tg.requestFullscreen()}catch(e){}
  }
  queue();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
 setTimeout(install,200);setTimeout(install,1000);
})();
