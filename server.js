'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Підключення до Supabase через змінні середовища Render
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* ====================================================================
   ПРАВИЛА ГРИ, ЯКІ СЕРВЕР МАЄ ЗНАТИ (дзеркало клієнта).
   ==================================================================== */
const TIER_LVL = [1, 10, 40, 150, 500, 1500, 3500, 5500], MAXLVL = 6000;
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const REGEN = 5 * MIN;            // +1 енергії за 5 хв
const FOOD_CD = 30e3, FOOD_EN = 20; // «Борщ»: +20 енергії раз на 30 с
const E_RATE = 1 / REGEN + FOOD_EN / FOOD_CD; // максимум енергії за мілісекунду
const SKEW = 1.15;                // запас на неточність годинників
const BOSS_HP = [1000, 2500, 6000, 14000, 32000, 70000], BOSS_ROUND = 125500, GROW = 1.45;
const WEAPON_GOLD = { bat: 40, bar: 90, chain: 200 };         // «mace» — лише дроп із босів
const EV = { drone: { c: 20, s: 5 }, bbq: { c: 12, s: 2 }, water: { c: 15, s: 3 }, trip: { c: 10, s: 5, it: 'body3' } };
const EV_COOLDOWN = 20 * HOUR;    // кожну нагороду івенту можна брати раз на ~добу
const EU_COST = { lang: [0, 200, 500, 1200, 2500, 5000], job: [0, 400, 900, 1800, 3500, 7000, 12000, 20000], home: [0, 800, 2500, 6500, 15000] };
const tierOf = l => { let t = 0; TIER_LVL.forEach((x, i) => { if (l >= x) t = i; }); return t; };
const basePay = t => Math.round(40 * Math.pow(4, t));
const xpNeed = l => 20 + l;
const XP_K = 900;                 // темп прокачки
const xpDiv = l => 1 + XP_K * l / MAXLVL;
const totalXP = (L, x) => 20 * (L - 1) + (L - 1) * L / 2 + x;
const UAB = basePay(7);
const UA_COST = { pos: [0, 6, 14, 30, 60, 120].map(x => x * UAB), biz: [0, 10, 25, 60, 140, 320].map(x => x * UAB), link: [0, 12, 30, 70, 150, 300].map(x => x * UAB) };
const BIZ_RATE = [0, .5, 1.5, 4, 10, 25];
const hpOf = (b, r) => Math.round(BOSS_HP[b] * Math.pow(GROW, r));
const cum = (arr, n) => { let s = 0; for (let i = 1; i <= n; i++) s += arr[i] || 0; return s; };
const dealt = (b, r, hp) => {
  const g = Math.pow(GROW, r); let s = BOSS_ROUND * (g - 1) / (GROW - 1);
  for (let i = 0; i < b; i++) s += BOSS_HP[i] * g;
  return s + BOSS_HP[b] * g - hp;
};
const bMultMax = (L, tg, sUp) => (1 + .015 * (25 * tg + 2.34 * sUp)) * (1 + .02 * Math.min(L, 300));
const KEYS = ['v', 'started', 'name', 'look', 'ng', 'level', 'xp', 'uah', 'gold', 'energy', 'eAt', 'eq', 'inv', 'bronUntil', 'fakeUntil', 'wantedUntil',
  'job', 'offers', 'offersAt', 'tcc', 'foodAt', 'dailyAt', 'end', 'eu', 'ua', 'st', 'say', 'seenEnd', 'askedEnd', 'bs', 'up'];

/* ---------- сховище (Supabase) ---------- */
let DB = { players: {} };
// Daily wheel: weighted outcomes are chosen on the server only, not in browser JS.
const WHEEL_COOLDOWN=24*HOUR;
const WHEEL_REWARDS=[
  {id:'cash80',label:'80 ₴',emoji:'💵',type:'cash',amount:80,weight:3200,tier:'common'},
  {id:'cash150',label:'150 ₴',emoji:'💰',type:'cash',amount:150,weight:2800,tier:'common'},
  {id:'cash320',label:'320 ₴',emoji:'🪙',type:'cash',amount:320,weight:1800,tier:'uncommon'},
  {id:'xp65',label:'65 XP',emoji:'⭐',type:'xp',amount:65,weight:1000,tier:'uncommon'},
  {id:'tracksuit',label:'Олімпійка',emoji:'🧥',type:'gear',item:'tracksuit',weight:600,tier:'uncommon'},
  {id:'vest',label:'Бронежилет',emoji:'🛡️',type:'gear',item:'vest',weight:350,tier:'rare'},
  {id:'shadow',label:'Тіньова куртка',emoji:'🌑',type:'gear',item:'shadow',weight:180,tier:'rare'},
  {id:'legend',label:'Легендарна біта',emoji:'⚔️',type:'gear',item:'legend',weight:60,tier:'epic'},
  {id:'premium',label:'Золотий дипломат',emoji:'👑',type:'premium',item:'acc6',weight:10,tier:'legendary'}
];
if(WHEEL_REWARDS.reduce((sum,r)=>sum+r.weight,0)!==10000)throw Error('Wheel weights must equal 10000');
// V27: costume bundles are purchased on the server and compatible with legacy gear.
const V27_SETS = [
  {id:'night',name:'Нічний райдер',price:380,level:1,description:'Каптур, темна куртка, штани та кросівки',icon:'🌘',bonus:{nightCashPct:4},bonusLabel:'нічні справи +4% ₴'},
  {id:'worker',name:'Майстер району',price:1400,level:4,description:'Каска, робочий жилет та міцні черевики',icon:'🛠',bonus:{workXPPct:4},bonusLabel:'досвід роботи +4%'},
  {id:'neon',name:'Неоновий курʼєр',price:5100,level:12,description:'Яскрава куртка та сумка доставки',icon:'⚡',bonus:{workCashPct:3},bonusLabel:'зарплата +3% ₴'},
  {id:'urban',name:'Міський агент',price:18000,level:35,description:'Стриманий піджак, окуляри й дипломат',icon:'🕶',bonus:{workCashPct:5},bonusLabel:'зарплата +5% ₴'},
  {id:'royal',name:'Золотий магнат',price:68000,level:100,description:'Золотий костюм та статусний аксесуар',icon:'👑',bonus:{workCashPct:6,workXPPct:2},bonusLabel:'зарплата +6% ₴ · досвід +2%'},
  {id:'mechanic',name:'Мандрівний механік',price:94000,level:150,description:'Захисний шолом, комбінезон, міцне взуття та набір інструментів',icon:'🔩',bonus:{workXPPct:7},bonusLabel:'досвід роботи +7%'},
  {id:'nightguard',name:'Тихий нічний дозорець',price:145000,level:220,description:'Темна форма з бронею та спорядженням для нічних маршрутів',icon:'🌙',bonus:{nightCashPct:7,nightXPPct:3},bonusLabel:'нічні справи +7% ₴ · досвід +3%'}
].map((o,i)=>({...o,tier:7+i,parts:['head','body','legs','shoes','acc'].map(k=>k+(7+i))}));
const V27_SET_PARTS=new Set(V27_SETS.flatMap(o=>o.parts));
const NICK_RE=/^[\p{L}\p{N}_]{3,20}$/u;
const NICK_FORBIDDEN=/^(admin|administrator|moderator|support|system|telegram|адмін|администратор|підтримка|тцк)$/iu;
const normalizeNick=v=>String(v||'').trim().normalize('NFC');
const nickTaken=(name,exclude)=>Object.values(DB.players).some(x=>x.id!==exclude&&x.name?.normalize('NFC').toLocaleLowerCase('uk')===name.toLocaleLowerCase('uk'));
const wheelPublic=()=>WHEEL_REWARDS.map(({id,label,emoji,tier,weight})=>({id,label,emoji,tier,chance:weight/100}));
const wheelState=(p,t=Date.now())=>{const lastAt=Math.max(0,Number(p.dailyWheel?.lastAt||0),Number(p.save?.dailyAt||0),Number(p.world?.lastDaily||0));return {ok:true,serverNow:t,ready:!lastAt||t-lastAt>=WHEEL_COOLDOWN,remainingMs:Math.max(0,lastAt+WHEEL_COOLDOWN-t),nextAt:lastAt?lastAt+WHEEL_COOLDOWN:0,lastSpin:p.dailyWheel?.lastSpin||null,rewards:wheelPublic()}};
const wheelBusy=new Set();
const NEWS_ROW_ID = 'UHYNEWS1'; // reserved metadata row in the existing players table
let newsEvents = [];
let newsDirty = false;
const newsSubscribers = new Set();
const activityCooldowns = new Map();


let dbLoaded=false;
async function loadDB() {
  if (!supabase) {console.error('SUPABASE_URL / SUPABASE_KEY не налаштовані');return;}
  try {
    const all={};let count=0;
    for(let from=0;from<100000;from+=1000) {
      const {data,error}=await supabase.from('players').select('*').range(from,from+999);
      if(error)throw error;
      for(const row of data||[]) {
        if(row?.id===NEWS_ROW_ID){
          if(Array.isArray(row.data?.events))newsEvents=row.data.events.slice(0,200);
        } else if(row?.id&&row?.data)all[row.id]=row.data;
      }
      count+=(data||[]).length;
      if(!data||data.length<1000)break;
    }
    DB.players=all;
    if(!newsEvents.length){
      const old=Object.values(all).flatMap(x=>Array.isArray(x.news)?x.news:[]);
      const seen=new Set();
      newsEvents=old.filter(x=>x&&x.id&&!seen.has(x.id)&&seen.add(x.id)).sort((a,b)=>(b.t||0)-(a.t||0)).slice(0,200);
      if(newsEvents.length)newsDirty=true;
    }
    dbLoaded=true;
    console.log(`Завантажено ${Object.keys(all).length} гравців та ${newsEvents.length} новин із Supabase`);
  } catch(e) { console.error('❌ Помилка завантаження бази з Supabase:',e.message); }
}

const dbReady = loadDB();
let requestQueue=Promise.resolve();
let transactionActive=false;

