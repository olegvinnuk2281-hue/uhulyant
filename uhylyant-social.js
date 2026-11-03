/* Uhylyant: public player dossiers, player-to-player gifts and secure virtual transfers. */
(()=>{'use strict';
const css=document.createElement('style');css.textContent=`
#uhyDossier{position:fixed;inset:0;z-index:60000;display:none;place-items:center;background:#110f0de9;padding:12px;color:#f7e7c8;font:14px system-ui}
#uhyDossier.open{display:grid}#uhyDossier .dossier-shell{width:min(700px,100%);max-height:95dvh;overflow:auto;background:repeating-linear-gradient(125deg,#ffffff06 0 1px,transparent 1px 26px),linear-gradient(135deg,#3c3024,#1f201e);border:3px solid #bf8b47;border-radius:12px;padding:20px;box-shadow:0 24px 80px #000}
#uhyDossier h2{font:900 32px Impact,system-ui;color:#f9c259;margin:0 0 12px}
#uhyDossier .dossier-header{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:15px}
#uhyDossier .dossier-pic{display:grid;place-items:center;width:125px;height:150px;border:2px solid #aa7e46;background:linear-gradient(#8a8d92,#302d2d);border-radius:9px}
#uhyDossier .dossier-pic svg{width:100px;height:140px}
#uhyDossier .dossier-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#uhyDossier .dossier-stats div{padding:12px 8px;border:1px solid #8a653b;border-radius:6px;background:#171612aa}
#uhyDossier .dossier-stats b{display:block;color:#ffe09c;font-size:20px}
#uhyDossier .dossier-stats small{color:#c6b298}
#uhyDossier button{padding:10px 14px;margin:6px 5px 5px 0;background:#edb047;border:2px solid #795528;border-radius:7px;color:#2b1b0a;font-weight:800;cursor:pointer}
#uhyDossier .secondary{background:#4e4031;color:#fff1d5}
#uhyDossier input{padding:11px;border-radius:7px;border:1px solid #a48259;background:#15120f;color:#fff;font-size:16px;width:140px}
#uhyDossier .notice{min-height:20px;color:#ffcf74}
@media(max-width:500px){#uhyDossier .dossier-shell{padding:12px}#uhyDossier .dossier-stats{grid-template-columns:repeat(2,1fr)}}
`;document.head.append(css);
const modal=document.createElement('div');modal.id='uhyDossier';modal.setAttribute('aria-hidden','true');modal.innerHTML='<div class="dossier-shell" role="dialog" aria-modal="true" aria-labelledby="dossierTitle"><button class="secondary" id="dossierClose" type="button">✕ Закрити</button><div id="dossierMain"></div></div>';document.body.append(modal);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>{try{return JSON.parse(localStorage.getItem('vt_net')||'null')}catch{return null}};
async function api(route,payload){
 const t=token();if(!t?.id)throw Error('Увійди в акаунт');
 const r=await fetch('/api/'+route,{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-id':t.id,'x-key':t.key},body:payload?JSON.stringify(payload):undefined});
 const b=await r.json();if(!b?.ok)throw Error(b?.err||'Дію відхилено');return b;
}
const F=(name,value)=>'<div><b>'+esc(value)+'</b><small>'+esc(name)+'</small></div>';
function portrait(p){
 const sk=['#f2c9a5','#e0a97d','#b9794f','#7a4a2d'][Math.max(0,Math.min(3,p.look?.skin||0))],hair=['#2a1f1a','#6b4a2a','#c9a24a','#b8442c','#8a8f98'][Math.max(0,Math.min(4,p.look?.hair||0))];
 const beard=Math.max(0,Math.min(30,p.beardMm||0));
 return `<svg viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg"><g stroke="#171310" stroke-width="4"><path d="M12 152Q18 92 60 93Q110 92 112 152V170H10Z" fill="#2e3036"/><rect x="51" y="83" width="18" height="28" fill="${sk}"/><ellipse cx="60" cy="58" rx="35" ry="43" fill="${sk}"/><path d="M25 43Q21 10 60 8Q100 10 95 43Q60 28 25 43" fill="${hair}"/><path d="M17 37Q16 18 60 18Q104 18 103 37L110 45Q60 55 10 45Z" fill="#303a49"/><path d="M40 65h9M71 65h9" stroke-width="5"/><path d="M52 80Q60 85 69 80" fill="none" stroke-width="2"/></g>${beard?`<path d="M27 79Q60 ${90+beard} 94 79Q90 97 60 ${93+beard}Q29 95 27 79" fill="#342920" stroke="#201714" stroke-width="2"/>`:''}</svg>`;
}
let viewedId=null;
async function open(id){
 viewedId=id;modal.classList.add('open');modal.setAttribute('aria-hidden','false');const main=document.getElementById('dossierMain');main.textContent='Завантаження…';
 try{const r=await api('player/profile?id='+encodeURIComponent(id)),p=r.player;
  main.innerHTML=`<h2 id="dossierTitle">👤 ${esc(p.name)}</h2><div class="dossier-header"><div class="dossier-pic">${portrait(p)}</div><div><b>Ігровий ID: ${esc(p.id)}</b><p>${p.on?'🟢 Онлайн':'⚪ Офлайн'} · рівень ${Number(p.level||1)}</p><p>🏠 ${esc(p.house)}</p><p>🧔 Борода ${Math.floor(p.beardMm||0)} мм</p></div></div><div class="dossier-stats">${F('Рівень',p.level)}${F('Гроші ₴',Number(p.money||0).toLocaleString('uk-UA'))}${F('Робочі дні',p.workDays)}${F('Зміни',p.shifts)}${F('Боси',p.achievements?.bosses||0)}${F('Джекпоти',p.achievements?.jackpots||0)}${F('Хати',p.achievements?.houses||1)}${F('Спорядження',p.equipment||0)}${F('Досвід',p.xp||0)}</div><div id="dossierActions">${r.self?'<p>Це твій персонаж. Поділись своїм ID із друзями.</p>':r.friends?'<h3>🤝 Обмін між друзями</h3><button id="dossierGift" type="button">🎁 Продуктовий набір — 180 ₴</button><div><input id="dossierSum" type="number" min="10" max="5000" step="10" value="100" aria-label="Сума переказу"><button id="dossierPay" type="button">💸 Переказати ₴</button></div><p>Не більше 5000 ігрових ₴ на добу. Реальні гроші не переказуються.</p>':'<button id="dossierAdd" type="button">➕ Додати у друзі</button>'}</div><p class="notice" id="dossierMsg" role="status"></p>`;
  const msg=()=>document.getElementById('dossierMsg');
  const act=async(route,payload)=>{try{const x=await api(route,payload);msg().textContent=x.message||'Успішно';if(route==='friend/add')document.getElementById('dossierActions').textContent='Запит на дружбу відправлено';}catch(e){msg().textContent=e.message}};
  const gift=document.getElementById('dossierGift');if(gift)gift.onclick=()=>act('friend/gift',{id:p.id});
  const pay=document.getElementById('dossierPay');if(pay)pay.onclick=()=>act('friend/transfer',{id:p.id,amount:Number(document.getElementById('dossierSum').value)});
  const add=document.getElementById('dossierAdd');if(add)add.onclick=()=>act('friend/add',{id:p.id});
 }catch(e){main.textContent=e.message}
}
function close(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
modal.querySelector('#dossierClose').onclick=close;
modal.addEventListener('click',e=>{if(e.target===modal)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
document.addEventListener('click',e=>{const el=e.target.closest('[data-public-profile]');if(el){e.preventDefault();open(el.dataset.publicProfile)}},true);
window.UHY_PROFILE_OPEN=open;
})();
