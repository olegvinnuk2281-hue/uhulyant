(()=>{'use strict';
const css=`
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap');
:root{--noir-ink:#181411;--noir-paper:#d8b98b;--noir-gold:#f7b83d;--noir-edge:#97714d}
html{background:#15120f!important} .hud,.card,.paper,.scene{background-image:none!important} #uhyComicScene .land{background-image:initial} #uhyComicScene .day{background-image:url('/assets/noir-courtyard-day.webp')} #uhyComicScene .night{background-image:url('/assets/noir-courtyard-night.webp')}
body{background:#171411!important;color:#f1dfc4!important;min-height:100dvh}
body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.045;background:repeating-linear-gradient(0deg,transparent 0 3px,#050403 4px 5px);mix-blend-mode:multiply}
body>*{position:relative}#uhyComicScene{z-index:0} .wrap,.container,main{min-width:0}
h1,h2,h3,.title,.section-title{font-family:Oswald,Impact,'Arial Narrow',sans-serif!important;letter-spacing:.035em;text-shadow:2px 2px #100c09}
h1{color:var(--noir-gold)!important}
button{transition:transform .15s ease,filter .15s ease,box-shadow .2s ease}
button:active{transform:scale(.965)!important}
button:focus-visible{outline:3px solid #ffd675!important;outline-offset:2px}
button:not(:disabled):hover{filter:brightness(1.11)}
#socialPanel{background:#070605ed!important;backdrop-filter:blur(5px)}
#socialPanel .spbox{width:min(900px,calc(100vw - 24px))!important;max-height:calc(100dvh - 35px)!important;background:linear-gradient(135deg,#33271f,#171514)!important;border:3px solid #b48b57!important;border-radius:8px!important;box-shadow:0 0 0 3px #0c0907,0 18px 70px #000!important;padding:clamp(12px,2.5vw,28px)!important}
#socialPanel .spbox:before{content:"УХИЛЯНТ • РАЙОННІ СПРАВИ";display:block;color:#f4b843;font:700 15px Oswald,Impact,sans-serif;letter-spacing:.1em;border-bottom:2px solid #7a5735;padding:0 0 12px;margin-bottom:12px}
#socialPanel h2{color:#f8bd4a;font:700 clamp(23px,3vw,36px) Oswald,Impact,sans-serif!important}
#socialPanel .spitem{background:#30271f;border:1px solid #705438;border-radius:6px;padding:12px!important;margin:8px 0}
#socialPanel button:not(.alt){background:linear-gradient(#ffd36c,#d99121)!important;border:2px solid #3d2514!important;border-radius:5px!important;box-shadow:inset 0 2px #ffe4a0,2px 3px #0d0a07!important;color:#261a10!important;font-family:Oswald,Impact,sans-serif!important;letter-spacing:.025em}
#socialPanel input,#socialPanel select{background:#14110e!important;border:2px solid #87613d!important;color:#f3e7d1!important;border-radius:5px!important;min-height:42px}
#socialDock{max-height:78px!important;overflow:hidden!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;z-index:9000!important;background:linear-gradient(#332820,#1a1512)!important;border:3px solid #9b7448!important;border-bottom:0!important;border-radius:9px 9px 0 0!important;box-shadow:0 -6px 22px #0009!important}
#socialDock>button{min-width:0!important;white-space:normal!important;overflow:hidden!important;text-overflow:ellipsis!important;font-family:Oswald,Impact,sans-serif!important;text-transform:uppercase!important;letter-spacing:.035em!important;background:#33291e!important;border:1px solid #6e5035!important;color:#f4dfbf!important}
#socialDock>button:hover,#socialDock>button.nav-on{background:linear-gradient(#ffc653,#cf7c17)!important;color:#24150b!important}
#uhyMore{z-index:8999!important;background:#241b16!important;border:3px solid #a47b4c!important}
#uhyMore button{font-family:Oswald,Impact,sans-serif!important;font-size:16px!important}
#uhyComicScene{position:relative;isolation:isolate;margin:12px auto 18px;width:calc(100% - 20px);max-width:1250px;min-width:0;grid-column:1/-1!important;grid-row:auto!important;height:clamp(200px,27vw,340px);overflow:hidden;border:4px solid #ae8454;border-radius:7px;box-shadow:0 0 0 3px #15100b,0 15px 32px #000b;background:#181411}
#uhyComicScene .land{position:absolute;inset:-2%;background-position:center 47%;background-size:cover;transition:opacity 1.8s ease;transform:scale(1.04);animation:uhyBreath 15s ease-in-out infinite alternate}
#uhyComicScene .day{background-image:url('/assets/noir-courtyard-day.webp')}
#uhyComicScene .night{background-image:url('/assets/noir-courtyard-night.webp');opacity:0}
#uhyComicScene[data-night="true"] .night{opacity:1}
#uhyComicScene .sceneShade{position:absolute;inset:0;background:linear-gradient(90deg,#100d0ba8,transparent 55%,#100d0b65),linear-gradient(0deg,#100d0bcf,transparent 45%)}
#uhyComicScene .sceneTitle{position:absolute;top:clamp(9px,2vw,24px);left:clamp(12px,2vw,30px);font:900 clamp(29px,5.3vw,70px) Oswald,Impact,sans-serif;line-height:1;color:#f6b52f;letter-spacing:.03em;-webkit-text-stroke:1px #1d1008;text-shadow:3px 4px #140c08,5px 6px #050403}
#uhyComicScene .sceneSub{position:absolute;top:clamp(48px,8vw,108px);left:clamp(12px,2vw,30px);background:#17120ed9;color:#fff0d1;border-left:4px solid #d5a148;padding:6px 10px;font:700 clamp(11px,1.6vw,17px) Oswald,Impact,sans-serif}
#uhyComicScene .clock{position:absolute;right:clamp(8px,2vw,24px);top:clamp(8px,2vw,20px);background:#1a140edc;border:2px solid #c49b61;border-radius:5px;padding:7px 12px;text-align:right;font:700 clamp(12px,1.5vw,19px) Oswald,Impact,sans-serif;color:#ffd16a}
#uhyComicScene .sceneTip{position:absolute;bottom:12px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;color:#fff1d7;font:600 clamp(11px,1.5vw,16px) Oswald,Impact,sans-serif;text-shadow:1px 2px #000}
#uhyComicScene .interact{cursor:pointer;background:#e4a832;color:#221408;border:2px solid #3b2413;border-radius:4px;padding:7px 10px;font:700 13px Oswald,Impact,sans-serif}
#uhyComicScene .spark{position:absolute;bottom:15%;left:43%;font-size:30px;pointer-events:none;animation:uhySpark 1s ease-out forwards}
#uhyComicScene .fog{position:absolute;width:150px;height:70px;bottom:8%;left:28%;opacity:.22;background:radial-gradient(ellipse,#e9d7bfaa,transparent 68%);filter:blur(14px);animation:uhyFog 9s ease-in-out infinite alternate;pointer-events:none}
#uhyComicScene .neon{position:absolute;right:9%;bottom:24%;width:7px;height:7px;background:#ffc36d;border-radius:50%;box-shadow:0 0 20px 9px #f1a8406b;animation:uhyFlicker 5s linear infinite}
@keyframes uhyBreath{to{transform:scale(1.095) translate(-.5%,.5%)}}
@keyframes uhyFog{to{transform:translate(160px,-20px);opacity:.08}}
@keyframes uhyFlicker{0%,85%,91%,100%{opacity:.9}87%,90%,93%{opacity:.18}}
@keyframes uhySpark{to{transform:translateY(-110px) rotate(30deg);opacity:0}}
@media(max-width:700px){#socialDock{grid-template-columns:repeat(5,minmax(0,1fr))!important;max-height:82px!important}#uhyComicScene{height:220px;margin:5px auto 12px;width:calc(100% - 12px);border-width:2px}#uhyComicScene .sceneSub{top:56px;max-width:53%}#uhyComicScene .sceneTip{bottom:7px}#uhyComicScene .interact{font-size:11px}#socialPanel .spbox{max-height:calc(100dvh - 14px)!important}}
@media(prefers-reduced-motion:reduce){#uhyComicScene *,button{animation:none!important;transition:none!important}}
`;
const style=document.createElement('style');style.textContent=css;document.head.append(style);
function time(){const d=new Date(Date.now()+2*3600000);return {hour:d.getUTCHours(),clock:String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')}}
function create(){
if(document.querySelector('#uhyComicScene'))return;
const target=document.querySelector('.hud')||document.querySelector('#tabs')||document.querySelector('.tabs')||document.querySelector('main')||document.body.firstElementChild;
const box=document.createElement('section');box.id='uhyComicScene';box.setAttribute('aria-label','Ілюстроване місто, час гри');
box.innerHTML=`<div class="land day"></div><div class="land night"></div><div class="fog"></div><div class="neon"></div><div class="sceneShade"></div><div class="sceneTitle">УХИЛЯНТ</div><div class="sceneSub">ВУЛИЧНИЙ СИМУЛЯТОР</div><div class="clock" id="uhyClock"></div><div class="sceneTip"><span id="uhySceneCaption">Місто живе своїм життям</span><button type="button" class="interact" id="uhySceneAction">🐈 Погладити кота</button></div>`;
// Put scene in the main page flow, never inside a grid column or an existing panel.
const main=target?.closest('.wrap,.container,#app,main') || target?.parentElement;
if(main && main!==document.body){main.insertBefore(box,main.firstElementChild);}else{document.body.insertBefore(box,document.body.firstElementChild)}

const refresh=()=>{const t=time(),night=t.hour<6||t.hour>=20;box.dataset.night=String(night);box.querySelector('#uhyClock').textContent=(night?'☾ НІЧ':'☀ ДЕНЬ')+' · '+t.clock+' UTC+2';};
refresh();setInterval(refresh,30000);
const tips=['Кіт задоволено муркоче.','Кіт перевернувся на інший бік.','Кіт ліниво потягнувся.','Кіт знову заснув.'];
let i=0;
box.querySelector('#uhySceneAction').onclick=()=>{const el=document.createElement('span');el.className='spark';el.textContent='♥';box.append(el);setTimeout(()=>el.remove(),950);box.querySelector('#uhySceneCaption').textContent=tips[i++%tips.length];};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',create);else create();
})();