let dirtyPlayerIds = new Set();
let flushing=false;
async function flush() {
  if (transactionActive || !supabase || flushing || (!dirtyPlayerIds.size && !newsDirty)) return;
  flushing=true;
  try {
    const ids=Array.from(dirtyPlayerIds);
    dirtyPlayerIds.clear();
    // A single batch per 80 players reduces redundant requests.
    for(let offset=0;offset<ids.length;offset+=80){
      const group=ids.slice(offset,offset+80);
      const rows=group.map(id=>DB.players[id]&&({id,data:DB.players[id]})).filter(Boolean);
      if(!rows.length)continue;
      const {error}=await supabase.from('players').upsert(rows);
      if(error){console.error('❌ Збереження гравців:',error.message);group.forEach(id=>dirtyPlayerIds.add(id));}
    }
    if(newsDirty){
      const snapshot=newsEvents.slice(0,200);
      newsDirty=false;
      const {error}=await supabase.from('players').upsert({id:NEWS_ROW_ID,data:{events:snapshot,updated:Date.now()}});
      if(error){console.error('❌ Збереження новин:',error.message);newsDirty=true;}
    }
  }catch(e){console.error('❌ Збереження:',e.message);newsDirty=true;}
  finally{flushing=false;}
}
setInterval(()=>{requestQueue=requestQueue.then(flush,flush)}, 10000).unref();
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, async () => { server.close();await requestQueue;await flush();process.exit(0); }));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const passwordHash = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString('hex');
const cleanLogin = v => String(v || '').trim().toLowerCase();
const validLogin = v => /^[a-z0-9_.-]{3,20}$/.test(v);
const validPassword = v => typeof v === 'string' && v.length >= 8 && v.length <= 128;
const cleanEmail = v => String(v || '').trim().toLowerCase();
const validEmail = v => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(v) && v.length <= 254;
const RESET_TTL = 20 * MIN;
const resetRequests = new Map();
async function mailReset(to, token) {
  // Configure RESEND_API_KEY and MAIL_FROM on the server. No mail is sent without both.
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
  const base = process.env.PUBLIC_URL;
  if (!base || !/^https:\/\//.test(base)) return false;
  const url = base.replace(/\/$/,'') + '/?reset=' + encodeURIComponent(token);
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.MAIL_FROM,to:[to],subject:'Ухилянт — відновлення пароля',
      text:'Для зміни пароля відкрийте посилання протягом 20 хвилин:\\n'+url+'\\nЯкщо це були не ви, ігноруйте лист.'})
  });
  if (!r.ok) { console.error('Reset email provider:',r.status); return false; }
  return true;
}
const safeEqual = (a, b) => { try { const x=Buffer.from(String(a),'hex'), y=Buffer.from(String(b),'hex'); return x.length===y.length && x.length>0 && crypto.timingSafeEqual(x,y); } catch (_) { return false; } };
// Only server-validated events enter the public feed. No auth or Telegram data is exposed.
function publishNews(item) {
  const actor = item?.playerId && DB.players[item.playerId];
  const event={id:crypto.randomUUID(),t:Date.now(),type:String(item?.type||'activity').slice(0,30),
    playerId:actor?.id||null,name:cleanName(actor?.name||item?.name||'Ухилянт'),
    text:String(item?.text||'Ігрова подія').replace(/[<>]/g,'').slice(0,240)};
  newsEvents.unshift(event);
  if(newsEvents.length>200)newsEvents.length=200;
  newsDirty=true;
  if(transactionActive)return event;
  const packet='data: '+JSON.stringify(event)+'\n\n';
  for(const subscriber of newsSubscribers){
    try{subscriber.write(packet)}catch(e){newsSubscribers.delete(subscriber)}
  }
  return event;
}
function logPlayer(p,type,description,interval=0) {
  if(!p || !p.id)return;
  const now=Date.now(),key=p.id+':'+type;
  if(interval && now-(activityCooldowns.get(key)||0)<interval)return;
  activityCooldowns.set(key,now);
  if(activityCooldowns.size>30000)activityCooldowns.clear();
  return publishNews({type,playerId:p.id,text:cleanName(p.name)+' '+description});
}
const HOUSES_V24={shack:'Обшарпана халупа',room:'Кімната у гуртожитку',flat:'Квартира на районі',loft:'Лофт',lux:'Пентхаус люкс'};
const JOBS_V24=['Роздача листівок','Миття авто','Тексти на замовлення','Курʼєр на самокаті','Вантажник на ринку','Модерація коментарів','Таксі','Охоронець у супермаркеті','Бухгалтерія для ФОПів','Менеджер із продажів','Бригадир на будові','Верстка сайтів','Адміністратор ресторану','Логіст на складі','Аутсорс-програміст','Керівник відділу','Власник кіоску','Консультант онлайн','Директор філії','Інвестор у нерухомість','Топ-аутсорсер','Власник мережі','Забудовник','Партнер IT-фірми'];
const PRIMARY_BOSS_NAMES=['Старший','Полициянт','ОПЕР','СБУшник','Зам. РТЦК','Начальник ТЦК'];
const GEAR_V24={tracksuit:'Олімпійка',uniform:'Польова форма',bat:'Біта',knife:'Ніж',chain:'Ланцюг',vest:'Бронежилет',shadow:'Тіньова куртка',storm:'Штормова форма',legend:'Легендарна біта'};
function publicProfile(x){
 const sv=x.save||{},w=x.world||{},h=w.housing||{};
 const owned=Array.isArray(h.owned)?h.owned.filter(id=>HOUSES_V24[id]):['shack'];
 const current=owned.includes(h.current)?h.current:'shack';
 const job=w.employment?.name || (Number.isInteger(sv.job?.ji)?JOBS_V24[sv.job.ji]:'Безробітний');
 const equip=sv.eq&&typeof sv.eq==='object'?Object.fromEntries(['head','body','legs','shoes','acc'].map(k=>[k,String(sv.eq[k]||k+'0')])):{};
 const gameGear=w.equipped||{};
 const brigadeName=w.brigade&&typeof w.brigade==='object'?w.brigade.name:(typeof w.brigade==='string'?Object.values(DB.players).find(z=>z.world?.brigade?.id===w.brigade)?.world?.brigade?.name:null);
 return {id:x.id,name:x.name,level:Math.max(1,Math.floor(num(sv.level,1))),xp:Math.floor(num(sv.xp)),online:Date.now()-(x.seen||0)<90000,
   look:cleanLook(sv.look||{}),equipped:equip,gear:Object.entries(gameGear).slice(0,8).map(([slot,id])=>({slot,name:GEAR_V24[id]||'Річ'})),
   house:{id:current,name:HOUSES_V24[current],owned:owned.length},
   job:String(job||'Безробітний').slice(0,64),
   hp:clamp(Math.floor(num(w.health,100)),0,100),maxHp:100,
   hunger:Number.isFinite(num(w.hunger,NaN))?clamp(Math.floor(w.hunger),0,100):null,
   bossWins:Math.max(0,Math.floor(num(sv.bs?.w))),bossDamage:Math.max(0,Math.floor(num(x.maxDamage))),
   shifts:Math.max(0,Math.floor(num(w.workShifts))),casinoJackpots:Math.max(0,Math.floor(num(w.casinoStats?.jackpots))),
   brigade:brigadeName?String(brigadeName).slice(0,35):'Немає',
   tccStatus:sv.tcc?'Затриманий / на позиціях':(x.career?.status==='training'?'У навчальному центрі':'Вільний')};
}
function createPlayer(name, loginData = {}) {
  const id = newId(), t = Date.now();
  DB.players[id] = { id, keyHash: sha(crypto.randomBytes(32).toString('hex')), name: cleanName(name), created: t, lastSave: t, seen: t, save: null, friends: [], reqIn: [], reqOut: [], events: [], news: [], goldBank: 30, goldSpent: 0, hits: [], bud: { e: 250, t }, evClaim: {}, fdmg: 0, ...loginData };
  // Секрет для API — окремий від хешу пароля.
  const key = crypto.randomBytes(32).toString('hex');
  DB.players[id].keyHash = sha(key);
  dirtyPlayerIds.add(id);
  return { id, key };
}
const newId = () => { for (;;) { let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[crypto.randomInt(ALPHA.length)]; if (!DB.players[s]) return s; } };
const cleanName = n => String(n || 'Ухилянт').replace(/[<>&"'`]/g, '').trim().slice(0, 20) || 'Ухилянт';
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sumUp = up => Object.values(up || {}).reduce((a, b) => a + Math.max(0, num(b)), 0);

const rate = new Map();                                                   
function limited(key, max, win) { const t = Date.now(), a = (rate.get(key) || []).filter(x => t - x < win); a.push(t); rate.set(key, a); return a.length > max; }
setInterval(() => { const t = Date.now(); for (const [k, a] of rate) if (!a.some(x => t - x < 36e5)) rate.delete(k); }, 6e4).unref();

const LOOK_MAX = { skin: 5, hair: 7, hc: 7, hs: 7, face: 5, body: 2, beard: 5, tat: 5 };
const LOCS_OK = ['yard', 'street', 'park', 'market', 'station', 'roof', 'forest', 'home'];
function cleanLook(l) {
  const o = {}; if (!l || typeof l !== 'object') return { skin: 1, hair: 0 };
  for (const k of Object.keys(LOOK_MAX)) { const v = l[k]; if (Number.isInteger(v) && v >= 0 && v <= LOOK_MAX[k]) o[k] = v; }
  if (typeof l.smoke === 'boolean') o.smoke = l.smoke;
  if (LOCS_OK.includes(l.loc)) o.loc = l.loc;
  if (o.skin === undefined) o.skin = 1; if (o.hair === undefined) o.hair = 0;
  return o;
}

function fresh() {
  return { level: 1, xp: 0, uah: 150, gold: 0, ng: 0, inv: ['head0', 'body0', 'legs0', 'shoes0', 'acc0'], up: {}, st: { earned: 0, escaped: 0, caught: 0 }, bs: { me: 0, wp: [], r: 0, b: 0, w: 0 }, dailyAt: 0, end: null, seenEnd: false };
}
const ID_RE = /^(head|body|legs|shoes|acc)([0-9]|1[0-3])$/;
const BASE_INV = ['head0', 'body0', 'legs0', 'shoes0', 'acc0'];
const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

function validate(p, nx) {
  const t = Date.now(), pv = p.save || fresh(), bad = why => ({ ok: false, why });
  if (!nx || typeof nx !== 'object' || Array.isArray(nx)) return bad('формат');
  for (const k of Object.keys(nx)) if (!KEYS.includes(k)) delete nx[k];
  nx.look = cleanLook(nx.look);
  nx.name = cleanName(nx.name);
  if(p.save?.started && nx.name!==cleanName(p.save.name||p.name))return bad('Змінити нік можна лише в профілі');
  nx.say = String(nx.say || '').slice(0, 300);

  const L = num(nx.level, 0), xp = num(nx.xp, -1), ng = num(nx.ng, 0), uah = num(nx.uah, -1), gold = num(nx.gold, -1);
  if (!isInt(L, 1, 1e7) || !(xp >= 0) || xp > xpNeed(L) + 1e-6) return bad('рівень');
  if (!isInt(ng, 0, 1e4)) return bad('нове життя');
  if (!(uah >= 0) || !(gold >= 0) || uah > 1e18 || gold > 1e9) return bad('баланс');
  nx.level = L; nx.xp = xp; nx.ng = ng; nx.uah = uah; nx.gold = gold;

  const inv = Array.isArray(nx.inv) ? nx.inv : null;
  if (!inv || inv.length > 40 || new Set(inv).size !== inv.length) return bad('інвентар');
  let maxT = 0;
  for (const id of inv) { const m = ID_RE.exec(String(id)); if (!m) return bad('предмет'); maxT = Math.max(maxT, Math.min(6,+m[2])); }
  for (const b of BASE_INV) if (!inv.includes(b)) return bad('інвентар');
  const eq = nx.eq && typeof nx.eq === 'object' ? nx.eq : {};
  for (const k of Object.keys(eq)) if (eq[k] != null && !inv.includes(eq[k])) return bad('екіпіровка');
  const up = nx.up && typeof nx.up === 'object' && !Array.isArray(nx.up) ? nx.up : {}, pup = pv.up || {};
  let sUp = 0;
  for (const id of Object.keys(up)) { if (!inv.includes(id) || !isInt(up[id], 0, 1e5)) return bad('★'); sUp += up[id]; }
  nx.up = up;

  if (ng !== num(pv.ng)) {
    const b = nx.bs || {};
    const ok = ng === num(pv.ng) + 1 && pv.end && pv.seenEnd && num(pv.level) >= MAXLVL && !nx.end;
    if (!ok || L !== 1 || xp !== 0 || uah > 150 || sUp !== 0 || inv.length !== 5 || num(b.b) !== 0 || num(b.r) !== 0 || num(b.w) !== 0 || num(b.me) !== 0 ||
      (b.wp || []).length || num(nx.st && nx.st.earned) !== 0 || gold > num(pv.gold) + 1e-6) return bad('нове життя');
    return { ok: true, commit() { p.bud = { e: 250, t }; p.goldSpent = 0; p.evClaim = {}; p.fdmg = 0; } };
  }

  const pL = Math.max(1, num(pv.level, 1)), tr = tierOf(L), tg = Math.max(tr, maxT), bp = basePay(tr);
  const div = xpDiv(pL);           
  const dXP = totalXP(L, xp) - totalXP(pL, num(pv.xp));
  if (dXP < -1e-6) return bad('рівень');

  const nend = nx.end || null, pend = pv.end || null;
  if (nend !== pend && (pend || !['eu', 'ua'].includes(nend) || L < MAXLVL)) return bad('шлях');
  if (nx.seenEnd && !pv.seenEnd) {
    const e = nx.eu || {}, a = nx.ua || {};
    const done = nend === 'eu' ? (num(e.lang) >= 5 && num(e.job) >= 7 && num(e.home) >= 4) : nend === 'ua' ? (num(a.pos) >= 5 && num(a.biz) >= 5 && num(a.link) >= 5) : false;
    if (!done) return bad('фінал');
  }
  if (!nx.seenEnd && pv.seenEnd) return bad('фінал');

  let uaCost = 0, E_eu = 0;
  const ua = nx.ua || {}, pua = pend === 'ua' ? (pv.ua || {}) : {};
  for (const k of ['pos', 'biz', 'link']) {
    const a = num(ua[k]), b0 = num(pua[k]);
    if (!isInt(a, 0, 5) || a < b0 || (nend !== 'ua' && a !== 0)) return bad('карʼєра');
    uaCost += cum(UA_COST[k], a) - cum(UA_COST[k], b0);
  }
  if (nend === 'eu') {
    const e = nx.eu;
    if (!e || !isInt(num(e.lang, -1), 0, 5) || !isInt(num(e.job, -1), 0, 7) || !isInt(num(e.home, -1), 0, 4) || !isInt(num(e.country, -2), -1, 4) || !(num(e.eur, -1) >= 0)) return bad('Європа');
    const pe = pend === 'eu' ? (pv.eu || {}) : {};
    const earn = x => num(x.eur) + cum(EU_COST.lang, num(x.lang)) + cum(EU_COST.job, num(x.job)) + cum(EU_COST.home, num(x.home));
    const dEur = earn(e) - earn(pe);
    if (dEur < -1e-6 || num(e.lang) < num(pe.lang) || num(e.job) < num(pe.job) || num(e.home) < num(pe.home)) return bad('Європа');
    E_eu = dEur / (14 * (1 + num(e.job) * 0.9) * (1 + num(e.lang) * 0.15) * 1.25 * (1 + 0.25 * ng) / 10);
  } else if (nx.eu) return bad('Європа');

  const bs = nx.bs && typeof nx.bs === 'object' ? nx.bs : {}, pb = pv.bs || {};
  const bb = num(bs.b, -1), r = num(bs.r, -1), w = num(bs.w, -1), me = num(bs.me, -1);
  const kmax = 6 + 6 * r; // Оголошено тут, щоб уникнути ReferenceError
  
  if (!isInt(bb, 0, 5) || !isInt(r, 0, 300) || !isInt(w, 0, 1e9) || !isInt(me, 0, 1e5) || me < num(pb.me)) return bad('бій');
  const pbb = num(pb.b), pr = num(pb.r), pw = num(pb.w);
  const dW = w - pw, dNb = (bb + 6 * r) - (pbb + 6 * pr);
  if (dW < 0 || dNb < 0 || dW !== dNb) return bad('перемоги');
  const hmax = hpOf(bb, r), hp = bs.hp == null ? hmax : num(bs.hp, -1);
  if (!(hp >= 0) || hp > hmax + 1) return bad('бос');
  const phmax = hpOf(pbb, pr), php = pb.hp == null ? phmax : Math.min(num(pb.hp, phmax), phmax);
  const dD = Math.max(0, dealt(bb, r, hp) - dealt(pbb, pr, php));
  const wp = Array.isArray(bs.wp) ? bs.wp : null;
  if (!wp || wp.length > 4 || new Set(wp).size !== wp.length) return bad('зброя');
  // Clients may spend copies while offline, but can never increase a stack by saving.
  const countWeapons=['bat','bar','chain','mace'],oldCounts=pb.weaponCounts||{},nextCounts=bs.weaponCounts;
  if(nextCounts!==undefined&&(!nextCounts||typeof nextCounts!=='object'||Array.isArray(nextCounts)))return bad('кількість зброї');
  if(nextCounts)for(const id of Object.keys(nextCounts))if(!countWeapons.includes(id))return bad('кількість зброї');
  for(const id of countWeapons){
    const previous=num(oldCounts[id],Array.isArray(pb.wp)&&pb.wp.includes(id)?1:0);
    const next=nextCounts&&Object.hasOwn(nextCounts,id)?num(nextCounts[id],-1):previous;
    if(!isInt(next,0,previous))return bad('кількість зброї');
  }
  let wpGold = 0;
  for (const x of wp) { if (x === 'mace') { if (w < 4) return bad('зброя'); } else if (WEAPON_GOLD[x]) wpGold += WEAPON_GOLD[x]; else return bad('зброя'); }

  const b0 = p.bud || { e: 250, t: p.lastSave || p.created || t };
  const dt = clamp(t - b0.t, 0, 3 * DAY);
  const maxE = 50 + 10 * me + 3 * (15 * tg + Math.floor(sUp / 3));
  let E = Math.min(b0.e + dt * E_RATE * SKEW, maxE + E_RATE * 10 * MIN);

  let bank = Math.min(60, num(p.goldBank, 30) + dt / DAY * 30), spent = num(p.goldSpent, 0), spentNow = 0;
  const dg = gold - num(pv.gold);
  if (dg > 1e-6) { if (dg > bank + 1e-6) return bad('золото'); bank -= dg; }
  else if (dg < -1e-6) { spentNow = -dg; spent += spentNow; E += Math.floor(spentNow / 15) * maxE; } 
  const needGold = amount => { const n = amount - spent; if (n > 1e-6) { if (n > bank + 1e-6) return false; bank -= n; spent += n; } return true; };
  if (!needGold(30 * me + wpGold)) return bad('золото');

  const ev = bs.ev || {}, pev = pb.ev || {}, claims = [];
  let claimMoney = 0, claimXP = 0, tripItem = 0;
  for (const id of Object.keys(EV)) {
    const n = ev[id]; if (!n) continue;
    if (num(n.k) > 0 && !(num(pev[id] && pev[id].k) > 0)) {
      if (t - num((p.evClaim || {})[id]) < EV_COOLDOWN) return bad('івент');
      claims.push(id); claimMoney += bp * EV[id].c; claimXP += 2 * xpNeed(L) / div; if (EV[id].it) tripItem++;
    }
  }

  const oldInv = new Set(pv.inv || []);
  const added = inv.filter(id => !oldInv.has(id)).map(id => ({ id, t: +ID_RE.exec(id)[2] })).sort((a, c) => c.t - a.t);
  if (added.length > 12) return bad('предмети');
  if(added.some(it=>it.t>=7))return bad('Набори одягу можна купити лише у майстерні');
  let free = dW + tripItem, itemUah = 0, itemGold = 0;
  for (const it of added) {
    if (it.t === 0) continue;
    if (free > 0) { free--; continue; }                       
    if (L < TIER_LVL[it.t]) return bad('предмет за рівень');
    if (it.t === 6) itemGold += 150; else itemUah += 100 * Math.pow(4, it.t);
  }
  if (itemGold) { const n = itemGold - spentNow; if (n > 1e-6) { if (n > bank + 1e-6) return false; bank -= n; spent += n; } } 

  let starCost = 0, nStars = 0;
  for (const id of Object.keys(pup)) if (num(up[id]) < num(pup[id])) return bad('★');
  for (const id of Object.keys(up)) { const a = num(pup[id]); nStars += up[id] - a; if (up[id] < a) return bad('★'); }
  if (nStars > 3000) return bad('★');
  const pbp = basePay(tierOf(pL));
  for (const id of Object.keys(up)) for (let n = num(pup[id]); n < up[id]; n++) starCost += pbp * 3 * Math.pow(1.3, n + 1) * 0.999;

  const dEsc = num(nx.st && nx.st.escaped) - num(pv.st && pv.st.escaped), dCau = num(nx.st && nx.st.caught) - num(pv.st && pv.st.caught);
  if (dEsc < 0 || dCau < 0 || dEsc > dCau + 1) return bad('втечі');
  const winXP = dW * 3 * xpNeed(L) * kmax / div, escXP = dEsc * xpNeed(L) / div;
  const gigXP = Math.max(0, dXP - winXP - escXP - claimXP);
  const E_X = gigXP / (1.3 * (4 + 0.2 * L) / div);

  const earned = num(nx.st && nx.st.earned), pEarned = num(pv.st && pv.st.earned), dEarn = earned - pEarned;
  if (dEarn < -1e-6) return bad('гроші');
  let daily = 0;
  const dA = num(nx.dailyAt), pA = num(pv.dailyAt);
  if (dA < pA || dA > t + 120000) return bad('бонус');
  if (dA > pA) { if (pA > 0 && dA - pA < 19 * HOUR) return bad('бонус'); daily = 5 * bp; }
  let biz = 0;
  if (nend === 'ua') {
    const a = num(ua.bizAt), pa = num(pua.bizAt);
    if (a < pa || a > t + 120000) return bad('бізнес');
    if (a > pa && pa > 0) biz = UAB * BIZ_RATE[Math.max(num(ua.biz), num(pua.biz))] * Math.min(12, (a - pa) / HOUR) * SKEW;
  }
  const bossMoney = dW * bp * 2 * kmax;
  const payMax = (1 + (15 * tg + sUp) / 100) * (1 + 0.25 * ng) * (nend === 'ua' ? 2 : 1);
  const E_M = Math.max(0, dEarn - daily - claimMoney - biz - bossMoney) / (0.15 * bp * payMax);
  const spentMin = starCost + itemUah + uaCost;
  if (uah > num(pv.uah) + dEarn - spentMin + 1) return bad('гривні');

  const F = Math.max(0, num(p.fdmg)), useF = Math.min(F, dD);
  const E_D = (dD - useF) / (120 * bMultMax(L, tg, sUp));

  const need = Math.max(E_X, E_M) + E_D + E_eu;                  
  if (need > E + 10) return bad('надто швидкий прогрес');

  return {
    ok: true, bossDamage: Math.max(0, dD - useF), commit() {
      p.bud = { e: Math.max(0, E - need), t }; p.goldBank = bank; p.goldSpent = spent; p.fdmg = F - useF;
      p.evClaim = Object.assign(p.evClaim || {}, ...claims.map(id => ({ [id]: t })));
    }
  };
}

/* ---------- API ---------- */
const send = (res, code, obj) => { if(res.capture){res.captured={code,obj};return;}  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => {
  let d = '', done = false; const fin = v => { if (!done) { done = true; r(v); } };
  req.on('data', c => { d += c; if (d.length > 2e5) { fin(null); req.destroy(); } });
  req.on('end', () => { try { fin(JSON.parse(d || '{}')); } catch (e) { fin(null); } });
  req.on('error', () => fin(null)); req.on('close', () => fin(null));
});
function clientIp(req) {
  if (TRUST_PROXY) { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); if (x.length) return x[x.length - 1]; }
  return req.socket.remoteAddress || '?';
}
function auth(req) {
  const id = String(req.headers['x-id'] || '').toUpperCase(), key = String(req.headers['x-key'] || ''), p = DB.players[id];
  if (!p) return null;
  const a = Buffer.from(sha(key)), b = Buffer.from(p.keyHash);
  const primary=a.length === b.length && crypto.timingSafeEqual(a,b);
  const secondary=(p.sessionHashes||[]).some(h=>safeEqual(sha(key),h));
  return primary || secondary ? p : null;
}
// Telegram Mini App: never trust an ID from the browser without Telegram's HMAC.
function verifyTelegramInitData(raw) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || typeof raw !== 'string' || raw.length < 20 || raw.length > 16000) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash'), authDate = Number(params.get('auth_date'));
  if (!/^[a-f0-9]{64}$/i.test(hash || '') || !Number.isInteger(authDate)) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 120 || nowSeconds - authDate > 86400) return null;
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k,v]) => k + '=' + v).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (!safeEqual(expected.toLowerCase(), hash.toLowerCase())) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !/^\d{1,18}$/.test(String(user.id)) || user.is_bot) return null;
    return user;
  } catch { return null; }
}
function starterTelegramSave(name) {
  const t = Date.now();
  return {
    ...fresh(), v:1, started:true, name, look:{skin:1,hair:0}, ng:0,
    energy:50, eAt:t,
    eq:{head:'head0',body:'body0',legs:'legs0',shoes:'shoes0',acc:'acc0'},
    bronUntil:0, fakeUntil:0, wantedUntil:0, job:null, offers:null, offersAt:0,
    tcc:null, foodAt:0, dailyAt:0, end:null, seenEnd:false, askedEnd:false,
    eu:null, ua:{pos:0,biz:0,link:0,bizAt:0}, st:{caught:0,escaped:0,shifts:0,earned:0},
    say:'Ласкаво просимо до Ухилянта!'
  };
}
const pub = p => ({ id: p.id, name: p.name, level: p.save ? p.save.level : 1, b: p.save && p.save.bs ? num(p.save.bs.b) : 0, on: Date.now() - (p.seen || 0) < 90000 });

