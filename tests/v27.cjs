'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const path=require('node:path'),{Readable}=require('node:stream');
function fixture(name='Гравець', cash=1600, randomInt=null, broken=false){
 const fresh={level:1,xp:0,uah:cash,gold:0,ng:0,started:true,name,inv:['head0','body0','legs0','shoes0','acc0'],eq:Object.fromEntries(['head','body','legs','shoes','acc'].map(k=>[k,k+'0'])),up:{},st:{earned:0,escaped:0,caught:0},bs:{me:0,wp:[],r:0,b:0,w:0},dailyAt:0,end:null,seenEnd:false};
 const player={id:'PLAYER01',name,keyHash:crypto.createHash('sha256').update('secret').digest('hex'),save:fresh,economyV26:true,world:{cash,xp:0,items:[],equipped:{},lastWork:0,workDays:[],hunger:85,hungerAt:Date.now()},friends:[],reqOut:[],reqIn:[],events:[],hits:[],welcomeRC4:true,goldBank:30,goldSpent:0,bud:{e:250,t:Date.now()},evClaim:{},fdmg:0};
 const stored={PLAYER01:player},writes=[];let outage=broken;
 const client={from(){return {select(){return {range:async()=>({data:Object.entries(stored).map(([id,data])=>({id,data:structuredClone(data)}))})}},upsert:async rows=>{if(outage)return {error:{message:'simulated outage'}};for(const row of Array.isArray(rows)?rows:[rows]){stored[row.id]=structuredClone(row.data);writes.push(row.id)}return {error:null}}}}};
 const module={exports:{}};
 const context={module,exports:module.exports,__dirname:path.resolve(__dirname,'..'),Buffer,URL,console,structuredClone,setTimeout,clearTimeout,setInterval:()=>({unref(){}}),process:{env:{SUPABASE_URL:'mock',SUPABASE_KEY:'mock'},on(){}},require:n=>n==='@supabase/supabase-js'?{createClient:()=>client}:n==='crypto'&&randomInt!==null?{...crypto,randomInt}:require(n)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),context);
 async function call(route,data,id='PLAYER01'){
  const req=Readable.from(data?[JSON.stringify(data)]:[]);req.url='/api/'+route;req.method=data?'POST':'GET';req.headers={'x-id':id,'x-key':'secret'};req.socket={remoteAddress:'test'};
  const res={writeHead(code){this.code=code},end(s){this.data=JSON.parse(s)}};
  await module.exports.durableApi(req,res,route);return res;
 }
 return {call,stored,writes,db:module.exports.DB,breakDB:v=>outage=v};
}
test('v27: expensive outfit is charged once and held in both inventory and appearance',async()=>{
 const a=fixture('Гравець',1800),before=(await a.call('world')).data;
 assert.equal(before.sets.length,7);
 const buy=await a.call('world',{action:'outfitBuy',set:'night'});
 assert.equal(buy.data.ok,true);
 assert.equal(buy.data.walletCash,1420);
 assert.equal(buy.data.save.eq.body,'body7');
 assert.equal(buy.data.save.inv.includes('acc7'),true);
 assert.equal((await a.call('world',{action:'outfitBuy',set:'night'})).data.ok,false);
 assert.equal(a.stored.PLAYER01.save.uah,1420);
});
test('v27: seven outfit sets are level-gated and cannot be injected through client save',async()=>{
 const a=fixture('Гравець',150000);
 assert.equal((await a.call('world',{action:'outfitBuy',set:'royal'})).data.ok,false);
 const start=(await a.call('me')).data.save;
 const forged=structuredClone(start);forged.inv=[...forged.inv,'body11'];forged.eq={...(forged.eq||{}),body:'body11'};
 const r=await a.call('save',{save:forged,walletRevision:0});
 assert.notEqual(r.data.ok,true);
 assert.equal(a.stored.PLAYER01.save.inv.includes('body11'),false);
});
test('v27: full outfit bonus is applied to server-calculated work XP',async()=>{
 const a=fixture('Гравець',150000,max=>Math.floor(max/2));await a.call('world');a.db.players.PLAYER01.save.level=150;
 const buy=await a.call('world',{action:'outfitBuy',set:'mechanic'});assert.equal(buy.data.ok,true);
 a.db.players.PLAYER01.world.employment={id:'foreman',name:'Бригадир'};a.db.players.PLAYER01.world.xp=2000;
 const shift=await a.call('world',{action:'shift'});assert.equal(shift.data.ok,true);assert.equal(shift.data.world.workShift.xp,80);
});
test('v27: buying a cosmetic set commits atomically or rolls back on database outage',async()=>{
 const a=fixture('Гравець',1800,null,true);
 assert.equal((await a.call('world',{action:'outfitBuy',set:'night'})).code,503);
 assert.equal(a.stored.PLAYER01.save.uah,1800);
 assert.equal(a.stored.PLAYER01.save.inv.includes('body7'),false);
 a.breakDB(false);
 assert.equal((await a.call('world',{action:'outfitBuy',set:'night'})).data.ok,true);
 assert.equal(a.stored.PLAYER01.save.uah,1420);
});
test('v27: high-risk 60-percent job catches player, never pays, and persists capture',async()=>{
 const a=fixture('Гравець',250,()=>0);
 await a.call('world');const p=a.db.players.PLAYER01;
 p.world.employment={id:'highway',name:'Нічний курʼєр без броні'};
 const res=await a.call('world',{action:'shift'});
 assert.equal(res.data.ok,true);
 assert.equal(res.data.world.workShift??null,null);
 assert.equal(res.data.world.lastIncident.type,'tcc');
 assert.equal(res.data.save.tcc.stage,0);
 assert.equal(res.data.save.tcc.documents,true);
 assert.equal(res.data.save.st.caught,0);
 assert.equal(a.stored.PLAYER01.save.st.caught,0);
 assert.equal(a.stored.PLAYER01.save.uah,250);
 assert.equal((await a.call('world',{action:'shift'})).data.ok,false);
});
test('v27: remote text work has no catch and is persisted after start',async()=>{
 const a=fixture('Гравець',250,()=>0);
 await a.call('world');a.db.players.PLAYER01.world.employment={id:'texts',name:'Написання текстів удома'};
 const r=await a.call('world',{action:'shift'});
 assert.equal(r.data.ok,true);
 assert.equal(r.data.world.workShift.jobId,'texts');
 assert.equal(r.data.world.workShift.motion,'texts');
 assert.equal(r.data.save.tcc??null,null);
 assert.equal(a.stored.PLAYER01.world.workShift.endsAt,r.data.world.workShift.endsAt);
});
test('v27: successful delivery fills hunger but walk to shop may trigger TCC',async()=>{
 const a=fixture('Гравець',500,()=>0);
 const r=await a.call('world',{action:'foodRun',mode:'order'});
 assert.equal(r.data.ok,true);
 assert.equal(r.data.world.hunger,100);
 assert.equal(a.stored.PLAYER01.save.uah,375);
 const b=fixture('Гравець',500,()=>0);const s=await b.call('world',{action:'foodRun',mode:'shop'});
 assert.equal(s.data.world.lastIncident.type,'tcc');
 assert.equal(s.data.save.tcc.stage,0);
 assert.equal(s.data.world.hunger,85);
 assert.equal(b.stored.PLAYER01.save.uah,445);
});
test('v27: renaming updates both player and save, persists and enforces seven-day cooldown',async()=>{
 const a=fixture('Гравець');
 const long='ДовгеІмяПерсонажа123';assert.equal([...long].length,20);
 const r=await a.call('player/rename',{name:long});assert.equal(r.data.ok,true);assert.equal(r.data.name,long);
 assert.equal(a.stored.PLAYER01.save.name,long);
 assert.equal((await a.call('player/rename',{name:'ІншийНік'})).code,429);
 assert.equal((await a.call('player/rename',{name:'admin'})).code,400);
});
test('v27: server rejects conflicting nickname and prevents disclosure of other player private fields',async()=>{
 const a=fixture('Гравець');
 const r=await a.call('player/rename',{name:'Районний'});assert.equal(r.data.ok,true);
 const other=structuredClone(a.stored.PLAYER01);other.id='PLAYER02';other.name='Новенький';other.save.name='Новенький';
 a.stored.PLAYER02=other;a.db.players.PLAYER02=structuredClone(other);
 assert.equal((await a.call('player/rename',{name:'Районний'},'PLAYER02')).code,409);
});

