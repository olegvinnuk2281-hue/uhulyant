
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
body.querySelector('#pfForgot').onclick=()=>showGate('forgot');
body.querySelector('#pfLogout').onclick=()=>{localStorage.removeItem('vt_net');location.reload()};
}
function nav(){
const original=document.querySelector('#tabs'),dock=document.querySelector('#socialDock');
if(!original||!dock||dock.dataset.unified)return;
dock.dataset.unified='1';
const originalTabs=[...original.querySelectorAll(':scope > .tab')];
// Keep original server-owned [data-sp] controls connected to the dock.
// The server's delegated click handler needs them as event targets.
const raw=document.createElement('div');raw.hidden=true;raw.dataset.uhyRaw='1';
const extra=[...dock.querySelectorAll('[data-sp]')].map(b=>{raw.append(b);return {label:b.textContent,action:()=>b.click(),key:b.dataset.sp}});
const menu=document.getElementById('uhyMore')||document.createElement('div');menu.id='uhyMore';menu.hidden=true;menu.replaceChildren();if(!menu.isConnected)document.body.append(menu);
const entries=originalTabs.map((b,i)=>({label:b.textContent.trim()||'Розділ '+(i+1),
 action:()=>{const current=document.querySelector('#tabs>.tab[data-act="tab"][data-v="'+b.dataset.v+'"]');if(current)current.click()},key:'tab'+i})).concat(extra);
const find=(needle)=>entries.find(x=>x.key===needle)||entries.find(x=>x.label.toLowerCase().includes(needle));
const primary=[find('tab0'),find('tab1'),find('world'),find('casino')].filter(Boolean);
dock.replaceChildren(raw);
const make=(parent,label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{menu.hidden=true;action()};parent.append(b);return b};
primary.forEach(x=>make(dock,x.label,x.action));
const more=make(dock,'☰ Меню',()=>{menu.hidden=!menu.hidden});
more.onclick=()=>{menu.hidden=!menu.hidden};
entries.filter(x=>!primary.includes(x)).forEach(x=>make(menu,x.label,x.action));
if(!document.body.dataset.uhyEscapeBound){document.body.dataset.uhyEscapeBound='1';document.addEventListener('keydown',e=>{if(e.key==='Escape'){const m=document.getElementById('uhyMore');if(m)m.hidden=true}})}
}
// The original client redraws #tabs on every game update.
// Restore the unified launcher after EACH redraw instead of reverting to 14 buttons.
const tabHost=document.querySelector('#tabs');
if(tabHost){new MutationObserver(()=>{const dock=tabHost.querySelector('#socialDock');if(dock&&!dock.dataset.unified)nav()}).observe(tabHost,{childList:true})}
window.UHYACCOUNT={render:renderAccount};
async function init(){
nav();
const token=(()=>{try{return JSON.parse(localStorage.getItem('vt_net')||'null')}catch{return null}})();
if(new URLSearchParams(location.search).has('reset')){showGate('reset');return}
if(!token?.id||!token?.key){showGate('login');return}
const r=await request('account/status',null,token);
if(!r.ok){showGate('login');return}
if(r.legacy){showGate('claim');return}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
