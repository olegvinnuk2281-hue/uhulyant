'use strict';
// Configure an optional Telegram Bot API webhook. Do not commit any secrets.
// Requires TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL (https://...)
const token=process.env.TELEGRAM_BOT_TOKEN;
const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
const base=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
if(!token||!secret||!/^https:\/\//i.test(base)||!(/^[A-Za-z0-9_-]{1,256}$/.test(secret))){
 console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (A-Za-z0-9_-), PUBLIC_URL=https://...');
 process.exit(1);
}
(async()=>{
 const resp=await fetch('https://api.telegram.org/bot'+token+'/setWebhook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:base+'/api/telegram/webhook',secret_token:secret,allowed_updates:['message','pre_checkout_query'],drop_pending_updates:false})});
 const result=await resp.json();
 if(!result.ok)throw Error(result.description||'setWebhook failed');
 console.log('Telegram webhook configured:',base+'/api/telegram/webhook');
})().catch(e=>{console.error('Webhook configuration failed:',e.message);process.exitCode=1});