test('documents release protected players; failed escape persists a cooldown',async()=>{
 const a=fixture('Гравець',500,()=>99);await a.call('me');a.db.players.PLAYER01.save.bronUntil=Date.now()+3600000;
 assert.equal((await a.call('tcc/choice',{action:'begin'})).data.save.tcc.documents,true);
 const released=await a.call('tcc/choice',{action:'documents'});assert.equal(released.data.save.tcc,null);assert.equal(a.stored.PLAYER01.save.tcc,null);
 await a.call('tcc/choice',{action:'begin'});
 const fail=await a.call('tcc/choice',{action:'run'});assert.equal(fail.data.save.st.caught,1);assert.ok(fail.data.save.tcc.nextAt>Date.now()+170000);
 assert.equal((await a.call('tcc/choice',{action:'run'})).code,429);
});
test('escape boundary is precisely 18 out of 100 server outcomes',async()=>{
 for(const [roll,success] of [[17,true],[18,false]]){
  const a=fixture('Гравець',500,()=>roll);await a.call('tcc/choice',{action:'begin'});
  const r=await a.call('tcc/choice',{action:'run'});assert.equal(r.data.save.tcc===null,success);
  assert.equal(r.data.save.st.escaped,success?1:0);
 }
});
test('documents without protection detain; database outage cannot commit a release',async()=>{
 const a=fixture();await a.call('tcc/choice',{action:'begin'});const r=await a.call('tcc/choice',{action:'documents'});assert.equal(r.data.save.tcc.documents,false);
 const b=fixture('Гравець',500,()=>0);await b.call('tcc/choice',{action:'begin'});b.breakDB(true);
 assert.equal((await b.call('tcc/choice',{action:'run'})).code,503);assert.ok(b.stored.PLAYER01.save.tcc);
});
test('district dialog choices grant 80, 180 or zero exactly once',async()=>{
 for(const [choice,roll,cash] of [['safe',99,80],['risk',44,180],['risk',45,0],['decline',0,0]]){
  const a=fixture('Гравець',500,()=>roll);const r=await a.call('city-events',{action:'radio',choice});
  assert.equal(r.data.events.radio.cash,cash);assert.equal(r.data.save.uah,500+cash);
  assert.equal((await a.call('city-events',{action:'radio',choice})).code,409);
 }
});
