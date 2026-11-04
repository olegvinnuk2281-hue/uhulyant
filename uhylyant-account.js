
(()=>{'use strict';
const css=`.tabs{position:relative!important;border:0!important;padding:0!important;background:transparent!important;min-height:0!important}
.tabs>.tab{display:none!important}
#socialDock{position:fixed!important;bottom:0!important;left:50%!important;transform:translateX(-50%)!important;width:min(1100px,100%)!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;overflow:visible!important;gap:2px!important;padding:7px 5px max(8px,env(safe-area-inset-bottom))!important;background:#201b18f5!important;border:1px solid #725637!important;border-radius:14px 14px 0 0!important;z-index:999!important}
#socialDock>button{min-width:0!important;width:100%!important;padding:8px 1px!important;white-space:normal!important;line-height:1.15!important;font-size:clamp(10px,1.8vw,13px)!important;min-height:49px!important}
#socialDock>button.nav-on{color:#f8b948!important;background:#4a3521!important}
#uhyMore{position:fixed;bottom:calc(65px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(1080px,calc(100% - 12px));max-height:min(60vh,480px);overflow:auto;z-index:998;background:#29231e;border:1px solid #8d6b40;border-radius:15px;padding:12px;box-shadow:0 -20px 45px #000c;display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}
#uhyMore[hidden]{display:none!important}#uhyMore button{background:#403329;color:#f2e4c9;border:1px solid #765a3b;border-radius:10px;min-height:48px;font-weight:700}
body{padding-bottom:calc(75px + env(safe-area-inset-bottom))!important}
@media(min-width:900px){.tabs{grid-column:2!important;grid-row:3!important;min-height:0!important;margin:0!important}#socialDock{width:min(1100px,100%)!important}}
@media(max-width:700px){.tabs{padding:0!important}#socialDock>button{font-size:11px!important}#spBody{padding-bottom:90px!important}}
#uhyAuth{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;background:#0b0e11f7;color:#f0e4cf;font:14px system-ui}
#uhyAuth[hidden]{display:none!important}#uhyAuth .auth-card{width:min(440px,100%);max-height:94dvh;overflow:auto;background:linear-gradient(135deg,#332b24,#1e2020);border:2px solid #98713b;border-radius:20px;padding:25px;box-shadow:0 18px 65px #000}
#uhyAuth h2{font:900 29px Impact,system-ui;margin:0 0 8px;color:#f7b63b;letter-spacing:.03em}
#uhyAuth p{color:#d1c3aa;line-height:1.45}
#uhyAuth input,#spBody .account-form input{display:block;width:100%;box-sizing:border-box;background:#111312;color:#fff;border:1px solid #7e6848;border-radius:10px;padding:13px;margin:8px 0;font-size:16px}
#uhyAuth button,#spBody .account-form button{padding:12px 14px;border-radius:10px;border:1px solid #a7803b;background:#e6a536;color:#21180e;font-weight:800;cursor:pointer;margin:4px 5px 4px 0}
#uhyAuth button.alt,#spBody .account-form button.alt{background:#44372b;color:#f5e5ca}
#uhyAuth .auth-msg,#spBody .auth-msg{min-height:25px;color:#ffd07a}
#uhyAuth .auth-switch{display:flex;flex-wrap:wrap;gap:4px;margin:12px 0}
#uhyAuth small{color:#c6b69d;display:block;margin-top:12px}
\n/* Telegram secure single-tap login status. Never show password entry in Mini App. */
#uhyAuth .tg-state{width:min(420px,100%);padding:28px 22px;text-align:center;box-shadow:0 18px 60px #000;background:linear-gradient(140deg,#30261d,#141716);border:2px solid #d7a046;border-radius:18px}
#uhyAuth .tg-state h2{letter-spacing:.07em;margin:12px 0}
#uhyAuth .tg-state p{margin:10px 0 12px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere}
#uhyAuth .tg-state .tg-icon{font-size:47px;display:block;filter:drop-shadow(0 3px #0008)}
#uhyAuth .tg-state .tg-spinner{width:35px;height:35px;border:3px solid #725433;border-top-color:#f6ba4e;border-radius:50%;animation:uhy-auth-spin .7s linear infinite;margin:15px auto}
#uhyAuth .tg-state .tg-actions{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:14px}
#uhyAuth .tg-state .tg-actions button,#uhyAuth .tg-state .tg-actions a{display:inline-flex;justify-content:center;align-items:center;padding:12px 15px;margin:0;border-radius:8px;border:1px solid #987345;background:#f6b33f;color:#24170a;font-weight:800;text-decoration:none;cursor:pointer}
#uhyAuth .tg-state .tg-actions a{background:#44362a;color:#ffe6b9}
@keyframes uhy-auth-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#uhyAuth .tg-state .tg-spinner{animation:none}}
`;
const st=document.createElement('style');st.textContent=css;document.head.append(st);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(path,data,token){try{const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-id':token.id,'x-key':token.key}:{})},body:data?JSON.stringify(data):undefined});return await r.json()}catch{return {ok:false,err:'Сервер недоступний'}}}
const val=(root,id)=>root.querySelector('#'+id)?.value||'';
function storeLogin(r){localStorage.setItem('vt_net',JSON.stringify({id:r.id,key:r.key}));location.reload()}
function fields(mode,prefix='au'){
if(mode==='login')return `<input id="${prefix}User" placeholder="Логін" autocomplete="username"><input id="${prefix}Pass" type="password" placeholder="Пароль" autocomplete="current-password">`;
if(mode==='register'||mode==='claim')return `<input id="${prefix}User" placeholder="Логін (латиниця, 3–20)" autocomplete="username"><input id="${prefix}Email" type="email" placeholder="Email для відновлення" autocomplete="email"><input id="${prefix}Pass" type="password" placeholder="Пароль (від 8 символів)" autocomplete="new-password"><input id="${prefix}Confirm" type="password" placeholder="Повторіть пароль" autocomplete="new-password">`;
if(mode==='forgot')return `<input id="${prefix}Email" type="email" placeholder="Email, прив'язаний до акаунта" autocomplete="email">`;
if(mode==='reset')return `<input id="${prefix}Pass" type="password" placeholder="Новий пароль" autocomplete="new-password"><input id="${prefix}Confirm" type="password" placeholder="Повторіть новий пароль" autocomplete="new-password">`;
if(mode==='change')return `<input id="${prefix}Old" type="password" placeholder="Старий пароль" autocomplete="current-password"><input id="${prefix}Pass" type="password" placeholder="Новий пароль" autocomplete="new-password"><input id="${prefix}Confirm" type="password" placeholder="Повторіть новий пароль" autocomplete="new-password">`;
if(mode==='email')return `<input id="${prefix}Email" type="email" placeholder="Email" autocomplete="email"><input id="${prefix}Old" type="password" placeholder="Поточний пароль" autocomplete="current-password">`;
return '';
}
function attachForm(root,mode,prefix,token,onDone,resetToken){
const b=root.querySelector('[data-auth-submit]');if(!b)return;
b.onclick=async()=>{
const msg=root.querySelector('.auth-msg');
const username=val(root,prefix+'User').trim(),email=val(root,prefix+'Email').trim(),password=val(root,prefix+'Pass'),confirmPassword=val(root,prefix+'Confirm'),oldPassword=val(root,prefix+'Old');
if(['register','claim','reset','change'].includes(mode)&&password!==confirmPassword){msg.textContent='Паролі не збігаються';return}
b.disabled=true;msg.textContent='Зачекайте…';
const routes={login:'account/login',register:'account/register',claim:'account/claim',forgot:'account/request-reset',reset:'account/reset-password',change:'account/change-password',email:'account/email'};
const payload={username,email,password,confirmPassword,oldPassword,newPassword:password,token:resetToken};
const r=await request(routes[mode],payload,['claim','change','email'].includes(mode)?token:null);
b.disabled=false;
if(!r.ok){msg.textContent=r.err||'Помилка';return}
if(['login','register'].includes(mode)){storeLogin(r);return}
msg.textContent=mode==='forgot'?'Якщо пошту підключено і акаунт знайдено, прийде лист. До підключення email-сервісу листи не надсилаються.':mode==='reset'?'Пароль змінено. Увійдіть із новим паролем.':'Збережено';
if(mode==='claim'){setTimeout(()=>location.reload(),600)}
if(mode==='reset'){history.replaceState({},'',location.pathname);setTimeout(()=>location.reload(),1800)}
if(onDone)onDone();
};
}
let gate;
function showGate(mode='login'){
if(!gate){gate=document.createElement('div');gate.id='uhyAuth';document.body.append(gate)}
gate.hidden=false;
const resetToken=new URLSearchParams(location.search).get('reset');
if(resetToken)mode='reset';
const title={login:'ВХІД ДО ГРИ',register:'СТВОРИТИ АКАУНТ',forgot:'ЗАБУВ ПАРОЛЬ',reset:'НОВИЙ ПАРОЛЬ',claim:'ПРИВʼЯЗАТИ ПРОФІЛЬ'}[mode];
gate.innerHTML=`<div class="auth-card"><h2>УХИЛЯНТ · ${title}</h2><p>${mode==='login'?'Уже грали? Введіть старий логін і пароль — прогрес залишиться.':mode==='register'?'Новий гравець: створіть логін, пароль і вкажіть пошту.':mode==='claim'?'Цей пристрій має гостьовий профіль. Привʼяжіть його, щоб не втратити прогрес.':mode==='reset'?'Посилання діє 20 хвилин.':'Відновлення через email буде доступне після налаштування поштового сервісу.'}</p><div class="auth-switch"><button data-mode="login" class="alt">Увійти</button><button data-mode="register" class="alt">Реєстрація</button><button data-mode="forgot" class="alt">Забув пароль</button></div>${fields(mode)}<button data-auth-submit>${mode==='login'?'Увійти':mode==='register'?'Зареєструватися':mode==='forgot'?'Запросити лист':mode==='claim'?'Зберегти цей профіль':'Змінити пароль'}</button><p class="auth-msg" role="status"></p><small>Важливо: старі гостьові акаунти без логіна потребують прив'язки на пристрої, де вони були створені. Не реєструйте новий акаунт замість входу в старий.</small></div>`;
gate.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>showGate(b.dataset.mode));
attachForm(gate,mode,'au',mode==='claim'?JSON.parse(localStorage.getItem('vt_net')||'null'):null,null,resetToken);
}
async function renderAccount(body,api,token,refresh){
const st=token.id?await api('account/status'):null;
const legacy=st?.ok&&!st.username;
body.innerHTML=`<h2>👤 Мій акаунт</h2><p>${st?.username?'Логін: <b>'+esc(st.username)+'</b>':'Гостьовий профіль без логіна'}</p><p>Email: <b>${esc(st?.email||'не привʼязаний')}</b></p><div class="account-form">${legacy?'<h3>Зберегти старий профіль</h3><p>Привʼяжіть логін до цього профілю — прогрес не зміниться.</p>'+fields('claim','pf')+'<button data-auth-submit>Привʼязати</button><p class="auth-msg"></p>':st?.username?'<h3>Змінити пароль</h3>'+fields('change','pf')+'<button data-auth-submit>Зберегти новий пароль</button><p class="auth-msg"></p>':'<p>Увійдіть, щоб керувати акаунтом.</p>'}</div><div class="account-form" id="emailForm">${st?.username?'<h3>Привʼязати / змінити email</h3>'+fields('email','em')+'<button data-auth-submit>Зберегти email</button><p class="auth-msg"></p>':''}</div><div class="account-form"><h3>Відновлення доступу</h3><p>Скидання через email запрацює після підключення поштового сервісу.</p><button id="pfForgot">Забув пароль</button><button id="pfLogout" class="alt">Вийти з акаунта</button></div>`;
if(legacy)attachForm(body.querySelector('.account-form'),'claim','pf',token,refresh);
else if(st?.username)attachForm(body.querySelector('.account-form'),'change','pf',token);
if(st?.username)attachForm(body.querySelector('#emailForm'),'email','em',token,refresh);
if(st?.telegram){
const box=document.createElement('div');box.className='account-form';box.innerHTML='<h3>🔗 Повернути старий акаунт</h3><p>Якщо раніше грав на сайті з логіном та паролем, привʼяжи його до Telegram. Прогрес старого акаунта буде відкрито замість новоствореного Telegram-профілю.</p><input id="telegramOldUser" placeholder="Старий логін" autocomplete="username"><input id="telegramOldPass" type="password" placeholder="Старий пароль" autocomplete="current-password"><button id="telegramOldLink" type="button">Привʼязати старий акаунт</button><p class="auth-msg" id="telegramOldMsg"></p>';
body.append(box);box.querySelector('#telegramOldLink').onclick=async()=>{
const button=box.querySelector('#telegramOldLink'),msg=box.querySelector('#telegramOldMsg');button.disabled=true;
const r=await request('telegram/link',{username:box.querySelector('#telegramOldUser').value,password:box.querySelector('#telegramOldPass').value},token);
button.disabled=false;
if(!r.ok){msg.textContent=r.err||'Помилка';return}
localStorage.setItem('vt_net',JSON.stringify({id:r.id,key:r.key,telegram:true}));location.reload();
};
}
body.querySelector('#pfForgot').onclick=()=>showGate('forgot');
body.querySelector('#pfLogout').onclick=()=>{localStorage.removeItem('vt_net');location.reload()};
}
function nav(){
const original=document.querySelector('#tabs'),dock=document.querySelector('#socialDock');
if(!original||!dock||dock.dataset.unified)return;
dock.dataset.unified='1';
const originalTabs=[...original.querySelectorAll(':scope > .tab')];
const social=[...dock.querySelectorAll('[data-sp]')];
const oldActions=originalTabs.map((b,i)=>({
 label:['🏠 Дім','⚔ Бої','🚶 Маршрути','🧥 Одяг','🧭 Шлях','💎 Донат'][i]||b.textContent.trim(),
 action:()=>document.querySelectorAll('#tabs > .tab')[i]?.click(),key:'tab'+i
}));
const newActions=social.map(b=>({label:b.textContent.trim(),action:()=>window.UHY_NAV?.open?.(b.dataset.sp),key:b.dataset.sp}));
const entries=[...oldActions,...newActions];
const find=key=>entries.find(x=>x.key===key);
let menu=document.getElementById('uhyMore');
if(!menu){menu=document.createElement('div');menu.id='uhyMore';document.body.append(menu)}
menu.replaceChildren();menu.hidden=true;
const make=(parent,label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{menu.hidden=true;action()};parent.append(b);return b};
const primary=[['tab0','🏠 Дім'],['tab1','⚔ Бої'],['world','🏙 Вулиця'],['casino','🎰 Казино']];
dock.replaceChildren();
primary.forEach(([id,label])=>{const item=find(id);if(item)make(dock,label,item.action)});
const more=make(dock,'☰ Меню',()=>{});more.onclick=()=>{menu.hidden=!menu.hidden};
const groups=[
 ['👤 ПЕРСОНАЖ',[['tab3','🧥 Одяг'],['housing','🏠 Хати'],['health','🩺 Здоровʼя'],['account','👤 Акаунт']]],
 ['🌆 СВІТ',[['tab2','🚶 Маршрути'],['tab4','🧭 Шлях'],['career','🎖 Карʼєра']]],
 ['🏆 СПІЛЬНОТА',[['leaderboard','🏆 Рейтинг'],['friends','👥 Друзі'],['news','📰 Новини']]],
 ['💎 МАГАЗИН',[['tab5','💎 Донат']]]
];
groups.forEach(([title,items])=>{
 const h=document.createElement('div');h.className='uhyMoreHeader';h.textContent=title;menu.append(h);
 items.forEach(([id,label])=>{const item=find(id);if(item)make(menu,label,item.action)});
});
window.__uhyNavClose=()=>{menu.hidden=true};
}
window.UHYACCOUNT={render:renderAccount};
const TELEGRAM_APP_LINK='https://t.me/Uhilyant_UAbot?startapp';
function getTelegramInitData(){
 const raw=window.Telegram?.WebApp?.initData;
 if(typeof raw==='string'&&raw.length>0)return raw;
 // SDK may fail to initialize; Telegram also passes initData in launch hash.
 // This is NEVER trusted directly: /api/telegram/auth checks the HMAC signature.
 const search=new URLSearchParams(location.hash.replace(/^#/,''));
 return search.get('tgWebAppData')||new URLSearchParams(location.search).get('tgWebAppData')||'';
}
function telegramLaunchHint(){
 if(getTelegramInitData())return true;
 const params=String(location.hash||'')+'&'+String(location.search||'');
 if(/(?:^|[&#?])tgWebApp(?:Platform|Version|Data|StartParam)=/i.test(params))return true;
 const platform=window.Telegram?.WebApp?.platform;
 return !!(platform&&platform!=='unknown');
}
function telegramGate(){
 if(!gate){gate=document.createElement('div');gate.id='uhyAuth';document.body.append(gate)}
 gate.hidden=false;return gate;
}
function telegramState(mode,message){
 const root=telegramGate();
 root.innerHTML='<section class="tg-state" role="status" aria-live="polite"><span class="tg-icon" aria-hidden="true">🎮</span><h2>УХИЛЯНТ</h2><p id="tgStatus"></p><div id="tgProgress"></div><div id="tgActions" class="tg-actions"></div></section>';
 root.querySelector('#tgStatus').textContent=message;
 if(mode==='loading')root.querySelector('#tgProgress').innerHTML='<div class="tg-spinner" aria-label="Завантаження"></div>';
 else{
  const retry=document.createElement('button');retry.type='button';retry.textContent='🔄 Спробувати ще раз';retry.onclick=()=>init();
  const launch=document.createElement('a');launch.href=TELEGRAM_APP_LINK;launch.target='_blank';launch.rel='noopener noreferrer';launch.textContent='🚀 Відкрити гру в боті';
  root.querySelector('#tgActions').append(retry,launch);
 }
}
async function waitForTelegramInitData(){
 for(let i=0;i<7;i++){
  const data=getTelegramInitData();if(data)return data;
  await new Promise(resolve=>setTimeout(resolve,180));
 }
 return '';
}
let initializing=false;
async function init(){
 if(initializing)return;
 initializing=true;
 try{
  nav();
  let token;try{token=JSON.parse(localStorage.getItem('vt_net')||'null')}catch{token=null}
  if(new URLSearchParams(location.search).has('reset')){showGate('reset');return}
  if(telegramLaunchHint()){
   telegramState('loading','Підключаємося через Telegram…');
   try{window.Telegram?.WebApp?.ready?.();window.Telegram?.WebApp?.expand?.()}catch(e){}
   const data=await waitForTelegramInitData();
   if(!data){
    telegramState('error','Telegram не передав дані входу. Запусти гру кнопкою «Відкрити застосунок» у @Uhilyant_UAbot, а не звичайним посиланням на сайт.');
    return;
   }
   const r=await request('telegram/auth',{initData:data},token);
   if(!r.ok||!r.id||!r.key){
    telegramState('error','Автоматичний вхід недоступний. '+(r.err||'Помилка сервера')+'\nПеревір TELEGRAM_BOT_TOKEN у Render та кнопку Mini App у BotFather.');
    return;
   }
   if(!token||token.id!==r.id||token.key!==r.key){
    localStorage.setItem('vt_net',JSON.stringify({id:r.id,key:r.key,telegram:true}));
    // Original game reads vt_net during its first JS execution. Reload once so
    // all subsystems receive the same verified account and cached world state.
    location.reload();return;
   }
   if(gate)gate.hidden=true;
   return;
  }
  // Direct website mode retains normal login; never fabricate a Telegram user.
  if(!token?.id||!token?.key){showGate('login');return}
  const r=await request('account/status',null,token);
  if(!r.ok){showGate('login');return}
  if(r.legacy){showGate('claim');return}
  if(gate)gate.hidden=true;
 }finally{initializing=false}
}
// The main game recreates #tabs on each render. Rebuild the 5-button dock
// whenever that happens, including after character creation or changing tabs.
function watchNav(){
 const tabs=document.querySelector('#tabs');if(!tabs)return;
 const observer=new MutationObserver(()=>{
  if(document.querySelector('#socialDock')&&!document.querySelector('#socialDock[data-unified]'))nav();
 });
 observer.observe(tabs,{childList:true});
 nav();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{watchNav();init()});else{watchNav();init()}
})();
