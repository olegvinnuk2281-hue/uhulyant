"""Browser smoke tests for Telegram auto-auth UI; no real bot credentials needed."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, time
script = Path(__file__).resolve().parents[1].joinpath('uhylyant-account.js').read_text()

def check(page, case, telegram, initial, response, expect_reload=False):
    logs=[];page.on('console', lambda message: logs.append(message.text))
    page.set_content('<!doctype html><html><head></head><body></body></html>')
    page.evaluate('''({telegram, initial, response}) => {
        window.Telegram = telegram ? {WebApp:{platform:'tdesktop',initData: telegram === true ? 'signed.telegram.payload' : '',ready(){},expand(){}}} : null;
        window.__saved = initial ? JSON.stringify(initial) : null;
        window.__requests = [];
        Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return k==='vt_net' ? window.__saved : null},setItem(k,v){if(k==='vt_net'){window.__saved=v;console.log('TG_AUTH_STORE:'+v)}},removeItem(k){if(k==='vt_net')window.__saved=null}}});
        window.fetch = async (url,opts) => {window.__requests.push({url,method:opts?.method});return {json:async()=>response};};
    }''',{'telegram': telegram,'initial':initial,'response':response})
    # Running code as an inline script is equivalent to the actual downloaded JS execution.
    page.evaluate('code => { const s = document.createElement("script"); s.textContent=code; document.body.appendChild(s); }',script)
    if expect_reload:
        # Reloading an about:blank test environment may fail, but stored credentials must be updated.
        deadline=time.time()+3
        while not any('TG_AUTH_STORE:' in x for x in logs) and time.time()<deadline: page.wait_for_timeout(100)
        assert any('TG_AUTH_STORE:' in x for x in logs),(case,logs)
        tok=json.loads(next(x.split('TG_AUTH_STORE:',1)[1] for x in logs if 'TG_AUTH_STORE:' in x))
        assert tok['id']==response['id'] and tok['key']==response['key'],(case,tok)
    else:
        page.wait_for_timeout(1650 if telegram=='no-data' else 400)
        text=page.locator('body').inner_text()
        if case=='normal-browser':
            assert 'ВХІД ДО ГРИ' in text and page.locator('input[placeholder="Пароль"]').count()==1,(case,text)
        elif case=='existing-tg':
            assert not page.locator('#uhyAuth:visible').count(),(case,text)
        elif case=='tg-error':
            assert 'Автоматичний вхід недоступний' in text and 'Пароль' not in text,(case,text)
            assert page.locator('#tgActions button').count()==1,(case,text)
        elif case=='tg-no-data':
            assert 'не передав дані входу' in text and 'Пароль' not in text,(case,text)
        else: raise Exception('Unknown case')
    print('PASS:',case)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for case,tg,initial,answer,reload in [
       ('normal-browser',False,None,{'ok':False},False),
       ('existing-tg',True,{'id':'ABCD2345','key':'token','telegram':True},{'ok':True,'id':'ABCD2345','key':'token'},False),
       ('new-tg',True,None,{'ok':True,'id':'ABCD2345','key':'token'},True),
       ('tg-error',True,None,{'ok':False,'err':'Telegram не налаштований на сервері'},False),
       ('tg-no-data','no-data',None,{'ok':False},False),
    ]:
       page=browser.new_page()
       try: check(page,case,tg,initial,answer,reload)
       finally: page.close()
    browser.close()
