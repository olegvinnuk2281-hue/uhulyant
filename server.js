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
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('players').select('*');
    if (!error && data) {
      data.forEach(row => { DB.players[row.id] = row.data; });
      console.log(`Завантажено ${data.length} гравців із Supabase`);
    }
  } catch (e) { console.error('Помилка завантаження бази:', e); }
}
loadDB();

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
        console.error('❌ Помилка збереження в Supabase:', error.message);
      } else {
        console.log(`✅ Успішно збережено гравця ${id} у Supabase`);
      }
    }
  }
}
setInterval(flush, 3000).unref();
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, async () => { await flush(); process.exit(0); }));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
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
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
}
const pub = p => ({ id: p.id, name: p.name, level: p.save ? p.save.level : 1, b: p.save && p.save.bs ? num(p.save.bs.b) : 0, on: Date.now() - (p.seen || 0) < 90000 });

async function api(req, res, route) {
  const ip = clientIp(req);
  if (route === 'ping') return send(res, 200, { ok: 1 });
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
  if (route === 'me') return send(res, 200, { ok: true, id: p.id, name: p.name, save: p.save });
  if (route === 'save') {
    const b = await body(req); if (!b) return send(res, 400, { ok: false });
    const nx = b.save, v = validate(p, nx);
    if (!v.ok) { console.log('відхилено', p.id, v.why); return send(res, 200, { ok: false, why: v.why, save: p.save || undefined }); }
    v.commit();
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
    const s = fs.createReadStream(path.join(__dirname, 'uhylyant.html'));
    s.on('error', () => { if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Немає файлу uhylyant.html поруч із server.js'); });
    s.on('open', () => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-cache' }));
    s.pipe(res);
  } catch (e) { console.error(e); try { send(res, 500, { ok: false }); } catch (_) {} }
});
process.on('uncaughtException', e => console.error('uncaught', e));

if (require.main === module) server.listen(PORT, () => console.log('Ухилянт: http://localhost:' + PORT));
module.exports = { validate, fresh, DB, basePay, xpNeed, tierOf, totalXP, hpOf, FOOD_CD, FOOD_EN, REGEN };
