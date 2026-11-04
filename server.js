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

async function loadDB() {
  if (!supabase) { console.warn('Supabase не налаштовано: дані зникнуть після перезапуску!');return; }
  try {
    // Supabase REST defaults to 1000 rows: explicitly page to load every player.
    let count=0;
    for(let from=0;from<100000;from+=1000){
      const {data,error}=await supabase.from('players').select('*').range(from,from+999);
      if(error)throw error;
      for(const row of data||[]){if(row&&row.id&&row.data){DB.players[row.id]=row.data;count++;}}
      if(!data||data.length<1000)break;
    }
    console.log('Завантажено '+count+' гравців із Supabase');
  } catch(e){console.error('Помилка завантаження бази:',e?.message||e);throw e;}
}
const dbReady = loadDB();

let dirtyPlayerIds = new Set();
// Prevent overlapping full-row Supabase writes: without serialization an older
// write can finish after a newer one and silently overwrite player progress.
let flushPromise = null;
async function flush() {
  if (!supabase || dirtyPlayerIds.size === 0) return flushPromise || Promise.resolve();
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    while (dirtyPlayerIds.size) {
      const idsToSave = Array.from(dirtyPlayerIds);
      dirtyPlayerIds.clear();
      let failures=0;
      for (const id of idsToSave) {
        const playerData = DB.players[id];
        if (!playerData) continue;
        try {
          // Copy once so network serialization has a consistent document.
          const snapshot = JSON.parse(JSON.stringify(playerData));
          const { error } = await supabase.from('players').upsert({ id, data: snapshot });
          if (error) throw error;
        } catch (e) {
          console.error('Supabase save failed for player '+id+':',e?.message||e);
          dirtyPlayerIds.add(id);failures++;
        }
      }
      // Avoid a hot loop while the database is unavailable. Retry on next tick.
      if (failures) break;
    }
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}
setInterval(() => { flush().catch(e => console.error('Flush error',e)); },3000).unref();
let shuttingDown=false;
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, async () => {
  if(shuttingDown)return;shuttingDown=true;
  console.log('Shutdown: saving player progress ('+sig+')');
  const kill=setTimeout(()=>process.exit(1),15000);kill.unref();
  try{if(flushPromise)await flushPromise;await flush();}
  catch(e){console.error('Shutdown flush failed:',e)}
  process.exit(dirtyPlayerIds.size?1:0);
}));

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
const publicNews = [];
function publishNews(item) {
  const event = Object.assign({ id: crypto.randomUUID(), t: Date.now() }, item);
  publicNews.unshift(event); if (publicNews.length > 100) publicNews.length = 100;
  // Дублюємо стрічку в дані гравців, щоб вона переживала перезапуск без окремої таблиці Supabase.
  for (const p of Object.values(DB.players)) {
    p.news = [event, ...(p.news || []).filter(x => x.id !== event.id)].slice(0, 100);
    dirtyPlayerIds.add(p.id);
  }
  return event;
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
const cleanName = n => String(n || 'Ухилянт').replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Ухилянт';
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sumUp = up => Object.values(up || {}).reduce((a, b) => a + Math.max(0, num(b)), 0);

const rate = new Map();                                                   
function limited(key, max, win) { const t = Date.now(), a = (rate.get(key) || []).filter(x => t - x < win); a.push(t); rate.set(key, a); return a.length > max; }
setInterval(() => { const t = Date.now(); for (const [k, a] of rate) if (!a.some(x => t - x < 36e5)) rate.delete(k); }, 6e4).unref();

function fresh() {
  return { level: 1, xp: 0, uah: 150, gold: 0, ng: 0, inv: ['head0', 'body0', 'legs0', 'shoes0', 'acc0'], up: {}, st: { earned: 0, escaped: 0, caught: 0 }, bs: { me: 0, wp: [], r: 0, b: 0, w: 0 }, dailyAt: 0, end: null, seenEnd: false };
}
const ID_RE = /^(head|body|legs|shoes|acc)([0-6])$/;
const BASE_INV = ['head0', 'body0', 'legs0', 'shoes0', 'acc0'];
const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

function validate(p, nx) {
  const t = Date.now(), pv = p.save || fresh(), bad = why => ({ ok: false, why });
  if (!nx || typeof nx !== 'object' || Array.isArray(nx)) return bad('формат');
  for (const k of Object.keys(nx)) if (!KEYS.includes(k)) delete nx[k];
  nx.name = cleanName(nx.name); nx.say = String(nx.say || '').slice(0, 300);

  const L = num(nx.level, 0), xp = num(nx.xp, -1), ng = num(nx.ng, 0), uah = num(nx.uah, -1), gold = num(nx.gold, -1);
  if (!isInt(L, 1, 1e7) || !(xp >= 0) || xp > xpNeed(L) + 1e-6) return bad('рівень');
  if (!isInt(ng, 0, 1e4)) return bad('нове життя');
  if (!(uah >= 0) || !(gold >= 0) || uah > 1e18 || gold > 1e9) return bad('баланс');
  nx.level = L; nx.xp = xp; nx.ng = ng; nx.uah = uah; nx.gold = gold;

  const inv = Array.isArray(nx.inv) ? nx.inv : null;
  if (!inv || inv.length > 40 || new Set(inv).size !== inv.length) return bad('інвентар');
  let maxT = 0;
  for (const id of inv) { const m = ID_RE.exec(String(id)); if (!m) return bad('предмет'); maxT = Math.max(maxT, +m[2]); }
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
    ok: true, commit() {
      p.bud = { e: Math.max(0, E - need), t }; p.goldBank = bank; p.goldSpent = spent; p.fdmg = F - useF;
      p.evClaim = Object.assign(p.evClaim || {}, ...claims.map(id => ({ [id]: t })));
    }
  };
}

