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

let dbLoaded=false;
async function loadDB() {
  if (!supabase) {console.error('SUPABASE_URL / SUPABASE_KEY не налаштовані');return;}
  try {
    const all={};let count=0;
    for(let from=0;from<100000;from+=1000) {
      const {data,error}=await supabase.from('players').select('*').range(from,from+999);
      if(error)throw error;
      for(const row of data||[]) {if(row?.id&&row?.data)all[row.id]=row.data;}
      count+=(data||[]).length;
      if(!data||data.length<1000)break;
    }
    DB.players=all;dbLoaded=true;
    console.log(`Завантажено ${count} гравців із Supabase`);
  } catch(e) { console.error('❌ Помилка завантаження бази з Supabase:',e.message); }
}

const dbReady = loadDB();

let dirtyPlayerIds = new Set();
async function flush() {
  if (!supabase || dirtyPlayerIds.size === 0) return;
  const idsToSave = Array.from(dirtyPlayerIds);
  dirtyPlayerIds.clear();

  for (const id of idsToSave) {
    const playerData = DB.players[id];
    if (playerData) {
      const { error } = await supabase.from('players').upsert({ id, data: playerData });
      if (error) {
        console.error('❌ Помилка збереження в Supabase:', error.message); dirtyPlayerIds.add(id);
      } else {
        console.log(`✅ Успішно збережено гравця ${id} у Supabase`);
      }
    }
  }
}
setInterval(flush, 3000).unref();
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, async () => { await flush(); process.exit(0); }));

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

const LOOK_MAX = { skin: 5, hair: 7, hc: 7, hs: 7, face: 5, body: 2, beard: 5, tat: 3 };
const LOCS_OK = ['yard', 'street', 'park', 'market', 'station', 'roof', 'forest', 'home'];
function cleanLook(l) {
  const o = {}; if (!l || typeof l !== 'object') return { skin: 1, hair: 0 };
  for (const k of Object.keys(LOOK_MAX)) { const v = l[k]; if (Number.isInteger(v) && v >= 0 && v <= LOOK_MAX[k]) o[k] = v; }
  if (LOCS_OK.includes(l.loc)) o.loc = l.loc;
  if (o.skin === undefined) o.skin = 1; if (o.hair === undefined) o.hair = 0;
  return o;
}

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
  nx.look = cleanLook(nx.look);
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

