"""Offline smoke test: launch with a local-only fake Supabase module, no credentials required."""
import json,os,random,requests,shutil,socket,subprocess,tempfile,time
from pathlib import Path
P=Path(__file__).resolve().parents[1];tmp=Path(tempfile.mkdtemp(prefix='uhy-release-test-'))
mod=tmp/'@supabase'/'supabase-js';mod.mkdir(parents=True)
(mod/'index.js').write_text("exports.createClient=()=>{throw Error('offline-only')};")
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
proc=subprocess.Popen(['node','server.js'],cwd=P,env={**os.environ,'ALLOW_EPHEMERAL_DB':'1','NODE_PATH':str(tmp),'PORT':str(port),'SUPABASE_URL':'','SUPABASE_KEY':''},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=f'http://127.0.0.1:{port}';num=0
def verify(condition,detail):
 global num
 assert condition,detail
 num+=1;print(f'PASS {num:02d} {detail}')
try:
 for i in range(50):
  try:
   if requests.get(base+'/api/ping',timeout=.2).ok:break
  except requests.RequestException:time.sleep(.1)
 else:raise RuntimeError('server did not start')
 verify(requests.get(base+'/api/ping').json().get('ok'),'server started')
 for path in ['boss-zh.svg','boss-my.svg','boss-ce.svg','comic-street-day.svg','comic-tcc0-night.svg']:
  r=requests.get(base+'/assets/'+path,timeout=3)
  verify(r.status_code==200 and r.headers.get('content-type')=='image/svg+xml' and b'<svg' in r.content,'asset '+path)
 r=requests.get(base+'/uhylyant-extras.js',timeout=3)
 verify(r.status_code==200 and b'UHY_AUDIO' in r.content,'original soundtrack module served')
 stamp=random.randint(100000,999999)
 r=requests.post(base+'/api/account/register',json={'username':f'release{stamp}','password':'long-dev-password-2026','email':f't{stamp}@example.test','name':'Гравець'},timeout=4).json()
 verify(r.get('ok') and r.get('id') and r.get('key'),'register')
 H={'x-id':r['id'],'x-key':r['key']}
 def api(payload=None):
  return requests.request('POST' if payload is not None else 'GET',base+'/api/world',headers=H,json=payload,timeout=5).json()
 w=api();verify(w.get('ok'),'world state')
 verify(len(w['bosses'])==3 and [b['keyCost'] for b in w['bosses']]==[0,2,4],'three boss tiers and key costs')
 verify(not api({'action':'fight','boss':'zh'}).get('ok'),'solo cannot attack brigade boss')
 c=api({'action':'create','name':'Вільні хлопці'})
 verify(c.get('ok') and c.get('brigade',{}).get('keys')==0,'created shared brigade with zero keys')
 verify(not api({'action':'fight','boss':'my'}).get('ok'),'second boss locked behind the first')
 verify(not api({'action':'fight','boss':'ce'}).get('ok'),'final boss locked behind second')
 f=api({'action':'fight','boss':'zh'})
 verify(f.get('ok') and f.get('brigade',{}).get('fight',{}).get('boss')=='zh','first boss attack accepted')
 verify(not api({'action':'fight','boss':'zh'}).get('ok'),'boss cooldown enforced')
 verify(api().get('brigade',{}).get('fight',{}).get('hp',999999)<12000,'boss damage saved')
 verify(not api({'action':'streetHide'}).get('ok'),'hide without scrap rejected')
 verify(not api({'action':'streetBribe'}).get('ok'),'bribe outside arrest rejected')
 verify(not api({'action':'streetLawyer'}).get('ok'),'lawyer outside arrest rejected')
 verify(not api({'action':'streetEscape'}).get('ok'),'evac outside trench rejected')
 verify(not requests.post(base+'/api/world',json={'action':'daily'},timeout=3).json().get('ok'),'unauthorized wallet change rejected')
 print(f'RELEASE TEST: {num} PASS')
finally:
 proc.terminate()
 try:proc.wait(timeout=2)
 except subprocess.TimeoutExpired:proc.kill()
 shutil.rmtree(tmp,ignore_errors=True)