/* ---------- API ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
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
const WORLD_START = () => ({cash:500,xp:0,items:[],equipped:{},lastDaily:0,lastWork:0,brigade:null,look:{hair:'short',beard:'stubble',skin:'medium'},crowns:0,scrap:0,street:{mode:'idle',lastRun:0,until:0,cooldownUntil:0,loot:null,reason:''},boosts:{stealth:0,luck:0,smoke:0,vip:0}});
const worldOf = p => p.world || (p.world=WORLD_START());
const HOUSE_LIST = [
  {id:'shack',name:'Обшарпана халупа',price:0,bonus:'Стартове житло',energy:0,stealth:0,level:1,workDays:0},
  {id:'room',name:'Кімната у гуртожитку',price:4500,bonus:'+5% зарплати',energy:5,stealth:0,level:2,workDays:5},
  {id:'flat',name:'Квартира на районі',price:17000,bonus:'+10% зарплати, +2 захисту',energy:10,stealth:2,level:5,workDays:20},
  {id:'loft',name:'Просторий лофт',price:47000,bonus:'+20% зарплати, +5 захисту',energy:20,stealth:5,level:10,workDays:40},
  {id:'lux',name:'Пентхаус люкс',price:100000,bonus:'+35% зарплати, +10 захисту',energy:35,stealth:10,level:18,workDays:60}
];
const GROOM_STEP = 5*MIN, GROOM_MAX = 35;
function groomMm(w, t=Date.now()){
  const g=w.groom || (w.groom={base:0,at:t});
  return clamp((+g.base||0) + Math.max(0,Math.floor((t-(+g.at||t))/GROOM_STEP)),0,GROOM_MAX);
}
function vitalsOf(w,t=Date.now()){
  if(!w.vitals)w.vitals={hunger:85,health:100,at:t};
  const v=w.vitals,elapsed=Math.max(0,t-(Number(v.at)||t)),steps=Math.floor(elapsed/(15*MIN));
  if(steps>0){
    const was=Math.max(0,Math.min(100,Number(v.hunger)||0));
    v.hunger=Math.max(0,was-steps);
    const hungrySteps=Math.max(0,steps-Math.max(0,was-15));
    v.health=Math.max(1,Math.min(100,(Number(v.health)||1)-Math.floor(hungrySteps/2)));
    v.at=t-(elapsed%(15*MIN));
  }
  v.hunger=clamp(Number(v.hunger)||0,0,100);v.health=clamp(Number(v.health)||1,1,100);
  return v;
}
function careState(w,t=Date.now()){
  const v=vitalsOf(w,t);return {hunger:v.hunger,health:v.health,beardMm:groomMm(w,t),nextBeardMs:Math.max(0,GROOM_STEP-((t-(w.groom?.at||t))%GROOM_STEP)),hospitalCooldown:Math.max(0,4*HOUR-(t-(w.lastHospital||0))),crowns:Math.max(0,Math.floor(num(w.crowns))),scrap:Math.max(0,Math.floor(num(w.scrap)))};
}
function safePlayerSummary(target){
 const w=worldOf(target),s=target.save||{};
 return {...pub(target),money:Math.floor(Math.max(0,w.cash||0)),xp:Math.floor(Math.max(0,w.xp||0)),shifts:w.workShifts||0,workDays:Array.isArray(w.workDays)?w.workDays.length:0,
   house:HOUSE_LIST.find(x=>x.id===w.housing?.current)?.name||HOUSE_LIST[0].name,
   equipment:Array.isArray(s.inv)?s.inv.length:0,achievements:{bosses:s.bs?.w||0,jackpots:w.casinoStats?.jackpots||0,houses:w.housing?.owned?.length||1},
   look:{skin:clamp(Number(s.look?.skin)||1,0,3),hair:clamp(Number(s.look?.hair)||0,0,4)},beardMm:groomMm(w)};
}
function telegramVerify(raw){
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token||typeof raw!=='string'||raw.length>10000||raw.length<15)return null;
 const data=new URLSearchParams(raw),hash=data.get('hash'), authDate=Number(data.get('auth_date'));
 if(!/^[a-f0-9]{64}$/i.test(hash||'')||!Number.isInteger(authDate))return null;
 const nowS=Math.floor(Date.now()/1000);
 if(nowS-authDate>24*3600||authDate>nowS+120)return null;
 data.delete('hash');
 const str=[...data.entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
 const actual=crypto.createHmac('sha256',secret).update(str).digest('hex');
 if(!safeEqual(actual,hash))return null;
 try{const u=JSON.parse(data.get('user')||'null');if(!u||!/^\d{1,18}$/.test(String(u.id))||u.is_bot)return null;return u;}catch{return null;}
}
const STARS_PRICES={room:49,flat:149,loft:349,lux:699};
const starsActive=()=>process.env.STARS_ENABLED==='1'&&!!process.env.TELEGRAM_BOT_TOKEN&&!!process.env.TELEGRAM_WEBHOOK_SECRET;
async function botCall(method, params){
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw Error('Немає токена бота');
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(8000)});
 const d=await r.json();if(!r.ok||!d.ok)throw Error('Помилка Bot API: '+(d.description||r.status));return d.result;
}
function orderFromPayload(payload){
 const m=/^house:([a-z]+):([0-9a-f]{32})$/.exec(String(payload||''));
 if(!m||!STARS_PRICES[m[1]])return null;
 return {house:m[1],nonce:m[2]};
}
function invoiceOwner(update){
 const order=orderFromPayload(update.invoice_payload);if(!order)return null;
 const player=Object.values(DB.players).find(p=>p.telegramId===String(update.from.id));
 if(!player)return null;
 const pending=(player.pendingInvoices||[]).find(x=>x.nonce===order.nonce&&x.house===order.house&&x.at>Date.now()-24*HOUR);
 if(!pending||pending.stars!==STARS_PRICES[order.house]||update.currency!=='XTR'||update.total_amount!==pending.stars)return null;
 return {player,order,pending};
}
function creditPaidHouse(player,order,charge){
 if(typeof charge!=='string'||charge.length<5)return false;
 player.starsCharges=player.starsCharges||[];
 if(player.starsCharges.includes(charge))return true;
 const w=worldOf(player);
 w.housing=w.housing||{current:'shack',owned:['shack'],awarded:[]};
 if(!w.housing.owned.includes(order.house))w.housing.owned.push(order.house);
 w.housing.current=order.house;
 w.message='⭐ Придбано житло за Telegram Stars: '+HOUSE_LIST.find(x=>x.id===order.house).name;
 player.starsCharges.push(charge);player.starsCharges=player.starsCharges.slice(-300);
 player.pendingInvoices=(player.pendingInvoices||[]).filter(x=>x.nonce!==order.nonce);
 dirtyPlayerIds.add(player.id);
 return true;
}
function bootstrapTelegramSave(name){const t=Date.now();return {...fresh(),v:1,started:true,name,look:{skin:1,hair:0},energy:50,eAt:t,eq:{head:'head0',body:'body0',legs:'legs0',shoes:'shoes0',acc:'acc0'},bronUntil:0,fakeUntil:0,wantedUntil:0,job:null,offers:null,offersAt:0,tcc:null,foodAt:0,eu:null,ua:{pos:0,biz:0,link:0,bizAt:0},say:'Ласкаво просимо до Ухилянта!',st:{caught:0,escaped:0,shifts:0,earned:0}};}
const pub = p => ({ id: p.id, name: p.name, level: p.save ? p.save.level : 1, b: p.save && p.save.bs ? num(p.save.bs.b) : 0, on: Date.now() - (p.seen || 0) < 90000 });

async function api(req, res, route) {
  await dbReady;
  const ip = clientIp(req);
  if (route === 'ping') return send(res, 200, { ok: 1 });
  if (route === 'leaderboard') {
    const mode=String(new URL(req.url,'http://localhost').searchParams.get('mode')||'level');
    const modes=['level','boss','casino','jackpots','wealth','work','housing','health','friends','street','crowns'];
    if(!modes.includes(mode))return send(res,400,{ok:false,err:'Невірний рейтинг'});
    const score=(p)=>{
      const w=p.world||{},cs=w.casinoStats||{},hs=w.housing||{},sv=p.save||{};
      return {level:Number(sv.level||1),boss:Number(w.bossVictories||0)+Number(sv.bs?.w||0),casino:Number(cs.totalWon||0),jackpots:Number(cs.jackpots||0),wealth:Number(w.cash||0),work:Number(w.xp||0),housing:Number((hs.owned||['shack']).length),health:Number(w.vitals?.health??100),friends:(p.friends||[]).length,street:Number(w.streetWins||0),crowns:Number(w.crowns||0)}[mode];
    };
    const list=Object.values(DB.players).map(p=>({...pub(p),score:score(p)})).sort((a,b)=>b.score-a.score||b.level-a.level||a.name.localeCompare(b.name,'uk')).slice(0,100);
    return send(res,200,{ok:true,mode,list});
  }
  if (route === 'news') {
    const stored = Object.values(DB.players).flatMap(x => x.news || []);
    const unique = new Map(); stored.forEach(x => unique.set(x.id, x));
    const list = [...unique.values()].sort((a,b) => b.t-a.t).slice(0,100);
    return send(res, 200, { ok: true, list });
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
  if(route==='telegram/auth'){
    if(req.method!=='POST')return send(res,405,{ok:false,err:'Method not allowed'});
    if(limited('tg'+ip,30,5*MIN))return send(res,429,{ok:false,err:'Забагато спроб'});
    const b=await body(req);const u=telegramVerify(b?.initData);
    if(!u)return send(res,401,{ok:false,err:!process.env.TELEGRAM_BOT_TOKEN?'Telegram не налаштований на сервері':'Недійсні або застарілі дані Telegram'});
    let p=Object.values(DB.players).find(x=>x.telegramId===String(u.id));
    if(!p){
      const name=cleanName((u.first_name||u.username||'Ухилянт')+' '+(u.last_name||''));
      const a=createPlayer(name,{telegramId:String(u.id),telegramUsername:String(u.username||'').slice(0,64)});
      p=DB.players[a.id];p.save=bootstrapTelegramSave(name);worldOf(p);dirtyPlayerIds.add(p.id);
      return send(res,200,{ok:true,...a,fresh:true});
    }
    const existing=auth(req);
    if(existing&&existing.id===p.id)return send(res,200,{ok:true,id:p.id,key:String(req.headers['x-key']),fresh:false});
    const key=crypto.randomBytes(32).toString('hex');
    p.sessionHashes=[...new Set([...(p.sessionHashes||[]),sha(key)])].slice(-12);
    dirtyPlayerIds.add(p.id);return send(res,200,{ok:true,id:p.id,key,fresh:false});
  }
  if(route==='telegram/webhook'){
    if(req.method!=='POST')return send(res,405,{ok:false});
    const secret=String(req.headers['x-telegram-bot-api-secret-token']||'');
    if(!starsActive()||!safeEqual(sha(secret),sha(process.env.TELEGRAM_WEBHOOK_SECRET)))return send(res,403,{ok:false});
    const update=await body(req);if(!update||typeof update!=='object')return send(res,400,{ok:false});
    try{
      if(update.pre_checkout_query){
        const q=update.pre_checkout_query;
        const match=invoiceOwner({invoice_payload:q.invoice_payload,from:q.from,currency:q.currency,total_amount:q.total_amount});
        const good=!!match&&!worldOf(match.player).housing?.owned?.includes(match.order.house);
        await botCall('answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok:good,...(!good?{error_message:'Замовлення недійсне або вже виконане'}:{})});
      }
      if(update.message?.successful_payment){
        const msg=update.message,pay=msg.successful_payment;
        const match=invoiceOwner({invoice_payload:pay.invoice_payload,from:msg.from,currency:pay.currency,total_amount:pay.total_amount});
        const charge=String(pay.telegram_payment_charge_id||'');
        if(match&&charge){creditPaidHouse(match.player,match.order,charge);await flush();if(supabase&&dirtyPlayerIds.has(match.player.id))throw Error('Payment persistence failed');}
        else {const user=Object.values(DB.players).find(x=>x.telegramId===String(msg.from?.id||''));
         if(!user||!(user.starsCharges||[]).includes(charge))console.error('Непізнаний оплачений інвойс: перевірити вручну');}
      }
      if(update.message?.text?.startsWith('/start')&&process.env.PUBLIC_URL?.startsWith('https://')){
        await botCall('sendMessage',{chat_id:update.message.chat.id,text:'🏘 Ухилянт — створи персонажа, працюй, відвідуй друзів і змагайся у рейтингах!',reply_markup:{inline_keyboard:[[{text:'🎮 Грати в Ухилянт',web_app:{url:process.env.PUBLIC_URL}}]]}});
      }
      if(update.message?.text?.startsWith('/paysupport')){
        await botCall('sendMessage',{chat_id:update.message.chat.id,text:'З питань придбань у Stars зверніться до адміністратора бота та вкажіть ідентифікатор платежу з чека Telegram.'});
      }
      return send(res,200,{ok:true});
    }catch(e){console.error('Telegram webhook error:',e.message);return send(res,503,{ok:false});}
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
  if (route === 'account/status') return send(res,200,{ok:true,username:p.username || null,email:p.email||null,legacy:!p.passHash,telegram:!!p.telegramId});
  if(route==='house/invoice'){
    if(req.method!=='POST')return send(res,405,{ok:false});
    if(!starsActive())return send(res,503,{ok:false,err:'Оплата Stars ще не налаштована'});
    if(!p.telegramId)return send(res,403,{ok:false,err:'Оплата Stars доступна тільки у Telegram Mini App'});
    if(limited('star'+p.id,6,15*MIN))return send(res,429,{ok:false,err:'Зачекай перед наступним замовленням'});
    const b=await body(req),id=String(b?.house||''),house=HOUSE_LIST.find(x=>x.id===id),stars=STARS_PRICES[id];
    if(!house||!stars)return send(res,400,{ok:false,err:'Ця квартира не продається за Stars'});
    const w=worldOf(p);if(w.housing?.owned?.includes(id))return send(res,409,{ok:false,err:'Квартира вже твоя'});
    const nonce=crypto.randomBytes(16).toString('hex'),payload='house:'+id+':'+nonce;
    const pending={house:id,nonce,stars,at:Date.now()};
    p.pendingInvoices=[...(p.pendingInvoices||[]).filter(x=>x.at>Date.now()-24*HOUR),pending].slice(-15);
    dirtyPlayerIds.add(p.id);
    try{
      const url=await botCall('createInvoiceLink',{title:house.name.slice(0,32),description:'Цифрове житло у грі Ухилянт. Без обміну на реальні гроші.',payload,currency:'XTR',prices:[{label:house.name,amount:stars}]});
      if(typeof url!=='string'||!url.startsWith('https://'))throw Error('Invalid Telegram invoice URL');
      return send(res,200,{ok:true,url,stars});
    }catch(e){p.pendingInvoices=p.pendingInvoices.filter(x=>x.nonce!==nonce);dirtyPlayerIds.add(p.id);console.error('Invoice generation:',e.message);return send(res,503,{ok:false,err:'Не вдалося створити рахунок у Telegram'});}
  }
  if(route==='telegram/link'){
    if(!p.telegramId)return send(res,403,{ok:false,err:'Відкрий Mini App через Telegram'});
    if(limited('tglink'+p.id,8,15*MIN))return send(res,429,{ok:false,err:'Забагато спроб'});
    const b=await body(req),username=cleanLogin(b?.username),old=Object.values(DB.players).find(x=>x.username===username);
    if(!old||!old.passHash||!safeEqual(passwordHash(b.password||'',old.passSalt),old.passHash))return send(res,403,{ok:false,err:'Неправильний логін або пароль старого акаунта'});
    if(old.telegramId&&old.telegramId!==p.telegramId)return send(res,409,{ok:false,err:'Цей акаунт уже повʼязаний з іншим Telegram'});
    if(old.id===p.id)return send(res,200,{ok:true,id:p.id,key:String(req.headers['x-key'])});
    old.telegramId=p.telegramId;p.telegramId=null;
    const key=crypto.randomBytes(32).toString('hex');old.sessionHashes=[...new Set([...(old.sessionHashes||[]),sha(key)])].slice(-12);
    dirtyPlayerIds.add(p.id);dirtyPlayerIds.add(old.id);
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
    const caught=Math.max(0,Math.floor(num(p.save?.st?.caught)))+Math.max(0,Math.floor(num(w.streetCaught)));
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
    dirtyPlayerIds.add(p.id);return send(res,200,response());
  }
  if (route === 'world') {
    const w=worldOf(p);
    const bosses=[{id:'zh',name:'Старший району',hp:12000,tier:1,keyCost:0,keyDrop:1,description:'Перший бос. Без ключів. Перемога дає 1 ключ бригаді.'},{id:'my',name:'Начальник патруля',hp:28000,tier:2,keyCost:2,keyDrop:2,description:'Потрібні 2 ключі та перемога над Старшим. Дасть 2 ключі.'},{id:'ce',name:'Комендант міста',hp:60000,tier:3,keyCost:4,keyDrop:4,description:'Потрібні 4 ключі й перемога над Начальником.'}];
    const houses=HOUSE_LIST;
    const care=()=>careState(w);
    if(!w.housing||!Array.isArray(w.housing.owned))w.housing={current:'shack',owned:['shack'],awarded:[]};
    if(!w.housing.owned.includes('shack'))w.housing.owned.unshift('shack');
    if(!w.casinoStats)w.casinoStats={spins:0,wins:0,totalBet:0,totalWon:0,jackpots:0,biggest:0};
    const gear={tracksuit:{name:'Олімпійка',slot:'body',stealth:2},uniform:{name:'Польова форма',slot:'body',energy:5},bat:{name:'Біта',slot:'weapon',attack:8},knife:{name:'Ніж (ігровий)',slot:'weapon',attack:12},chain:{name:'Ланцюг',slot:'weapon',attack:15},vest:{name:'Бронежилет',slot:'body',energy:10},shadow:{name:'Тіньова куртка',slot:'body',stealth:12},storm:{name:'Штормова форма',slot:'body',energy:20},legend:{name:'Легендарна біта',slot:'weapon',attack:40}};
    const get=()=>{if(w.brigade&&typeof w.brigade==='object')return w.brigade;const g=Object.values(DB.players).find(x=>x.world&&x.world.brigade&&typeof x.world.brigade==='object'&&x.world.brigade.id===w.brigade);return g&&g.world.brigade};
    const ensureStreet=()=>{
      if(!w.street||typeof w.street!=='object')w.street={mode:'idle',lastRun:0,until:0,cooldownUntil:0,loot:null,reason:''};
      if(!w.boosts||typeof w.boosts!=='object')w.boosts={stealth:0,luck:0,smoke:0,vip:0};
      w.crowns=Math.max(0,Math.floor(num(w.crowns)));w.scrap=Math.max(0,Math.floor(num(w.scrap)));
      return w.street;
    };
    // Fictional in-game Kyiv clock. Curfew is a gameplay rule, not real-world legal advice.
    const nightClock=()=>{const d=new Date(Date.now()+2*60*60*1000),h=d.getUTCHours(),m=d.getUTCMinutes();return {hour:h,minute:m,active:h>=0&&h<5,start:'00:00',end:'05:00'};};
    const curfewClock=()=>nightClock();
    const houseNow=()=>houses.find(x=>x.id===w.housing?.current)||houses[0];
    const premiumOffers=[
      {id:'stealth',name:'Тіньовий маршрут',cost:{scrap:18},desc:'+2 до скритності на вулиці'},
      {id:'luck',name:'Фартовий жетон',cost:{crowns:3},desc:'+6% до шансів знайти лут'},
      {id:'smoke',name:'Пачка цигарок',cost:{scrap:12,cash:120},desc:'Вмикає атмосферу: герой курить у сцені'},
      {id:'vip',name:'VIP перепустка',cost:{crowns:8},desc:'Ще -2% до ризику патруля під час комендантської години'},
      {id:'papers',name:'Фальшиві документи',cost:{crowns:4,scrap:10},desc:'Постійно -3% до ризику перевірки ТЦК на вулиці'}
    ];
    const streetMeta=(t=Date.now())=>{
      const st=ensureStreet(),cur=curfewClock(),house=houseNow(),stealth=(house.stealth||0)+(w.boosts.stealth?2:0)+(w.boosts.vip&&cur.active?2:0);
      if(st.mode==='patrol'&&st.until&&t>=st.until){st.mode='idle';st.until=0;st.loot=null;st.reason='';}
      if((st.mode==='detained'||st.mode==='trench')&&st.until&&t>=st.until)st.ready=true; else st.ready=false;
      const risk=Math.max(cur.active?2:5,(cur.active?7:14)-stealth);
      return {...st,curfewActive:cur.active,curfewStart:cur.start,curfewEnd:cur.end,curfewText:cur.active?'Комендантська година активна':'Денний режим',risk,cooldownMs:Math.max(0,(st.cooldownUntil||0)-t),hideMs:Math.max(0,(st.hideUntil||0)-t),boosts:w.boosts||{}};
    };
    const nightTasks=[{id:'delivery',name:'Нічна доставка',cash:165,xp:38,risk:7,drop:'tracksuit',desc:'Доставити пакунок через тихі двори'},{id:'watch',name:'Нічний сторож',cash:140,xp:44,risk:4,drop:'vest',desc:'Перевірити склад та освітлення'},{id:'radio',name:'Радіомайстерня',cash:120,xp:55,risk:2,drop:'chain',desc:'Полагодити старий приймач'},{id:'taxi',name:'Нічне таксі',cash:195,xp:35,risk:9,drop:'uniform',desc:'Довезти пасажира до вокзалу'}];
    const state=()=>{const br=get();const c=care(),street=streetMeta(Date.now());dirtyPlayerIds.add(p.id);return {ok:true,world:w,care:c,stars:{enabled:starsActive()&&!!p.telegramId,prices:STARS_PRICES},skills:{days:(w.workDays||[]).length,shifts:w.workShifts||0,xp:w.xp||0},houses,gear,bosses,jobs:jobOffers(),night:{...nightClock(),tasks:nightTasks,cooldownMs:Math.max(0,4*MIN-(Date.now()-(w.lastNight||0)))},street,premium:{offers:premiumOffers,currencies:{cash:Math.floor(w.cash||0),crowns:Math.floor(w.crowns||0),scrap:Math.floor(w.scrap||0)}},brigade:br?{...br,members:br.members.map(id=>({id,name:DB.players[id]?.name||id}))}:null}};
    const jobPool=[
      {id:'courier',name:'Курʼєр',cash:65,xp:18,drop:'tracksuit',risk:13,minDays:0,minXP:0},
      {id:'warehouse',name:'Підсобник на складі',cash:75,xp:20,drop:'chain',risk:17,minDays:0,minXP:0},
      {id:'workshop',name:'Помічник майстра',cash:110,xp:30,drop:'knife',risk:19,minDays:2,minXP:80},
      {id:'guard',name:'Охоронець',cash:150,xp:38,drop:'bat',risk:24,minDays:3,minXP:150},
      {id:'patrol',name:'Старший зміни',cash:215,xp:50,drop:'uniform',risk:29,minDays:5,minXP:350},
      {id:'foreman',name:'Бригадир',cash:330,xp:70,drop:'vest',risk:34,minDays:7,minXP:650}
    ];
    const jobOffers=()=>{const cycle=Math.floor(Date.now()/(20*MIN));return jobPool.filter((j,i)=>j.minDays===0||((cycle+i*3)%5)<3).map(j=>({...j,locked:(w.workDays||[]).length<j.minDays||w.xp<j.minXP}));};
    if(req.method==='GET')return send(res,200,state());
    if(req.method!=='POST')return send(res,405,{ok:false,err:'Метод не підтримується'});
    const b=await body(req);if(!b||typeof b.action!=='string')return send(res,400,{ok:false,err:'Некоректна дія'});
    const t=Date.now(), fail=err=>send(res,200,{ok:false,err});
    if(b.action==='eat'){
      const menu={snack:{cash:35,hunger:18,health:0,name:'Перекус'},lunch:{cash:90,hunger:45,health:2,name:'Домашній обід'},feast:{cash:180,hunger:75,health:5,name:'Повноцінна вечеря'}};
      const food=menu[b.food];if(!food)return fail('Страву не знайдено');
      if(t-(w.lastMeal||0)<45*1000)return fail('Зачекай 45 секунд');
      if(w.cash<food.cash)return fail('Не вистачає ігрових грошей');
      const v=vitalsOf(w,t);w.cash-=food.cash;w.lastMeal=t;v.hunger=clamp(v.hunger+food.hunger,0,100);v.health=clamp(v.health+food.health,1,100);
      w.message=food.name+': +'+food.hunger+' ситості';
    } else if(b.action==='hospital'){
      const v=vitalsOf(w,t),cost=320;
      if(t-(w.lastHospital||0)<4*HOUR)return fail('Лікарня знову доступна через '+Math.ceil((4*HOUR-(t-w.lastHospital))/MIN)+' хв');
      if(v.health>=100)return fail('Здоровʼя повне');if(w.cash<cost)return fail('Лікування коштує 320 ₴');
      w.cash-=cost;v.health=Math.min(100,v.health+55);w.lastHospital=t;w.message='Лікарня: +55 здоровʼя';
    } else if(b.action==='rest'){
      const v=vitalsOf(w,t);
      if(t-(w.lastRest||0)<3*HOUR)return fail('Відпочинок раз на 3 години');
      if(v.hunger<10)return fail('Спочатку поїж');
      v.health=clamp(v.health+12,1,100);v.hunger=Math.max(0,v.hunger-6);w.lastRest=t;w.message='Відпочинок удома: +12 здоровʼя';
    } else if(b.action==='shave'){
      if(t-(w.lastShave||0)<30*1000)return fail('Можна голитися раз на 30 секунд');
      w.groom={base:0,at:t};w.lastShave=t;w.message='Поголився. Борода відростає на 1 мм кожні 5 хвилин.';
    } else if(b.action==='daily'){
      if(t-w.lastDaily<DAY)return fail('Бонус раз на 24 години');
      const prizes=[{cash:100},{cash:250},{cash:500},{xp:60},{item:'tracksuit'},{item:'uniform'},{item:'bat'}];const prize=prizes[crypto.randomInt(prizes.length)];w.lastDaily=t;w.cash+=prize.cash||0;w.xp+=prize.xp||0;if(prize.item&&!w.items.includes(prize.item))w.items.push(prize.item);w.message='Рулетка: '+JSON.stringify(prize);
    } else if(b.action==='apply'){
      if(w.workShift)return fail('Спочатку закінчіть поточну зміну');const j=jobOffers().find(x=>x.id===b.job);if(!j)return fail('Ця вакансія вже закрита. Оновіть список');if(j.locked)return fail('Недостатньо досвіду або відпрацьованих днів');if(t-(w.lastInterview||0)<30*1000)return fail('Наступна співбесіда через '+Math.ceil((30*1000-(t-w.lastInterview))/1000)+' с');w.lastInterview=t;
      const reason=['Погана репутація персонажа','Не підійшов зовнішній вигляд','Велика конкуренція','Роботодавець змінив вимоги'];
      if(crypto.randomInt(100)<j.risk){w.message='Відмова: '+reason[crypto.randomInt(reason.length)];}
      else {w.employment={id:j.id,name:j.name};w.message='Вас прийняли на роботу: '+j.name;}
    } else if(b.action==='quit'){
      if(w.workShift)return fail('Спочатку закінчіть поточну зміну');
      w.employment=null;w.message='Ви звільнилися';
    } else if(b.action==='shift'){
      // An active shift survives reloads, reconnects and Telegram app restarts.
      if(w.workShift)return fail('Зміна вже триває. Дочекайся завершення');
      const v=vitalsOf(w,t);if(v.hunger<15)return fail('Персонаж голодний. Спочатку поїж.');if(v.health<25)return fail('Здоровʼя замало: відвідай лікарню');
      if(t-(w.lastWork||0)<5*MIN)return fail('Наступна зміна через '+Math.ceil((5*MIN-(t-w.lastWork))/1000)+' с');
      const j=jobPool.find(x=>x.id===w.employment?.id);if(!j)return fail('Спочатку влаштуйтеся на роботу');
      const shiftDuration=60*1000+15*1000*jobPool.findIndex(x=>x.id===j.id);
      w.workShift={jobId:j.id,name:j.name,startedAt:t,endsAt:t+shiftDuration};
      w.message='Зміна почалася: '+j.name+'. Залишилося '+Math.ceil(shiftDuration/1000)+' с';
    } else if(b.action==='workCollect'){
      const sh=w.workShift;if(!sh)return fail('Немає зміни для завершення');
      if(t<sh.endsAt)return fail('Зміна триває ще '+Math.ceil((sh.endsAt-t)/1000)+' с');
      const j=jobPool.find(x=>x.id===sh.jobId);if(!j||w.employment?.id!==sh.jobId)return fail('Дані зміни пошкоджено. Звернися до адміністратора');
      const v=vitalsOf(w,t);v.hunger=Math.max(0,v.hunger-5);v.health=Math.max(1,v.health-1);
      w.lastWork=t;w.workShifts=(w.workShifts||0)+1;
      const gameDay=new Date(t+2*3600000).toISOString().slice(0,10);
      w.workDays=Array.isArray(w.workDays)?w.workDays:[];
      if(!w.workDays.includes(gameDay))w.workDays.push(gameDay);
      w.workDays=w.workDays.slice(-365);
      const houseBonus=houses.find(x=>x.id===w.housing.current)||houses[0];
      const extraCash=Math.floor(j.cash*(houseBonus.energy/100));w.cash+=j.cash+extraCash;w.xp+=j.xp;
      const found=crypto.randomInt(100)<12;if(found&&!w.items.includes(j.drop))w.items.push(j.drop);
      w.message=`Зміна: +${j.cash+extraCash} ₴, +${j.xp} XP`+(found?', знахідка: '+gear[j.drop].name:'');
      w.workShift=null;
    } else if(b.action==='nightTask'){
      const v=vitalsOf(w,t);if(v.hunger<20||v.health<30)return fail('Для нічної справи потрібні ситість ≥20 і здоровʼя ≥30');
      const clock=nightClock();if(!clock.active)return fail('Нічні справи доступні лише з 00:00 до 05:00 за ігровим київським часом');
      if(t-(w.lastNight||0)<4*MIN)return fail('Наступна нічна справа через '+Math.ceil((4*MIN-(t-(w.lastNight||0)))/1000)+' с');
      const task=nightTasks.find(x=>x.id===b.task);if(!task)return fail('Невідома нічна справа');
      v.hunger=Math.max(0,v.hunger-8);v.health=Math.max(1,v.health-2);
      w.lastNight=t;w.nightRuns=(w.nightRuns||0)+1;
      if(crypto.randomInt(100)<Math.max(1,task.risk-(houses.find(x=>x.id===w.housing.current)?.stealth||0))){w.message='Нічна справа зірвалася: помітили патруль. Нагороди немає.';}
      else{w.cash+=task.cash;w.xp+=task.xp;w.scrap=(w.scrap||0)+1+crypto.randomInt(3);const loot=crypto.randomInt(100)<9;if(loot&&!w.items.includes(task.drop))w.items.push(task.drop);w.message='Нічна справа: +'+task.cash+' ₴, +'+task.xp+' XP, +скрап'+(loot?', знахідка: '+gear[task.drop].name:'');}
    } else if(b.action==='streetRun'){
      const st=ensureStreet(),meta=streetMeta(t),v=vitalsOf(w,t);
      if(v.hunger<16||v.health<24)return fail('Щоб вийти на вулицю, потрібні ситість ≥16 і здоровʼя ≥24');
      if(w.workShift)return fail('Спочатку заверши робочу зміну');
      if(p.save?.tcc)return fail('Ти вже затриманий ТЦК у головному сюжеті');
      if(meta.cooldownMs>0)return fail('Повторний вихід на вулицю через '+Math.ceil(meta.cooldownMs/1000)+' с');
      if(st.mode==='detained')return fail('Після затримання потрібно завершити перевірку та повернутися на вулицю');
      if(st.mode==='trench')return fail('Тривають бойові дії. Спочатку забери нагороду за виживання');
      st.lastRun=t;w.streetRuns=(w.streetRuns||0)+1;st.cooldownUntil=t+45*1000;v.hunger=Math.max(0,v.hunger-6);v.health=Math.max(1,v.health-1);
      const caught=crypto.randomInt(100)<meta.risk;
      if(caught&&meta.curfewActive){
        st.mode='trench';st.until=t+85*1000;st.reason='Під час комендантської години патруль забрав тебе й одразу кинув на нуль.';st.loot=null;
        w.streetCaught=(w.streetCaught||0)+1;const cr=p.career||(p.career={status:'civilian',trainingAt:0,crateClaimed:false,coins:0});cr.caughtAt=t;if(!cr.trainingAt)cr.status='detained';
        w.message='Комендантська година: тебе схопив патруль. Тепер тримай оборону в окопі.';
      } else if(caught){
        st.mode='detained';st.until=t+60*1000;st.reason='На вулиці помітили ТЦК, бусик і поліцію. Тебе затримали для перевірки.';st.loot=null;
        w.streetCaught=(w.streetCaught||0)+1;const cr=p.career||(p.career={status:'civilian',trainingAt:0,crateClaimed:false,coins:0});cr.caughtAt=t;if(!cr.trainingAt)cr.status='detained';
        w.cash=Math.max(0,Math.floor((w.cash||0)*0.92));
        w.message='На вулиці тебе затримали. Частину ігрових грошей втрачено, сцена змінилася.';
      } else {
        const cash=meta.curfewActive?120+crypto.randomInt(110):70+crypto.randomInt(90);
        const xp=meta.curfewActive?34+crypto.randomInt(18):18+crypto.randomInt(15);
        const scrap=1+crypto.randomInt(meta.curfewActive?4:3);
        const crown=(crypto.randomInt(100)<(meta.curfewActive?16:6)+(w.boosts.luck?6:0))?1:0;
        w.streetWins=(w.streetWins||0)+1;w.cash+=cash;w.xp+=xp;w.scrap=(w.scrap||0)+scrap;w.crowns=(w.crowns||0)+crown;
        st.mode='patrol';st.until=t+18*1000;st.reason=meta.curfewActive?'Тиха вилазка під час комендантської години пройшла успішно.':'Вулична вилазка пройшла без пригод.';st.loot={cash,xp,scrap,crowns:crown};
        w.message='Вулиця: +'+cash+' ₴, +'+xp+' XP, +'+scrap+' скрап'+(crown?' і +1 crown':'');
      }
    } else if(b.action==='streetHide'){
      const st=ensureStreet(),meta=streetMeta(t);
      if(st.mode==='detained'||st.mode==='trench')return fail('Під час затримання або бою сховатися вже пізно');
      if(meta.hideMs>0)return fail('Схованка вже активна ще '+Math.ceil(meta.hideMs/1000)+' с');
      if((w.scrap||0)<6)return fail('Потрібно 6 scrap на схованку');
      w.scrap-=6;st.hideUntil=t+20*MIN;w.message='Ти організував схованку. Наступні 20 хв ризик перевірки нижчий.';
    } else if(b.action==='streetBribe'){
      const st=ensureStreet();
      if(st.mode!=='detained')return fail('Дати на лапу можна лише під час затримання');
      if((w.cash||0)<480)return fail('Потрібно 480 ₴');
      w.cash-=480;st.mode='idle';st.until=0;st.ready=false;st.loot=null;st.reason='';
      w.message='Ти домовився на місці й вийшов без подальших наслідків.';
    } else if(b.action==='streetLawyer'){
      const st=ensureStreet();
      if(st.mode!=='detained')return fail('Адвокат потрібен лише при затриманні');
      if((w.crowns||0)<1)return fail('Потрібно 1 crown');
      w.crowns-=1;st.until=Math.min(st.until||t,t+10*1000);st.ready=false;
      w.message='Адвокат уже в дорозі. Перевірка завершиться значно швидше.';
    } else if(b.action==='streetEscape'){
      const st=ensureStreet(),v=vitalsOf(w,t);
      if(st.mode!=='trench')return fail('Екстрена евакуація доступна лише на нулі');
      if((w.crowns||0)<2||(w.scrap||0)<8)return fail('Потрібно 2 crowns і 8 scrap');
      w.crowns-=2;w.scrap-=8;v.health=Math.max(1,v.health-6);
      st.mode='idle';st.until=0;st.ready=false;st.loot=null;st.reason='';
      w.message='Тебе евакуювали знайомі. Живий, але виснажений.';
    } else if(b.action==='streetCollect'){
      const st=ensureStreet(),meta=streetMeta(t);
      if(st.mode==='trench'){
        if(!meta.ready)return fail('Бій ще триває '+Math.ceil((st.until-t)/1000)+' с');
        const surviveCash=140+crypto.randomInt(120),surviveXP=48+crypto.randomInt(22),surviveCrowns=1+crypto.randomInt(2);
        w.cash+=surviveCash;w.xp+=surviveXP;w.crowns=(w.crowns||0)+surviveCrowns;w.scrap=(w.scrap||0)+2+crypto.randomInt(2);
        st.mode='idle';st.until=0;st.ready=false;st.loot=null;st.reason='';
        w.message='Ти вибрався з окопу: +'+surviveCash+' ₴, +'+surviveXP+' XP, +'+surviveCrowns+' crowns';
      } else if(st.mode==='detained'){
        if(!meta.ready)return fail('Перевірка ще триває '+Math.ceil((st.until-t)/1000)+' с');
        st.mode='idle';st.until=0;st.ready=false;st.loot=null;st.reason='';
        w.message='Тебе відпустили після перевірки. Будь обережнішим на вулиці.';
      } else {
        st.mode='idle';st.until=0;st.ready=false;st.loot=null;st.reason='';
        w.message='Ти повернувся з вулиці.';
      }
    } else if(b.action==='buyBoost'){
      const offer=premiumOffers.find(x=>x.id===b.offer);if(!offer)return fail('Покращення не знайдено');
      ensureStreet();
      if(w.boosts[offer.id])return fail('Це покращення вже придбане');
      const cost=offer.cost||{};
      if((cost.cash||0)>w.cash)return fail('Не вистачає ігрових грошей');
      if((cost.scrap||0)>w.scrap)return fail('Не вистачає скрапу');
      if((cost.crowns||0)>w.crowns)return fail('Не вистачає crowns');
      w.cash-=cost.cash||0;w.scrap-=cost.scrap||0;w.crowns-=cost.crowns||0;w.boosts[offer.id]=1;
      w.message='Придбано покращення: '+offer.name;
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
      if(symbol===5){cs.jackpots++;publishNews({type:'jackpot',text:`🎰 ${p.name} зірвав джекпот ${win} ₴ у казино!`});}
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
      const targetHouse=houses.find(x=>x.id===b.house);if(!targetHouse||!w.housing.owned.includes(targetHouse.id))return fail('Житло ще не відкрито');
      w.housing.current=targetHouse.id;w.message='Нове житло: '+targetHouse.name;
    } else if(b.action==='houseClaim'){
      const house=houses.find(x=>x.id===b.house);if(!house||house.id==='shack')return fail('Немає такої нагороди');
      if(w.housing.owned.includes(house.id))return fail('Житло вже ваше');
      const lvl=Number(p.save?.level||1),bossWins=Number(p.save?.bs?.w||0)+Number(w.bossVictories||0),workDays=Array.isArray(w.workDays)?w.workDays.length:0;
      const eligible=lvl>=house.level&&workDays>=house.workDays&&(house.id==='room'?true:house.id==='flat'?bossWins>=2:house.id==='loft'?bossWins>=8:bossWins>=20);
      if(!eligible)return fail('Ще не виконано умови нагороди');
      w.housing.owned.push(house.id);w.housing.awarded.push(house.id);w.housing.current=house.id;
      w.message='Житло за заслуги: '+house.name;
    } else if(b.action==='equip'){
      if(!w.items.includes(b.item)||!gear[b.item])return fail('Речі немає в інвентарі');w.equipped[gear[b.item].slot]=b.item;w.message='Одягнуто: '+gear[b.item].name;
    } else if(b.action==='look'){
      const allowed={hair:['short','buzz','long'],beard:['none','stubble','full'],skin:['light','medium','dark']};for(const k of Object.keys(allowed))if(b[k]!==undefined){if(!allowed[k].includes(b[k]))return fail('Некоректний вигляд');w.look[k]=b[k]}w.message='Зовнішність збережено';
    } else if(b.action==='create'){
      if(w.brigade)return fail('Ви вже у бригаді');const name=String(b.name||'').trim();if(name.length<3||name.length>24||/[<>]/.test(name))return fail('Назва 3–24 символи');const id=crypto.randomBytes(4).toString('hex').toUpperCase();w.brigade={id,name,owner:p.id,members:[p.id],fight:null,keys:0,cleared:[],raidWins:0};w.message='Бригаду створено, код '+id;
    } else if(b.action==='leave'){
      const br=get();if(!br)return fail('Ти не в бригаді');
      if(br.owner===p.id&&br.members.length>1)return fail('Власник не може піти, поки в бригаді є інші гравці');
      br.members=br.members.filter(x=>x!==p.id);w.brigade=null;w.message='Ти вийшов із бригади';
      if(br.owner&&DB.players[br.owner])dirtyPlayerIds.add(br.owner);
    } else if(b.action==='join'){
      if(w.brigade)return fail('Ви вже у бригаді');const id=String(b.id||'').trim().toUpperCase();const target=Object.values(DB.players).map(x=>x.world?.brigade).find(x=>x&&x.id===id);if(!target)return fail('Бригаду не знайдено');if(target.members.length>=8)return fail('У бригаді максимум 8 гравців');target.members.push(p.id);const owner=DB.players[target.owner];if(owner)dirtyPlayerIds.add(owner.id);w.brigade=id;w.message='Ви вступили в '+target.name;
    } else if(b.action==='fight'){
      const br=get();if(!br||!br.members.includes(p.id))return fail('Потрібна бригада');
      const boss=bosses.find(x=>x.id===b.boss);if(!boss)return fail('Немає такого боса');
      br.keys=Math.max(0,Math.floor(num(br.keys)));
      br.cleared=Array.isArray(br.cleared)?br.cleared.filter(id=>bosses.some(x=>x.id===id)):[];
      const starting=!br.fight||br.fight.hp<=0;
      if(starting){
        if(br.owner!==p.id)return fail('Тільки лідер бригади може відкрити новий рейд');
        if(br.fight&&t-Math.max(0,num(br.fight.finishedAt))<10*MIN)return fail('Новий рейд через 10 хвилин');
        if(boss.tier===2&&!br.cleared.includes('zh'))return fail('Спершу переможіть Старшого району');
        if(boss.tier===3&&!br.cleared.includes('my'))return fail('Спершу переможіть Начальника патруля');
        if(br.keys<boss.keyCost)return fail('Потрібно '+boss.keyCost+' ключі бригади. Зараз '+br.keys);
        br.keys-=boss.keyCost;
        br.fight={boss:boss.id,hp:boss.hp,maxHp:boss.hp,hits:{},damage:{},startedAt:t,finishedAt:0,keyPaid:boss.keyCost};
      }
      if(br.fight.boss!==boss.id)return fail('Спочатку завершіть поточного боса');
      if(t-Math.max(0,num(br.fight.hits[p.id]))<30*1000)return fail('Атака раз на 30 секунд');
      br.fight.hits[p.id]=t;
      const weapon=gear[w.equipped.weapon],dmg=220+Math.min(330,Math.floor(w.xp/8))+(weapon?.attack||0)*20+(houses.find(x=>x.id===w.housing.current)?.energy||0)*3;
      br.fight.hp=Math.max(0,br.fight.hp-dmg);br.fight.damage=br.fight.damage||{};
      br.fight.damage[p.id]=(br.fight.damage[p.id]||0)+dmg;
      w.message=`Удар по ${boss.name}: ${dmg} шкоди`;
      // The owner stores the shared brigade; every strike must persist its world.
      if(br.owner&&DB.players[br.owner])dirtyPlayerIds.add(br.owner);
      if(!br.fight.hp){
        br.fight.finishedAt=t;
        br.raidWins=(br.raidWins||0)+1;
        br.keys+=boss.keyDrop;
        if(!br.cleared.includes(boss.id))br.cleared.push(boss.id);
        for(const id of br.members){
          const m=DB.players[id];if(!m)continue;
          const mw=worldOf(m);mw.cash=Math.max(0,num(mw.cash))+Math.floor(boss.hp/60);
          mw.xp=Math.max(0,num(mw.xp))+Math.floor(boss.hp/30);
          mw.bossVictories=(mw.bossVictories||0)+1;
          mw.items=Array.isArray(mw.items)?mw.items:[];
          const loot=boss.id==='ce'?'legend':boss.id==='my'?'storm':'shadow';
          if(crypto.randomInt(100)<35&&!mw.items.includes(loot))mw.items.push(loot);
          dirtyPlayerIds.add(id);
        }
        w.message=`🏆 Боса переможено! +${boss.keyDrop} ключ(ів) у скарбницю бригади`;
        publishNews({type:'brigade',text:`Бригада ${br.name} перемогла ${boss.name}! Отримано ${boss.keyDrop} ключ(ів).`});
      }
    } else return fail('Невідома дія');
    dirtyPlayerIds.add(p.id);return send(res,200,state());
  }
  if(route==='player/profile'){
    const targetId=String(new URL(req.url,'http://localhost').searchParams.get('id')||'').toUpperCase();
    const target=DB.players[targetId];if(!target)return send(res,404,{ok:false,err:'Гравця не знайдено'});
    return send(res,200,{ok:true,player:safePlayerSummary(target),friends:p.friends.includes(targetId),self:p.id===targetId});
  }
  if(route==='friend/transfer'||route==='friend/gift'){
    if(req.method!=='POST')return send(res,405,{ok:false});
    if(limited('tx'+p.id,16,60*MIN))return send(res,429,{ok:false,err:'Занадто багато переказів'});
    const b=await body(req),targetId=String(b?.id||'').trim().toUpperCase(),target=DB.players[targetId];
    if(!target||target.id===p.id||!p.friends.includes(targetId)||!target.friends.includes(p.id))return send(res,403,{ok:false,err:'Перекази доступні лише взаємним друзям'});
    const sender=worldOf(p),receiver=worldOf(target);let cost=0,amount=0;
    const day=new Date(Date.now()).toISOString().slice(0,10);
    if(!p.transferDay||p.transferDay.day!==day)p.transferDay={day,total:0};
    if(route==='friend/transfer'){
      amount=Number(b.amount);if(!Number.isSafeInteger(amount)||amount<10||amount>5000)return send(res,400,{ok:false,err:'Сума 10–5000 ігрових ₴'});
      if(p.transferDay.total+amount>5000)return send(res,400,{ok:false,err:'Ліміт 5000 ₴ на добу'});
      cost=amount;
    }else{cost=180;amount=0;}
    if((sender.cash||0)<cost)return send(res,400,{ok:false,err:'Недостатньо ігрових грошей'});
    sender.cash-=cost;
    if(route==='friend/transfer'){receiver.cash=(receiver.cash||0)+amount;p.transferDay.total+=amount;}
    else {const v=vitalsOf(receiver);v.hunger=clamp(v.hunger+30,0,100);v.health=clamp(v.health+8,1,100);}
    const msg=route==='friend/transfer'?`💸 ${p.name} переказав тобі ${amount} ₴`:`🎁 ${p.name} подарував тобі продуктовий набір (+30 їжі, +8 здоров'я)`;
    target.events=[...(target.events||[]),{type:'gift',name:p.name,text:msg,t:Date.now()}].slice(-50);
    sender.message=route==='friend/transfer'?`Переказано ${amount} ₴ другу ${target.name}`:`Подарунок надіслано ${target.name}`;
    dirtyPlayerIds.add(p.id);dirtyPlayerIds.add(target.id);
    return send(res,200,{ok:true,world:sender,message:sender.message});
  }
  if (route === 'me') return send(res, 200, { ok: true, id: p.id, name: p.name, save: p.save });
  if (route === 'save') {
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const nx = b.save, v = validate(p, nx);
    if (!v.ok) { console.log('відхилено', p.id, v.why); return send(res, 200, { ok: false, why: v.why, save: p.save || undefined }); }
    v.commit();
    // Server-side penalty for each newly recorded detention; no client-provided loot or amount is trusted.
    const previousCaught = Math.max(0, Math.floor(num(p.save?.st?.caught)));
    const currentCaught = Math.max(0, Math.floor(num(nx.st?.caught)));
    if (currentCaught > previousCaught && p.world) {
      const w = p.world;
      const n = Math.min(10, currentCaught - previousCaught);
      for (let i=0;i<n;i++) {
        w.cash = Math.max(0, Math.floor(num(w.cash) * .70));
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
    nx.gold = Math.min(num(nx.gold), 1e9); p.save = nx; p.lastSave = Date.now(); p.name = cleanName(nx.name); 
    dirtyPlayerIds.add(p.id);
    return send(res, 200, { ok: true });
  }
  if (route === 'friends') {
    const get = id => DB.players[id], f = p.friends.map(get).filter(Boolean).map(pub);
    return send(res, 200, { ok: true, friends: f, incoming: p.reqIn.map(get).filter(Boolean).map(x => ({ id: x.id, name: x.name })),outgoing:p.reqOut.map(get).filter(Boolean).map(x=>({id:x.id,name:x.name})) });
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
    const tg = Math.max(tierOf(L), ...((sv && sv.inv) || []).map(id => { const m = ID_RE.exec(String(id)); return m ? +m[2] : 0; }));
    const cap = 700 * bMultMax(L, tg, sUp);
    const d = Math.floor(num(b.dmg));
    const t = Date.now(); p.hits = p.hits.filter(x => t - x < 3 * HOUR);
    if (d <= 0 || d > cap || p.hits.length >= 30) return send(res, 200, { ok: false, err: 'відхилено' });
    p.hits.push(t);
    const previousMax = num(p.maxDamage, 0);
    if (d > previousMax) { p.maxDamage=d; publishNews({type:'damage',name:p.name,playerId:p.id,value:d,text:`${p.name} встановив рекорд удару: ${d.toLocaleString('uk-UA')} шкоди`}); }
    p.friends.forEach(id => {
      const o = DB.players[id]; if (!o) return;
      o.events.push({ name: p.name, dmg: d, t }); if (o.events.length > 50) o.events.shift();
      const rr = o.save && o.save.bs ? clamp(num(o.save.bs.r), 0, 300) : 0;     
      o.fdmg = Math.min(4 * BOSS_ROUND * Math.pow(GROW, rr) + 1e5, num(o.fdmg) + Math.round(d * .5));
      dirtyPlayerIds.add(o.id);
    });
    dirtyPlayerIds.add(p.id); 
    return send(res, 200, { ok: true });
  }
  if (route === 'events') { const list = p.events; p.events = []; dirtyPlayerIds.add(p.id); return send(res, 200, { ok: true, list }); }
  return send(res, 404, { ok: false });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (u.pathname.startsWith('/api/')) return await api(req, res, u.pathname.slice(5));
    if (u.pathname.startsWith('/assets/')) {
      const name = u.pathname.slice('/assets/'.length);
      if (!['boss-zh.svg','boss-my.svg','boss-ce.svg','game-icon.webp','noir-courtyard-day.webp','noir-courtyard-night.webp',...['yard','street','park','home'].flatMap(x=>['day','night'].map(t=>'location-'+x+'-'+t+'.webp')),...['yard','street','roof','forest'].flatMap(x=>['day','night'].map(t=>'comic-'+x+'-'+t+'.svg')),...['work','tcc0','tcc1','tcc2','boss','hospital','casino','workshop','transit'].flatMap(x=>['day','night'].map(t=>'comic-'+x+'-'+t+'.svg')),...['shack','room','flat','loft','lux'].flatMap(x=>['day','night'].map(t=>'comic-home-'+x+'-'+t+'.svg'))].includes(name)) {res.writeHead(404);return res.end('Not found')}
      return fs.readFile(path.join(__dirname,'assets',name),(err,data)=>{
        if(err){res.writeHead(404);return res.end('Not found')}
        res.writeHead(200,{'content-type':name.endsWith('.svg')?'image/svg+xml':'image/webp','cache-control':name.startsWith('comic-')?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff'});res.end(data)
      });
    }
    if (u.pathname === '/uhylyant-extras.js' || u.pathname === '/uhylyant-social.js' || u.pathname === '/uhylyant-comic.js' || u.pathname === '/uhylyant-ui.js' || u.pathname === '/uhylyant-3d.js' || u.pathname === '/uhylyant-account.js') { const f=path.join(__dirname,u.pathname.slice(1)); return fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache'});res.end(data)}); }
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
<div id="socialPanel"><div class="spbox"><button class="alt spclose" id="spClose" aria-label="Закрити панель">✕</button><div id="uhySceneMini" class="uhy-mini-scene"><div class="uhy-mini-actor"></div><span class="uhy-mini-label">Ухилянт</span><span class="uhy-mini-timer"></span><button class="uhy-mini-edit" type="button" aria-label="Редактор персонажа">✎</button></div><div id="spBody"></div></div></div>
<script>
(()=>{'use strict';const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=(()=>{try{return JSON.parse(localStorage.getItem('vt_net')||'null')}catch(e){return null}})()||{};let panel=$('#socialPanel'),body=$('#spBody'),active='';window.UHY_NAV={open:which=>show(which)};
const api=async(path,data,auth=true)=>{try{const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(auth?{'x-id':token.id||'','x-key':token.key||''}:{})},body:data?JSON.stringify(data):undefined});return await r.json()}catch(e){return {ok:false,err:'Немає зв’язку із сервером'}}};
function open(){panel.style.display='flex'}function close(){panel.style.display='none';window.UHY_SCENE?.setSection?.(null)}$('#spClose').onclick=close;panel.addEventListener('click',e=>{if(e.target===panel)close()});
function dock(){let nav=$('#tabs');if(!nav||$('#socialDock'))return;let d=document.createElement('div');d.id='socialDock';d.innerHTML='<button data-sp="account">👤 Акаунт</button><button data-sp="leaderboard">🏆 Топ-100</button><button data-sp="friends">👥 Друзі</button><button data-sp="news">📰 Новини</button><button data-sp="career">🎖 Кар’єра / резерв</button><button data-sp="world">🏙 Вулиця</button><button data-sp="housing">🏠 Хати</button><button data-sp="health">🩺 Здоровʼя</button><button data-sp="casino">🎰 Казино</button>';nav.appendChild(d);d.addEventListener('click',e=>{let b=e.target.closest('[data-sp]');if(b)show(b.dataset.sp)});}
async function show(which){active=which;window.UHY_SCENE?.setSection?.(which);open();window.UHYUI?.ensurePanelNav?.();window.UHYUI?.markView?.(which);body.innerHTML='<h2>Завантаження…</h2>';
 if(which==='account'){await window.UHYACCOUNT.render(body,api,token,()=>show('account'));return;}
 if(which==='leaderboard'){
  let modes=[['level','Рівень'],['boss','Боси'],['casino','Виграші казино'],['jackpots','Джекпоти'],['wealth','Капітал'],['work','Досвід роботи'],['housing','Нерухомість'],['street','Вулиця'],['crowns','Корони']];
  body.innerHTML='<h2>🏆 Рейтинги гравців</h2><div id="rankModes" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">'+modes.map(m=>'<button data-mode="'+m[0]+'">'+m[1]+'</button>').join('')+'</div><div id="rankRows">Завантаження…</div>';
  const load=async(mode)=>{let r=await api('leaderboard?mode='+encodeURIComponent(mode),null,false);
   const dest=document.getElementById('rankRows');if(!dest)return;
   dest.innerHTML=(r.list||[]).map((x,i)=>'<div class="spitem"><button class="alt" data-public-profile="'+esc(x.id)+'">#'+(i+1)+' '+esc(x.name)+'</button> · '+Number(x.score||0).toLocaleString('uk-UA')+'<div class="muted">Рівень '+x.level+' · '+(x.on?'онлайн':'офлайн')+'</div></div>').join('')||'<p>Поки немає гравців.</p>';
  };
  body.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>load(b.dataset.mode));
  await load('level');return;
 }
 if(which==='friends'){
  if(!token.id){body.innerHTML='<h2>Друзі</h2><p>Спочатку увійди в акаунт.</p>';return}
  const r=await api('friends');if(!r.ok){body.textContent=r.err||'Помилка';return}
  body.innerHTML='<h2>👥 Друзі та подарунки</h2><p>Додавай друга за ID, відкривай його профіль, надсилай подарунки чи ігрові гроші. Суперники також видимі у рейтингах.</p><input id="spFriend" placeholder="ID гравця (8 символів)" maxlength="8"><button id="spAdd">Додати друга</button>'
   +'<h3>Запрошення</h3>'+(r.incoming||[]).map(f=>'<div class="spitem">'+esc(f.name)+' · '+esc(f.id)+' <button data-accept="'+esc(f.id)+'">Прийняти</button><button class="alt" data-remove-friend="'+esc(f.id)+'">Відхилити</button></div>').join('')
   +'<h3>Твої друзі</h3>'+(r.friends||[]).map(f=>'<div class="spitem"><button class="alt" data-public-profile="'+esc(f.id)+'">'+esc(f.name)+'</button> · рівень '+f.level+' · '+(f.on?'онлайн':'офлайн')+' <button class="alt" data-remove-friend="'+esc(f.id)+'">Видалити</button></div>').join('')
   +'<h3>Надіслані запити</h3>'+(r.outgoing||[]).map(f=>'<div class="spitem">'+esc(f.name)+' · '+esc(f.id)+' <button class="alt" data-remove-friend="'+esc(f.id)+'">Скасувати</button></div>').join('')
   +(r.friends?.length?'':'<p>Твої друзі поки не додані.</p>');
  $('#spAdd').onclick=async()=>{const x=await api('friend/add',{id:$('#spFriend').value});alert(x.ok?(x.status==='friends'?'Ви друзі!':'Запит надіслано'):x.err||'Помилка');show('friends')};
  body.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{const x=await api('friend/add',{id:b.dataset.accept});if(!x.ok)alert(x.err);show('friends')});
  body.querySelectorAll('[data-remove-friend]').forEach(b=>b.onclick=async()=>{if(!confirm('Видалити друга або запит?'))return;const x=await api('friend/del',{id:b.dataset.removeFriend});if(!x.ok)alert(x.err);show('friends')});
  return;
 }
 if(which==='news'){let r=await api('news',null,false);body.innerHTML='<h2>Новини сервера</h2>'+(r.list||[]).map(x=>'<div class="spitem"><b>'+ (x.type==='donation'?'💰 Донат':x.type==='damage'?'⚔ Рекорд шкоди':'📣 Подія')+'</b><div>'+esc(x.text||x.name)+'</div><div class="muted">'+new Date(x.t).toLocaleString()+'</div></div>').join('')||'<p>Гучних подій поки немає.</p>';return;}
 if(['world','casino','housing','health','raids','work','shop'].includes(which)){await window.UHYUI.show(which);return;}
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
      const extras = '<script src="/uhylyant-ui.js"></script><script src="/uhylyant-account.js"></script><script src="/uhylyant-social.js"></script><script src="/uhylyant-extras.js"></script>';
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

if (require.main === module) {
  // Never run a public economy on volatile RAM: data would disappear on restart.
  if (!supabase && process.env.ALLOW_EPHEMERAL_DB !== '1') {
    console.error('FATAL: configure SUPABASE_URL and SUPABASE_KEY in Render Environment.');
    console.error('Local smoke tests only: set ALLOW_EPHEMERAL_DB=1.');
    process.exit(1);
  }
  dbReady.then(()=>server.listen(PORT, '0.0.0.0',()=>console.log('Ухилянт: port ' + PORT)))
    .catch(e=>{console.error('FATAL: cannot load Supabase players:',e?.message||e);process.exit(1)});
}
module.exports = { server, validate, fresh, DB, basePay, xpNeed, tierOf, totalXP, hpOf, FOOD_CD, FOOD_EN, REGEN };
