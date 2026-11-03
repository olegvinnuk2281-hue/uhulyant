import requests,datetime,time,json,hmac,hashlib,random
base='http://127.0.0.1:8877/api/'
def call(route,payload=None,t=None,method=None):
 headers={'x-id':t['id'],'x-key':t['key']} if t else {}
 r=requests.request(method or ('POST' if payload is not None else 'GET'),base+route,json=payload,headers=headers,timeout=6)
 try: d=r.json()
 except: raise AssertionError((r.status_code,r.text[:500]))
 return r.status_code,d

def ok(route,payload=None,t=None):
 code,d=call(route,payload,t)
 assert d.get('ok'),(route,code,d)
 return d

seed=random.randrange(1000000)
a=ok('account/register',{'name':'Тестовий А','username':f'tester{seed}a','email':f'a{seed}@test.example','password':'secure_pass_2026'})
b=ok('account/register',{'name':'Тестовий Б','username':f'tester{seed}b','email':f'b{seed}@test.example','password':'secure_pass_2026'})
print('REGISTRATION',a['id'],b['id'])
wa=ok('world',t=a);assert wa['world']['cash']==500;assert wa['care']['health']==100
assert len(wa['houses'])==5 and wa['houses'][4]['price']==100000
w=ok('world',{'action':'eat','food':'snack'},a);assert w['care']['hunger']>=85
w=ok('world',{'action':'shave'},a);assert w['care']['beardMm']==0
code,d=call('world',{'action':'shave'},a);assert not d['ok'],'shave cooldown missing'
code,d=call('world',{'action':'hospital'},a);assert not d['ok'],'hospital when full should reject'
code,d=call('world',{'action':'houseBuy','house':'lux'},a);assert not d['ok'],'free house exploit'
code,d=call('world',{'action':'slots','bet':100000},a);assert not d['ok'],'slots over balance'
code,d=call('world',{'action':'shift'},a);assert not d['ok'],'shift without job'
code,d=call('world',{'action':'houseEquip','house':'nope'},a);assert not d['ok'],'house invalid exploit'
ra=ok('friends',t=a);assert ra['friends']==[]
r=ok('friend/add',{'id':b['id']},a);assert r['status']=='sent'
r=ok('friend/add',{'id':a['id']},b);assert r['status']=='friends'
p=ok('player/profile?id='+b['id'],t=a);assert p['friends'] and p['player']['id']==b['id'];print('PUBLIC PROFILE',p['player']['name'])
old=ok('world',t=a)['world']['cash'];recvOld=ok('world',t=b)['world']['cash']
ok('friend/transfer',{'id':b['id'],'amount':150},a)
assert ok('world',t=a)['world']['cash']==old-150
assert ok('world',t=b)['world']['cash']==recvOld+150
code,d=call('friend/transfer',{'id':b['id'],'amount':50000},a);assert not d['ok'],'transfer limit exploit'
code,d=call('friend/transfer',{'id':a['id'],'amount':100},a);assert not d['ok'],'self transfer exploit'
ok('friend/gift',{'id':b['id']},a)
print('FRIEND/GIFT/TRANSFER PASS')
ok('friend/del',{'id':b['id']},a)
code,d=call('friend/transfer',{'id':b['id'],'amount':10},a);assert not d['ok'],'transfer without friendship'
# brigade creation / join / strike
ok('world',{'action':'create','name':'Тестова бригада'},a)
a_world=ok('world',t=a);brig=a_world['brigade'];print('BRIGADE',brig['id'])
ok('world',{'action':'join','id':brig['id']},b)
ok('world',{'action':'fight','boss':'zh'},a)
code,d=call('world',{'action':'fight','boss':'zh'},a);assert not d['ok'],'missing attack cooldown'
print('BOSS/FRIENDS PASS')
# signed Telegram payload
user={'id':987654321,'first_name':'Telegram','last_name':'Тестер','username':'test_new'}
from urllib.parse import urlencode
items={'auth_date':str(int(time.time())),'user':json.dumps(user,ensure_ascii=False,separators=(',',':')),'query_id':'AAExample'}
secret=hmac.new(b'WebAppData',b'TEST_12345:FAKE_SECRET_FOR_LOCAL_TESTS_ONLY',hashlib.sha256).digest()
check='\n'.join(k+'='+v for k,v in sorted(items.items()))
items['hash']=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
signed=urlencode(items)
tg=ok('telegram/auth',{'initData':signed});print('TELEGRAM REGISTER',tg['id'])
tgworld=ok('world',t=tg);assert tgworld['world']['cash']==500
p=ok('me',t=tg);assert p['save']['started'] is True
again=ok('telegram/auth',{'initData':signed},tg);assert again['key']==tg['key'] and again['id']==tg['id']
bad=items.copy();bad['hash']='0'*64
code,d=call('telegram/auth',{'initData':urlencode(bad)});assert code==401 and not d['ok']
expired=items.copy();expired['auth_date']=str(int(time.time())-200000)
code,d=call('telegram/auth',{'initData':urlencode(expired)});assert code==401 and not d['ok']
print('TELEGRAM SECURITY PASS')
# link old account with password to fresh telegram profile
link=ok('telegram/link',{'username':f'tester{seed}a','password':'secure_pass_2026'},tg)
assert link['id']==a['id'];print('TELEGRAM LINK PASS')
# not leak sensitive details in leaderboard
rank=ok('leaderboard?mode=friends',t=a);assert rank['list'][0].get('keyHash') is None
print('ALL TESTS PASS')