async function api(req, res, route) {
  await dbReady;
  const ip = clientIp(req);
  if (route === 'ping') return send(res, 200, { ok: 1 });
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
      dirtyPlayerIds.add(player.id);
      await flush();
      return send(res,200,{ok:true,...created,fresh:true});
    }
    const existing = auth(req);
    if (existing && existing.id === player.id) return send(res,200,{ok:true,id:player.id,key:String(req.headers['x-key']),fresh:false});
    const key=crypto.randomBytes(32).toString('hex');
    player.sessionHashes=[...new Set([...(player.sessionHashes||[]),sha(key)])].slice(-12);
    player.seen=Date.now();dirtyPlayerIds.add(player.id);
    await flush();
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
    await flush();
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
    dirtyPlayerIds.add(p.id);return send(res,200,response());
  }
  if (route === 'world') {
    const w=p.world || (p.world={cash:500,xp:0,items:[],equipped:{},lastDaily:0,lastWork:0,brigade:null,look:{hair:'short',beard:'stubble',skin:'medium'}});
    const bosses=[{id:'zh',name:'Жадовський',hp:30000},{id:'my',name:'Миколаївський',hp:60000},{id:'ce',name:'Центровий',hp:100000}];
    const houses=[
      {id:'shack',name:'Обшарпана халупа',price:0,bonus:'Стартове житло',energy:0,stealth:0,level:1},
      {id:'room',name:'Кімната у гуртожитку',price:1600,bonus:'+5 енергії',energy:5,stealth:0,level:2},
      {id:'flat',name:'Квартира на районі',price:7000,bonus:'+10 енергії, +2 скритності',energy:10,stealth:2,level:5},
      {id:'loft',name:'Лофт',price:24000,bonus:'+20 енергії, +5 скритності',energy:20,stealth:5,level:10},
      {id:'lux',name:'Пентхаус люкс',price:85000,bonus:'+35 енергії, +10 скритності',energy:35,stealth:10,level:18}
    ];
    if(!w.housing)w.housing={current:'shack',owned:['shack'],awarded:[]};
    if(!w.housing.owned.includes('shack'))w.housing.owned.unshift('shack');
    if(!w.casinoStats)w.casinoStats={spins:0,wins:0,totalBet:0,totalWon:0,jackpots:0,biggest:0};
    const gear={tracksuit:{name:'Олімпійка',slot:'body',stealth:2},uniform:{name:'Польова форма',slot:'body',energy:5},bat:{name:'Біта',slot:'weapon',attack:8},knife:{name:'Ніж (ігровий)',slot:'weapon',attack:12},chain:{name:'Ланцюг',slot:'weapon',attack:15},vest:{name:'Бронежилет',slot:'body',energy:10},shadow:{name:'Тіньова куртка',slot:'body',stealth:12},storm:{name:'Штормова форма',slot:'body',energy:20},legend:{name:'Легендарна біта',slot:'weapon',attack:40}};
    const get=()=>{if(w.brigade&&typeof w.brigade==='object')return w.brigade;const g=Object.values(DB.players).find(x=>x.world&&x.world.brigade&&typeof x.world.brigade==='object'&&x.world.brigade.id===w.brigade);return g&&g.world.brigade};
    // Fictional in-game Kyiv clock. Curfew is a gameplay rule, not real-world legal advice.
    const nightClock=()=>{const d=new Date(Date.now()+2*60*60*1000),h=d.getUTCHours(),m=d.getUTCMinutes();return {hour:h,minute:m,active:h>=0&&h<5,start:'00:00',end:'05:00'};};
    const nightTasks=[{id:'delivery',name:'Нічна доставка',cash:165,xp:38,risk:7,drop:'tracksuit',desc:'Доставити пакунок через тихі двори'},{id:'watch',name:'Нічний сторож',cash:140,xp:44,risk:4,drop:'vest',desc:'Перевірити склад та освітлення'},{id:'radio',name:'Радіомайстерня',cash:120,xp:55,risk:2,drop:'chain',desc:'Полагодити старий приймач'},{id:'taxi',name:'Нічне таксі',cash:195,xp:35,risk:9,drop:'uniform',desc:'Довезти пасажира до вокзалу'}];
    const state=()=>{const br=get();return {ok:true,world:w,skills:{days:(w.workDays||[]).length,shifts:w.workShifts||0,xp:w.xp||0},houses,gear,bosses,jobs:jobOffers(),night:{...nightClock(),tasks:nightTasks,cooldownMs:Math.max(0,4*MIN-(Date.now()-(w.lastNight||0)))},brigade:br?{...br,members:br.members.map(id=>({id,name:DB.players[id]?.name||id}))}:null}};
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
    const b=await body(req);if(!b||typeof b.action!=='string')return send(res,400,{ok:false,err:'Некоректна дія'});
    const t=Date.now(), fail=err=>send(res,200,{ok:false,err});
    if(b.action==='daily'){
      if(t-w.lastDaily<DAY)return fail('Бонус раз на 24 години');
      const prizes=[{cash:100},{cash:250},{cash:500},{xp:60},{item:'tracksuit'},{item:'uniform'},{item:'bat'}];const prize=prizes[crypto.randomInt(prizes.length)];w.lastDaily=t;w.cash+=prize.cash||0;w.xp+=prize.xp||0;if(prize.item)w.items.push(prize.item);w.message='Рулетка: '+JSON.stringify(prize);
    } else if(b.action==='apply'){
      const j=jobOffers().find(x=>x.id===b.job);if(!j)return fail('Ця вакансія вже закрита. Оновіть список');if(j.locked)return fail('Недостатньо досвіду або відпрацьованих днів');
      const reason=['Погана репутація персонажа','Не підійшов зовнішній вигляд','Велика конкуренція','Роботодавець змінив вимоги'];
      if(crypto.randomInt(100)<j.risk){w.message='Відмова: '+reason[crypto.randomInt(reason.length)];}
      else {w.employment={id:j.id,name:j.name};w.message='Вас прийняли на роботу: '+j.name;}
    } else if(b.action==='quit'){
      w.employment=null;w.message='Ви звільнилися';
    } else if(b.action==='shift'){
      if(t-(w.lastWork||0)<5*MIN)return fail('Наступна зміна через '+Math.ceil((5*MIN-(t-w.lastWork))/1000)+' с');
      const j=jobPool.find(x=>x.id===w.employment?.id);if(!j)return fail('Спочатку влаштуйтеся на роботу');
      w.lastWork=t;w.workShifts=(w.workShifts||0)+1;
      const gameDay=new Date(t+2*3600000).toISOString().slice(0,10);
      w.workDays=Array.isArray(w.workDays)?w.workDays:[];
      if(!w.workDays.includes(gameDay))w.workDays.push(gameDay);
      w.workDays=w.workDays.slice(-365);
      const houseBonus=houses.find(x=>x.id===w.housing.current)||houses[0];
      const extraCash=Math.floor(j.cash*(houseBonus.energy/100));w.cash+=j.cash+extraCash;w.xp+=j.xp;
      const found=crypto.randomInt(100)<12;if(found)w.items.push(j.drop);
      w.message=`Зміна: +${j.cash+extraCash} ₴, +${j.xp} XP`+(found?', знахідка: '+gear[j.drop].name:'');
    } else if(b.action==='nightTask'){
      const clock=nightClock();if(!clock.active)return fail('Нічні справи доступні лише з 00:00 до 05:00 за ігровим київським часом');
      if(t-(w.lastNight||0)<4*MIN)return fail('Наступна нічна справа через '+Math.ceil((4*MIN-(t-(w.lastNight||0)))/1000)+' с');
      const task=nightTasks.find(x=>x.id===b.task);if(!task)return fail('Невідома нічна справа');
      w.lastNight=t;w.nightRuns=(w.nightRuns||0)+1;
      // Risk is deliberately lower than daytime job interview risk, but nonzero.
      if(crypto.randomInt(100)<Math.max(1,task.risk-(houses.find(x=>x.id===w.housing.current)?.stealth||0))){w.message='Нічна справа зірвалася: помітили патруль. Нагороди немає.';}
      else{w.cash+=task.cash;w.xp+=task.xp;const loot=crypto.randomInt(100)<9;if(loot)w.items.push(task.drop);w.message='Нічна справа: +'+task.cash+' ₴, +'+task.xp+' XP'+(loot?', знахідка: '+gear[task.drop].name:'');}
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
      const br=get();if(!br||!br.members.includes(p.id))return fail('Потрібна бригада');const boss=bosses.find(x=>x.id===b.boss);if(!boss)return fail('Немає боса');if(!br.fight||br.fight.hp<=0){if(br.fight&&t-br.fight.finishedAt<10*MIN)return fail('Новий рейд через 10 хвилин');br.fight={boss:boss.id,hp:boss.hp,maxHp:boss.hp,hits:{},finishedAt:0}}if(br.fight.boss!==boss.id)return fail('Спочатку завершіть поточного боса');if(t-(br.fight.hits[p.id]||0)<30*1000)return fail('Атака раз на 30 секунд');br.fight.hits[p.id]=t;const weapon=gear[w.equipped.weapon];const dmg=200+Math.min(300,Math.floor(w.xp/10))+(weapon?.attack||0)*20+(houses.find(x=>x.id===w.housing.current)?.energy||0)*3; br.fight.hp=Math.max(0,br.fight.hp-dmg);w.message=`Удар по ${boss.name}: ${dmg} шкоди`;if(!br.fight.hp){br.fight.finishedAt=t;for(const id of br.members){const m=DB.players[id];if(!m)continue;const mw=m.world||(m.world={cash:0,xp:0,items:[],equipped:{}});mw.xp+=boss.hp/30;mw.cash+=boss.hp/60;const loot=boss.id==='ce'?'legend':boss.id==='my'?'storm':'shadow';if(crypto.randomInt(100)<35)mw.items.push(loot);dirtyPlayerIds.add(id)}publishNews({type:'brigade',text:`Бригада ${br.name} перемогла боса ${boss.name}!`})}
    } else return fail('Невідома дія');
    dirtyPlayerIds.add(p.id);return send(res,200,state());
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
      if (!['noir-courtyard-day.webp','noir-courtyard-night.webp',...['yard','street','park','home'].flatMap(x=>['day','night'].map(t=>'location-'+x+'-'+t+'.webp'))].includes(name)) {res.writeHead(404);return res.end('Not found')}
      return fs.readFile(path.join(__dirname,'assets',name),(err,data)=>{
        if(err){res.writeHead(404);return res.end('Not found')}
        res.writeHead(200,{'content-type':'image/webp','cache-control':'public, max-age=3600'});res.end(data)
      });
    }
    if (u.pathname === '/uhy-polish.css' || u.pathname === '/uhy-polish.js') {
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
const api=async(path,data,auth=true)=>{try{const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(auth?{'x-id':token.id||'','x-key':token.key||''}:{})},body:data?JSON.stringify(data):undefined});return await r.json()}catch(e){return {ok:false,err:'Немає зв’язку із сервером'}}};
function open(){panel.style.display='flex'}function close(){panel.style.display='none'}$('#spClose').onclick=close;panel.addEventListener('click',e=>{if(e.target===panel)close()});
function dock(){let nav=$('#tabs');if(!nav||$('#socialDock'))return;let d=document.createElement('div');d.id='socialDock';d.innerHTML='<button data-sp="account">👤 Акаунт</button><button data-sp="leaderboard">🏆 Топ-100</button><button data-sp="friends">👥 Друзі</button><button data-sp="news">📰 Новини</button><button data-sp="career">🎖 Кар’єра / резерв</button><button data-sp="world">🏙 Вулиця</button><button data-sp="housing">🏠 Хати</button><button data-sp="casino">🎰 Казино</button>';nav.appendChild(d);d.addEventListener('click',e=>{let b=e.target.closest('[data-sp]');if(b)show(b.dataset.sp)});}
async function show(which){active=which;open();body.innerHTML='<h2>Завантаження…</h2>';
 if(which==='account'){await window.UHYACCOUNT.render(body,api,token,()=>show('account'));return;}
 if(which==='leaderboard'){
  let modes=[['level','Рівень'],['boss','Боси'],['casino','Виграші казино'],['jackpots','Джекпоти'],['wealth','Капітал'],['work','Досвід роботи'],['housing','Нерухомість']];
  body.innerHTML='<h2>🏆 Рейтинги гравців</h2><div id="rankModes" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">'+modes.map(m=>'<button data-mode="'+m[0]+'">'+m[1]+'</button>').join('')+'</div><div id="rankRows">Завантаження…</div>';
  const load=async(mode)=>{let r=await api('leaderboard?mode='+encodeURIComponent(mode),null,false);
   const dest=document.getElementById('rankRows');if(!dest)return;
   dest.innerHTML=(r.list||[]).map((x,i)=>'<div class="spitem"><b>#'+(i+1)+' '+esc(x.name)+'</b> · '+Number(x.score||0).toLocaleString('uk-UA')+'<div class="muted">Рівень '+x.level+' · '+(x.on?'онлайн':'офлайн')+'</div></div>').join('')||'<p>Поки немає гравців.</p>';
  };
  body.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>load(b.dataset.mode));
  await load('level');return;
 }
 if(which==='friends'){if(!token.id){body.innerHTML='<h2>Друзі</h2><p>Спочатку увійди в акаунт.</p>';return}let r=await api('friends');body.innerHTML='<h2>Друзі</h2><input id="spFriend" placeholder="ID гравця"><button id="spAdd">Додати друга</button>'+(r.incoming||[]).map(f=>'<div class="spitem">Запит: '+esc(f.name)+' · '+esc(f.id)+' <button data-accept="'+esc(f.id)+'">Прийняти</button></div>').join('')+(r.friends||[]).map(f=>'<div class="spitem">'+esc(f.name)+' · рівень '+f.level+' · '+(f.on?'онлайн':'офлайн')+'</div>').join('');$('#spAdd').onclick=async()=>{let x=await api('friend/add',{id:$('#spFriend').value});alert(x.ok?'Запит надіслано':x.err||'Помилка');show('friends')};body.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{await api('friend/add',{id:b.dataset.accept});show('friends')});return;}
 if(which==='news'){let r=await api('news',null,false);body.innerHTML='<h2>Новини сервера</h2>'+(r.list||[]).map(x=>'<div class="spitem"><b>'+ (x.type==='donation'?'💰 Донат':x.type==='damage'?'⚔ Рекорд шкоди':'📣 Подія')+'</b><div>'+esc(x.text||x.name)+'</div><div class="muted">'+new Date(x.t).toLocaleString()+'</div></div>').join('')||'<p>Гучних подій поки немає.</p>';return;}
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
      const extras = '<script src="/uhylyant-ui.js"></script><script src="/uhylyant-account.js"></script>';
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
module.exports = { validate, fresh, DB, basePay, xpNeed, tierOf, totalXP, hpOf, FOOD_CD, FOOD_EN, REGEN };
