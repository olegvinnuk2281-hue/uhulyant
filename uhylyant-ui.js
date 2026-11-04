/* Responsive world and casino screens. Uses existing account token and /api/world. */
(()=>{'use strict';
function viewport(){const tg=window.Telegram?.WebApp;const h=tg?.viewportHeight||window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--uhy-viewport',h+'px')}
window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);window.Telegram?.WebApp?.onEvent('viewportChanged',viewport);viewport();
const css=`
#socialPanel{padding:0!important;align-items:stretch!important;justify-content:center!important;backdrop-filter:blur(9px)}
#socialPanel .spbox{position:relative;width:min(1080px,100%)!important;height:min(92dvh,900px);max-height:none!important;margin:auto;overflow:hidden!important;display:flex;flex-direction:column;background:#151b23!important;border:1px solid #344254!important;border-radius:20px!important;padding:0!important;box-shadow:0 24px 90px #000c!important}
#socialPanel .spclose{position:absolute;right:14px;top:13px;z-index:10;float:none!important;background:#273240!important;color:#e7f0fa!important;border:1px solid #46556a!important;margin:0!important}
#spBody{overflow-y:auto;min-height:0;flex:1;padding:24px 26px 100px;scrollbar-color:#45546a transparent}
#socialPanel h2{font:700 clamp(22px,3vw,30px) system-ui;margin:0 100px 12px 0;color:#f5f8fc}
#socialPanel h3{font-size:17px;color:#e9f0f8;margin:8px 0 12px}
#socialPanel p{line-height:1.5}#socialPanel .spitem{border-color:#344254}
#socialPanel button{transition:transform .15s,background .15s;box-shadow:none!important}#socialPanel button:hover:not(:disabled){filter:brightness(1.12)}
#socialPanel button:disabled{opacity:.45;cursor:not-allowed}
#socialPanel input,#socialPanel select{width:100%;min-width:0;padding:12px;background:#0d141c;color:#f3f6fb;border:1px solid #435269;border-radius:12px;font:inherit;box-sizing:border-box}
#socialDock{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(1280px,100%);z-index:25;display:flex!important;gap:4px!important;flex-wrap:nowrap!important;overflow-x:auto;justify-content:space-around!important;background:#121b25ee!important;border:1px solid #344354!important;border-radius:16px 16px 0 0;padding:7px 8px max(8px,env(safe-area-inset-bottom))!important;box-shadow:0 -12px 40px #0009}
#socialDock button{flex:1 0 auto;min-width:85px;border:0!important;background:transparent!important;color:#b7c7d8!important;padding:11px 8px!important;font-size:12px!important;white-space:nowrap}
#socialDock button:hover{background:#283647!important;color:#fff!important}
#socialPanel .world-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
#socialPanel .world-card{background:linear-gradient(145deg,#202b38,#19232e);border:1px solid #354659;border-radius:18px;padding:18px;min-width:0;display:flex;flex-direction:column;gap:12px}
#socialPanel .world-wide{grid-column:1/-1}#socialPanel .world-card h3{margin:0}#socialPanel .world-card p{margin:0;color:#b7c6d8}
#socialPanel .world-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#socialPanel .world-actions button,#socialPanel .world-card button{background:#edaa35;color:#151b22;border:0;border-radius:11px;font-weight:750;padding:12px 16px;margin:0;min-height:44px}
#socialPanel .world-actions .secondary{background:#354659;color:#e6edf7}
#socialPanel .world-stat{display:flex;gap:10px;flex-wrap:wrap}#socialPanel .world-stat span{padding:10px 14px;background:#253446;border-radius:12px;font-weight:700}
#socialPanel .world-muted{font-size:12px;color:#9eb0c4!important}#socialPanel .world-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#socialPanel .world-job{display:flex;flex-direction:column;align-items:flex-start;gap:7px;background:#121b25;border:1px solid #36485d;border-radius:12px;padding:12px}
#socialPanel .world-job b{font-size:15px}#socialPanel .world-job small{color:#a9bacd}#socialPanel .world-job button{width:100%;margin-top:auto}
#socialPanel .world-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#socialPanel .world-inventory{display:flex;flex-wrap:wrap;gap:8px}#socialPanel .world-inventory button{background:#324359;color:#e7f0fa}
#socialPanel .slot-machine{padding:22px;background:radial-gradient(circle at 50% 0,#633c1a,#151c27 65%);border:3px solid #bf8a37;border-radius:23px;box-shadow:inset 0 0 32px #0009;text-align:center}
#socialPanel .slot-title{font-size:24px;font-weight:900;letter-spacing:3px;color:#ffda8a;text-shadow:0 2px 10px #fa9b3d80}
#socialPanel .slot-reels{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:550px;margin:20px auto;background:#090e15;padding:12px;border-radius:16px;perspective:600px}
#socialPanel .slot-reel{height:135px;display:grid;place-items:center;background:linear-gradient(#a7b4c2,#f9fbff 25%,#fff 50%,#b8c5d1);border-radius:12px;border:3px solid #d1a455;box-shadow:inset 0 0 22px #506276a0;font-size:clamp(44px,7vw,76px);transform-style:preserve-3d;overflow:hidden}
#socialPanel .slot-reel.spinning{animation:reelRoll .14s linear infinite;filter:blur(1.4px)}@keyframes reelRoll{0%{transform:rotateX(-15deg) translateY(-9px)}50%{transform:rotateX(0) translateY(9px)}100%{transform:rotateX(15deg) translateY(-9px)}}
#socialPanel .slot-controls{display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap}#socialPanel .slot-controls input{width:110px;text-align:center;margin:0;font-weight:800}
#socialPanel .slot-result{min-height:32px;color:#ffe4a9;font-weight:800;font-size:18px}
@media(max-width:700px){#socialPanel .spbox{height:100dvh;width:100%!important;border-radius:0!important;border:0!important}#spBody{padding:20px 14px 110px}#socialPanel .world-grid{grid-template-columns:1fr;gap:11px}#socialPanel .world-wide{grid-column:auto}#socialPanel .world-card{padding:14px}#socialPanel .world-list{grid-template-columns:1fr 1fr}#socialPanel .world-fields{grid-template-columns:1fr}#socialPanel .spclose{right:10px;top:10px}#socialDock{border-radius:12px 12px 0 0}#socialDock button{min-width:78px;font-size:11px!important}#socialPanel .slot-reels{gap:6px;padding:7px}#socialPanel .slot-reel{height:105px}body{padding-bottom:65px!important}.tabs{padding-bottom:70px!important}}
@media(max-width:380px){#socialPanel .world-list{grid-template-columns:1fr}#socialPanel .slot-reel{height:90px}}
#socialPanel .night-clock{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#131c22;border:1px solid #77603a;border-radius:13px;padding:14px 16px}#socialPanel .night-clock strong{font:800 32px Impact,sans-serif;color:#edb64c;letter-spacing:.08em}#socialPanel .night-clock span{font-weight:700;color:#d9d2bf}#socialPanel .world-card:has(.night-clock){background:linear-gradient(130deg,#242e39,#171b23)}
/* Game-wide inked noir palette, inspired by gritty comic-book illustration. */
:root{--bg:#15191a;--panel:#242526;--panel-2:#303334;--line:#514535;--ink:#f1e6cf;--muted:#b5a68f;--paper:#d6c49e;--paper-ink:#2b2119;--amber:#e9a72f;--amber-edge:#815316;--green:#86b88c;--red:#c9543c;--red-edge:#7a271a;--blue:#7a9aaf}
body{background:radial-gradient(circle at 25% 15%,#4b392b 0%,transparent 35%),repeating-linear-gradient(90deg,#161b1d 0 46px,#1b2022 46px 48px)!important}
.hud{background:linear-gradient(145deg,#3a3028,#211e1c)!important;border-color:#594832!important}
.card,.paper{box-shadow:3px 5px 0 #100e0c!important;border-color:#584733!important}
.scene{border-color:#6b5030!important;box-shadow:0 7px 22px #000a!important}
.btn.amber,.pill.on{background:linear-gradient(#efb747,#d18a21)!important;color:#24190f!important}
.tabs{background:#211f1b!important;border-color:#5b4830!important}
#socialPanel .spbox{background:#201e1b!important;border:2px solid #765936!important}
#socialPanel .world-card{background:linear-gradient(145deg,#322b25,#211f1c);border-color:#67533b}
#socialPanel .world-job{background:#241f1a;border-color:#665038}
#socialPanel .world-stat span{background:#393027;color:#f3dfb6}
#socialPanel .world-card h3{color:#f2d9a7}
#socialPanel .world-card button{background:#e4a437;color:#22180d}
#socialPanel .world-card button.secondary{background:#564839;color:#f2e3c5}
#socialPanel .spclose{background:#4a3b2c!important;border-color:#97723c!important}
#socialDock{background:#24201bea!important;border-color:#705334!important}
#socialDock button{color:#ead8b8!important}
/* Casino: inked noir, aged paper, brass, hand-painted poster atmosphere */
#socialPanel .casino-stage{position:relative;overflow:hidden;border:2px solid #805a2a;border-radius:17px;padding:clamp(12px,3vw,26px);background:radial-gradient(ellipse at 68% 6%,#6e4c2c77,transparent 38%),repeating-linear-gradient(90deg,#151d20 0 34px,#182328 34px 36px),#172125;color:#f3e2b7;box-shadow:inset 0 0 90px #000b,0 10px 24px #0008}
#socialPanel .casino-stage:before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.19;background:repeating-linear-gradient(0deg,#0000 0 3px,#e2b46e12 3px 4px),radial-gradient(circle at 20% 35%,#b57b40 0 1px,transparent 2px);background-size:auto,19px 23px}
#socialPanel .casino-banner{position:relative;text-align:center;margin-bottom:20px;display:flex;flex-direction:column;gap:4px;text-shadow:3px 4px #100b08}
#socialPanel .casino-banner small{letter-spacing:.24em;color:#d9b477;font-weight:700;font-size:10px}
#socialPanel .casino-banner strong{font:900 clamp(27px,5vw,58px)/1.06 Impact,'Arial Narrow',sans-serif;letter-spacing:.045em;color:#e9a82c;-webkit-text-stroke:1px #1e1107;filter:drop-shadow(0 3px #17100a)}
#socialPanel .casino-banner span{font-size:11px;letter-spacing:.16em;color:#e2c997}
#socialPanel .casino-layout{position:relative;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(210px,.85fr);gap:18px;align-items:stretch}
#socialPanel .slot-machine{height:100%;padding:clamp(12px,2vw,25px);background:linear-gradient(130deg,#59442c,#211b17 18%,#38281c 80%,#120e0b);border:6px ridge #a77a3d;border-radius:18px;box-shadow:inset 0 0 0 2px #1a120b,0 8px 0 #110d09,0 20px 32px #0008}
#socialPanel .slot-topline{font:900 17px Impact,sans-serif;letter-spacing:.14em;color:#e8bb6b}
#socialPanel .slot-reels{margin:16px auto;gap:8px;max-width:520px;padding:10px;background:#0d0d0d;border:4px solid #765329;box-shadow:inset 0 8px 20px #000;perspective:650px}
#socialPanel .slot-reel{position:relative;height:clamp(100px,15vw,160px);font-size:clamp(36px,6vw,70px);background:linear-gradient(#b7a98c,#f7edcc 30%,#fff3d1 49%,#d4c3a2 75%,#8f806a);border:2px solid #5b4429;border-radius:7px;box-shadow:inset 0 16px 15px #241a1744,inset 0 -16px 15px #241a1744;overflow:hidden;transform:rotateX(0)}
#socialPanel .reel-strip{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:0;transform:translateY(0);font-family:system-ui;line-height:1}
#socialPanel .reel-strip span{display:grid;place-items:center;flex:0 0 80%;height:80%;filter:drop-shadow(2px 4px 2px #0004)}
#socialPanel .slot-reel.spinning{animation:none;filter:none}
#socialPanel .slot-reel.spinning .reel-strip{animation:casinoRoll .13s linear infinite;filter:blur(2px)}
@keyframes casinoRoll{0%{transform:translateY(-38%) rotateX(17deg)}100%{transform:translateY(38%) rotateX(-17deg)}}
#socialPanel .slot-result{font:900 clamp(16px,2.5vw,22px) Impact,sans-serif;color:#e8bd75;letter-spacing:.05em;min-height:32px}
#socialPanel .slot-result.winner{color:#ffe666;text-shadow:0 0 20px #ffb400}
#socialPanel .slot-balance{margin:12px 0 8px;color:#f2d6a1;font-weight:700}
#socialPanel .bet-label{font-size:11px;letter-spacing:.15em;color:#c3a16d}
#socialPanel .slot-controls{margin:8px 0;gap:9px;flex-wrap:nowrap}
#socialPanel .slot-controls input{max-width:130px;text-align:center;font-weight:900;font-size:20px}
#socialPanel .slot-controls button{min-width:52px;font-size:22px}
#socialPanel .spin-line{margin-top:10px}
#socialPanel .spin-line button{width:100%;font:900 17px Impact,sans-serif;letter-spacing:.08em;background:linear-gradient(#ffc04d,#ce8423);border:2px solid #57380e;min-height:54px}
#socialPanel .casino-note{margin-top:12px;color:#c5a778;font-size:11px}
#socialPanel .paytable{background:linear-gradient(155deg,#e4d0a2,#bfa16e);border:4px double #49331f;border-radius:10px;color:#2c2118;padding:15px;box-shadow:5px 6px 0 #120d08}
#socialPanel .paytable h3{font:900 23px Impact,sans-serif;letter-spacing:.05em;color:#302015;text-align:center;border-bottom:3px double #624c2d;padding-bottom:9px;margin:0 0 10px}
#socialPanel .pay-header,#socialPanel .pay-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid #8b744f}
#socialPanel .pay-header{font-size:10px;letter-spacing:.08em;font-weight:800}
#socialPanel .pay-row b{font:900 22px Impact,sans-serif;color:#6a2b19}
#socialPanel .pay-symbol{font-size:clamp(19px,2.5vw,27px);white-space:nowrap}
#socialPanel .pay-foot{font-size:11px;line-height:1.6;padding-top:12px;color:#5e4730}
#socialPanel .world-card:has(.casino-stage){background:transparent;border:0;padding:0}
@media(max-width:800px){#socialPanel .casino-layout{grid-template-columns:1fr}#socialPanel .paytable{max-width:none}#socialPanel .paytable .pay-row{padding:6px}#socialPanel .casino-stage{padding:12px}#socialPanel .casino-banner{margin-bottom:14px}}
@media(max-width:380px){#socialPanel .slot-reel{height:100px}#socialPanel .reel-strip span{font-size:36px}#socialPanel .slot-controls button{min-width:44px}}
@media(prefers-reduced-motion:reduce){#socialPanel .slot-reel.spinning .reel-strip{animation-duration:.4s}}

/* Inked illustrated environments and restrained motion across every screen. */
:root{--bg:#151a1c;--panel:#2b2925;--panel-2:#3a3530;--line:#71583b;--ink:#f4e6c9;--muted:#c1ad8f;--amber:#edae3c}
body{background-color:#151a1c!important;background-image:linear-gradient(180deg,#cba77612,#11191edb),repeating-linear-gradient(0deg,#0000 0 6px,#00000014 6px 7px),linear-gradient(115deg,#35434b 0 25%,#202b30 25% 46%,#4d4438 46% 67%,#1a2429 67%)!important;background-attachment:fixed!important;transition:background-color 1.5s,color .6s}
html[data-game-time=day] body{background-color:#84908b!important;background-image:linear-gradient(180deg,#e7c69a55,#1a2429bd),repeating-linear-gradient(0deg,#0000 0 6px,#00000013 6px 7px),linear-gradient(115deg,#8d9e9c 0 25%,#596f73 25% 46%,#ad9375 46% 67%,#607778 67%)!important}
html[data-game-time=night] body{background-color:#09111b!important;background-image:linear-gradient(180deg,#081526e8,#162331a8),repeating-linear-gradient(0deg,#0000 0 6px,#00000022 6px 7px),linear-gradient(115deg,#111b28 0 25%,#1b2936 25% 46%,#272c2d 46% 67%,#0c1926 67%)!important}
#gameClockBadge{position:fixed;right:12px;top:calc(9px + env(safe-area-inset-top,0px));z-index:8000;padding:6px 11px;border:1px solid #a07a43;background:#1a1d1de8;color:#ffdb8d;border-radius:8px;box-shadow:2px 3px #090a0a;font:700 11px system-ui;letter-spacing:.05em;pointer-events:none}
.hud,.card,.paper,#socialPanel .world-card,#socialPanel .spbox{background-image:repeating-linear-gradient(120deg,#fff2 0 1px,transparent 1px 19px),linear-gradient(145deg,#3e3529,#1b2225)!important;box-shadow:0 7px 0 #110e0b,0 15px 32px #0006!important;transition:transform .25s,box-shadow .25s,background-color 1s}
.card,.paper,#socialPanel .world-card{animation:inkReveal .4s ease-out both}
@keyframes inkReveal{from{opacity:.25;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes neonBreath{0%,100%{text-shadow:0 0 5px #f2b44d55}50%{text-shadow:0 0 19px #f2b44d99}}
#socialPanel .casino-banner strong{animation:neonBreath 3s ease-in-out infinite}
#socialPanel .world-card:hover{box-shadow:0 10px 0 #110e0b,0 22px 35px #0008!important}
.btn,.tab,#socialPanel button{transition:filter .18s,transform .18s,background .3s!important}
.btn:active,.tab:active,#socialPanel button:active{transform:translateY(2px) scale(.985)!important}
#socialPanel .spbox{background-color:#211d18!important}
#socialPanel .world-card{background-color:#27231f!important}
#socialPanel .world-job{border:2px solid #70563b;background:linear-gradient(150deg,#38312a,#201e1b);box-shadow:inset 0 1px #ffffff13}
#socialPanel .paytable{background-image:repeating-linear-gradient(5deg,#0000 0 9px,#3b231014 9px 10px),linear-gradient(#e8d5a7,#bda16c)!important}
html[data-game-time=night] .scene{box-shadow:0 0 28px #e6a34a36,0 8px 0 #100d0a!important}
html[data-game-time=day] .scene{box-shadow:0 0 22px #f8d49d52,0 8px 0 #100d0a!important}
@media(max-width:700px){#gameClockBadge{top:auto;bottom:calc(73px + env(safe-area-inset-bottom,0px));right:8px;font-size:10px}#socialPanel .spbox{height:100dvh!important}}
@media(prefers-reduced-motion:reduce){.card,.paper,#socialPanel .world-card,#socialPanel .casino-banner strong{animation:none!important}*{scroll-behavior:auto!important}}

`;
const animCss=document.createElement('style');animCss.textContent=`#socialPanel .work-anim{display:flex;justify-content:space-around;align-items:center;background:linear-gradient(125deg,#4b3523,#191510);border:2px solid #987047;border-radius:9px;padding:18px;margin:12px 0;overflow:hidden}#socialPanel .work-anim span{font-size:clamp(32px,6vw,62px);animation:workBob 1.6s ease-in-out infinite alternate}#socialPanel .work-anim span:nth-child(2){animation-delay:.35s}#socialPanel .work-anim span:nth-child(3){animation-delay:.7s}#socialPanel .work-anim.working{box-shadow:inset 0 0 30px #f6ae3b66}@keyframes workBob{to{transform:translateY(-12px) rotate(8deg)}}@media(prefers-reduced-motion:reduce){#socialPanel .work-anim span{animation:none}}`;document.head.append(animCss);
const style=document.createElement('style');style.textContent=css;document.head.append(style);
// UTC+2 is deliberately fixed, independently of the visitor's device timezone.
const GAME_OFFSET_HOURS=2;
function gameClock(){const d=new Date(Date.now()+GAME_OFFSET_HOURS*3600000);return {hour:d.getUTCHours(),minute:d.getUTCMinutes()}}
function syncVisualClock(){const {hour,minute}=gameClock(),night=hour>=20||hour<6;document.documentElement.dataset.gameTime=night?'night':'day';let badge=document.getElementById('gameClockBadge');if(!badge){badge=document.createElement('div');badge.id='gameClockBadge';document.body.appendChild(badge)}badge.textContent=(night?'🌙 НІЧ':'☀ ДЕНЬ')+' · '+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+' · UTC+2'}
setInterval(syncVisualClock,15000);syncVisualClock();
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest=null,busy=false;
// Stable hand-drawn SVG symbols replace platform-dependent emoji glyphs.
const sym=['cherry','lemon','star','medal','diamond','seven'];
const symbolName=['Вишні','Лимон','Зірка','Медаль','Діамант','Сімка'];
function slotIcon(index){const i=((Number(index)||0)%sym.length+sym.length)%sym.length;return `<img class="uhy-slot-icon" src="assets/casino-${sym[i]}.svg" width="70" height="70" alt="${symbolName[i]}" draggable="false">`}

const payout=[1.2,2,3,5,12,60];
const body=()=>document.getElementById('spBody');
const card=(title,inner,wide=false)=>`<section class="world-card ${wide?'world-wide':''}"><h3>${title}</h3>${inner}</section>`;
const btn=(name,action,extra='')=>`<button data-wact="${action}" ${extra}>${name}</button>`;
function panel(title,html){body().innerHTML=`<h2>${title}</h2>${html}`;body().querySelectorAll('[data-wact]').forEach(b=>b.addEventListener('click',()=>act(b)));}
function credentials(){try{return JSON.parse(localStorage.getItem('vt_net')||'{}')}catch{return {}}}
async function api(payload){if(window.UHY?.sync&&!await window.UHY.sync())throw Error('Спочатку дочекайтесь збереження профілю');const t=credentials();if(!t.id||!t.key)throw Error('Увійдіть до акаунта');const r=await fetch('/api/world',{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-id':t.id,'x-key':t.key},body:payload?JSON.stringify(payload):undefined});const d=await r.json();if(!d.ok)throw Error(d.err||'Помилка сервера');window.UHY?.applyWallet?.(d);d._clockOffset=(Number(d.serverNow)||Date.now())-Date.now();return d}
const wheelTick=()=>{const label=document.getElementById('uhyWheelNext');if(label&&window.UHY_WHEEL){const w=window.UHY_WHEEL;const ms=Math.max(0,(w.nextAt||0)-(Date.now()+(w.clockOffset||0)));label.textContent=ms?('Наступна спроба: '+fmtDuration(ms)):'Можна крутити!';const b=document.getElementById('uhyWheelSpin');if(b&&!b.dataset.spinning)b.disabled=!!ms;}};
setInterval(wheelTick,1000);
function fmtDuration(ms){const seconds=Math.ceil(Math.max(0,ms)/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;return [h,m,sec].map(x=>String(x).padStart(2,'0')).join(':')}
async function wheelApi(spin=false){if(window.UHY?.sync&&!await window.UHY.sync())throw Error('Не вдалося зберегти профіль');const t=credentials();if(!t.id||!t.key)throw Error('Вхід у Telegram / акаунт необхідний для бонусу');const r=await fetch('/api/daily-wheel',{method:spin?'POST':'GET',headers:{'content-type':'application/json','x-id':t.id,'x-key':t.key}});const v=await r.json();if(!r.ok||!v.ok)throw Error(v.err||'Не вдалося відкрити колесо');window.UHY?.applyWallet?.(v);return v}
function wheelGradient(prizes){const palette=['#ebad41','#ae7840','#d18c40','#4e775e','#5a8bb9','#617b8d','#85699c','#ad6a34','#ffd075'];let cursor=0;return 'conic-gradient('+prizes.map((p,i)=>{const start=cursor;cursor+=p.chance;return `${palette[i]} ${start}% ${cursor}%`}).join(',')+')'}
function wheelCenter(prizes,id){let before=0;for(const p of prizes){if(p.id===id)return (before+p.chance/2)*3.6;before+=p.chance}return 0}
function renderWheel(w){const rewards=w.rewards||[],recent=w.lastSpin?.reward;const notice=recent?`<p class="uhy-wheel-recent">Останній бонус: <b>${e(recent.label)}</b>. Отримано на сервері, не загубиться після виходу.</p>`:'<p class="world-muted">Крути раз на 24 години. Результат зберігається на сервері відразу після натискання.</p>';panel('🎡 Щоденне колесо удачі',`<div class="uhy-wheel-page"><div class="uhy-wheel-main"><div class="uhy-wheel-pointer" aria-hidden="true"></div><div class="uhy-wheel-disc" id="uhyWheelDisc" style="background:${wheelGradient(rewards)}"><div class="uhy-wheel-dots"></div><div class="uhy-wheel-center"><strong>УХИЛЯНТ</strong><small>ЩОДЕННИЙ БОНУС</small></div></div><p id="uhyWheelNext" aria-live="polite"></p>${btn('🎯 Крутити колесо','wheelSpin','id="uhyWheelSpin"')}<div class="uhy-wheel-result" id="uhyWheelResult" aria-live="polite">${notice}</div></div><div class="uhy-wheel-odds"><h3>СЕКТОРИ Й ШАНСИ</h3>${rewards.map(p=>`<div class="uhy-wheel-prize ${e(p.tier)}"><span>${e(p.emoji)}</span><b>${e(p.label)}</b><small>${p.chance.toFixed(1)}%</small></div>`).join('')}<p class="world-muted">Площа кожного сектора пропорційна шансу. Рідкісна преміальна річ випадає з імовірністю 0,1%. Усі винагороди — ігрові.</p></div></div>`);wheelTick();}
async function openWheel(){const outer=document.getElementById('socialPanel');if(!body()||!outer)return;outer.style.display='flex';outer.classList.add('uhy-wheel-mode');outer.classList.remove('uhy-casino-mode');panel('Колесо','<p>Завантаження сервера…</p>');try{const w=await wheelApi();window.UHY_WHEEL={...w,clockOffset:(w.serverNow||Date.now())-Date.now()};renderWheel(w)}catch(err){panel('Колесо · помилка','<p>'+e(err.message)+'</p>')}}
async function spinWheel(btn){if(btn.dataset.spinning)return;btn.dataset.spinning='1';btn.disabled=true;try{const result=await wheelApi(true);const cur=window.UHY_WHEEL||{};window.UHY_WHEEL={...result,clockOffset:(result.serverNow||Date.now())-Date.now()};if(result.save&&window.UHY?.applyWheelSave)window.UHY.applyWheelSave(result.save);const disc=document.getElementById('uhyWheelDisc');if(!disc)return;const angle=wheelCenter(result.rewards,result.spin?.originalId||result.spin?.reward?.id);disc.style.transition='none';disc.style.transform='rotate(0deg)';void disc.offsetWidth;const duration=window.matchMedia('(prefers-reduced-motion:reduce)').matches?0:4300;disc.style.transition=`transform ${duration}ms cubic-bezier(.12,.71,.17,1)`;disc.style.transform='rotate('+(360*(duration?7:0)-angle)+'deg)';const resultPanel=document.getElementById('uhyWheelResult');if(resultPanel){resultPanel.innerHTML='<strong>🎯 Визначаємо нагороду…</strong>'}await new Promise(done=>setTimeout(done,duration+60));if(resultPanel){resultPanel.innerHTML='<div class="uhy-wheel-award">'+e(result.spin?.reward?.emoji||'🎁')+' '+e(result.spin?.reward?.label||'Нагорода')+'</div><p>Нараховано на сервері. Наступний оберт через 24 години.</p>';}wheelTick();}catch(err){alert(err.message);try{const w=await wheelApi();window.UHY_WHEEL={...w,clockOffset:(w.serverNow||Date.now())-Date.now()};renderWheel(w)}catch{}}finally{delete btn.dataset.spinning;wheelTick();}}
async function show(which){if(!body())return;document.getElementById('socialPanel')?.classList.remove('uhy-wheel-mode');panel('Завантаження…','');try{latest=await api();render(which)}catch(err){panel('Не вдалося завантажити','<p>'+e(err.message)+'</p>')}}
function render(which){try{window.UHY&&UHY.setHouse(latest.world?.housing?.current)}catch(e){}const {world:w={},gear={},brigade:br,bosses=[],jobs=[],houses=[]}=latest;const info=`<div class="world-stat"><span>💵 ${Number(w.cash||0).toLocaleString('uk-UA')} ₴</span><span>⭐ ${Number(w.xp||0)} XP</span></div><p class="world-muted">${e(w.message||'Усі суми — виключно ігрова валюта.')}</p>`;
if(which==='casino'){
const rows=sym.map((x,i)=>`<div class="pay-row"><span class="pay-symbol" aria-label="${symbolName[i]}">${slotIcon(i)}${slotIcon(i)}${slotIcon(i)}</span><b>×${payout[i]}</b></div>`).join('');
const machine=`<div class="casino-stage"><div class="casino-smoke"></div><div class="casino-banner"><small>ПІДПІЛЬНИЙ КЛУБ · ТІЛЬКИ ІГРОВІ ГРОШІ</small><strong>ВОРОНЯЧИЙ ФАРТ</strong><span>🎰 ТРИ БАРАБАНИ · ОДНА ЛІНІЯ</span></div><div class="casino-layout"><div class="casino-main"><div class="slot-machine"><div class="slot-topline">✦ ВИПРОБУЙ УДАЧУ ✦</div><div class="slot-reels">${[0,1,2].map((_,i)=>`<div class="slot-reel" id="slot${i}"><div class="reel-strip">${slotIcon(0)}</div></div>`).join('')}</div><div class="slot-result" id="slotResult" aria-live="polite">Три однакові — виграш!</div><div class="slot-balance">БАЛАНС: <b id="casinoBalance">${Number(w.cash||0).toLocaleString('uk-UA')} ₴</b></div><div class="bet-label">СТАВКА · ІГРОВІ ₴</div><div class="slot-controls">${btn('−','minus','class="secondary" aria-label="Зменшити ставку"')}<input id="slotBet" type="number" min="10" max="1000" step="10" value="50" aria-label="Ставка">${btn('+','plus','class="secondary" aria-label="Збільшити ставку"')}</div><div class="spin-line">${btn('🎰 КРУТИТИ БАРАБАНИ','spin')}</div><div class="casino-note">Ставка 10–1000 ₴ · лише віртуальна валюта</div></div></div><aside class="paytable"><h3>ТАБЛИЦЯ ВИПЛАТ</h3><div class="pay-header"><span>КОМБІНАЦІЯ</span><span>ВИПЛАТА</span></div>${rows}<div class="pay-foot">Виплата включає ставку. Інші комбінації — ×0.<br>Малі ставки (10–50 ₴): 38% шанс виграшу.<br>Середні (51–200 ₴): 27%; великі: 18%.<br>Переважно дрібні виплати. Джекпот дуже рідкісний.<br>Результат визначає сервер; довгостроковий прибуток не гарантовано.</div></aside></div></div>`;
panel('🎰 Казино · Воронячий фарт',info+card('',machine,true));return}
const offers=(jobs||[]).map(j=>`<div class="world-job"><b>${e(j.name)}</b><small>₴${j.cash} · ${j.xp} XP · ${j.risk}% ризик відмови</small><small>${j.locked?'🔒 Потрібно '+j.minDays+' робочих днів та '+j.minXP+' XP':'✅ Доступна вакансія'}</small>${btn(w.employment?.id===j.id?'Працевлаштовано':j.locked?'Ще не доступно':'Подати заявку','apply',`data-job="${e(j.id)}" ${w.employment?.id===j.id||j.locked?'disabled':''}`)}</div>`).join('');
const work=card('💼 Біржа праці',`<p>Початкові роботи оплачуються менше. Кращі відкриваються за робочі дні й досвід. Вакансії змінюються кожні 20 хвилин. Спочатку пройди співбесіду — можуть відмовити через репутацію, зовнішність або конкуренцію.</p><div class="world-list">${offers||'<p>Немає вакансій</p>'}</div>${w.employment?`<p>Поточна робота: <b>${e(w.employment.name)}</b></p><div class="work-anim ${w.workShift?'working':''}" aria-label="Робоча зміна"><span>👷</span><span>🧰</span><span>📦</span></div><p id="uhyWorkTimer" data-ends="${Number(w.workShift?.endsAt||0)}">${w.workShift?'Зміна триває…':'Готовий до роботи'}</p><div class="world-actions">${w.workShift?btn('Забрати зарплату','workCollect','id="uhyWorkClaim"'):btn('Розпочати зміну','shift')}${btn('Звільнитися','quit',`class="secondary" ${w.workShift?'disabled':''}`)}</div>`:''}<p class="world-muted">Зміна 60–135 секунд за серверним часом. Закриття Telegram не обнуляє таймер; після завершення забери зарплату. Нова зміна — через 5 хвилин.</p>`);
const inventory=card('🎒 Інвентар',`<div class="world-inventory">${(w.items||[]).map(id=>btn(e(gear[id]?.name||id),'equip',`data-item="${e(id)}"`)).join('')||'<p>Поки порожньо</p>'}</div><p>Одягнуто: ${Object.values(w.equipped||{}).map(id=>e(gear[id]?.name||id)).join(', ')||'нічого'}</p>`);
const sel=(id,opts,v)=>`<select id="${id}">${opts.map(([a,b])=>`<option value="${a}" ${a===v?'selected':''}>${b}</option>`).join('')}</select>`;
const looks=card('👤 Зовнішність','<p>Обличчя, зачіска, борода, тату, готові образи та локація — у редакторі персонажа.</p><div class="world-actions">'+btn('✎ Редактор персонажа','editHero')+btn('📍 Локації','editLoc','class="secondary"')+'</div>');
const nt=latest.night||{active:false,hour:12,minute:0,tasks:[],cooldownMs:0};
const clock=String(nt.hour).padStart(2,'0')+':'+String(nt.minute).padStart(2,'0');
const night=card('🌙 Комендантська година · Нічні справи',`<div class="night-clock"><strong>${clock}</strong><span>${nt.active?'🌘 Нічний режим активний':'☀️ Денний режим'}</span></div><p>Ігровий час: Київ. Комендантська година у світі гри — 00:00–05:00. Нічні завдання мають менший ризик невдачі, але доступні тільки вночі.</p><div class="world-list">${(nt.tasks||[]).map(j=>`<div class="world-job"><b>${e(j.name)}</b><small>${e(j.desc)} · +${j.cash} ₴ · +${j.xp} XP</small><small>Ризик ${j.risk}% · шанс знахідки 9%</small>${btn('Виконати','nightTask',`data-task="${e(j.id)}" ${!nt.active||nt.cooldownMs>0?'disabled':''}`)}</div>`).join('')}</div><p class="world-muted">${nt.active?(nt.cooldownMs>0?'Відпочинок: ще '+Math.ceil(nt.cooldownMs/1000)+' с':'Можна виконати нічне завдання'):'Нічні справи відкриються о 00:00'} · Пауза між завданнями 4 хв.</p>`,true);
const house=w.housing||{current:'shack',owned:['shack']};
const housePanel=card('🏠 Моя хата · житло та бонуси',`<p>Кожен починає з халупи. Нові хати купуються за ігрові гроші або відкриваються за рівень і перемоги.</p><div class="world-list">${houses.map(h=>`<div class="world-job uhy-house-tile ${house.current===h.id?'is-current':''}"><div class="uhy-house-preview" aria-hidden="true">${window.UHY?.houseThumb?.(h.id)||'🏠'}</div><b>${e(h.name)} ${house.current===h.id?'🏠':''}</b><small>${e(h.bonus)} · від ${h.level} рівня</small><small>${house.owned.includes(h.id)?'У власності':h.price+' ₴ або за заслуги'}</small>${house.owned.includes(h.id)?btn('Оселитися','houseEquip',`data-house="${e(h.id)}" ${house.current===h.id?'disabled':''}`):`<div class="world-actions">${btn('Купити','houseBuy',`data-house="${e(h.id)}"`)}${btn('За заслуги','houseClaim',`data-house="${e(h.id)}" class="secondary"`)}</div>`}</div>`).join('')}</div><p class="world-muted">За заслуги: рівень + активність; для квартир від 2, 8 та 20 перемог над босами відповідно. Бонуси житла показані як ігрові характеристики.</p>`,true);
if(which==='housing'){
  const hp=Math.max(0,Math.min(100,Number(w.health??100))),hospitalReady=Math.max(0,4*3600000-(Date.now()-Number(w.lastHospital||0)));
  const healthCard=card('🏥 Лікарня і здоровʼя',`<p>❤️ Здоровʼя персонажа: <b>${hp}/100 HP</b></p><div class="care-track"><span style="width:${hp}%;background:linear-gradient(90deg,#d17e54,#86ba78)"></span></div><p class="world-muted">Після затримань та небезпечних ситуацій здоровʼя може зменшуватися. Лікування коштує 320 ігрових ₴ та доступне раз на 4 години.</p>${btn(hospitalReady?'Лікарня через '+Math.ceil(hospitalReady/60000)+' хв':'Відновити +45 HP · 320 ₴','hospital',hospitalReady||hp>=100?'disabled':'')}`);
  panel('🏠 Хати · Мій район',info+`<div class="world-grid">${housePanel}${healthCard}${card('✎ Персонаж', '<p>Змінюй шкіру, волосся, бороду, одяг та локацію у редакторі головної сцени.</p>'+btn('Відкрити редактор персонажа','editHero'))}</div>`);return
 }
const brigade=card('⚔ Бригада та боси',br?`<p><b>${e(br.name)}</b> · код ${e(br.id)} · ${br.members.length}/8</p><p>${br.members.map(m=>e(m.name)).join(', ')}</p><p>🔑 Ключі бригади: <b>${Math.max(0,Number(br.keys)||0)}</b> · активний бос: <b>${e(br.fight?.boss||'не обраний')}</b> · HP ${br.fight?.hp??'—'}</p><div class="world-actions">${bosses.map((x,i)=>`<div class="uhy-raid-boss"><div class="uhy-raid-art" aria-hidden="true">${window.UHY?.bossPortrait?.(i===0?0:i===1?2:5,br.fight?.boss===x.id?Math.min(3,Math.floor(4*(1-br.fight.hp/(br.fight.maxHp||x.hp)))):0)||'⚔'}</div><div><b>${e(x.name)}</b><small>${Number(x.hp).toLocaleString('uk-UA')} HP · ${[0,2,4][i]} 🔑 для відкриття</small></div>${btn('⚔ Атакувати','fight',`data-boss="${e(x.id)}"`)}</div>`).join('')}</div>`:`<input id="spBrigade" placeholder="Назва бригади або код запрошення" maxlength="24"><div class="world-actions">${btn('Створити','create')}${btn('Увійти за кодом','join','class="secondary"')}</div>`);
const daily=card('🎁 Щоденний бонус',`<p>Одна спроба кожні 24 години. Випадкова нагорода: гроші, досвід або рідкісна річ.</p><div class="world-actions">${btn('🎡 Відкрити колесо','daily')}</div>`);
panel('🏙 Вулиця · Робота та спорядження',info+`<div class="world-grid">${night}${work}${daily}${inventory}${looks}${brigade}</div>`)}
async function act(el){const action=el.dataset.wact;if(action==='daily'){await openWheel();return}if(action==='wheelSpin'){await spinWheel(el);return}if(action==='editHero'){document.getElementById('socialPanel').style.display='none';window.UHY&&UHY.editor();return}if(action==='editLoc'){document.getElementById('socialPanel').style.display='none';window.UHY&&UHY.locs();return}if(action==='minus'||action==='plus'){const x=document.getElementById('slotBet');x.value=Math.max(10,Math.min(1000,(Number(x.value)||50)+(action==='plus'?10:-10)));return}if(busy)return;busy=true;try{let p={action};if(action==='apply')p.job=el.dataset.job;if(action==='nightTask')p.task=el.dataset.task;if(action==='equip')p.item=el.dataset.item;if(action==='fight')p.boss=el.dataset.boss;if(action.startsWith('house'))p.house=el.dataset.house;if(action==='look'){p.hair=document.getElementById('spHair').value;p.beard=document.getElementById('spBeard').value;p.skin=document.getElementById('spSkin').value}if(action==='create')p.name=document.getElementById('spBrigade').value;if(action==='join')p.id=document.getElementById('spBrigade').value;
if(action==='spin'){
p.action='slots';p.bet=Number(document.getElementById('slotBet').value);
const reels=[0,1,2].map(i=>document.getElementById('slot'+i));
const spinButton=el;spinButton.disabled=true;
const timers=reels.map((r,i)=>{r.classList.add('spinning');return setInterval(()=>{const v=Math.floor(Math.random()*sym.length);r.querySelector('.reel-strip').innerHTML=slotIcon(v)},55+i*22)});
let result;try{result=await api(p);const roll=result.world?.lastSpin;if(!roll)throw Error('Немає результату');for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,380+i*190));clearInterval(timers[i]);reels[i].classList.remove('spinning');const v=roll.reels[i];reels[i].querySelector('.reel-strip').innerHTML=slotIcon(v);}latest=result;const delta=roll.win-roll.bet;document.getElementById('slotResult').textContent=roll.win?`ВИГРАШ ${roll.win} ₴ (чистими +${delta} ₴)`:`ПРОГРАШ −${roll.bet} ₴`;document.getElementById('slotResult').classList.toggle('winner',!!roll.win);document.getElementById('casinoBalance').textContent=Number(result.world.cash).toLocaleString('uk-UA')+' ₴';const st=body().querySelector('.world-stat');if(st)st.firstElementChild.textContent='💵 '+Number(result.world.cash).toLocaleString('uk-UA')+' ₴';}finally{timers.forEach(clearInterval);reels.forEach(r=>r.classList.remove('spinning'));spinButton.disabled=false}return}
latest=await api(p);
if(action==='houseEquip'||action==='houseBuy'||action==='houseClaim'){
 window.UHY&&UHY.setHouse(latest.world?.housing?.current);
}
render(action.startsWith('house')?'housing':'world')}catch(err){alert(err.message)}finally{busy=false}}
setInterval(()=>{const el=document.getElementById('uhyWorkTimer');if(!el)return;const ends=Number(el.dataset.ends||0),serverNow=Date.now()+Number(latest?._clockOffset||0);const left=ends-serverNow;el.textContent=ends?(left>0?'⏳ Зміна: '+fmtDuration(left):'✅ Зміна завершена — забери оплату'):'Готовий до роботи';const claim=document.getElementById('uhyWorkClaim');if(claim)claim.disabled=!!(ends&&left>0);},1000);
window.UHYUI={show,openWheel};
})();
