const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('inline and external browser scripts compile',()=>{
 const root=path.join(__dirname,'..'),file=path.join(root,'uhylyant.html');
 const html=fs.readFileSync(file,'utf8');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1]));
 assert.ok(scripts.length>0,'expected inline game scripts');
 scripts.forEach((match,index)=>new vm.Script(match[2],{filename:`uhylyant.html:inline-${index+1}`}));
 for(const name of ['uhylyant-ui.js','uhylyant-account.js','uhy-polish.js','weekly.js','v27-action.js','motion.js','combat.js','city-events.js']){
  new vm.Script(fs.readFileSync(path.join(root,name),'utf8'),{filename:name});
 }
});

test('responsive home, capture escape, full avatar, and work props stay connected',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'uhylyant.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'v27.css'),'utf8'),ui=fs.readFileSync(path.join(root,'uhylyant-ui.js'),'utf8'),action=fs.readFileSync(path.join(root,'v27-action.js'),'utf8');
 assert.match(html,/function avatarSVG\([^]*?'0 -8 200 324'/,'game avatar should use the full-body frame with foot clearance');
 assert.match(css,/body \.scene \.lyr\.hero\{[^}]*aspect-ratio:200\/306/i,'scene avatar should keep full-height proportions');
 assert.match(html,/@media\(max-width:899px\)/i,'phone and tablet layout breakpoint should remain present');
 assert.match(html,/@media\(min-width:900px\)/i,'desktop layout breakpoint should remain present');
 assert.match(css,/--v27-header-clearance/,'Telegram top safe-area clearance should remain wired');
 assert.match(css,/#audioControls\{display:none!important\}/,'the floating audio bar should not cover the game header');
 assert.match(html,/data-act="audioMusic"[^]*?data-act="audioSounds"/,'music and sound controls should remain available in Settings');
 assert.match(css,/@media\(max-height:475px\) and \(orientation:landscape\)\{\.scene \.v27-capture-van\{[^}]*width:min\(30%,160px\);left:50%;right:auto[^}]*animation-name:v27TccDriveLandscape/,'the capture van should fit away from the escape button in a short landscape scene');
 assert.match(css,/@keyframes v27TccDriveLandscape\{0%\{transform:translateX\(-300%\)[^]*?100%\{transform:translateX\(-100%\)/,'the landscape arrival route should start outside the avatar and stay clear of the escape control');
 assert.match(css,/@media\(max-width:420px\)/i,'grouped home controls should include a narrow-phone breakpoint');
 assert.match(css,/\.home-current-job\{align-items:flex-start;flex-direction:column\}/i,'the active job actions should stack on narrow phones');
 const tcc=html.slice(html.indexOf('function viewTCC(){'),html.indexOf('function viewHome(){'));
 const scene=html.slice(html.indexOf('function renderScene(){'),html.indexOf('/* ---------- вигляд ---------- */'));
 assert.match(scene,/const capturing=!!S\.tcc&&ui\.captureUntil>now\(\)/,'the capture animation should only be active during its one-shot window');
 assert.match(scene,/class="v27-capture-van"[^]*?van\(1,1,1,true\)/,'the main scene should show the animated van with flashing lights');
 assert.match(html,/function caught\(fake\)\{[^]*?startTccArrival\(\);/,'a local capture should trigger the arrival animation');
 assert.match(html,/const enteredTcc=ui\.sceneReady&&!S\.tcc&&!!sv\?\.tcc;[^]*?if\(enteredTcc\)startTccArrival\(\)/,'a server capture should animate only on a live transition');
 const arrival=html.slice(html.indexOf('function startTccArrival(){'),html.indexOf('function outing(mod){'));
 const timers=new Map(),cleared=[];let timerId=0,refreshes=0;
 const runtime={ui:{captureUntil:0,captureTimer:0},S:{started:true},now:()=>5000,clearTimeout:id=>{cleared.push(id);timers.delete(id)},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},renderScene:()=>refreshes++,UHY_AUDIO:{sounds:false},soundTone(){}};
 vm.runInNewContext(arrival+'\nstartTccArrival();',runtime);
 const first=runtime.ui.captureTimer;
 assert.equal(runtime.ui.captureUntil,6900,'the arrival should have a finite visible window');
 vm.runInNewContext(arrival+'\nstartTccArrival();',runtime);
 assert.ok(cleared.includes(first),'a duplicate start should replace its prior timer');
 const finalTimer=timers.get(runtime.ui.captureTimer);
 assert.equal(finalTimer.ms,2100,'the scene should refresh after the animation ends');
 finalTimer.fn();
 assert.equal(runtime.ui.captureUntil,0,'the capture window should close');
 assert.equal(refreshes,1,'the scene should remove the van after its arrival beat');
 const sceneClasses=new Set(),bubble={textContent:''};
 const sceneNode={dataset:{},innerHTML:'',classList:{toggle:(name,on)=>on?sceneClasses.add(name):sceneClasses.delete(name)},querySelector(selector){return selector==='.lyr'&&this.innerHTML.includes('class="lyr')?{}:null}};
 const renderContext={ui:{tab:'home',house:'shack',sk:'',captureUntil:0,sceneReady:false},S:{tcc:{stage:0,busy:false,nextAt:0},bs:{b:0},look:{},eq:{},say:'',started:true},now:()=>5000,ESC:[.3],sceneKind:()=> 'tcc0',phaseNow:()=> 'night',van:()=>'<g>animated van</g>',bossSVG:()=>'',bossDamage:()=>0,$:selector=>selector==='#scene'?sceneNode:selector==='#bubble'?bubble:null,UHART:{paint:()=>({bg:'<svg></svg>',hero:{x:1,h:90},fg:'',name:'Test'}),cfgFor:()=>({}),svg:()=>'<svg></svg>'}};
 const renderScene=vm.runInNewContext(scene+'\nrenderScene;',renderContext);
 renderScene();
 assert.doesNotMatch(sceneNode.innerHTML,/animated van/,'a saved capture should not replay the van on page load');
 renderContext.ui.captureUntil=6000;renderScene();
 assert.match(sceneNode.innerHTML,/animated van/,'a newly triggered capture should render the van in the main scene');
 assert.match(sceneNode.innerHTML,/data-act="tccTry"/,'the escape button should remain available over the van scene');
 assert.ok(sceneClasses.has('v27-tcc-capture'),'the main scene should apply the capture reaction class');
 renderContext.ui.captureUntil=0;renderScene();
 assert.doesNotMatch(sceneNode.innerHTML,/animated van/,'the van should be removed when the one-shot window closes');
 assert.ok(!sceneClasses.has('v27-tcc-capture'),'the scene should clear its capture reaction class');
 assert.match(scene,/const sceneButtons=S\.tcc\s*\?/,'the capture state should replace scene controls on every main tab');
 assert.match(scene,/data-act="tccTry"/,'capture scene should expose the escape action');
 assert.doesNotMatch(tcc,/data-act="tccTry"/,'capture panel should not duplicate the prominent scene action');
 const fight=html.slice(html.indexOf('function bFight(){'),html.indexOf('function bSquad0(){'));
 assert.match(fight,/Втікай кнопкою просто на сцені/,'the fight tab should direct the player to the scene action');
 assert.doesNotMatch(fight,/втікай на вкладці «Дім»/,'the fight tab should not require switching to Home');
 assert.match(html,/hat\(H,c,hd2\);o\+=hairFront\(c,true\)/,'hair should be painted over the lower edge of headwear');
 assert.match(html,/data-act="smokeToggle"/,'character editor should include a cigarette toggle');
 assert.match(ui,/WORK_PROPS\.moderation=\{title:'Модеруємо коментарі',svg:WORK_PROPS\.texts\.svg\}/,'comment moderation should use its own laptop scene');
 assert.match(action,/\['gig','shift'\]\.includes\(a\)&&\(\['texts','moderation'\]\.includes\(button\?\.dataset\.w\)/,'remote text and moderation actions should trigger the animated laptop');
 assert.doesNotMatch(css,/var\(--v27-tg-top\)/,'short landscape layout must not depend on an unset Telegram offset');
});

test('Telegram safe-area fallback follows orientation and live content insets',()=>{
 const root=path.join(__dirname,'..'),action=fs.readFileSync(path.join(root,'v27-action.js'),'utf8');
 function setup({width=390,height=844,safeTop=24,safeBottom=20,version8=false,content}={}){
  const values={},events={},webApp={initData:'test-fixture',safeAreaInset:{top:safeTop,bottom:safeBottom},isVersionAtLeast:version=>version==='8.0'&&version8,onEvent:(name,fn)=>events[name]=fn};
  if(content)webApp.contentSafeAreaInset=content;
  const window={innerWidth:width,innerHeight:height,Telegram:{WebApp:webApp},visualViewport:{addEventListener(){}},addEventListener(){}};
  const document={documentElement:{classList:{toggle(){}},style:{setProperty:(key,value)=>values[key]=value}},addEventListener(){}};
  vm.runInNewContext(action,{window,document,location:{hash:'',search:''},matchMedia:()=>({matches:false}),setTimeout:()=>0,clearTimeout(){}});
  return{values,events,window};
 }
 const legacy=setup({content:{top:0,bottom:0,left:0,right:0}});
 assert.equal(legacy.values['--v27-header-clearance'],'92px','old Telegram clients should reserve the compact app header and status area');
 assert.equal(legacy.values['--v27-bottom-clearance'],'20px','old clients should preserve the device bottom safe area');
 legacy.window.innerWidth=844;legacy.window.innerHeight=390;legacy.events.viewportChanged();
 assert.equal(legacy.values['--v27-header-clearance'],'58px','short landscape should use the compact header plus the device status inset');
 const fullscreen=setup({safeTop:24,safeBottom:20,version8:true,content:{top:0,bottom:0,left:0,right:0}});
 assert.equal(fullscreen.values['--v27-header-clearance'],'0px','Telegram content safe area should replace the legacy header fallback');
 assert.equal(fullscreen.values['--v27-bottom-clearance'],'0px','fullscreen content inset should not add a second bottom offset');
});

test('fullscreen is requested only when Telegram Bot API 8.0 is supported',()=>{
 const root=path.join(__dirname,'..');
 for(const name of ['uhy-polish.js','uhylyant-account.js']){
  const source=fs.readFileSync(path.join(root,name),'utf8');
  assert.match(source,/isVersionAtLeast\?\.\('8\.0'\)/,`${name} should guard the fullscreen method by Telegram API version`);
  assert.match(source,/requestFullscreen\?\.\(\)/,`${name} should call fullscreen only through the guarded optional method`);
 }
});

test('TCC escape delegates to the authoritative server action',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../uhylyant.html'),'utf8');
 const start=html.indexOf('function tccTry(){'),end=html.indexOf('\nfunction release(',start);
 const calls=[];vm.runInNewContext(html.slice(start,end)+';tccTry();',{tccCommand:a=>calls.push(a)});
 assert.deepEqual(calls,['run']);
});