function welcomeGift(p){if(p.save?.started&&!p.welcomeRC4){p.save.gold=(Number(p.save.gold)||0)+50;p.starterKit=1;p.welcomeRC4=true;}}
function weekClock(at=Date.now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date(at));
 const get=k=>parts.find(p=>p.type===k).value;const date=get('year')+'-'+get('month')+'-'+get('day');
 const day=new Date(date+'T12:00:00Z');const dow=day.getUTCDay();day.setUTCDate(day.getUTCDate()-((dow+6)%7));
 return {id:day.toISOString().slice(0,10),date,active:dow!==0};
}
const LEAGUE_DIVISIONS=[
 {id:'street',name:'Дворова',min:1,max:39},
 {id:'worker',name:'Робітнича',min:40,max:149},
 {id:'district',name:'Районна',min:150,max:499},
 {id:'city',name:'Міська',min:500,max:1499},
 {id:'capital',name:'Столична',min:1500,max:5499},
 {id:'legend',name:'Легенди',min:5500,max:40000}
];
function leagueDivision(level){
 const n=Math.max(1,Math.floor(num(level,1)));
 return LEAGUE_DIVISIONS.find(d=>n>=d.min&&n<=d.max)||LEAGUE_DIVISIONS.at(-1);
}
function brigadeForPlayer(p){
 const ref=p.world?.brigade;
 if(ref&&typeof ref==='object'&&Array.isArray(ref.members))return {team:ref,owner:p};
 if(typeof ref!=='string'||!ref)return null;
 const owner=Object.values(DB.players).find(x=>x.world?.brigade?.id===ref);
 return owner?.world?.brigade&&Array.isArray(owner.world.brigade.members)?{team:owner.world.brigade,owner}:null;
}
function weeklyScore(p,kind,at=Date.now()){
 const clock=weekClock(at);if(!clock.active)return;
 if(p.weekly?.id!==clock.id)p.weekly={id:clock.id,score:0,days:{},division:leagueDivision(p.save?.level).id};
 if(!p.weekly.division)p.weekly.division=leagueDivision(p.save?.level).id;
 const day=p.weekly.days[clock.date]||(p.weekly.days[clock.date]={work:0,fight:0});
 const cap=kind==='work'?5:10;if(day[kind]>=cap)return;
 const points=kind==='work'?20:10;
 day[kind]++;p.weekly.score+=points;
 const found=brigadeForPlayer(p),thresholds=[300,1000,2500];
 if(!found||!found.team.members.includes(p.id))return;
 const team=found.team;
 if(team.weekly?.id!==clock.id)team.weekly={id:clock.id,score:0,keysGranted:0,contributors:{}};
 team.weekly.score=Math.max(0,Math.floor(num(team.weekly.score)))+points;
 team.weekly.contributors=team.weekly.contributors&&typeof team.weekly.contributors==='object'?team.weekly.contributors:{};
 team.weekly.contributors[p.id]=Math.max(0,Math.floor(num(team.weekly.contributors[p.id])))+points;
 let granted=Math.max(0,Math.min(thresholds.length,Math.floor(num(team.weekly.keysGranted))));
 team.keys=Math.max(0,Math.floor(num(team.keys)));
 while(granted<thresholds.length&&team.weekly.score>=thresholds[granted]){team.keys++;granted++;}
 team.weekly.keysGranted=granted;
 dirtyPlayerIds.add(found.owner.id);
}
function weeklyBrigades(weekId=weekClock().id){
 const seen=new Set();
 return Object.values(DB.players).flatMap(owner=>{
  const team=owner.world?.brigade;
  if(!team||typeof team!=='object'||!team.id||team.owner!==owner.id||!Array.isArray(team.members)||seen.has(team.id))return[];
  seen.add(team.id);
  const score=team.weekly?.id===weekId?Math.max(0,Math.floor(num(team.weekly.score))):0;
  return score>0?[{id:team.id,name:String(team.name||'Бригада').slice(0,35),score,members:team.members.length}]:[];
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
async function api(req, res, route) {
  await dbReady;
  const ip = clientIp(req);
  if (route === 'ping') return send(res, 200, { ok: 1 });
  if(route==='weekly'){
    const clock=weekClock(),player=auth(req);if(!player)return send(res,401,{ok:false,err:'auth'});
    const own=player.weekly?.id===clock.id?player.weekly:null;
    const divisionId=own?.division||leagueDivision(player.save?.level).id;
    const division=LEAGUE_DIVISIONS.find(d=>d.id===divisionId)||leagueDivision(player.save?.level);
    const divisionRows=Object.values(DB.players).filter(p=>p.weekly?.id===clock.id&&(p.weekly.division||leagueDivision(p.save?.level).id)===division.id)
      .sort((a,b)=>b.weekly.score-a.weekly.score||a.id.localeCompare(b.id));
    const publicRow=(p,rank)=>({rank,name:p.name,id:p.id,score:Math.max(0,Math.floor(num(p.weekly?.id===clock.id?p.weekly.score:0))),level:Number(p.save?.level||1),on:Date.now()-(p.seen||0)<90000});
    const rank=divisionRows.findIndex(p=>p.id===player.id)+1||null;
    const ownScore=Math.max(0,Math.floor(num(own?.score)));
    const rival=rank===1?divisionRows[1]:rank?divisionRows[rank-2]:divisionRows[0];
    const nextRival=rival?{name:rival.name,score:Math.max(0,Math.floor(num(rival.weekly?.score))),leading:rank===1,delta:rank===1?Math.max(0,ownScore-Math.floor(num(rival.weekly?.score))):Math.max(1,Math.floor(num(rival.weekly?.score))-ownScore+1)}:null;
    const list=divisionRows.slice(0,50).map((p,i)=>publicRow(p,i+1));
    const friendIds=new Set([player.id,...(Array.isArray(player.friends)?player.friends:[])]);
    const friendRows=Object.values(DB.players).filter(p=>friendIds.has(p.id)&&(p.id===player.id||!p.weekly||p.weekly.id!==clock.id||((p.weekly.division||leagueDivision(p.save?.level).id)===division.id)))
      .filter(p=>(p.weekly?.id===clock.id?(p.weekly.division||leagueDivision(p.save?.level).id):leagueDivision(p.save?.level).id)===division.id)
      .sort((a,b)=>num(b.weekly?.id===clock.id?b.weekly.score:0)-num(a.weekly?.id===clock.id?a.weekly.score:0)||a.id.localeCompare(b.id))
      .map((p,i)=>({...publicRow(p,i+1),self:p.id===player.id}));
    const teamRows=weeklyBrigades(clock.id).map((team,i)=>({...team,rank:i+1})),ownTeam=brigadeForPlayer(player)?.team;
    const brigadeRank=ownTeam?teamRows.findIndex(team=>team.id===ownTeam.id)+1||null:null;
    return send(res,200,{ok:true,...clock,serverNow:Date.now(),playerId:player.id,score:ownScore,division:{id:division.id,name:division.name,min:division.min,max:division.max},rank,participants:divisionRows.length,list,friends:friendRows,nextRival,brigadeRank,teams:teamRows.slice(0,10)});
  }
  if (route === 'leaderboard') {
    const mode=String(new URL(req.url,'http://localhost').searchParams.get('mode')||'level');
    const modes=['level','boss','casino','jackpots','wealth','work','housing'];
    if(!modes.includes(mode))return send(res,400,{ok:false,err:'Невірний рейтинг'});
    const score=(p)=>{
      const w=p.world||{},cs=w.casinoStats||{},hs=w.housing||{},sv=p.save||{};
      return {level:Number(sv.level||1),boss:Number(sv.bs?.b||0),casino:Number(cs.totalWon||0),jackpots:Number(cs.jackpots||0),wealth:Number(w.cash||0),work:Number(w.xp||0),housing:Number((hs.owned||['shack']).length)}[mode];
    };
    const list=Object.values(DB.players).map(p=>({...pub(p),score:score(p)})).sort((a,b)=>b.score-a.score||b.level-a.level||a.name.localeCompare(b.name,'uk')).slice(0,100);
    return send(res,200,{ok:true,mode,list});
  }
  if (route === 'news/stream') {
    if(req.method!=='GET')return send(res,405,{ok:false,err:'Method not allowed'});
    if(newsSubscribers.size>=250)return send(res,503,{ok:false,err:'Too many live streams'});
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform',
      'connection':'keep-alive','x-content-type-options':'nosniff','x-accel-buffering':'no'});
    res.write('retry: 5000\n\n');
    newsSubscribers.add(res);
    const heartbeat=setInterval(()=>{try{res.write(': heartbeat\n\n')}catch(e){clearInterval(heartbeat)}},20000);
    heartbeat.unref();
    req.on('close',()=>{clearInterval(heartbeat);newsSubscribers.delete(res)});
    return;
  }
  if (route === 'news') {
    const u=new URL(req.url,'http://localhost');
    const max=Math.min(100,Math.max(1,u.searchParams.has('limit')?Math.floor(num(u.searchParams.get('limit'),80)):80));
    const list=newsEvents.slice(0,max);
    return send(res,200,{ok:true,list,version:newsEvents[0]?.id||'',pollAfterMs:3500});
  }
  if (route === 'admin/news/donation') {
    const secret=String(req.headers['x-admin-secret']||'');
    if (!process.env.ADMIN_EVENT_SECRET || !safeEqual(sha(secret),sha(process.env.ADMIN_EVENT_SECRET))) return send(res,403,{ok:false,err:'forbidden'});
    const b=await body(req); if(!b) return send(res,400,{ok:false});
    const amount=Number(b.amount), name=cleanName(b.name || 'Гравець');
    if (!Number.isFinite(amount) || amount<=0 || amount>1e9) return send(res,400,{ok:false,err:'Некоректна сума'});
    const item=publishNews({type:'donation',name,amount,text:`${name} підтримав гру на ₴${Math.round(amount).toLocaleString('uk-UA')}`});
    return send(res,200,{ok:true,event:item});
  }
  if (route === 'telegram/auth') {
    if (req.method !== 'POST') return send(res,405,{ok:false,err:'Method not allowed'});
    if (!supabase) return send(res,503,{ok:false,err:'У Render не налаштована база Supabase'});
    if (!dbLoaded) return send(res,503,{ok:false,err:'Не вдалося завантажити акаунти з Supabase'});
    if (limited('tg' + ip, 20, 5*MIN)) return send(res,429,{ok:false,err:'Забагато спроб входу'});
    const input = await body(req), user = verifyTelegramInitData(input?.initData);
    if (!user) return send(res,401,{ok:false,err:!process.env.TELEGRAM_BOT_TOKEN ? 'TELEGRAM_BOT_TOKEN відсутній у Render' : 'Недійсні або застарілі дані Telegram'});
    const telegramId = String(user.id);
    let player = Object.values(DB.players).find(p => p.telegramId === telegramId);
    if (!player) {
      const name = cleanName((user.first_name || user.username || 'Ухилянт') + ' ' + (user.last_name || ''));
      const created = createPlayer(name,{telegramId,telegramUsername:String(user.username||'').slice(0,64)});
      player=DB.players[created.id];player.save=starterTelegramSave(name);
      logPlayer(player,'join','приєднався до міста');
      dirtyPlayerIds.add(player.id);
      // The request transaction persists all changed players before responding.
      return send(res,200,{ok:true,...created,fresh:true});
    }
    const existing = auth(req);
    if (existing && existing.id === player.id) return send(res,200,{ok:true,id:player.id,key:String(req.headers['x-key']),fresh:false});
    const key=crypto.randomBytes(32).toString('hex');
    player.sessionHashes=[...new Set([...(player.sessionHashes||[]),sha(key)])].slice(-12);
    player.seen=Date.now();dirtyPlayerIds.add(player.id);
    // The request transaction persists all changed players before responding.
    return send(res,200,{ok:true,id:player.id,key,fresh:false});
  }
  if (route === 'account/register') {
    if (limited('areg' + ip, 5, 36e5)) return send(res, 429, { ok:false, err:'Забагато спроб реєстрації' });
    const b = await body(req); if (!b) return send(res,400,{ok:false});
    const username = cleanLogin(b.username), password = b.password;
    if (!validLogin(username)) return send(res,400,{ok:false,err:'Логін: 3–20 символів, латиниця, цифри, . _ -'});
    if (!validPassword(password)) return send(res,400,{ok:false,err:'Пароль має містити 8–128 символів'});
    if (Object.values(DB.players).some(x => x.username === username)) return send(res,409,{ok:false,err:'Такий логін уже зайнятий'});
    const salt = crypto.randomBytes(16).toString('hex'), authData = { username, passSalt:salt, passHash:passwordHash(password,salt) };
    const email=cleanEmail(b.email);
    if (!validEmail(email)) return send(res,400,{ok:false,err:'Вкажіть коректний email'});
    if (Object.values(DB.players).some(x => x.email === email)) return send(res,409,{ok:false,err:'Цей email вже використовується'});
    authData.email=email;
    const a = createPlayer(b.name || username, authData);
    logPlayer(DB.players[a.id],'join','зареєструвався у місті');
    return send(res,200,{ok:true,...a,fresh:true});
  }
  if (route === 'account/login') {
    if (limited('alog' + ip, 12, 15*MIN)) return send(res,429,{ok:false,err:'Забагато спроб входу. Спробуй пізніше.'});
    const b = await body(req); if (!b) return send(res,400,{ok:false});
    const username = cleanLogin(b.username), p = Object.values(DB.players).find(x => x.username === username);
    if (!p || !p.passSalt || !safeEqual(passwordHash(b.password || '',p.passSalt),p.passHash)) return send(res,401,{ok:false,err:'Неправильний логін або пароль'});
    const key = crypto.randomBytes(32).toString('hex'); p.sessionHashes = [...new Set([...(p.sessionHashes||[]),sha(key)])].slice(-12);
    p.seen = Date.now(); dirtyPlayerIds.add(p.id);
    return send(res,200,{ok:true,id:p.id,key,save:p.save,name:p.name});
  }
  if (route === 'account/request-reset') {
    if(limited('reset'+ip,4,36e5))return send(res,429,{ok:false,err:'Забагато запитів'});
    const b=await body(req);if(!b)return send(res,400,{ok:false});
    const email=cleanEmail(b.email),p=Object.values(DB.players).find(x=>x.email===email&&x.passHash);
    const generic={ok:true,message:'Якщо пошта привʼязана та надсилання налаштоване, лист буде відправлено.'};
    if(!p||!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!process.env.PUBLIC_URL)return send(res,200,generic);
    const token=crypto.randomBytes(32).toString('hex');
    p.resetHash=sha(token);p.resetUntil=Date.now()+RESET_TTL;dirtyPlayerIds.add(p.id);
    try { await mailReset(email,token); }catch(err){console.error('Email error:',err.message)}
    return send(res,200,generic);
  }
  if (route === 'account/reset-password') {
    if(limited('resetapply'+ip,8,36e5))return send(res,429,{ok:false,err:'Забагато спроб'});
    const b=await body(req);if(!b)return send(res,400,{ok:false});
    if(!validPassword(b.password)||b.password!==b.confirmPassword)return send(res,400,{ok:false,err:'Паролі не збігаються або закороткі'});
    const h=sha(String(b.token||'')),p=Object.values(DB.players).find(x=>x.resetHash&&safeEqual(x.resetHash,h)&&x.resetUntil>Date.now());
    if(!p)return send(res,400,{ok:false,err:'Посилання недійсне або прострочене'});
    p.passSalt=crypto.randomBytes(16).toString('hex');p.passHash=passwordHash(b.password,p.passSalt);
    delete p.resetHash;delete p.resetUntil;p.sessionHashes=[];p.keyHash=sha(crypto.randomBytes(32).toString('hex'));
    dirtyPlayerIds.add(p.id);return send(res,200,{ok:true});
  }
  if (route === 'register') {
    if (limited('reg' + ip, 5, 36e5)) return send(res, 429, { ok: false, err: 'Забагато реєстрацій' });
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const key = crypto.randomBytes(24).toString('hex'), id = newId();
    DB.players[id] = { id, keyHash: sha(key), name: cleanName(b.name), created: Date.now(), lastSave: Date.now(), seen: Date.now(), save: null, friends: [], reqIn: [], reqOut: [], events: [], goldBank: 30, goldSpent: 0, hits: [], bud: { e: 250, t: Date.now() }, evClaim: {}, fdmg: 0 };
    dirtyPlayerIds.add(id); 
    return send(res, 200, { ok: true, id, key, fresh: true });
  }
  const p = auth(req);
  if (!p) return send(res, 401, { ok: false, err: 'auth' });
  p.seen = Date.now();
  if (limited('p' + p.id, 120, 6e4)) return send(res, 429, { ok: false, err: 'Забагато запитів' });
  if(route==='weapon-buy'){
    if(req.method!=='POST'||!p.save?.started)return send(res,400,{ok:false});
    const b=await body(req),price=WEAPON_GOLD[b?.weapon];
    if(!Object.hasOwn(WEAPON_GOLD,b?.weapon))return send(res,400,{ok:false,err:'Невідома зброя'});
    const count=b.count==='max'?Math.floor(p.save.gold/price):Number(b.count);
    if(!Number.isSafeInteger(count)||count<1||count*price>p.save.gold)return send(res,400,{ok:false,err:'Недостатньо монет або невірна кількість'});
    const bs=p.save.bs;bs.wp=Array.isArray(bs.wp)?bs.wp:[];bs.weaponCounts=bs.weaponCounts||{};
    bs.weaponCounts[b.weapon]=(bs.weaponCounts[b.weapon]??(bs.wp.includes(b.weapon)?1:0))+count;
    if(!bs.wp.includes(b.weapon))bs.wp.push(b.weapon);
    p.save.gold-=count*price;p.goldSpent=(p.goldSpent||0)+count*price;
    dirtyPlayerIds.add(p.id);return send(res,200,{ok:true,save:p.save});
  }
  if(route==='tcc/choice'){
    if(req.method!=='POST'||!p.save?.started)return send(res,400,{ok:false});
    const b=await body(req),sv=p.save,t=Date.now();p.tccServerOwned=true;
    if(b?.action==='begin'){
      if(!sv.tcc)sv.tcc={stage:0,nextAt:0,busy:false,documents:true};
      sv.say='Ваші документи! Покажи бронь або спробуй втекти.';
    }else{
      if(!sv.tcc)return send(res,409,{ok:false,err:'Перевірки немає'});
      if(!['documents','run'].includes(b?.action))return send(res,400,{ok:false});
      if(t<Number(sv.tcc.nextAt||0))return send(res,429,{ok:false,err:'Зачекай до наступної спроби'});
      const protectedPlayer=b.action==='documents'&&Number(sv.bronUntil)>t;
      const escaped=b.action==='run'&&crypto.randomInt(100)<18;
      if(protectedPlayer||escaped){sv.tcc=null;sv.say=protectedPlayer?'Бронь дійсна. Ви вільні.':'Ти відірвався від патруля!';if(p.career?.status==='detained')p.career.status='civilian';if(escaped){sv.wantedUntil=t+15*MIN;sv.st=sv.st||{};sv.st.escaped=(sv.st.escaped||0)+1;}}
      else{const first=!!sv.tcc.documents;sv.tcc={stage:0,nextAt:t+3*MIN,busy:false,documents:false};sv.say=b.action==='documents'?'Дійсної броні немає. Тебе затримано.':'Втеча не вдалася. Тебе затримано.';if(first){sv.st=sv.st||{};sv.st.caught=(sv.st.caught||0)+1;}p.career=p.career||{};p.career.status='detained';}
    }
    p.walletRevision=(p.walletRevision||0)+1;dirtyPlayerIds.add(p.id);
    return send(res,200,{ok:true,save:sv});
  }
  if(route==='city-events'){
    if(!p.save?.started)return send(res,409,{ok:false,err:'Спочатку створи персонажа'});
    const clock=weekClock(),day=clock.date;
    p.cityEvents=p.cityEvents||{};
    if(req.method==='POST'){
      const input=await body(req);const action=input?.action;
      if(action==='kit'){
        if(!p.starterKit)return send(res,409,{ok:false,err:'Набір вже використано'});
        if(p.save.energy>=50)return send(res,409,{ok:false,err:'Спочатку витрать енергію'});
        p.starterKit=0;p.save.energy=Math.min(50,Math.max(0,Number(p.save.energy)||0)+20);
        p.save.say='Стартовий термос: +20 енергії.';
      }else if(['radio','courtyard'].includes(action)){
        if(p.cityEvents[action]?.day===day)return send(res,409,{ok:false,err:'Сьогодні вже завершено'});
        if(!['safe','risk','decline'].includes(input.choice))return send(res,400,{ok:false});
        const lucky=input.choice==='risk'&&crypto.randomInt(100)<45;
        const cash=input.choice==='decline'?0:input.choice==='safe'?80:lucky?180:0;
        p.save.uah+=cash;
        const text=action==='radio'?(lucky?'Ти впіймав рідкісну частоту — сусіди знайшли загублений вантаж!':'Радіомайстерня знову на зв’язку. Район дякує за допомогу.'):(lucky?'Твій імпровізований концерт зібрав увесь двір!':'Теплий чай, гітара та розмови до сутінків.');
        const outcome=cash===0?'Цього разу історія завершилась без нагороди.':text;p.cityEvents[action]={day,text:outcome,cash,choice:input.choice};p.save.say=outcome+' +'+cash+' ₴';
        logPlayer(p,'city',outcome);
      }else return send(res,400,{ok:false,err:'Невідома дія'});
      dirtyPlayerIds.add(p.id);
    }
    return send(res,200,{ok:true,day,kit:p.starterKit||0,events:p.cityEvents,save:p.save});
  }
  if(route==='daily-wheel'){
    if(req.method==='GET')return send(res,200,wheelState(p));
    if(req.method!=='POST')return send(res,405,{ok:false,err:'Method not allowed'});
    if(!supabase||!dbLoaded)return send(res,503,{ok:false,err:'Збереження тимчасово недоступне'});
    if(wheelBusy.has(p.id))return send(res,409,{ok:false,err:'Колесо вже обертається'});
    wheelBusy.add(p.id);
    try{
      const t=Date.now(),st=wheelState(p,t);
      if(!st.ready)return send(res,200,{...st,ok:false,err:'Наступна спроба через '+Math.ceil(st.remainingMs/60000)+' хв'});
      if(!p.save?.started)return send(res,409,{ok:false,err:'Спочатку створи персонажа'});
      // Legacy daily cooldown is unified with the new, server-authoritative wheel.
      const oldAt=Number(p.save.dailyAt||0);
      if(oldAt>t-WHEEL_COOLDOWN)return send(res,200,{ok:false,err:'Щоденний бонус уже забрано. Зачекай 24 години',remainingMs:Math.max(0,oldAt+WHEEL_COOLDOWN-t)});
      const draw=crypto.randomInt(10000);let x=draw,chosen=WHEEL_REWARDS[0];
      for(const reward of WHEEL_REWARDS){if(x<reward.weight){chosen=reward;break;}x-=reward.weight}
      const w=p.world||(p.world={cash:Number(p.save?.uah)||0,xp:0,items:[],equipped:{},lastDaily:0,lastWork:0,brigade:null,look:{hair:'short',beard:'stubble',skin:'medium'}});
      if(!Array.isArray(w.items))w.items=[];
      let prize={id:chosen.id,label:chosen.label,emoji:chosen.emoji,type:chosen.type,tier:chosen.tier,amount:chosen.amount||0,item:chosen.item||null};
      if(chosen.type==='cash') {w.cash=(Number(w.cash)||0)+chosen.amount;}
      else if(chosen.type==='xp') {w.xp=(Number(w.xp)||0)+chosen.amount;}
      else if(chosen.type==='gear'){
        if(!w.items.includes(chosen.item))w.items.push(chosen.item);
        else {prize={...prize,label:'Повторна річ → 200 ₴',emoji:'💵',type:'cash',amount:200};w.cash=(Number(w.cash)||0)+200;}
      } else if(chosen.type==='premium'){
        if(!Array.isArray(p.save.inv))p.save.inv=['head0','body0','legs0','shoes0','acc0'];
        if(!p.save.inv.includes(chosen.item)){p.save.inv.push(chosen.item);w.premiumCosmetics=w.premiumCosmetics||[];if(!w.premiumCosmetics.includes(chosen.item))w.premiumCosmetics.push(chosen.item);}
        else {prize={...prize,label:'Дублікат → 2500 ₴',emoji:'💰',type:'cash',amount:2500};w.cash=(Number(w.cash)||0)+2500;}
      }
      p.save.dailyAt=t;w.lastDaily=t;
      const lastSpin={id:crypto.randomUUID(),at:t,reward:prize,originalId:chosen.id};
      p.dailyWheel={lastAt:t,lastSpin};
      // Persist before responding so closing Telegram during animation cannot lose the outcome.

      dirtyPlayerIds.add(p.id);
      if(prize.tier==='legendary'||prize.tier==='epic')logPlayer(p,'bonus',`виграв ${prize.label} на щоденному колесі!`);
      else logPlayer(p,'bonus',`отримав бонус ${prize.label}`,30000);
      return send(res,200,{...wheelState(p,t),ok:true,spin:lastSpin,save:{uah:p.save.uah,dailyAt:p.save.dailyAt,inv:p.save.inv},cash:w.cash,xp:w.xp});
    }finally{wheelBusy.delete(p.id)}
  }
  if(route==='player/profile'){
    if(req.method!=='GET')return send(res,405,{ok:false,err:'Method not allowed'});
    const id=String(new URL(req.url,'http://localhost').searchParams.get('id')||'').toUpperCase().trim();
    if(!/^[A-Z0-9]{8}$/.test(id))return send(res,400,{ok:false,err:'Некоректний ID гравця'});
    const target=DB.players[id];
    if(!target)return send(res,404,{ok:false,err:'Гравця не знайдено'});
    return send(res,200,{ok:true,player:publicProfile(target)});
  }
  if (route === 'account/claim') {
    const b = await body(req); if (!b) return send(res,400,{ok:false});
    const username=cleanLogin(b.username), password=b.password;
    if (!validLogin(username)) return send(res,400,{ok:false,err:'Логін: 3–20 символів, латиниця, цифри, . _ -'});
    if (!validPassword(password)) return send(res,400,{ok:false,err:'Пароль має містити 8–128 символів'});
    if (p.username && p.passHash) return send(res,409,{ok:false,err:'До цього акаунта вже привʼязаний логін'});
    if (Object.values(DB.players).some(x => x.username === username)) return send(res,409,{ok:false,err:'Такий логін уже зайнятий'});
    if(b.email){const email=cleanEmail(b.email);if(!validEmail(email))return send(res,400,{ok:false,err:'Некоректний email'});if(Object.values(DB.players).some(x=>x.id!==p.id&&x.email===email))return send(res,409,{ok:false,err:'Email вже зайнятий'});p.email=email;}
    p.username=username; p.passSalt=crypto.randomBytes(16).toString('hex'); p.passHash=passwordHash(password,p.passSalt); dirtyPlayerIds.add(p.id);
    return send(res,200,{ok:true,username});
  }
  if(route==='player/rename'){
    if(req.method!=='POST')return send(res,405,{ok:false,err:'Використай POST'});
    const b=await body(req);const name=normalizeNick(b?.name);
    if(!NICK_RE.test(name)||NICK_FORBIDDEN.test(name))return send(res,400,{ok:false,err:'Нік: 3–20 букв, цифр або _, без службових назв'});
    if(name.toLocaleLowerCase('uk')===String(p.name).toLocaleLowerCase('uk'))return send(res,200,{ok:true,name:p.name,save:p.save,nextAt:Math.max(0,Number(p.nicknameChangedAt||0)+7*DAY)});
    if(nickTaken(name,p.id))return send(res,409,{ok:false,err:'Цей нік уже зайнятий'});
    if(p.nicknameChangedAt && Date.now()-p.nicknameChangedAt<7*DAY)return send(res,429,{ok:false,err:'Наступна зміна ніку через '+Math.ceil((7*DAY-(Date.now()-p.nicknameChangedAt))/HOUR)+' год'});
    const old=p.name;p.name=name;p.nicknameChangedAt=Date.now();if(p.save)p.save.name=name;
    logPlayer(p,'profile','оновив нік (раніше '+old+')',0);
    dirtyPlayerIds.add(p.id);
    return send(res,200,{ok:true,name,save:p.save,nextAt:p.nicknameChangedAt+7*DAY});
  }
  if (route === 'account/status') return send(res,200,{ok:true,username:p.username || null,email:p.email||null,legacy:!p.passHash,telegram:!!p.telegramId});
  if (route === 'telegram/link') {
    if (!p.telegramId) return send(res,403,{ok:false,err:'Цей акаунт не привʼязаний до Telegram'});
    if (limited('tglink'+p.id,8,15*MIN)) return send(res,429,{ok:false,err:'Забагато спроб'});
    const b = await body(req), username=cleanLogin(b?.username);
    const old=Object.values(DB.players).find(x=>x.username===username);
    if (!old || !old.passHash || !safeEqual(passwordHash(b?.password||'',old.passSalt),old.passHash))
      return send(res,403,{ok:false,err:'Неправильний логін або пароль старого акаунта'});
    if (old.telegramId && old.telegramId !== p.telegramId)
      return send(res,409,{ok:false,err:'Цей профіль уже привʼязаний до іншого Telegram'});
    if (old.id === p.id) return send(res,200,{ok:true,id:p.id,key:String(req.headers['x-key'])});
    old.telegramId=p.telegramId; p.telegramId=null;
    const key=crypto.randomBytes(32).toString('hex');
    old.sessionHashes=[...new Set([...(old.sessionHashes||[]),sha(key)])].slice(-12);
    dirtyPlayerIds.add(p.id);dirtyPlayerIds.add(old.id);
    // The request transaction persists all changed players before responding.
    return send(res,200,{ok:true,id:old.id,key,restored:true});
  }
  if (route === 'account/email') {
    const b=await body(req); if(!b) return send(res,400,{ok:false});
    const email=cleanEmail(b.email);
    if(!validEmail(email))return send(res,400,{ok:false,err:'Некоректний email'});
    if(p.passHash && !safeEqual(passwordHash(b.password||'',p.passSalt),p.passHash))
      return send(res,403,{ok:false,err:'Невірний поточний пароль'});
    if(Object.values(DB.players).some(x=>x.id!==p.id&&x.email===email))return send(res,409,{ok:false,err:'Email вже зайнятий'});
    p.email=email;dirtyPlayerIds.add(p.id);return send(res,200,{ok:true});
  }
  if (route === 'account/change-password') {
    if(limited('chpass'+p.id,6,15*MIN))return send(res,429,{ok:false,err:'Зачекайте перед наступною спробою'});
    const b=await body(req);if(!b)return send(res,400,{ok:false});
    if(!p.passHash)return send(res,400,{ok:false,err:'Спочатку привʼяжіть логін і пароль'});
    if(!safeEqual(passwordHash(b.oldPassword||'',p.passSalt),p.passHash))return send(res,403,{ok:false,err:'Невірний старий пароль'});
    if(!validPassword(b.newPassword)||b.newPassword!==b.confirmPassword)return send(res,400,{ok:false,err:'Нові паролі не збігаються або закороткі'});
    p.passSalt=crypto.randomBytes(16).toString('hex');p.passHash=passwordHash(b.newPassword,p.passSalt);
    dirtyPlayerIds.add(p.id);return send(res,200,{ok:true});
  }
  if (route === 'career') {
    const w=p.world||{}, c=p.career||(p.career={status:'civilian',trainingAt:0,crateClaimed:false,coins:0});
    const caught=Math.max(0,Math.floor(num(p.save?.st?.caught)));
    const trained=!!c.trainingAt && Date.now()-c.trainingAt>=52*MIN;
    const days=Array.isArray(w.workDays)?w.workDays.length:0;
    const shifts=Math.max(0,Math.floor(num(w.workShifts)));
    const skills={experience:Math.floor(num(w.xp)),shifts,days,discipline:Math.floor(shifts/3),endurance:Math.floor(shifts/5),communication:Math.floor(shifts/4)};
    const response=()=>({ok:true,career:c,skills,caught,trained,trainingRemaining:c.trainingAt?Math.max(0,52*MIN-(Date.now()-c.trainingAt)):0});
    if(req.method==='GET')return send(res,200,response());
    const b=await body(req);if(!b)return send(res,400,{ok:false});
    if(b.action==='enroll'){
      if(!caught)return send(res,403,{ok:false,err:'Навчання відкривається лише після затримання ТЦК'});
      if(c.trainingAt)return send(res,400,{ok:false,err:'Навчання вже розпочато'});
      c.trainingAt=Date.now();c.crateClaimed=false;c.status='training';
    }else if(b.action==='crate'){
      if(!caught||!trained||c.crateClaimed)return send(res,400,{ok:false,err:'Нагорода поки недоступна'});
      c.crateClaimed=true;c.status='reserve';c.coins=(c.coins||0)+100;
    }else return send(res,400,{ok:false,err:'Невідома дія'});
    logPlayer(p,b.action==='enroll'?'tcc':'career',b.action==='enroll'?'розпочав навчання після затримання ТЦК':'завершив навчання та забрав нагороду');
    dirtyPlayerIds.add(p.id);return send(res,200,response());
  }
  if (route === 'world') {
    const w=p.world || (p.world={cash:Number(p.save?.uah)||0,xp:0,items:[],equipped:{},lastDaily:0,lastWork:0,brigade:null,look:{hair:'short',beard:'stubble',skin:'medium'}});
    const bosses=[{id:'zh',name:'Жадовський',hp:30000},{id:'my',name:'Миколаївський',hp:60000},{id:'ce',name:'Центровий',hp:100000}];
    const houses=[
      {id:'shack',name:'Обшарпана халупа',price:0,bonus:'Стартове житло',energy:0,stealth:0,level:1},
      {id:'room',name:'Кімната у гуртожитку',price:1600,bonus:'+5 енергії',energy:5,stealth:0,level:2},
      {id:'flat',name:'Квартира на районі',price:7000,bonus:'+10 енергії, +2 скритності',energy:10,stealth:2,level:5},
      {id:'loft',name:'Лофт',price:24000,bonus:'+20 енергії, +5 скритності',energy:20,stealth:5,level:10},
      {id:'lux',name:'Пентхаус люкс',price:85000,bonus:'+35 енергії, +10 скритності',energy:35,stealth:10,level:18}
    ];
    if(!w.housing)w.housing={current:'shack',owned:['shack'],awarded:[]};
    w.health=clamp(Math.floor(num(w.health,100)),0,100);
    if(!w.housing.owned.includes('shack'))w.housing.owned.unshift('shack');
    if(!w.casinoStats)w.casinoStats={spins:0,wins:0,totalBet:0,totalWon:0,jackpots:0,biggest:0};
    const gear={tracksuit:{name:'Олімпійка',slot:'body',stealth:2},uniform:{name:'Польова форма',slot:'body',energy:5},bat:{name:'Біта',slot:'weapon',attack:8},knife:{name:'Ніж (ігровий)',slot:'weapon',attack:12},chain:{name:'Ланцюг',slot:'weapon',attack:15},vest:{name:'Бронежилет',slot:'body',energy:10},shadow:{name:'Тіньова куртка',slot:'body',stealth:12},storm:{name:'Штормова форма',slot:'body',energy:20},legend:{name:'Легендарна біта',slot:'weapon',attack:40}};
    const get=()=>{if(w.brigade&&typeof w.brigade==='object')return w.brigade;const g=Object.values(DB.players).find(x=>x.world&&x.world.brigade&&typeof x.world.brigade==='object'&&x.world.brigade.id===w.brigade);return g&&g.world.brigade};
    // Fictional in-game Kyiv clock. Curfew is a gameplay rule, not real-world legal advice.
    const kyivParts=(date=new Date())=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    const nightClock=()=>{const t=kyivParts(),h=Number(t.hour),m=Number(t.minute);return {hour:h,minute:m,active:h>=0&&h<5,start:'00:00',end:'05:00'};};
    // All street rewards, risks and caught outcomes are calculated here, not by the browser.
    const nightTasks=[
      {id:'delivery',name:'Нічна доставка',cash:195,xp:38,risk:28,drop:'tracksuit',desc:'Доставити пакунок через тихі двори',motion:'courier'},
      {id:'wagons',name:'Розвантаження вагонів',cash:120,xp:34,risk:24,drop:'vest',desc:'Перенести мішки та ящики на станції',motion:'warehouse'},
      {id:'watch',name:'Нічний сторож',cash:90,xp:27,risk:12,drop:'vest',desc:'Обійти склад із ліхтариком',motion:'guard'},
      {id:'radio',name:'Радіомайстерня',cash:65,xp:25,risk:8,drop:'chain',desc:'Полагодити старий приймач',motion:'texts'},
      {id:'taxi',name:'Нічне таксі',cash:270,xp:55,risk:42,drop:'uniform',desc:'Довезти пасажира до вокзалу',motion:'courier'}
    ];
    const jobPool=[
      {id:'tea',name:'Помічник у чайній з бронню',cash:12,xp:6,risk:1,interviewRisk:2,minDays:0,minXP:0,motion:'clean',protected:true,desc:'Чай і рис, але майже нульовий ризик'},
      {id:'texts',name:'Написання текстів удома',cash:52,xp:15,risk:0,interviewRisk:4,minDays:0,minXP:0,motion:'texts',remote:true,desc:'Ноутбук, тексти, ніяких виходів'},
      {id:'courier',name:'Курʼєр',cash:100,xp:22,risk:20,interviewRisk:11,minDays:0,minXP:0,motion:'courier',desc:'Доставка по місту, ризик патруля'},
      {id:'warehouse',name:'Підсобник на складі',cash:140,xp:29,risk:28,interviewRisk:13,minDays:0,minXP:0,motion:'warehouse',desc:'Тягай ящики, отримуй більше'},
      {id:'workshop',name:'Помічник майстра',cash:190,xp:38,risk:33,interviewRisk:16,minDays:2,minXP:80,motion:'repair',desc:'Ремонтуй інструменти та обладнання'},
      {id:'guard',name:'Охоронець',cash:240,xp:46,risk:38,interviewRisk:18,minDays:3,minXP:150,motion:'guard',desc:'Патрулюй двір без броні'},
      {id:'patrol',name:'Старший зміни',cash:350,xp:58,risk:44,interviewRisk:23,minDays:5,minXP:350,motion:'repair',desc:'Відповідальний за бригаду'},
      {id:'foreman',name:'Бригадир',cash:480,xp:75,risk:49,interviewRisk:26,minDays:7,minXP:650,motion:'build',desc:'Керуєш будівельним майданчиком'},
      {id:'highway',name:'Нічний курʼєр без броні',cash:980,xp:120,risk:60,interviewRisk:20,minDays:2,minXP:100,motion:'courier',desc:'Великий заробіток, 60% шанс затримання'},
      {id:'engineer',name:'Інженер із бронню',cash:620,xp:92,risk:3,interviewRisk:8,minDays:18,minXP:1700,motion:'texts',protected:true,desc:'Стабільна висока зарплата для досвідчених'}
    ];
    const jobOffers=()=>{const cycle=Math.floor(Date.now()/(20*MIN));return jobPool.filter((j,i)=>j.id===w.employment?.id||j.minDays===0||j.id==='highway'||j.id==='engineer'||((cycle+i*3)%5)<3).map(j=>({...j,effectiveRisk:j.risk,locked:(w.workDays||[]).length<j.minDays||w.xp<j.minXP}));};
    const activeSet=()=>V27_SETS.find(set=>set.parts.every(part=>{const m=ID_RE.exec(part);return m&&p.save?.eq?.[m[1]]===part;}));
    const setBonus=()=>activeSet()?.bonus||{};
    const effectiveRisk=r=>r;
    const caughtScenes=['Бус біля зупинки','Перевірка документів','Патруль біля переходу','Рейд на робочому місці','Контроль біля вокзалу','Засідка на складі'];
    const caughtWorld=source=>{
      const incident=caughtScenes[crypto.randomInt(caughtScenes.length)],sv=p.save||(p.save=starterTelegramSave(p.name));
      if(sv.tcc)return false;
      p.tccServerOwned=true;sv.tcc={stage:0,nextAt:0,busy:false,documents:true};sv.say='Ваші документи!';
      // Document check does not injure the player.
      p.career=p.career||{status:'civilian',trainingAt:0,crateClaimed:false,coins:0};p.career.status='detained';p.career.caughtAt=Date.now();
      w.lastIncident={type:'tcc',at:Date.now(),source,scene:incident};
      w.message='ТЦК: '+incident+'. Ваші документи!';
      logPlayer(p,'tcc','потрапив до ТЦК під час «'+source+'»',0);return true;
    };
    const refreshHunger=()=>{
      const now=Date.now(),at=Math.min(now,Math.max(0,Number(w.hungerAt||now)));
      w.hunger=Math.max(0,Math.min(100,Number.isFinite(+w.hunger)?Number(w.hunger):85)-Math.floor((now-at)/HOUR)*3);
      w.hungerAt=at+Math.floor((now-at)/HOUR)*HOUR;
    };
    refreshHunger();
    const state=()=>{const br=get(),clock=weekClock(),stored=br?.weekly?.id===clock.id?br.weekly:null,teamRows=weeklyBrigades(clock.id),teamRank=teamRows.findIndex(team=>team.id===br?.id)+1||null;
      const teamWeekly={id:clock.id,score:Math.max(0,Math.floor(num(stored?.score))),goal:2500,rank:teamRank,participants:teamRows.length,keysGranted:Math.max(0,Math.floor(num(stored?.keysGranted))),
        milestones:[300,1000,2500].map((goal,i)=>({goal,claimed:Math.floor(num(stored?.keysGranted))>i})),
        contributors:Object.entries(stored?.contributors||{}).map(([id,score])=>({id,name:DB.players[id]?.name||id,score:Math.max(0,Math.floor(num(score)))})).sort((a,b)=>b.score-a.score).slice(0,8)};
      return {ok:true,serverNow:Date.now(),world:w,save:p.save,skills:{days:(w.workDays||[]).length,shifts:w.workShifts||0,xp:w.xp||0},houses,gear,bosses,sets:V27_SETS,jobs:jobOffers(),night:{...nightClock(),tasks:nightTasks.map(j=>({...j,effectiveRisk:effectiveRisk(j.risk)})),cooldownMs:Math.max(0,4*MIN-(Date.now()-(w.lastNight||0)))},brigade:br?{...br,weekly:teamWeekly,members:br.members.map(id=>({id,name:DB.players[id]?.name||id}))}:null}};
    if(req.method==='GET')return send(res,200,state());
    const b=await body(req);if(!b||typeof b.action!=='string')return send(res,400,{ok:false,err:'Некоректна дія'});
    const t=Date.now(), fail=err=>send(res,200,{ok:false,err});
    if(b.action==='daily'){
      return fail('Колесо перенесено до /api/daily-wheel — відкрий анімацію та прокрути його');
    } else if(b.action==='apply'){
      const j=jobOffers().find(x=>x.id===b.job);if(!j)return fail('Ця вакансія вже закрита. Оновіть список');if(j.locked)return fail('Недостатньо досвіду або відпрацьованих днів');
      const reason=['Погана репутація персонажа','Не підійшов зовнішній вигляд','Велика конкуренція','Роботодавець змінив вимоги'];
      if(crypto.randomInt(100)<j.interviewRisk){w.message='Відмова: '+reason[crypto.randomInt(reason.length)];}
      else {w.employment={id:j.id,name:j.name};w.message='Вас прийняли на роботу: '+j.name;}
    } else if(b.action==='quit'){
      if(w.workShift?.endsAt)return fail('Дочекайся завершення зміни');w.employment=null;w.message='Ви звільнилися';
    } else if(b.action==='shift'){
      if(p.save?.tcc)return fail('Спочатку звільнись із ТЦК');
      if(w.workShift?.endsAt)return fail('Зміна вже триває, дочекайся завершення');
      if(t-(w.lastWork||0)<5*MIN)return fail('Наступна зміна через '+Math.ceil((5*MIN-(t-w.lastWork))/1000)+' с');
      const j=jobPool.find(x=>x.id===w.employment?.id);if(!j)return fail('Спочатку влаштуйтеся на роботу');
      if(w.hunger<10)return fail('Спочатку поїж — сил для роботи не вистачає');
      const risk=effectiveRisk(j.risk);
      if(crypto.randomInt(10000)<risk*100){caughtWorld(j.name);w.lastWork=t;return send(res,200,state());}
      w.lastIncident=null;
      const houseBonus=houses.find(x=>x.id===w.housing.current)||houses[0];
      const outfitBonus=setBonus();
      const duration=60*1000+crypto.randomInt(16)*5000;
      const baseCash=j.cash+Math.floor(j.cash*(houseBonus.energy/100));
      w.workShift={startedAt:t,endsAt:t+duration,name:j.name,jobId:j.id,motion:j.motion,risk,protected:!!j.protected,cash:Math.floor(baseCash*(100+(outfitBonus.workCashPct||0))/100),xp:Math.floor(j.xp*(100+(outfitBonus.workXPPct||0))/100),drop:j.drop,loot:crypto.randomInt(100)<12,claimed:false};
      w.lastWork=t;w.hunger=Math.max(0,w.hunger-3);w.message='Зміна почалася. Зарплата після завершення таймера.';
    } else if(b.action==='workCollect'){
      const sh=w.workShift;
      if(!sh||!sh.endsAt)return fail('Немає активної зміни');
      if(t<sh.endsAt)return fail('Зміна ще триває '+Math.ceil((sh.endsAt-t)/1000)+' с');
      const amount=Math.max(0,Math.floor(Number(sh.cash)||0)),xp=Math.max(0,Math.floor(Number(sh.xp)||0));
      w.cash=(Number(w.cash)||0)+amount;w.xp=(Number(w.xp)||0)+xp;
      w.workShifts=(w.workShifts||0)+1;weeklyScore(p,'work');
      const date=kyivParts(new Date(sh.startedAt));const gameDay=`${date.year}-${date.month}-${date.day}`;
      w.workDays=Array.isArray(w.workDays)?w.workDays:[];
      if(!w.workDays.includes(gameDay))w.workDays.push(gameDay);
      w.workDays=w.workDays.slice(-365);
      const found=sh.loot&&gear[sh.drop];if(found&&!w.items.includes(sh.drop))w.items.push(sh.drop);
      w.message='Зміна завершена: +'+amount+' ₴, +'+xp+' XP'+(found?', знахідка: '+gear[sh.drop].name:'');
      w.workShift=null;w.lastWork=t;
    } else if(b.action==='nightTask'){
      if(p.save?.tcc)return fail('Спочатку звільнись із ТЦК');
      if(w.hunger<8)return fail('Спочатку поїж перед нічною вилазкою');
      const clock=nightClock();if(!clock.active)return fail('Нічні справи доступні лише з 00:00 до 05:00 за ігровим київським часом');
      if(t-(w.lastNight||0)<4*MIN)return fail('Наступна нічна справа через '+Math.ceil((4*MIN-(t-(w.lastNight||0)))/1000)+' с');
      const task=nightTasks.find(x=>x.id===b.task);if(!task)return fail('Невідома нічна справа');
      w.lastNight=t;w.nightRuns=(w.nightRuns||0)+1;
      w.hunger=Math.max(0,w.hunger-3);
      if(crypto.randomInt(10000)<effectiveRisk(task.risk)*100){caughtWorld(task.name);}
      else{const bonus=setBonus(),cash=Math.floor(task.cash*(100+(bonus.nightCashPct||0))/100),xp=Math.floor(task.xp*(100+(bonus.nightXPPct||0))/100);w.lastIncident=null;w.cash+=cash;w.xp+=xp;const loot=crypto.randomInt(100)<9;if(loot)w.items.push(task.drop);w.message='Нічна справа: +'+cash+' ₴, +'+xp+' XP'+(loot?', знахідка: '+gear[task.drop].name:'');}
    } else if(b.action==='foodRun'){
      if(p.save?.tcc)return fail('Спочатку звільнись із ТЦК');
      if(w.hunger>=100)return fail('Ти ще не голодний');
      const mode=b.mode==='order'?'order':b.mode==='shop'?'shop':null;
      if(!mode)return fail('Обери магазин чи доставку');
      const price=mode==='order'?125:55;
      if(w.cash<price)return fail('Не вистачає ігрових ₴');
      if(t-(w.lastMeal||0)<2*MIN)return fail('Наступний прийом їжі через 2 хвилини');
      w.cash-=price;w.lastMeal=t;
      if(mode==='shop'&&crypto.randomInt(100)<22){caughtWorld('Похід по продукти');}
      else{w.lastIncident=null;w.hunger=Math.min(100,w.hunger+(mode==='order'?55:45));w.message=mode==='order'?'Курʼєр приніс вечерю додому.':'Купив продукти та приготував вечерю.';logPlayer(p,'food',mode==='order'?'замовив вечерю':'повернувся з продуктами');}
    } else if(b.action==='outfitBuy'||b.action==='outfitWear'){
      const set=V27_SETS.find(x=>x.id===b.set);if(!set)return fail('Такого комплекту немає');
      const sv=p.save;if(!sv?.started)return fail('Спочатку створи персонажа');
      const owned=set.parts.every(id=>(sv.inv||[]).includes(id));
      if(b.action==='outfitBuy'){
        if(owned)return fail('Цей комплект уже куплений');
        if(Number(sv.level||1)<set.level)return fail('Потрібен рівень '+set.level);
        if(w.cash<set.price)return fail('Не вистачає ігрових ₴');
        if((sv.inv||[]).length+set.parts.length>40)return fail('Інвентар заповнений');
        w.cash-=set.price;sv.inv=sv.inv||[];
        for(const part of set.parts)if(!sv.inv.includes(part))sv.inv.push(part);
        logPlayer(p,'outfit','придбав новий комплект «'+set.name+'»');
      }else if(!owned)return fail('Спочатку придбай комплект');
      sv.eq=sv.eq||{};for(const part of set.parts){const mt=ID_RE.exec(part);if(mt)sv.eq[mt[1]]=part;}
      w.message='Одягнуто: '+set.name;
        } else if(b.action==='slots'){
      const bet=Number(b.bet);if(!Number.isSafeInteger(bet)||bet<10||bet>1000||bet>w.cash)return fail('Ставка 10–1000 ігрових ₴, не більше балансу');
      // All randomness and payouts are determined server-side. No real-money play.
      // Low stakes produce small wins more frequently; larger bets have greater volatility.
      const tier=bet<=50?0:bet<=200?1:2;
      const chance=[3800,2700,1800][tier]; // basis points: 38%, 27%, 18%
      const draw=crypto.randomInt(10000);
      let mult=0, symbol=-1;
      if(draw<chance){
        const rarity=crypto.randomInt(10000);
        if(rarity<8){symbol=5;mult=60;}           // 0.08% of wins
        else if(rarity<65){symbol=4;mult=12;}
        else if(rarity<300){symbol=3;mult=5;}
        else if(rarity<1450){symbol=2;mult=3;}
        else if(rarity<4750){symbol=1;mult=2;}
        else {symbol=0;mult=1.2;}
      }
      const reels=symbol>=0?[symbol,symbol,symbol]:(()=>{
        const a=crypto.randomInt(6),bb=crypto.randomInt(6),c=(a===bb)?(a+1+crypto.randomInt(5))%6:crypto.randomInt(6);
        return [a,bb,c];
      })();
      const win=Math.round(bet*mult);
      w.cash+=win-bet;
      w.casinoStats=w.casinoStats||{spins:0,wins:0,totalBet:0,totalWon:0,jackpots:0,biggest:0};
      const cs=w.casinoStats;cs.spins++;cs.totalBet+=bet;cs.totalWon+=win;
      if(win>0)cs.wins++;
      cs.biggest=Math.max(cs.biggest,win);
      if(symbol===5){cs.jackpots++;logPlayer(p,'jackpot',`зірвав джекпот ${win} ₴ у казино!`);}
      w.lastSpin={reels,bet,win,mult,jackpot:symbol===5,at:t};
      w.message=win?'Виграш '+win+' ₴':'Програш '+bet+' ₴';
    } else if(b.action==='casino'){
      return fail('Відкрийте окрему вкладку казино');
    } else if(b.action==='houseBuy'){
      const house=houses.find(x=>x.id===b.house);if(!house)return fail('Будинок не знайдено');
      if(w.housing.owned.includes(house.id))return fail('Житло вже ваше');
      if(w.cash<house.price)return fail('Не вистачає ігрових грошей');
      w.cash-=house.price;w.housing.owned.push(house.id);w.housing.current=house.id;
      w.message='Придбано житло: '+house.name;
    } else if(b.action==='houseEquip'){
      if(!w.housing.owned.includes(b.house))return fail('Житло ще не відкрито');
      w.housing.current=b.house;w.message='Нове житло: '+houses.find(x=>x.id===b.house).name;
    } else if(b.action==='houseClaim'){
      const house=houses.find(x=>x.id===b.house);if(!house||house.id==='shack')return fail('Немає такої нагороди');
      if(w.housing.owned.includes(house.id))return fail('Житло вже ваше');
      const lvl=Number(p.save?.level||1),bossWins=Number(p.save?.bs?.b||0),jobRuns=Math.floor(Number(w.xp||0)/100);
      const eligible=lvl>=house.level&&(house.id==='room'?jobRuns>=2:house.id==='flat'?bossWins>=2:house.id==='loft'?bossWins>=8:bossWins>=20);
      if(!eligible)return fail('Ще не виконано умови нагороди');
      w.housing.owned.push(house.id);w.housing.awarded.push(house.id);w.housing.current=house.id;
      w.message='Житло за заслуги: '+house.name;
    } else if(b.action==='equip'){
      if(!w.items.includes(b.item)||!gear[b.item])return fail('Речі немає в інвентарі');w.equipped[gear[b.item].slot]=b.item;w.message='Одягнуто: '+gear[b.item].name;
    } else if(b.action==='look'){
      const allowed={hair:['short','buzz','long'],beard:['none','stubble','full'],skin:['light','medium','dark']};for(const k of Object.keys(allowed))if(b[k]!==undefined){if(!allowed[k].includes(b[k]))return fail('Некоректний вигляд');w.look[k]=b[k]}w.message='Зовнішність збережено';
    } else if(b.action==='create'){
      if(w.brigade)return fail('Ви вже у бригаді');const name=String(b.name||'').trim();if(name.length<3||name.length>24||/[<>]/.test(name))return fail('Назва 3–24 символи');const id=crypto.randomBytes(4).toString('hex').toUpperCase();w.brigade={id,name,owner:p.id,members:[p.id],fight:null};w.message='Бригаду створено, код '+id;
    } else if(b.action==='join'){
      if(w.brigade)return fail('Ви вже у бригаді');const id=String(b.id||'').trim().toUpperCase();const target=Object.values(DB.players).map(x=>x.world?.brigade).find(x=>x&&x.id===id);if(!target)return fail('Бригаду не знайдено');if(target.members.length>=8)return fail('У бригаді максимум 8 гравців');target.members.push(p.id);const owner=DB.players[target.owner];if(owner)dirtyPlayerIds.add(owner.id);w.brigade=id;w.message='Ви вступили в '+target.name;
    } else if(b.action==='fight'){
      const br=get();if(!br||!br.members.includes(p.id))return fail('Потрібна бригада');const boss=bosses.find(x=>x.id===b.boss);if(!boss)return fail('Немає боса');if(!br.fight||br.fight.hp<=0){if(br.fight&&t-br.fight.finishedAt<10*MIN)return fail('Новий рейд через 10 хвилин');br.keys=Math.max(0,Math.floor(Number(br.keys)||0));br.wins=br.wins||{};const stage=bosses.findIndex(x=>x.id===boss.id);const needed=[0,2,4][stage];if(br.keys<needed)return fail('Для цього боса потрібно '+needed+' ключів');br.keys-=needed;br.fight={boss:boss.id,hp:boss.hp,maxHp:boss.hp,hits:{},finishedAt:0,keysSpent:needed}}if(br.fight.boss!==boss.id)return fail('Спочатку завершіть поточного боса');if(t-(br.fight.hits[p.id]||0)<30*1000)return fail('Атака раз на 30 секунд');br.fight.hits[p.id]=t;weeklyScore(p,'fight');const weapon=gear[w.equipped.weapon];const dmg=200+Math.min(300,Math.floor(w.xp/10))+(weapon?.attack||0)*20+(houses.find(x=>x.id===w.housing.current)?.energy||0)*3; br.fight.hp=Math.max(0,br.fight.hp-dmg);w.message=`Удар по ${boss.name}: ${dmg} шкоди`;if(!br.fight.hp){br.fight.finishedAt=t;br.wins=br.wins||{};br.wins[boss.id]=(Number(br.wins[boss.id])||0)+1;br.keys=(Number(br.keys)||0)+([1,2,4][bosses.findIndex(x=>x.id===boss.id)]||1);for(const id of br.members){const m=DB.players[id];if(!m)continue;const mw=m.world||(m.world={cash:Number(m.save?.uah)||0,xp:0,items:[],equipped:{}});mw.xp+=boss.hp/30;mw.cash+=boss.hp/60;const loot=boss.id==='ce'?'legend':boss.id==='my'?'storm':'shadow';if(crypto.randomInt(100)<35)mw.items.push(loot);dirtyPlayerIds.add(id)}logPlayer(p,'brigade',`із бригадою «${br.name}» переміг боса ${boss.name}!`)}
    } else if(b.action==='hospital'){
      w.health=clamp(Math.floor(num(w.health,100)),0,100);
      if(w.cash<320)return fail('Для лікування потрібно 320 ігрових ₴');
      if(t-(w.lastHospital||0)<4*HOUR)return fail('Лікарня доступна раз на 4 години');
      w.cash-=320;w.health=Math.min(100,w.health+45);w.lastHospital=t;w.message='Лікарня: здоровʼя відновлено до '+w.health+' HP';
    } else return fail('Невідома дія');
    const msgs={daily:['bonus','отримав щоденну нагороду',20000],apply:['work',w.employment?'влаштувався на роботу: '+w.employment.name:'побував на співбесіді',20000],
      quit:['work','звільнився з роботи',20000],shift:['work','почав робочу зміну',20000],workCollect:['work','завершив зміну і забрав оплату',20000],nightTask:['street','виконав нічне завдання',20000],
      slots:['casino',w.lastSpin?.win?'виграв '+w.lastSpin.win+' ₴ у казино':'зіграв у казино',30000],
      houseBuy:['housing','купив житло: '+(HOUSES_V24[b.house]||'квартиру'),0],
      houseClaim:['housing','отримав житло за досягнення: '+(HOUSES_V24[b.house]||'квартиру'),0],
      houseEquip:['housing','переїхав у '+(HOUSES_V24[b.house]||'нове житло'),20000],
      equip:['outfit','змінив спорядження',30000],look:['outfit','змінив зовнішність',30000],
      create:['brigade','створив бригаду',0],join:['brigade','приєднався до бригади',0],
      fight:['attack','атакував боса',60000],hospital:['hospital','відвідав лікарню та відновив здоровʼя',10000]};
    const item=msgs[b.action];
    if(item && !(b.action==='slots'&&w.lastSpin?.jackpot))logPlayer(p,item[0],item[1],item[2]);
    dirtyPlayerIds.add(p.id);return send(res,200,state());
  }
  if (route === 'me') return send(res, 200, { ok: true, id: p.id, name: p.name, save: p.save });
  if (route === 'save') {
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    if(b.walletRevision!==Number(p.walletRevision||0))return send(res,409,{ok:false,why:'Баланс змінився на сервері. Оновлено профіль.',save:p.save});
    const nx = b.save, v = validate(p, nx);
    if (!v.ok) { console.log('відхилено', p.id, v.why); return send(res, 200, { ok: false, why: v.why, save: p.save || undefined }); }
    v.commit();
    // Friend assists may reduce the boss damage in this save, but only damage
    // earned by this player's validated progress can be forwarded to friends.
    const verifiedBossDamage = Math.max(0, Math.round(num(v.bossDamage)));
    if (verifiedBossDamage) {
      p.pendingBossDamage = Math.min(1e15, num(p.pendingBossDamage) + verifiedBossDamage);
      p.pendingBossMax = Math.max(num(p.pendingBossMax), verifiedBossDamage);
    }
    // Server-side penalty for each newly recorded detention; no client-provided loot or amount is trusted.
    const previousCaught = Math.max(0, Math.floor(num(p.save?.st?.caught)));
    const currentCaught = Math.max(0, Math.floor(num(nx.st?.caught)));
    if (currentCaught > previousCaught && p.world) {
      const w = p.world;
      const n = Math.min(10, currentCaught - previousCaught);
      for (let i=0;i<n;i++) {
        // The primary save already includes the detention cash penalty.
        const pool = Array.isArray(w.items) ? w.items : (w.items=[]);
        for (let j=0;j<Math.min(2,pool.length);j++) {
          const idx = crypto.randomInt(pool.length), lost=pool.splice(idx,1)[0];
          for (const [slot,id] of Object.entries(w.equipped||{})) if(id===lost && !pool.includes(lost))delete w.equipped[slot];
        }
      }
      w.message = 'ТЦК: конфісковано 30% ігрових грошей та до двох речей.';
    }
    if(currentCaught>previousCaught){
      const c=p.career||(p.career={status:'civilian',trainingAt:0,crateClaimed:false,coins:0});
      c.caughtAt=Date.now();
      if(!c.trainingAt)c.status='detained';
    }
    const prevSave=p.save||{},oldLevel=Math.floor(num(prevSave.level,1));
    const oldEscaped=Math.floor(num(prevSave.st?.escaped));
    const oldShifts=Math.floor(num(prevSave.st?.shifts));
    const oldBossWins=Math.floor(num(prevSave.bs?.w));
    const prevJob=prevSave.job?.ji;
    if(p.tccServerOwned){nx.tcc=prevSave.tcc||null;nx.st=nx.st||{};nx.st.caught=prevSave.st?.caught||0;nx.st.escaped=prevSave.st?.escaped||0;}
    nx.gold = Math.min(num(nx.gold), 1e9); p.save = nx; p.lastSave = Date.now(); p.name = cleanName(nx.name);
    if(currentCaught>previousCaught){
      if(p.world)p.world.health=Math.max(1,Math.floor(num(p.world.health,100))-12);
      logPlayer(p,'tcc','був затриманий ТЦК');
    }
    if(Math.floor(num(nx.st?.escaped))>oldEscaped)logPlayer(p,'escape','вирвався після затримання ТЦК');
    if(nx.level>oldLevel && (nx.level>=5 && (oldLevel<5||Math.floor(nx.level/5)>Math.floor(oldLevel/5))))logPlayer(p,'level','досяг рівня '+nx.level,30000);
    if(nx.job?.ji!==prevJob && Number.isInteger(nx.job?.ji))logPlayer(p,'work','влаштувався: '+(JOBS_V24[nx.job.ji]||'нова робота'),30000);
    if(Math.floor(num(nx.st?.shifts))>oldShifts)logPlayer(p,'work','відпрацював ігрову зміну',15000);
    if(Math.floor(num(nx.bs?.w))>oldBossWins)logPlayer(p,'brigade','переміг боса: '+(PRIMARY_BOSS_NAMES[Math.floor(num(prevSave.bs?.b))]||'нового суперника'),0);
    if(JSON.stringify(nx.eq||{})!==JSON.stringify(prevSave.eq||{}))logPlayer(p,'outfit','переодягнув персонажа',20000);
    if(JSON.stringify(nx.look||{})!==JSON.stringify(prevSave.look||{}))logPlayer(p,'outfit','змінив зовнішність персонажа',20000);
    dirtyPlayerIds.add(p.id);
    return send(res, 200, { ok: true });
  }
  if (route === 'friends') {
    const get = id => DB.players[id], f = p.friends.map(get).filter(Boolean).map(pub);
    return send(res, 200, { ok: true, friends: f, incoming: p.reqIn.map(get).filter(Boolean).map(x => ({ id: x.id, name: x.name })) });
  }
  if (route === 'friend/add') {
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const id = String(b.id || '').toUpperCase().trim(), o = DB.players[id];
    if (limited('fa' + p.id, 30, 36e5)) return send(res, 200, { ok: false, err: 'Забагато спроб' });
    if (!o || o.id === p.id) return send(res, 200, { ok: false, err: 'Гравця з таким ID немає' });
    if (p.friends.includes(id)) return send(res, 200, { ok: true, status: 'friends' });
    if (p.friends.length >= 30) return send(res, 200, { ok: false, err: 'Максимум 30 друзів' });
    if (p.reqIn.includes(id)) {                                            
      if (o.friends.length >= 30) return send(res, 200, { ok: false, err: 'У друга вже 30 друзів' });
      p.reqIn = p.reqIn.filter(x => x !== id); o.reqOut = o.reqOut.filter(x => x !== p.id);
      p.friends.push(id); o.friends.push(p.id);
      logPlayer(p,'friends','подружився із '+cleanName(o.name));
      dirtyPlayerIds.add(p.id); dirtyPlayerIds.add(o.id);
      return send(res, 200, { ok: true, status: 'friends' });
    }
    if (!o.reqIn.includes(p.id)) { if (o.reqIn.length >= 50) return send(res, 200, { ok: false, err: 'У гравця забагато запитів' }); o.reqIn.push(p.id); }
    if (!p.reqOut.includes(id)) p.reqOut.push(id);
    dirtyPlayerIds.add(p.id); dirtyPlayerIds.add(o.id);
    return send(res, 200, { ok: true, status: 'sent' });
  }
  if (route === 'friend/del') {
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const id = String(b.id || '').toUpperCase(), o = DB.players[id], rm = (a, x) => a.filter(y => y !== x);
    p.friends = rm(p.friends, id); p.reqIn = rm(p.reqIn, id); p.reqOut = rm(p.reqOut, id);
    if (o) { o.friends = rm(o.friends, p.id); o.reqOut = rm(o.reqOut, p.id); o.reqIn = rm(o.reqIn, p.id); dirtyPlayerIds.add(o.id); }
    dirtyPlayerIds.add(p.id);
    return send(res, 200, { ok: true });
  }
  if (route === 'hit') {                                                   
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const sv = p.save, L = sv ? num(sv.level, 1) : 1, sUp = sumUp(sv && sv.up);
    const d = Math.floor(Math.max(0, num(p.pendingBossDamage)));
    const maxHit = Math.min(d, Math.floor(Math.max(0, num(p.pendingBossMax, d))));
    const t = Date.now(); p.hits = p.hits.filter(x => t - x < 3 * HOUR);
    if (d <= 0 || p.hits.length >= 30) return send(res, 200, { ok: false, err: d <= 0 ? 'Немає підтвердженого сервером удару' : 'Забагато ударів' });
    // Never trust client damage or weapon fields. Save validation calculated
    // this amount from the boss HP delta and has already committed weapon use.
    p.pendingBossDamage = 0; p.pendingBossMax = 0;
    p.hits.push(t);
    logPlayer(p,'attack','завдав '+d.toLocaleString('uk-UA')+' шкоди босу',25000);
    const previousMax = num(p.maxDamage, 0);
    if (maxHit > previousMax) { p.maxDamage=maxHit; publishNews({type:'damage',name:p.name,playerId:p.id,value:maxHit,text:`${p.name} встановив рекорд удару: ${maxHit.toLocaleString('uk-UA')} шкоди`}); }
    p.friends.forEach(id => {
      const o = DB.players[id]; if (!o) return;
      o.events.push({ name: p.name, dmg: d, t }); if (o.events.length > 50) o.events.shift();
      const rr = o.save && o.save.bs ? clamp(num(o.save.bs.r), 0, 300) : 0;     
      o.fdmg = Math.min(4 * BOSS_ROUND * Math.pow(GROW, rr) + 1e5, num(o.fdmg) + Math.round(d * .5));
      dirtyPlayerIds.add(o.id);
    });
    dirtyPlayerIds.add(p.id); 
    return send(res, 200, { ok: true, damage: d });
  }
  if (route === 'events') { const list = p.events; p.events = []; dirtyPlayerIds.add(p.id); return send(res, 200, { ok: true, list }); }
  return send(res, 404, { ok: false });
}

// One process owns the in-memory game. Serialize requests and commit a single
// Postgres upsert statement for all participants before acknowledging any action.
async function durableApi(req,res,route){
  if(route==='news/stream')return api(req,res,route);
  const run=async()=>{
    await dbReady;
    if(!supabase||!dbLoaded)return send(res,503,{ok:false,err:'База збережень недоступна'});
    const before=JSON.stringify(DB.players), oldNews=JSON.stringify(newsEvents);
    const oldDirty=new Set(dirtyPlayerIds), oldNewsDirty=newsDirty, oldCooldowns=new Map(activityCooldowns);
    const oldPlayers=JSON.parse(before);
    const captured={capture:true};
    transactionActive=true;
    try{
      for(const p of Object.values(DB.players)){
        if(route!=='save')welcomeGift(p);if(!p.save)continue;
        if(!p.economyV26){
          // Preserve both legacy balances once; never award the old 500 starter again.
          p.save.uah=Math.max(0,Number(p.save.uah)||0)+Math.max(0,Number(p.world?.cash)||0);
          p.economyV26=true;
        }
        if(p.world)p.world.cash=p.save.uah;
      }
      const baseline=JSON.parse(JSON.stringify(DB.players));
      await api(req,captured,route);
      if(!captured.captured)throw Error('Missing API response');
      const {code,obj}=captured.captured;
      if(code>=400||obj.ok===false){
        DB.players=JSON.parse(before);newsEvents=JSON.parse(oldNews);
        dirtyPlayerIds=oldDirty;newsDirty=oldNewsDirty;activityCooldowns.clear();for(const [k,v] of oldCooldowns)activityCooldowns.set(k,v);
        const current=auth(req);if(current)obj.walletRevision=Number(current.walletRevision||0);
        return send(res,code,obj);
      }
      for(const p of Object.values(DB.players)){
        welcomeGift(p);if(!p.save)continue;
        const base=baseline[p.id];
        if(!base?.save&&!p.economyV26){
          p.save.uah+=Math.max(0,Number(base?.world?.cash)||0);
          p.economyV26=true;
        }
        if((route==='world'||route==='daily-wheel')&&p.world){
          const delta=Number(p.world.cash||0)-Number(base?.world?.cash??base?.save?.uah??p.save.uah);
          p.save.uah=Math.max(0,Number(p.save.uah||0)+delta);
        }
        if(p.world)p.world.cash=p.save.uah;
        if(p.save.uah!==oldPlayers[p.id]?.save?.uah||p.save.gold!==oldPlayers[p.id]?.save?.gold)p.walletRevision=Number(p.walletRevision||0)+1;
      }
      const rows=Object.values(DB.players).filter(p=>JSON.stringify(p)!==JSON.stringify(oldPlayers[p.id])).map(p=>({id:p.id,data:p}));
      if(newsDirty)rows.push({id:NEWS_ROW_ID,data:{events:newsEvents.slice(0,200),updated:Date.now()}});
      if(rows.length){const {error}=await supabase.from('players').upsert(rows);if(error)throw error;}
      rows.forEach(row=>dirtyPlayerIds.delete(row.id));newsDirty=false;
      const known=new Set(JSON.parse(oldNews).map(e=>e.id));
      for(const event of newsEvents.filter(e=>!known.has(e.id)).reverse()){
        for(const sub of newsSubscribers){try{sub.write('data: '+JSON.stringify(event)+'\n\n')}catch{newsSubscribers.delete(sub)}}
      }
      const current=auth(req)||DB.players[obj.id];
      if(current){obj.walletRevision=Number(current.walletRevision||0);if(current.save){obj.walletCash=current.save.uah;if(obj.save)obj.save=current.save;if(route==='save')obj.save=current.save;}}
      return send(res,code,obj);
    }catch(e){
      DB.players=JSON.parse(before);newsEvents=JSON.parse(oldNews);
      dirtyPlayerIds=oldDirty;newsDirty=oldNewsDirty;activityCooldowns.clear();for(const [k,v] of oldCooldowns)activityCooldowns.set(k,v);
      console.error('Commit failed:',e.message);
      return send(res,503,{ok:false,err:'Не вдалося підтвердити збереження. Оновіть профіль перед повторною дією.'});
    }finally{transactionActive=false;}
  };
  const pending=requestQueue.then(run,run);requestQueue=pending.catch(()=>{});return pending;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (u.pathname.startsWith('/api/')) return await durableApi(req, res, u.pathname.slice(5));
    if (u.pathname.startsWith('/assets/')) {
      const name = u.pathname.slice('/assets/'.length);
      if (!['noir-courtyard-day.webp','noir-courtyard-night.webp',...['yard','street','park','home'].flatMap(x=>['day','night'].map(t=>'location-'+x+'-'+t+'.webp')),...['cherry','lemon','star','medal','diamond','seven'].map(x=>'casino-'+x+'.svg')].includes(name)) {res.writeHead(404);return res.end('Not found')}
      return fs.readFile(path.join(__dirname,'assets',name),(err,data)=>{
        if(err){res.writeHead(404);return res.end('Not found')}
        res.writeHead(200,{'content-type':name.endsWith('.svg')?'image/svg+xml; charset=utf-8':'image/webp','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'});res.end(data)
      });
    }
    if (u.pathname === '/uhy-polish.css' || u.pathname === '/uhy-polish.js' || u.pathname === '/uhy-live.css' || u.pathname === '/weekly.js' || u.pathname === '/motion.js' || u.pathname === '/city-events.js' || u.pathname === '/v27.css' || u.pathname === '/v27-action.js' || u.pathname === '/combat.js') {
      const f=path.join(__dirname,u.pathname.slice(1));
      return fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}
        res.writeHead(200,{'content-type':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(data)});
    }
    if (u.pathname === '/uhylyant-comic.js' || u.pathname === '/uhylyant-ui.js' || u.pathname === '/uhylyant-3d.js' || u.pathname === '/uhylyant-account.js') { const f=path.join(__dirname,u.pathname.slice(1)); return fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache'});res.end(data)}); }
    const primaryHtml = path.join(__dirname, 'uhylyant.html');
    const htmlPath = fs.existsSync(primaryHtml) ? primaryHtml : path.join(__dirname, 'uhylyant (1).html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
      if (err) { if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Немає файлу uhylyant.html поруч із server.js'); }
      const addon = `
<style>
#socialDock{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;padding:5px 0 8px;background:#251f19;border-top:1px solid #66533a}
#socialDock button{border:1px solid #8c7047;border-radius:9px;background:#3d342a;color:#f3e9d2;padding:7px 10px;font-weight:700;font-size:12px;cursor:pointer}
#socialDock button:active{transform:translateY(1px)}
#socialPanel{position:fixed;inset:0;z-index:9999;background:#090b0eeF;display:none;align-items:center;justify-content:center;padding:16px;font:14px system-ui;color:#f3e9d2}
#socialPanel .spbox{width:min(520px,100%);max-height:90vh;overflow:auto;background:#2d2720;border:2px solid #8c7047;border-radius:18px;padding:18px;box-shadow:0 12px 50px #000}
#socialPanel h2{font-size:23px;margin:0 0 12px}#socialPanel input{display:block;width:100%;padding:12px;margin:7px 0;border-radius:9px;border:1px solid #776448;background:#14100c;color:#fff;box-sizing:border-box}
#socialPanel button{border:1px solid #9a7134;border-radius:9px;background:#f2a931;color:#211600;padding:10px 13px;font-weight:700;cursor:pointer;margin:4px 4px 4px 0}
#socialPanel button.alt{background:#3d342a;color:#f3e9d2;border-color:#776448}#socialPanel .spitem{padding:10px 0;border-bottom:1px solid #5b4d3b}#socialPanel .muted{color:#b9ab8f;font-size:12px}#socialPanel .spclose{float:right}

#socialPanel .career-head{background:linear-gradient(120deg,#39271c,#15110e);padding:18px;border:2px solid #9b6c37;border-radius:9px}
#socialPanel .career-head h2{color:#ffbf47}
#socialPanel .career-skillgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
#socialPanel .career-skill{background:linear-gradient(145deg,#493222,#231c18);border:2px solid #916a3d;border-radius:9px;padding:14px;display:flex;flex-direction:column;gap:6px}
#socialPanel .career-skill strong{font:700 28px Oswald,Impact,sans-serif;color:#ffcb61}
#socialPanel .career-skill small{color:#cbbba6}
#socialPanel .career-road,#socialPanel .career-training{background:#251e19;border:2px solid #765337;border-radius:9px;padding:16px;margin:12px 0}
#socialPanel .training-animation{display:flex;justify-content:space-around;background:linear-gradient(#44372c,#221c17);border-radius:9px;margin:10px 0;padding:15px;overflow:hidden}
#socialPanel .training-animation span{font-size:40px;display:block;animation:careerMove 1.5s ease-in-out infinite alternate}
#socialPanel .training-animation span:nth-child(2){animation-delay:.4s}#socialPanel .training-animation span:nth-child(3){animation-delay:.8s}
#socialPanel .training-track{height:16px;background:#100d0a;border:1px solid #ac844c;border-radius:20px;overflow:hidden}
#socialPanel .training-track i{display:block;height:100%;background:linear-gradient(90deg,#b45d23,#ffc75a);transition:width 1s}
@keyframes careerMove{to{transform:translateY(-12px) rotate(8deg)}}
@media(max-width:650px){#socialPanel .career-skillgrid{grid-template-columns:repeat(2,minmax(0,1fr))}#socialPanel .career-skill{padding:9px}}
@media(prefers-reduced-motion:reduce){#socialPanel .training-animation span{animation:none}}
</style>
<div id="socialPanel"><div class="spbox"><button class="alt spclose" id="spClose">Закрити</button><div id="spBody"></div></div></div>
<script>
(()=>{'use strict';const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=(()=>{try{return JSON.parse(localStorage.getItem('vt_net')||'null')}catch(e){return null}})()||{};let panel=$('#socialPanel'),body=$('#spBody'),active='';
let newsTimer=null,newsStream=null,newsVersion='',lastNewsList=[];
function stopNews(){if(newsTimer){clearInterval(newsTimer);newsTimer=null;}if(newsStream){newsStream.close();newsStream=null;}}
const newsLabels={join:'🏙 Новий гравець',work:'💼 Робота',housing:'🏠 Нерухомість',casino:'🎰 Казино',jackpot:'💎 Джекпот',bonus:'🎁 Бонус',tcc:'🚐 ТЦК',escape:'🏃 Звільнення',street:'🌙 Вулиця',level:'⭐ Рівень',outfit:'🧥 Одяг',brigade:'⚔ Бригада',attack:'👊 Бій',damage:'💥 Рекорд',hospital:'🏥 Лікарня',friends:'🤝 Друзі',career:'🎖 Карʼєра',donation:'💛 Підтримка'};
function money(n){return Number(n||0).toLocaleString('uk-UA')}
function newsDetail(ev){const text=String(ev.text||'Подія'),name=String(ev.name||'');return ev.playerId&&text.startsWith(name+' ')?text.slice(name.length+1):text;}
function listNews(list){
 return list.length?list.map(ev=>'<article class="uhy-feed-item"><div class="uhy-feed-icon">'+esc((newsLabels[ev.type]||'📢 Подія').split(' ')[0])+'</div><div class="uhy-feed-main"><div class="uhy-feed-top">'+(ev.playerId?'<button type="button" class="uhy-feed-person" data-profile="'+esc(ev.playerId)+'" data-return="news">'+esc(ev.name||'Гравець')+'</button>':'<b>'+esc(ev.name||'Новини')+'</b>')+'<small>'+esc(newsLabels[ev.type]||'Подія')+'</small></div><div>'+esc(newsDetail(ev))+'</div><time datetime="'+new Date(Number(ev.t)||Date.now()).toISOString()+'">'+new Date(Number(ev.t)||Date.now()).toLocaleString('uk-UA')+'</time></div></article>').join(''):'<p class="uhy-live-empty">Поки немає подій. Коли гравці почнуть працювати, битися, міняти хати й перемагати — тут зʼявляться новини.</p>';
}
async function liveNews(){
 body.innerHTML='<h2>📰 Хроніка міста <span class="uhy-live-light">● LIVE</span></h2><div class="uhy-feed-note">Ігрові події оновлюються автоматично приблизно кожні 3,5 секунди. Натисни на імʼя, щоб подивитися профіль.</div><div class="uhy-profile-search"><input id="uhyProfileId" maxlength="8" placeholder="Пошук гравця за ID"><button id="uhyProfileGo" type="button">Знайти</button></div><section id="uhyLiveFeed" aria-live="polite">Завантаження…</section>';
 const input=body.querySelector('#uhyProfileId'),go=body.querySelector('#uhyProfileGo');
 const lookup=()=>{const id=String(input.value||'').trim().toUpperCase();if(/^[A-Z0-9]{8}$/.test(id))showPlayerProfile(id,'news');else alert('Вкажіть 8-символьний ID')};
 go.onclick=lookup;input.addEventListener('keydown',e=>{if(e.key==='Enter')lookup()});
 newsVersion='';
 async function refresh(force=false){
   if(active!=='news'||panel.style.display!=='flex'||document.hidden)return;
   const r=await api('news?limit=80',null,false);
   if(active!=='news')return;
   const dest=body.querySelector('#uhyLiveFeed');if(!dest)return;
   if(!r.ok){if(force)dest.textContent=r.err||'Немає звʼязку';return;}
   if(!force&&r.version===newsVersion)return;
   newsVersion=r.version||'';lastNewsList=Array.isArray(r.list)?r.list:[];
   dest.innerHTML=listNews(lastNewsList);
 }
 await refresh(true);
 newsTimer=setInterval(()=>refresh(false),3500); // fallback and synchronization after reconnect
 if(typeof EventSource==='function'){
   newsStream=new EventSource('/api/news/stream');
   newsStream.onmessage=(event)=>{
     if(active!=='news')return;
     try{
       const fresh=JSON.parse(event.data);
       if(!fresh?.id||lastNewsList.some(x=>x.id===fresh.id))return;
       newsVersion=fresh.id;
       lastNewsList=[fresh,...lastNewsList].slice(0,80);
       const dest=body.querySelector('#uhyLiveFeed');if(dest)dest.innerHTML=listNews(lastNewsList);
     }catch(e){}
   };
 }
}
async function showPlayerProfile(id,from){
 stopNews();active='profile';open();panel.classList.add('uhy-view-profile');body.innerHTML='<h2>👤 Профіль гравця</h2><p>Завантаження…</p>';
 const result=await api('player/profile?id='+encodeURIComponent(id),null,true);
 if(active!=='profile')return;
 if(!result.ok){body.innerHTML='<h2>Профіль</h2><p>'+esc(result.err||'Неможливо відкрити гравця')+'</p><button id="uhyProfileBack">← Назад</button>';
   body.querySelector('#uhyProfileBack').onclick=()=>show(from||'news');return;}
 const pl=result.player,house=pl.house||{},prefix='<div class="uhy-profile-top"><button class="uhy-back" id="uhyProfileBack" type="button">← Назад</button><div><h2>'+esc(pl.name)+'</h2><p>ID: '+esc(pl.id)+' · рівень '+Number(pl.level||1)+' · '+(pl.online?'🟢 онлайн':'⚪ офлайн')+'</p></div></div>';
 let avatar='',background='';
 try{
   const art=window.UHART;
   if(art?.cfgFor&&art?.svg){avatar=art.svg(art.cfgFor(pl.look||{},pl.equipped||{},'ok'),'0 0 200 262')}
   if(art?.paint){background=art.paint('home',{phase:'day',house:house.id||'shack',seed:7}).bg||''}
 }catch(e){console.warn('Profile art',e)}
 const scene='<div class="uhy-profile-scene" aria-label="Хата та персонаж гравця"><div class="uhy-profile-room">'+background+'</div><div class="uhy-profile-avatar">'+avatar+'</div><div class="uhy-profile-label">🏠 '+esc(house.name||'Стартова хата')+'</div></div>';
 const outfits=Object.entries(pl.equipped||{}).map(([slot,item])=>{let name=item;try{if(typeof ITEM!=='undefined'&&ITEM[item]?.name)name=ITEM[item].name}catch(e){}return '<span>'+esc(name)+'</span>'}).join('');
 const gear=(pl.gear||[]).map(g=>'<span>'+esc(g.name)+'</span>').join('');
 const stats='<div class="uhy-profile-stats"><div><small>❤️ Здоровʼя</small><b>'+Number(pl.hp)+'/'+Number(pl.maxHp)+'</b><div class="uhy-profile-meter"><i style="width:'+Math.max(0,Math.min(100,Number(pl.hp)))+'%"></i></div></div><div><small>💼 Робота</small><b>'+esc(pl.job||'Безробітний')+'</b></div><div><small>🥊 Перемоги</small><b>'+money(pl.bossWins)+'</b></div><div><small>💥 Кращий удар</small><b>'+money(pl.bossDamage)+'</b></div><div><small>⏱ Зміни</small><b>'+money(pl.shifts)+'</b></div><div><small>🎰 Джекпоти</small><b>'+money(pl.casinoJackpots)+'</b></div></div>';
 const details='<div class="uhy-profile-details"><div class="uhy-profile-card"><h3>🧥 Одяг персонажа</h3><div class="uhy-profile-items">'+(outfits||'Звичайний одяг')+'</div></div><div class="uhy-profile-card"><h3>🏠 Мій дім</h3><p>'+esc(house.name||'Стартова хата')+' · власних обʼєктів: '+Number(house.owned||1)+'</p></div><div class="uhy-profile-card"><h3>🎖 Статус</h3><p>'+esc(pl.tccStatus||'Вільний')+' · бригада: '+esc(pl.brigade||'Немає')+'</p></div>'+(gear?'<div class="uhy-profile-card"><h3>🛡 Спорядження</h3><div class="uhy-profile-items">'+gear+'</div></div>':'')+'</div>';
 body.innerHTML=prefix+scene+stats+details+(pl.id!==token.id?'<div class="uhy-profile-actions"><button type="button" id="uhyProfileFriend">+ Додати у друзі</button></div>':'');
 body.querySelector('#uhyProfileBack').onclick=()=>show(from||'news');
 const friend=body.querySelector('#uhyProfileFriend');if(friend)friend.onclick=async()=>{friend.disabled=true;const r=await api('friend/add',{id:pl.id});friend.textContent=r.ok?'✓ Запит надіслано':(r.err||'Не вдалося додати');};
}
document.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-profile]');if(b&&panel.contains(b)){ev.preventDefault();showPlayerProfile(b.dataset.profile,b.dataset.return||active)}},true);

const api=async(path,data,auth=true)=>{try{
 let t=token;try{t=JSON.parse(localStorage.getItem('vt_net')||'null')||token}catch(e){}
 const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(auth?{'x-id':t.id||'','x-key':t.key||''}:{})},body:data?JSON.stringify(data):undefined});return await r.json()
 }catch(e){return {ok:false,err:'Немає зв’язку із сервером'}}};
function open(){panel.style.display='flex'}function close(){stopNews();active='';panel.classList.remove('uhy-view-profile');panel.style.display='none'}$('#spClose').onclick=close;panel.addEventListener('click',e=>{if(e.target===panel)close()});
function dock(){let nav=$('#tabs');if(!nav||$('#socialDock'))return;let d=document.createElement('div');d.id='socialDock';d.innerHTML='<button data-sp="account">👤 Акаунт</button><button data-sp="leaderboard">🏆 Топ-100</button><button data-sp="friends">👥 Друзі</button><button data-sp="news">📰 Новини</button><button data-sp="career">🎖 Кар’єра / резерв</button><button data-sp="world">🏙 Вулиця</button><button data-sp="housing">🏠 Хати</button><button data-sp="casino">🎰 Казино</button>';nav.appendChild(d);d.addEventListener('click',e=>{let b=e.target.closest('[data-sp]');if(b)show(b.dataset.sp)});}
async function show(which){stopNews();active=which;panel.classList.remove('uhy-view-profile');open();body.innerHTML='<h2>Завантаження…</h2>';
 if(which==='account'){await window.UHYACCOUNT.render(body,api,token,()=>show('account'));return;}
 if(which==='leaderboard'){
  let modes=[['level','Рівень'],['boss','Боси'],['casino','Виграші казино'],['jackpots','Джекпоти'],['wealth','Капітал'],['work','Досвід роботи'],['housing','Нерухомість']];
  body.innerHTML='<h2>🏆 Рейтинги гравців</h2><div id="rankModes" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">'+modes.map(m=>'<button data-mode="'+m[0]+'">'+m[1]+'</button>').join('')+'</div><div id="rankRows">Завантаження…</div>';
  const load=async(mode)=>{let r=await api('leaderboard?mode='+encodeURIComponent(mode),null,false);
   const dest=document.getElementById('rankRows');if(!dest)return;
   dest.innerHTML=(r.list||[]).map((x,i)=>'<div class="spitem uhy-rank-row"><b>#'+(i+1)+' <button class="uhy-feed-person" data-profile="'+esc(x.id)+'" data-return="leaderboard">'+esc(x.name)+'</button></b> · '+Number(x.score||0).toLocaleString('uk-UA')+'<div class="muted">Рівень '+x.level+' · '+(x.on?'онлайн':'офлайн')+'</div></div>').join('')||'<p>Поки немає гравців.</p>';
  };
  body.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>load(b.dataset.mode));
  await load('level');return;
 }
 if(which==='friends'){if(!token.id){body.innerHTML='<h2>Друзі</h2><p>Спочатку увійди в акаунт.</p>';return}let r=await api('friends');body.innerHTML='<h2>Друзі</h2><input id="spFriend" placeholder="ID гравця"><button id="spAdd">Додати друга</button>'+(r.incoming||[]).map(f=>'<div class="spitem">Запит: '+esc(f.name)+' · '+esc(f.id)+' <button data-accept="'+esc(f.id)+'">Прийняти</button></div>').join('')+(r.friends||[]).map(f=>'<div class="spitem"><button type="button" class="uhy-feed-person" data-profile="'+esc(f.id)+'" data-return="friends">'+esc(f.name)+'</button> · рівень '+f.level+' · '+(f.on?'онлайн':'офлайн')+'</div>').join('');$('#spAdd').onclick=async()=>{let x=await api('friend/add',{id:$('#spFriend').value});alert(x.ok?'Запит надіслано':x.err||'Помилка');show('friends')};body.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{await api('friend/add',{id:b.dataset.accept});show('friends')});return;}
 if(which==='news'){await liveNews();return;}
 if(which==='world'||which==='casino'||which==='housing'){await window.UHYUI.show(which);return;}
 if(which==='career'){
  if(!token.id){body.innerHTML='<h2>Кар’єра</h2><p>Увійди в акаунт, щоб зберігати навички.</p>';return}
  const r=await api('career');if(!r.ok){body.textContent=r.err||'Помилка';return}
  const c=r.career||{},sk=r.skills||{},caught=r.caught||0,remaining=r.trainingRemaining||0;
  const training=!!c.trainingAt;
  const status=training?(remaining?'Навчальний центр':'Навчання завершено'):caught?'Після затримання ТЦК':'Цивільний';
  const stat=(name,value,desc)=>'<div class="career-skill"><span>'+name+'</span><strong>'+value+'</strong><small>'+desc+'</small></div>';
  body.innerHTML='<div class="career-head"><h2>🎖 КАР’ЄРА ТА НАВИЧКИ</h2><p>Твій шлях від першої підробітки до високооплачуваних вакансій.</p></div><div class="career-skillgrid">'
   +stat('⭐ Досвід',sk.experience||0,'За роботу')+stat('📆 Робочі дні',sk.days||0,'Різні календарні дні')
   +stat('🧰 Зміни',sk.shifts||0,'Відпрацьовано')+stat('💪 Витривалість',sk.endurance||0,'За 5 змін')
   +stat('🧠 Дисципліна',sk.discipline||0,'За 3 зміни')+stat('🤝 Комунікація',sk.communication||0,'За 4 зміни')
   +'</div><div class="career-road"><h3>💼 СХОДИНКИ КАР’ЄРИ</h3><div>Підсобник / кур’єр → помічник майстра → охоронець → старший зміни → бригадир</div><p>Вищі вакансії відкриваються після кількох різних робочих днів та накопичення XP. Перевіряй доступність на біржі праці.</p></div><div class="career-training"><h3>🎖 НАВЧАЛЬНИЙ ЦЕНТР</h3><p>Статус: <b>'+esc(status)+'</b> · Затримань ТЦК: '+caught+'</p>'
   +(training?'<div class="training-animation"><span>🏃</span><span>🎯</span><span>🎒</span></div><div class="training-track"><i style="width:'+Math.min(100,100*(1-remaining/(52*60000)))+'%"></i></div><p>'+(remaining?'Залишилось '+Math.ceil(remaining/60000)+' хв':'Навчання завершено')+'</p>':caught?'<button id="spEnroll">Почати навчання (52 хв)</button>':'<p class="muted">🔒 Навчання недоступне до затримання ТЦК. Самостійно записатися не можна.</p>')
   +(training&&remaining===0&&!c.crateClaimed?'<button id="spCrate">Отримати нагороду навчального центру</button>':'')
   +'<p class="muted">Ігровий режим. Кнопки «Вийти в наряд» більше немає.</p></div>';
  if($('#spEnroll'))$('#spEnroll').onclick=async()=>{let x=await api('career',{action:'enroll'});if(!x.ok)alert(x.err);show('career')};
  if($('#spCrate'))$('#spCrate').onclick=async()=>{let x=await api('career',{action:'crate'});if(!x.ok)alert(x.err);show('career')};
  return;
 }

}
const observer=new MutationObserver(dock);observer.observe($('#tabs'),{childList:true});dock();
})();
</script>`;
      const extras = '<script src="/uhylyant-ui.js"></script><script src="/uhylyant-account.js"></script><link rel="stylesheet" href="/uhy-live.css"><script src="/weekly.js"></script><script src="/motion.js"></script><script src="/city-events.js"></script><link rel="stylesheet" href="/v27.css"><script src="/v27-action.js"></script><script src="/combat.js"></script>';
      // Patch the original client's detention handler in-memory; source HTML and old saves remain compatible.
      const oldCatch = `S.tcc={stage:0,nextAt:0,busy:false};S.st.caught++;`;
      const newCatch = `S.tcc={stage:0,nextAt:0,busy:false};S.st.caught++;
   const lostCash=Math.floor(Math.max(0,S.uah)*.30);S.uah-=lostCash;
   const baseIds=['head0','body0','legs0','shoes0','acc0'];
   const removable=S.inv.filter(id=>!baseIds.includes(id));
   const taken=[];
   for(let i=0;i<2&&removable.length;i++){
     const at=Math.floor(Math.random()*removable.length),id=removable.splice(at,1)[0];
     S.inv=S.inv.filter(x=>x!==id);taken.push(ITEM[id]?.name||id);
     if(S.up)delete S.up[id];
     for(const slot of Object.keys(S.eq))if(S.eq[slot]===id)S.eq[slot]=BASE_EQ[slot];
   }
   const bruises=['Синець під оком і розбита губа.','Після сутички обличчя в синцях.','Добряче дісталося по обличчю.'];
   S.say=bruises[Math.floor(Math.random()*bruises.length)]+' Забрали ₴'+lostCash+(taken.length?' та речі: '+taken.join(', '):'. Інших речей не було.');
   toast('ТЦК: −30% грошей'+(taken.length?', −'+taken.length+' речі':''),'bad');`;
      const patchedHtml = html.includes(oldCatch) ? html.replace(oldCatch,newCatch) : html;
      const out = patchedHtml.includes('</body>') ? patchedHtml.replace('</body>', addon + extras + '</body>') : patchedHtml + addon + extras;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-cache' });
      res.end(out);
    });
  } catch (e) { console.error(e); try { send(res, 500, { ok: false }); } catch (_) {} }
});
process.on('uncaughtException', e => console.error('uncaught', e));

if (require.main === module) server.listen(PORT, () => console.log('Ухилянт: http://localhost:' + PORT));
module.exports = { weekClock, weeklyScore, leagueDivision, server, durableApi, dbReady, validate, fresh, DB, basePay, xpNeed, tierOf, totalXP, hpOf, FOOD_CD, FOOD_EN, REGEN };
