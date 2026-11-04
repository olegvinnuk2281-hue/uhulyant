from pathlib import Path
import subprocess,os,time,requests,random,sys,traceback,tempfile,shutil
P=Path(__file__).resolve().parents[1]
temp=tempfile.mkdtemp(prefix='uhy-v16-test-')
mod=Path(temp)/'@supabase'/'supabase-js';mod.mkdir(parents=True)
(mod/'index.js').write_text("exports.createClient = () => {throw Error('Offline test only')};")
env={**os.environ,'ALLOW_EPHEMERAL_DB':'1','NODE_PATH':temp,'PORT':'8994','SUPABASE_URL':'','SUPABASE_KEY':''}
pr=subprocess.Popen(['node','server.js'],cwd=P,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
base='http://127.0.0.1:8994'; sess=requests.Session();n=0

def check(name,cond,detail=''):
 global n
 if not cond:raise AssertionError(f'{name}: {detail}')
 n+=1;print(f'PASS {n:02d}: {name}')
try:
 for _ in range(30):
  try:
   if sess.get(base+'/api/ping',timeout=.4).ok:break
  except Exception:time.sleep(.1)
 else:raise RuntimeError('server never started')
 r=sess.get(base+'/api/ping',timeout=2).json();check('health ping',r.get('ok'))
 r=sess.get(base+'/',timeout=4);check('HTML served',r.status_code==200 and 'uhyEditBtn' in r.text or r.status_code==200 and 'УХИЛЯНТ' in r.text)
 for asset in ('comic-street-day.svg','comic-tcc0-day.svg','comic-tcc2-night.svg'):
  r=sess.get(base+'/assets/'+asset,timeout=3);check('SVG '+asset,r.status_code==200 and '<svg' in r.text,(r.status_code,r.text[:35]))
 stamp=str(random.randint(100000,999999)); reg=sess.post(base+'/api/account/register',json={'username':'v16test'+stamp,'email':'t'+stamp+'@example.com','password':'password_test_2026','name':'Інспектор'},timeout=5).json();check('register with persistent account',reg.get('ok') and reg.get('id') and reg.get('key'),reg)
 tok={'x-id':reg['id'],'x-key':reg['key']}
 def api(path='world',body=None):
  r=sess.request('POST' if body is not None else 'GET',base+'/api/'+path,headers=tok, json=body,timeout=6)
  return r.json()
 check('fetch self',api('me').get('ok'))
 check('fetch profile world',api().get('ok'))
 world=api();check('starting wallet',world['world']['cash']>=500)
 check('street state attached',world['street']['mode']=='idle')
 check('three currencies',set(['cash','scrap','crowns']) <= set(world['premium']['currencies']))
 check('bonus shop available',len(world['premium']['offers'])>=4)
 check('invalid money bet rejected',not api(body={'action':'slots','bet':0}).get('ok'))
 check('spoofed equipment rejected',not api(body={'action':'equip','item':'legend'}).get('ok'))
 check('free house equip',api(body={'action':'houseEquip','house':'shack'}).get('ok'))
 check('locked house rejected',not api(body={'action':'houseBuy','house':'lux'}).get('ok'))
 check('premium boost unaffordable',not api(body={'action':'buyBoost','offer':'stealth'}).get('ok'))
 x=api(body={'action':'streetRun'});check('street run accepted',x.get('ok'),x)
 check('street run count',x['world'].get('streetRuns')==1)
 check('street cooldown',x['street']['cooldownMs']>0)
 x2=api(body={'action':'streetRun'});check('street spam blocked',not x2.get('ok'))
 x3=api();check('progress survives request',x3['world'].get('streetRuns')==1)
 x4=api(body={'action':'shave'});check('shave action',x4.get('ok'))
 check('shave cooldown',not api(body={'action':'shave'}).get('ok'))
 check('meal accepted',api(body={'action':'eat','food':'snack'}).get('ok'))
 check('meal cooldown',not api(body={'action':'eat','food':'snack'}).get('ok'))
 check('invalid shop item rejected',not api(body={'action':'buyBoost','offer':'ROOT'}).get('ok'))
 check('leaderboard street mode',sess.get(base+'/api/leaderboard?mode=street',timeout=4).json().get('ok'))
 check('career GET',api('career').get('ok'))
 # account auth should fail when missing key
 check('reject unauthorized game actions',not sess.post(base+'/api/world',json={'action':'daily'},timeout=4).json().get('ok'))
 print('ALL',n,'CHECKS OK')
except Exception as e:
 print('TEST FAILURE',str(e));traceback.print_exc();sys.exit(1)
finally:
 pr.terminate()
 try:pr.wait(timeout=2)
 except:pr.kill()
 shutil.rmtree(temp,ignore_errors=True)
