/* Responsive world and casino screens. Uses existing account token and /api/world. */
(()=>{'use strict';
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

`;
const style=document.createElement('style');style.textContent=css;document.head.append(style);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest=null,busy=false;
const sym=['🍒','🍋','⭐','🎖️','💎','7️⃣'];
const payout=[6,8,10,15,25,60];
const body=()=>document.getElementById('spBody');
const card=(title,inner,wide=false)=>`<section class="world-card ${wide?'world-wide':''}"><h3>${title}</h3>${inner}</section>`;
const btn=(name,action,extra='')=>`<button data-wact="${action}" ${extra}>${name}</button>`;
function panel(title,html){body().innerHTML=`<h2>${title}</h2>${html}`;body().querySelectorAll('[data-wact]').forEach(b=>b.addEventListener('click',()=>act(b)));}
function credentials(){try{return JSON.parse(localStorage.getItem('vt_net')||'{}')}catch{return {}}}
async function api(payload){const t=credentials();if(!t.id||!t.key)throw Error('Увійдіть до акаунта');const r=await fetch('/api/world',{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-id':t.id,'x-key':t.key},body:payload?JSON.stringify(payload):undefined});const d=await r.json();if(!d.ok)throw Error(d.err||'Помилка сервера');return d}
async function show(which){if(!body())return;panel('Завантаження…','');try{latest=await api();render(which)}catch(err){panel('Не вдалося завантажити','<p>'+e(err.message)+'</p>')}}
function render(which){const {world:w={},gear={},brigade:br,bosses=[],jobs=[]}=latest;const info=`<div class="world-stat"><span>💵 ${Number(w.cash||0).toLocaleString('uk-UA')} ₴</span><span>⭐ ${Number(w.xp||0)} XP</span></div><p class="world-muted">${e(w.message||'Усі суми — виключно ігрова валюта.')}</p>`;
if(which==='casino'){
const rows=sym.map((x,i)=>`<div class="pay-row"><span class="pay-symbol">${x} ${x} ${x}</span><b>×${payout[i]}</b></div>`).join('');
const machine=`<div class="casino-stage"><div class="casino-smoke"></div><div class="casino-banner"><small>ПІДПІЛЬНИЙ КЛУБ · ТІЛЬКИ ІГРОВІ ГРОШІ</small><strong>ВОРОНЯЧИЙ ФАРТ</strong><span>🎰 ТРИ БАРАБАНИ · ОДНА ЛІНІЯ</span></div><div class="casino-layout"><div class="casino-main"><div class="slot-machine"><div class="slot-topline">✦ ВИПРОБУЙ УДАЧУ ✦</div><div class="slot-reels">${[0,1,2].map((_,i)=>`<div class="slot-reel" id="slot${i}"><div class="reel-strip"><span>🍒</span><span>🍋</span><span>⭐</span></div></div>`).join('')}</div><div class="slot-result" id="slotResult" aria-live="polite">Три однакові — виграш!</div><div class="slot-balance">БАЛАНС: <b id="casinoBalance">${Number(w.cash||0).toLocaleString('uk-UA')} ₴</b></div><div class="bet-label">СТАВКА · ІГРОВІ ₴</div><div class="slot-controls">${btn('−','minus','class="secondary" aria-label="Зменшити ставку"')}<input id="slotBet" type="number" min="10" max="1000" step="10" value="50" aria-label="Ставка">${btn('+','plus','class="secondary" aria-label="Збільшити ставку"')}</div><div class="spin-line">${btn('🎰 КРУТИТИ БАРАБАНИ','spin')}</div><div class="casino-note">Ставка 10–1000 ₴ · лише віртуальна валюта</div></div></div><aside class="paytable"><h3>ТАБЛИЦЯ ВИПЛАТ</h3><div class="pay-header"><span>КОМБІНАЦІЯ</span><span>ВИПЛАТА</span></div>${rows}<div class="pay-foot">Виплата включає ставку. Інші комбінації — ×0.<br>Шанс будь-якої трійки: 2,78%. Джекпот 7️⃣: 0,46%.<br>Середнє повернення: 57,4% ставок.</div></aside></div></div>`;
panel('🎰 Казино · Воронячий фарт',info+card('',machine,true));return}
const offers=(jobs||[]).map(j=>`<div class="world-job"><b>${e(j.name)}</b><small>₴${j.cash} · ${j.xp} XP · ${j.risk}% ризик відмови</small>${btn(w.employment?.id===j.id?'Працевлаштовано':'Подати заявку','apply',`data-job="${e(j.id)}" ${w.employment?.id===j.id?'disabled':''}`)}</div>`).join('');
const work=card('💼 Біржа праці',`<p>Вакансії змінюються кожні 20 хвилин. Спочатку пройди співбесіду — можуть відмовити через репутацію, зовнішність або конкуренцію.</p><div class="world-list">${offers||'<p>Немає вакансій</p>'}</div>${w.employment?`<p>Поточна робота: <b>${e(w.employment.name)}</b></p><div class="world-actions">${btn('Відпрацювати зміну','shift')}${btn('Звільнитися','quit','class="secondary"')}</div>`:''}<p class="world-muted">Зміна — раз на 5 хвилин. Невдала співбесіда не списує гроші.</p>`);
const inventory=card('🎒 Інвентар',`<div class="world-inventory">${(w.items||[]).map(id=>btn(e(gear[id]?.name||id),'equip',`data-item="${e(id)}"`)).join('')||'<p>Поки порожньо</p>'}</div><p>Одягнуто: ${Object.values(w.equipped||{}).map(id=>e(gear[id]?.name||id)).join(', ')||'нічого'}</p>`);
const sel=(id,opts,v)=>`<select id="${id}">${opts.map(([a,b])=>`<option value="${a}" ${a===v?'selected':''}>${b}</option>`).join('')}</select>`;
const looks=card('👤 Зовнішність',`<div class="world-fields">${sel('spHair',[['short','Коротка'],['buzz','Під машинку'],['long','Довга']],w.look?.hair)}${sel('spBeard',[['none','Без бороди'],['stubble','Щетина'],['full','Борода']],w.look?.beard)}${sel('spSkin',[['light','Світлий'],['medium','Середній'],['dark','Темний']],w.look?.skin)}</div><div class="world-actions">${btn('Зберегти вигляд','look')}</div>`);
const brigade=card('⚔ Бригада та боси',br?`<p><b>${e(br.name)}</b> · код ${e(br.id)} · ${br.members.length}/8</p><p>${br.members.map(m=>e(m.name)).join(', ')}</p><p>Бос: ${e(br.fight?.boss||'не обраний')} · HP ${br.fight?.hp??'—'}</p><div class="world-actions">${bosses.map(x=>btn(`${e(x.name)} · ${x.hp} HP`,'fight',`data-boss="${e(x.id)}"`)).join('')}</div>`:`<input id="spBrigade" placeholder="Назва бригади або код запрошення" maxlength="24"><div class="world-actions">${btn('Створити','create')}${btn('Увійти за кодом','join','class="secondary"')}</div>`);
const daily=card('🎁 Щоденний бонус',`<p>Одна спроба кожні 24 години. Випадкова нагорода: гроші, досвід або рідкісна річ.</p><div class="world-actions">${btn('🎡 Крутити рулетку','daily')}</div>`);
panel('🏙 Вулиця · Робота та спорядження',info+`<div class="world-grid">${work}${daily}${inventory}${looks}${brigade}</div>`)}
async function act(el){const action=el.dataset.wact;if(action==='minus'||action==='plus'){const x=document.getElementById('slotBet');x.value=Math.max(10,Math.min(1000,(Number(x.value)||50)+(action==='plus'?10:-10)));return}if(busy)return;busy=true;try{let p={action};if(action==='apply')p.job=el.dataset.job;if(action==='equip')p.item=el.dataset.item;if(action==='fight')p.boss=el.dataset.boss;if(action==='look'){p.hair=document.getElementById('spHair').value;p.beard=document.getElementById('spBeard').value;p.skin=document.getElementById('spSkin').value}if(action==='create')p.name=document.getElementById('spBrigade').value;if(action==='join')p.id=document.getElementById('spBrigade').value;
if(action==='spin'){
p.action='slots';p.bet=Number(document.getElementById('slotBet').value);
const reels=[0,1,2].map(i=>document.getElementById('slot'+i));
const spinButton=el;spinButton.disabled=true;
const timers=reels.map((r,i)=>{r.classList.add('spinning');return setInterval(()=>{const v=Math.floor(Math.random()*sym.length);r.querySelector('.reel-strip').innerHTML=`<span>${sym[(v+5)%6]}</span><span>${sym[v]}</span><span>${sym[(v+1)%6]}</span>`},55+i*22)});
let result;try{result=await api(p);const roll=result.world?.lastSpin;if(!roll)throw Error('Немає результату');for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,380+i*190));clearInterval(timers[i]);reels[i].classList.remove('spinning');const v=roll.reels[i];reels[i].querySelector('.reel-strip').innerHTML=`<span>${sym[(v+5)%6]}</span><span>${sym[v]}</span><span>${sym[(v+1)%6]}</span>`;}latest=result;const delta=roll.win-roll.bet;document.getElementById('slotResult').textContent=roll.win?`ВИГРАШ ${roll.win} ₴ (чистими +${delta} ₴)`:`ПРОГРАШ −${roll.bet} ₴`;document.getElementById('slotResult').classList.toggle('winner',!!roll.win);document.getElementById('casinoBalance').textContent=Number(result.world.cash).toLocaleString('uk-UA')+' ₴';const st=body().querySelector('.world-stat');if(st)st.firstElementChild.textContent='💵 '+Number(result.world.cash).toLocaleString('uk-UA')+' ₴';}finally{timers.forEach(clearInterval);reels.forEach(r=>r.classList.remove('spinning'));spinButton.disabled=false}return}
latest=await api(p);render('world')}catch(err){alert(err.message)}finally{busy=false}}
window.UHYUI={show};
})();
