'use strict';
// No network, secrets or third-party modules required. Verifies fresh GitHub upload.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const required=['server.js','uhylyant.html','uhylyant-ui.js','uhylyant-account.js','uhylyant-social.js','package.json','render.yaml'];
for(const f of required){
 const p=path.join(root,f);if(!fs.existsSync(p)||fs.statSync(p).size<100)throw Error('Missing/empty '+f);
}
const assets=fs.readdirSync(path.join(root,'assets'));
const requiredAssets=['game-icon.webp',...['yard','street','roof','forest'].flatMap(x=>['day','night'].map(time=>`comic-${x}-${time}.svg`)),...['shack','room','flat','loft','lux'].flatMap(h=>['day','night'].map(time=>`comic-home-${h}-${time}.svg`))];
for(const f of requiredAssets)if(!assets.includes(f))throw Error('Missing asset: assets/'+f);
const html=fs.readFileSync(path.join(root,'uhylyant.html'),'utf8');
let n=0;
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(m[1].trim()){new vm.Script(m[1],{filename:'uhylyant.html:inline_'+(++n)});}
}
for(const f of ['server.js','uhylyant-ui.js','uhylyant-account.js','uhylyant-social.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
console.log(`OK: ${required.length} core files, ${requiredAssets.length} required comic assets, ${n} inline scripts; ${assets.length} total assets.`);
