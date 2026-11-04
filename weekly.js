(()=>{
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let opened=false;
async function refresh(){
 const token=JSON.parse(localStorage.getItem('vt_net')||'{}');
 const r=await fetch('/api/weekly',{headers:{'x-id':token.id||'','x-key':token.key||''}});const data=await r.json();
 document.querySelectorAll('#uhyMore button').forEach(b=>{if(b.textContent.includes('Тижнева ліга'))b.hidden=!data.active;});
 if(!opened)return;
 const body=document.getElementById('spBody');if(!body)return;
 if(!data.ok){body.textContent=data.err||'Не вдалося завантажити лігу';return;}
 if(!data.active){body.innerHTML='<h2>Тижневу лігу завершено</h2><p>Неділя — день відпочинку. Нова ліга відкриється в понеділок.</p>';return;}
 const goal=[100,300,600,1000].find(n=>n>data.score)||1000;
 body.innerHTML='<h2>🏅 Ліга живого міста</h2><p>До неділі 00:00 за Києвом · новий старт щопонеділка</p><div class="card"><h3>'+data.score+' очок · '+(data.score>=1000?'Легенда':data.score>=600?'Золото':data.score>=300?'Срібло':data.score>=100?'Бронза':'Новачок')+'</h3><progress max="'+goal+'" value="'+data.score+'" style="width:100%"></progress><p>Наступна особиста ціль: '+goal+' очок</p></div><p>Завершена зміна: +20 (перші 5 за день). Удар по босу бригади: +10 (перші 10 за день). Покупки та ставки очок не дають. Пропущений день не забирає досягнуте.</p><h3>Рейтинг тижня</h3>'+data.list.map(p=>'<div class="spitem"><b>#'+p.rank+' '+esc(p.name)+'</b><span style="float:right">'+p.score+' очок</span></div>').join('');
}
window.UHYWeekly={open(){opened=true;const panel=document.getElementById('socialPanel');panel.classList.remove('uhy-casino-mode','uhy-wheel-mode','uhy-view-profile');panel.style.display='flex';document.getElementById('spBody').innerHTML='<p>Завантаження ліги…</p>';refresh().catch(()=>{document.getElementById('spBody').textContent='Немає зв’язку. Спробуйте ще раз.'});}};
document.addEventListener('click',e=>{if(e.target.closest('#socialDock,#spClose,#uhyMore'))opened=false;},true);
setInterval(()=>refresh().catch(()=>{}),15000);
})();
