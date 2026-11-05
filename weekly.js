(()=>{
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let opened=false;
async function refresh(){
 if(!opened)return;
 const token=JSON.parse(localStorage.getItem('vt_net')||'{}');
 const r=await fetch('/api/weekly',{headers:{'x-id':token.id||'','x-key':token.key||''}});const data=await r.json();
 const body=document.getElementById('spBody');if(!body)return;
 if(!data.ok){body.textContent=data.err||'Не вдалося завантажити лігу';return;}
 const goal=[100,300,600,1000].find(n=>n>data.score)||1000;
 const row=p=>'<div class="spitem"><b>#'+p.rank+' '+esc(p.name)+(p.self?' · ти':'')+'</b><span style="float:right">'+p.score+' очок</span><div class="muted">Рівень '+p.level+(p.on?' · онлайн':' · офлайн')+'</div></div>';
 body.innerHTML='<h2>🏅 Ліга живого міста · '+esc(data.division?.name||'Дивізіон')+'</h2><p>'+(data.active?'До неділі 00:00 за Києвом · новий старт щопонеділка':'Тиждень завершено. Таблиця зафіксована; новий раунд відкриється в понеділок.')+'</p><div class="card"><h3>'+data.score+' очок · '+(data.score>=1000?'Легенда':data.score>=600?'Золото':data.score>=300?'Срібло':data.score>=100?'Бронза':'Новачок')+'</h3><progress max="'+goal+'" value="'+data.score+'" style="width:100%"></progress><p>Наступна особиста ціль: '+goal+' очок · місце '+(data.rank||'—')+' із '+data.participants+'</p>'+(data.nextRival?(data.nextRival.leading?'<p>Ти лідируєш. Відрив від найближчого: '+data.nextRival.delta+' очок.</p>':'<p>Щоб обійти '+esc(data.nextRival.name)+', потрібно ще '+data.nextRival.delta+' очок.</p>'):'<p>Ти відкриваєш цей дивізіон!</p>')+'</div><p>Завершена зміна: +20 (перші 5 за день). Удар по босу бригади: +10 (перші 10 за день). Покупки та ставки очок не дають. Пропущений день не забирає вже набрані очки.</p><h3>Рейтинг тижня · твій дивізіон</h3>'+(data.list.length?data.list.map(row).join(''):'<p>Тут поки немає результатів. Зроби перший крок до ліги!')+'<h3>Суперництво з друзями</h3>'+(data.friends?.length?data.friends.map(row).join(''):'<p>Додай друзів, щоб порівнювати результати цього тижня.</p>')+'<h3>Бригади тижня</h3>'+(data.teams?.length?data.teams.map(t=>'<div class="spitem"><b>#'+t.rank+' '+esc(t.name)+'</b><span style="float:right">'+t.score+' очок</span><div class="muted">Учасників: '+t.members+'</div></div>').join(''):'<p>Бригади ще не набрали очок цього тижня.</p>');
}
window.UHYWeekly={open(){opened=true;const panel=document.getElementById('socialPanel');panel.classList.remove('uhy-casino-mode','uhy-wheel-mode','uhy-view-profile');panel.style.display='flex';document.getElementById('spBody').innerHTML='<p>Завантаження ліги…</p>';refresh().catch(()=>{document.getElementById('spBody').textContent='Немає зв’язку. Спробуйте ще раз.'});}};
document.addEventListener('click',e=>{if(e.target.closest('#socialDock,#spClose,#uhyMore'))opened=false;},true);
setInterval(()=>{if(opened)refresh().catch(()=>{});},15000);
})();
