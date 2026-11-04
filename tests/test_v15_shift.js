'use strict';
const assert=require('node:assert/strict');
const {server,DB}=require('../server.js');
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function req(route,body,token){const res=await fetch(base+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-id':token.id,'x-key':token.key}:{})},body:body?JSON.stringify(body):undefined});return await res.json()}
 try{
  const name='tester'+Math.floor(Math.random()*1000000000);
  const account=await req('account/register',{username:name,email:name+'@test.example',password:'a_strong_password_2026',name:'Тест робітник'});
  assert(account.ok,JSON.stringify(account));const p=DB.players[account.id];assert(p);
  const a=await req('world',undefined,account);assert(a.ok);
  const initial=a.world.cash;p.world.employment={id:'courier',name:'Курʼєр'};
  const started=await req('world',{action:'shift'},account);assert(started.ok,JSON.stringify(started));
  assert(started.world.workShift.endsAt>started.world.workShift.startedAt);
  assert.equal(started.world.cash,initial,'work should not pay immediately');
  const duplicate=await req('world',{action:'shift'},account);assert(!duplicate.ok);
  const early=await req('world',{action:'workCollect'},account);assert(!early.ok);
  const quit=await req('world',{action:'quit'},account);assert(!quit.ok);
  // Simulate elapsed time by editing the in-memory test fixture, never the production clock.
  p.world.workShift.endsAt=Date.now()-1;
  const finished=await req('world',{action:'workCollect'},account);assert(finished.ok,JSON.stringify(finished));
  assert(finished.world.cash>initial,'finished shift should pay');assert.equal(finished.world.workShift,null);
  assert.equal(finished.world.workShifts,1);
  const collectedTwice=await req('world',{action:'workCollect'},account);assert(!collectedTwice.ok);
  const cooldown=await req('world',{action:'shift'},account);assert(!cooldown.ok);
  console.log('PASS timed work start, server timer, no early pay, no duplicate pay, cooldown, quitting guard');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error(err);process.exitCode=1});
