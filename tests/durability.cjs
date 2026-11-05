const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {Readable}=require('node:stream');
function boot(seed={},fail=false,rand=null){
 const stored=structuredClone(seed), writes=[];
 let broken=fail;
 const client={from(){return {select(){return {range:async()=>({data:Object.entries(stored).map(([id,data])=>({id,data:structuredClone(data)}))})}},async upsert(rows){writes.push(structuredClone(rows));if(broken)return {error:{message:'simulated outage'}};for(const row of Array.isArray(rows)?rows:[rows])stored[row.id]=structuredClone(row.data);return {error:null}}}}};
 const module={exports:{}};
 const context={require:n=>n==='@supabase/supabase-js'?{createClient:()=>client}:(n==='crypto'&&rand!==null?{...crypto,randomInt:rand}:require(n)),module,exports:module.exports,__dirname:require('node:path').resolve(__dirname,'..'),Buffer,URL,console,structuredClone,setTimeout,clearTimeout,setInterval:()=>({unref(){}}),process:{env:{SUPABASE_URL:'mock',SUPABASE_KEY:'mock'},on(){}}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8'),context);
 async function call(route,data,id='PLAYER01'){
  const req=Readable.from(data?[JSON.stringify(data)]:[]);req.url='/api/'+route;req.method=data?'POST':'GET';req.headers={'x-id':id,'x-key':'secret'};req.socket={remoteAddress:'test'};
  const res={writeHead(code){this.code=code},end(s){this.data=JSON.parse(s)}};
  await module.exports.durableApi(req,res,route);return res;
 }
 return {call,stored,writes,fresh:module.exports.fresh,weekClock:module.exports.weekClock,weeklyScore:module.exports.weeklyScore,leagueDivision:module.exports.leagueDivision,db:module.exports.DB,breakDB:v=>broken=v};
}
function player(id='PLAYER01'){
 return {id,keyHash:crypto.createHash('sha256').update('secret').digest('hex'),name:id,created:Date.now(),lastSave:Date.now(),seen:Date.now(),save:{level:1,xp:0,uah:150,gold:0,bs:{b:0,w:0}},friends:[],reqIn:[],reqOut:[],events:[],goldBank:30,goldSpent:0,hits:[],bud:{e:250,t:Date.now()},evClaim:{},fdmg:0};
}
test('legacy wallets merge exactly once and survive reload',async()=>{
 const p=player();p.world={cash:500,xp:0,items:[],equipped:{}};
 const a=boot({PLAYER01:p});let r=await a.call('me');assert.equal(r.data.walletCash,650);assert.equal(a.stored.PLAYER01.save.uah,650);
 await a.call('me');assert.equal(a.stored.PLAYER01.save.uah,650);
 const b=boot(a.stored);r=await b.call('me');assert.equal(r.data.walletCash,650);
});
test('new world does not mint an independent starter wallet',async()=>{
 const a=boot({PLAYER01:player()});const r=await a.call('world');assert.equal(r.data.world.cash,150);assert.equal(a.stored.PLAYER01.save.uah,150);
});
test('first character save never treats the mirrored wallet as legacy money',async()=>{
 const p=player();p.save=null;const a=boot({PLAYER01:p});await a.call('world');
 const r=await a.call('save',{walletRevision:0,save:{...a.fresh(),name:'Test',look:{skin:1,hair:0},started:true}});
 assert.equal(r.data.ok,true);assert.equal((await a.call('world')).data.walletCash,150);
 assert.equal(a.stored.PLAYER01.economyV26,true);
});
test('outage returns failure and rolls back memory, retry merges once',async()=>{
 const p=player();p.world={cash:500};const a=boot({PLAYER01:p},true);
 assert.equal((await a.call('me')).code,503);assert.equal(a.stored.PLAYER01.save.uah,150);
 a.breakDB(false);assert.equal((await a.call('me')).data.walletCash,650);
});
test('stale client cannot overwrite server wallet',async()=>{
 const a=boot({PLAYER01:player()});await a.call('me');const r=await a.call('save',{save:{uah:999},walletRevision:99});assert.equal(r.code,409);assert.equal(a.stored.PLAYER01.save.uah,150);
});
test('failed registration issues no usable account; retry is possible',async()=>{
 const a=boot({},true);const data={name:'Tester',username:'tester',password:'password123',email:'t@example.org'};
 assert.equal((await a.call('account/register',data)).code,503);assert.equal(Object.keys(a.stored).length,0);
 a.breakDB(false);assert.equal((await a.call('account/register',data)).data.ok,true);
});
test('brigade hit persists owner and updates damage in the same commit',async()=>{
 const week=boot().weekClock();
 const owner=player('OWNER001'),member=player();
 owner.economyV26=member.economyV26=true;
 owner.world={cash:150,xp:0,items:[],equipped:{},brigade:{id:'TEST',name:'Team',owner:owner.id,members:[owner.id,member.id],keys:0,wins:{},weekly:{id:week.id,score:290,keysGranted:0,contributors:{}},fight:{boss:'zh',hp:30000,maxHp:30000,hits:{},finishedAt:0}}};
 member.world={cash:150,xp:0,items:[],equipped:{},brigade:'TEST'};
 const a=boot({OWNER001:owner,PLAYER01:member});const r=await a.call('world',{action:'fight',boss:'zh'});
 assert.equal(r.data.ok,true);assert.ok(a.stored.OWNER001.world.brigade.fight.hp<30000);
 const batch=a.writes.at(-1);assert.ok(batch.some(x=>x.id==='OWNER001'));assert.ok(batch.some(x=>x.id==='PLAYER01'));
 assert.equal(a.stored.OWNER001.world.brigade.weekly.score,week.active?300:290);
 assert.equal(a.stored.OWNER001.world.brigade.keys,week.active?1:0);
});
test('work uses persisted deadline, survives restart and pays only once',async()=>{
 const p=player();p.economyV26=true;p.world={cash:150,xp:0,items:[],equipped:{},employment:{id:'courier',name:'Курʼєр'}};
 const a=boot({PLAYER01:p},false,max=>Math.floor(max/2));const started=await a.call('world',{action:'shift'});assert.equal(started.data.ok,true);
 const deadline=a.stored.PLAYER01.world.workShift.endsAt;assert.ok(deadline>Date.now());
 const b=boot(a.stored);assert.equal((await b.call('world')).data.world.workShift.endsAt,deadline);
 assert.equal((await b.call('world',{action:'workCollect'})).data.ok,false);
 const later=structuredClone(a.stored);later.PLAYER01.world.workShift.endsAt=Date.now()-1;
 const c=boot(later);const collected=await c.call('world',{action:'workCollect'});assert.equal(collected.data.ok,true);assert.equal(collected.data.walletCash,250);assert.equal(c.stored.PLAYER01.world.cash,250);
 assert.equal((await c.call('world',{action:'workCollect'})).data.ok,false);assert.equal(c.stored.PLAYER01.save.uah,250);
});
test('daily wheel persists outcome before reply and prevents a second spin after restart',async()=>{
 const p=player();p.save.started=true;
 const a=boot({PLAYER01:p});const spin=await a.call('daily-wheel',{});assert.equal(spin.data.ok,true);
 assert.equal(a.stored.PLAYER01.dailyWheel.lastSpin.id,spin.data.spin.id);
 assert.equal(a.stored.PLAYER01.save.uah,a.stored.PLAYER01.world.cash);
 const b=boot(a.stored);assert.equal((await b.call('daily-wheel',{})).data.ok,false);
});

test('Kyiv league closes at Sunday midnight and resets Monday, including summer time',()=>{
 const a=boot();assert.equal(a.weekClock(Date.parse('2026-11-07T21:59:59Z')).active,true);
 assert.equal(a.weekClock(Date.parse('2026-11-07T22:00:00Z')).active,false);
 assert.equal(a.weekClock(Date.parse('2026-11-08T22:00:00Z')).id,'2026-11-09');
 assert.equal(a.weekClock(Date.parse('2026-07-04T21:00:00Z')).active,false);
});
test('weekly league divisions group players by level without overlap',()=>{
 const a=boot();
 assert.equal(a.leagueDivision(1).id,'street');assert.equal(a.leagueDivision(39).id,'street');
 assert.equal(a.leagueDivision(40).id,'worker');assert.equal(a.leagueDivision(149).id,'worker');
 assert.equal(a.leagueDivision(150).id,'district');assert.equal(a.leagueDivision(500).id,'city');
 assert.equal(a.leagueDivision(1500).id,'capital');assert.equal(a.leagueDivision(5500).id,'legend');
});
test('weekly leaderboard keeps the full rank and compares friends in the same division',async()=>{
 const a0=player('PLAYER01'),clock=boot().weekClock(),seed={};
 a0.friends=['P0000002'];a0.weekly={id:clock.id,score:1,division:'street',days:{}};seed[a0.id]=a0;
 for(let i=2;i<=52;i++){const id='P'+String(i).padStart(7,'0'),p=player(id);p.weekly={id:clock.id,score:103-i,division:'street',days:{}};seed[id]=p;}
 const a=boot(seed),result=await a.call('weekly');
 assert.equal(result.data.rank,52);assert.equal(result.data.participants,52);assert.equal(result.data.list.length,50);
 assert.equal(result.data.nextRival.name,'P0000052');assert.equal(result.data.nextRival.delta,51);
 assert.equal(result.data.friends.length,2);assert.equal(result.data.friends[0].id,'P0000002');assert.equal(result.data.friends[1].self,true);
});
test('weekly league ranks brigades by server-recorded team activity',async()=>{
 const clock=boot().weekClock(),member=player('PLAYER01'),aOwner=player('OWNER001'),bOwner=player('OWNER002');
 for(const p of [member,aOwner,bOwner])p.weekly={id:clock.id,score:10,division:'street',days:{}};
 aOwner.world={cash:150,brigade:{id:'TEAM-A',name:'A Team',owner:aOwner.id,members:[aOwner.id,member.id],weekly:{id:clock.id,score:300,keysGranted:1,contributors:{}}}};
 member.world={cash:150,brigade:'TEAM-A'};
 bOwner.world={cash:150,brigade:{id:'TEAM-B',name:'B Team',owner:bOwner.id,members:[bOwner.id],weekly:{id:clock.id,score:500,keysGranted:1,contributors:{}}}};
 const a=boot({PLAYER01:member,OWNER001:aOwner,OWNER002:bOwner}),result=await a.call('weekly');
 assert.equal(result.data.teams[0].id,'TEAM-B');assert.equal(result.data.teams[0].rank,1);
 assert.equal(result.data.teams[1].id,'TEAM-A');assert.equal(result.data.brigadeRank,2);
});
test('brigade weekly activity awards capped key milestones and resets per Kyiv week',async()=>{
 const owner=player('OWNER001'),member=player('PLAYER01');owner.save.level=40;
 owner.world={cash:150,xp:0,items:[],equipped:{},brigade:{id:'RALLY',name:'Team',owner:owner.id,members:[owner.id,member.id],keys:0,wins:{}}};
 member.world={cash:150,xp:0,items:[],equipped:{},brigade:'RALLY'};
 const a=boot({OWNER001:owner,PLAYER01:member}),monday=Date.parse('2026-11-02T12:00:00Z');await a.call('me');
 for(let i=0;i<5;i++)a.weeklyScore(a.db.players.OWNER001,'work',monday);
 for(let i=0;i<10;i++)a.weeklyScore(a.db.players.PLAYER01,'fight',monday);
 for(let i=0;i<5;i++)a.weeklyScore(a.db.players.PLAYER01,'work',monday);
 let team=a.db.players.OWNER001.world.brigade;
 assert.equal(team.weekly.score,300);assert.equal(team.weekly.keysGranted,1);assert.equal(team.keys,1);
 assert.equal(team.weekly.contributors.OWNER001,100);assert.equal(team.weekly.contributors.PLAYER01,200);
 a.weeklyScore(a.db.players.PLAYER01,'fight',monday);assert.equal(team.weekly.score,300);assert.equal(team.keys,1);
 const nextMonday=Date.parse('2026-11-09T12:00:00Z');a.weeklyScore(a.db.players.OWNER001,'work',nextMonday);
 team=a.db.players.OWNER001.world.brigade;assert.equal(team.weekly.id,'2026-11-09');assert.equal(team.weekly.score,20);assert.equal(team.keys,1);
});
test('welcome gift grants 50 coins once and kit is consumed once across restart',async()=>{
 const p=player();p.save.started=true;p.save.energy=10;const a=boot({PLAYER01:p});
 assert.equal((await a.call('me')).data.save.gold,50);assert.equal((await a.call('me')).data.save.gold,50);
 const used=await a.call('city-events',{action:'kit'});assert.equal(used.data.save.energy,30);assert.equal(used.data.kit,0);
 const b=boot(a.stored);assert.equal((await b.call('me')).data.save.gold,50);assert.equal((await b.call('city-events',{action:'kit'})).code,409);
});
test('city event pays once per Kyiv day and survives reload',async()=>{
 const p=player();p.save.started=true;const a=boot({PLAYER01:p});await a.call('me');
 const r=await a.call('city-events',{action:'radio',choice:'safe'});assert.equal(r.data.walletCash,230);
 const b=boot(a.stored);assert.equal((await b.call('city-events',{action:'radio',choice:'safe'})).code,409);
 assert.equal((await b.call('me')).data.walletCash,230);
});
test('failed gift commit rolls back and retry grants exactly once',async()=>{
 const p=player();p.save.started=true;const a=boot({PLAYER01:p},true);assert.equal((await a.call('me')).code,503);
 a.breakDB(false);assert.equal((await a.call('me')).data.save.gold,50);
});
test('weapon stacks preserve legacy copy, max spends only affordable gold, survive reload',async()=>{
 const p=player();p.save.started=true;p.welcomeRC4=true;p.save.gold=250;p.save.bs.wp=['bat'];
 const a=boot({PLAYER01:p});const r=await a.call('weapon-buy',{weapon:'bat',count:'max'});
 assert.equal(r.data.save.gold,10);assert.equal(r.data.save.bs.weaponCounts.bat,7);
 const b=boot(a.stored);assert.equal((await b.call('me')).data.save.bs.weaponCounts.bat,7);
 assert.equal((await b.call('weapon-buy',{weapon:'bat',count:1})).code,400);
 assert.equal((await b.call('weapon-buy',{weapon:'toString',count:1})).code,400);
});
test('online boss damage comes from a validated save and is published once',async()=>{
 const base=boot().fresh(),p=player(),friend=player('FRIEND01');
 p.name='Player';p.friends=['FRIEND01'];p.economyV26=true;p.welcomeRC4=true;
 p.save={...base,started:true,name:p.name,gold:200,look:{skin:1,hair:0},energy:50,eAt:Date.now(),
  eq:{head:'head0',body:'body0',legs:'legs0',shoes:'shoes0',acc:'acc0'},bs:{...base.bs,hp:1000},
  st:{...base.st,earned:0,shifts:0,caught:0,escaped:0},say:''};
 const a=boot({PLAYER01:p,FRIEND01:friend});await a.call('me');
 const forged=await a.call('hit',{dmg:999999,b:0,weapon:'bat'});
 assert.equal(forged.data.ok,false);assert.equal(a.stored.FRIEND01.events.length,0);assert.equal(a.stored.FRIEND01.fdmg||0,0);
 const bought=await a.call('weapon-buy',{weapon:'bat',count:3});assert.equal(bought.data.save.bs.weaponCounts.bat,3);
 for(let left=2;left>=0;left--){
  const owner=a.db.players.PLAYER01,nx=structuredClone(owner.save);nx.bs.hp-=260;nx.bs.weaponCounts.bat=left;
  const saved=await a.call('save',{save:nx,walletRevision:Number(owner.walletRevision||0)});
  assert.equal(saved.data.ok,true,saved.data.why);
  assert.equal(a.stored.PLAYER01.save.bs.weaponCounts.bat,left);
  const hit=await a.call('hit',{dmg:1,b:5,weapon:'mace'});
  assert.equal(hit.data.ok,true);assert.equal(hit.data.damage,260);
  assert.equal(a.stored.PLAYER01.pendingBossDamage,0);assert.equal(a.stored.PLAYER01.pendingBossMax,0);
 }
 const noDamage=await a.call('hit',{dmg:260,b:0,weapon:'bat'});assert.equal(noDamage.data.ok,false);
 assert.equal(a.stored.FRIEND01.events.length,3);assert.equal(a.stored.FRIEND01.fdmg,390);
 const owner=a.db.players.PLAYER01,nx=structuredClone(owner.save);nx.bs.hp-=50;
 const freeSave=await a.call('save',{save:nx,walletRevision:Number(owner.walletRevision||0)});assert.equal(freeSave.data.ok,true,freeSave.data.why);
 const free=await a.call('hit',{dmg:500000,b:0});assert.equal(free.data.ok,true);assert.equal(free.data.damage,50);
 assert.equal(a.stored.PLAYER01.save.bs.weaponCounts.bat,0);
});
test('pending verified boss damage survives database failure and server restart exactly once',async()=>{
 const base=boot().fresh(),p=player(),friend=player('FRIEND01');
 p.name='Player';p.friends=['FRIEND01'];p.economyV26=true;p.welcomeRC4=true;
 p.save={...base,started:true,name:p.name,look:{skin:1,hair:0},energy:50,eAt:Date.now(),
  eq:{head:'head0',body:'body0',legs:'legs0',shoes:'shoes0',acc:'acc0'},bs:{...base.bs,hp:1000},
  st:{...base.st,earned:0,shifts:0,caught:0,escaped:0},say:''};
 const a=boot({PLAYER01:p,FRIEND01:friend});await a.call('me');
 const owner=a.db.players.PLAYER01,nx=structuredClone(owner.save);nx.bs.hp=900;
 a.breakDB(true);
 assert.equal((await a.call('save',{save:nx,walletRevision:Number(owner.walletRevision||0)})).code,503);
 assert.equal(a.stored.PLAYER01.pendingBossDamage,undefined);
 a.breakDB(false);
 assert.equal((await a.call('save',{save:nx,walletRevision:Number(owner.walletRevision||0)})).data.ok,true);
 assert.equal(a.stored.PLAYER01.pendingBossDamage,100);
 a.breakDB(true);assert.equal((await a.call('hit',{dmg:999999})).code,503);
 assert.equal(a.stored.PLAYER01.pendingBossDamage,100);assert.equal(a.stored.FRIEND01.events.length,0);
 a.breakDB(false);
 const restarted=boot(a.stored);await restarted.call('me');
 const hit=await restarted.call('hit',{dmg:1});assert.equal(hit.data.ok,true);assert.equal(hit.data.damage,100);
 assert.equal(restarted.stored.FRIEND01.events.length,1);
 assert.equal(restarted.stored.PLAYER01.maxDamage,100);assert.equal(restarted.stored.PLAYER01.pendingBossMax,0);
 assert.equal((await restarted.call('hit',{dmg:999999})).data.ok,false);
 assert.equal(restarted.stored.FRIEND01.events.length,1);
});
test('brigade may start any boss when it has that boss key cost',async()=>{
 const p=player();p.world={cash:150,xp:0,items:[],equipped:{},brigade:{id:'TEST',name:'Team',owner:p.id,members:[p.id],keys:4,wins:{},fight:null}};
 const a=boot({PLAYER01:p},false,max=>Math.floor(max/2));const result=await a.call('world',{action:'fight',boss:'ce'});
 assert.equal(result.data.ok,true);assert.equal(result.data.brigade.fight.boss,'ce');assert.equal(result.data.brigade.fight.keysSpent,4);assert.equal(result.data.brigade.keys,0);
});
test('failed weapon purchase rolls back both charge and stack',async()=>{
 const p=player();p.save.started=true;p.welcomeRC4=true;p.save.gold=100;p.save.bs.wp=[];
 const a=boot({PLAYER01:p},true);assert.equal((await a.call('weapon-buy',{weapon:'bat',count:2})).code,503);
 a.breakDB(false);const r=await a.call('weapon-buy',{weapon:'bat',count:2});assert.equal(r.data.save.gold,20);assert.equal(r.data.save.bs.weaponCounts.bat,2);
});
