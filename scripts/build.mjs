import {execFileSync} from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { Script } from 'node:vm';

import { zipHTML } from './zip.mjs';
import { compactSelectors } from './selectors.mjs';
import { packJavaScriptHTML } from './roadroller.mjs';

// Generate layouts before importing any modules that cache course data.
execFileSync(process.execPath,['scripts/course-codes.mjs'],{stdio:'inherit'});
const {writeRacingLines}=await import('./racing-lines.mjs');
const {readScripts,compactScript,packageHTML}=await import('./optimize.mjs');
const fast=process.argv.includes('--fast');
await writeRacingLines();
const [source,html,css]=await Promise.all([readScripts(),readFile('index.html','utf8'),readFile('style.css','utf8')]);
const candidates=[];
async function addCandidate(variant,input,passes=[15]){
  const archive=await zipHTML(variant.html,passes);
  candidates.push({...variant,bytes:Buffer.byteLength(variant.html),deflate:deflateRawSync(variant.html,{level:9}).length,
    cssBytes:Buffer.byteLength(variant.html.match(/<style>([\s\S]*?)<\/style>/)[1]),mapping:input.mapping,...archive});
}
for(const [name,options] of [['minified',{properties:false,shaders:false}],['shaders',{properties:false}],['properties',{}],['selectors',{}],['locals',{locals:true}],['webgl',{webgl:true}],['enums',{enums:true}],['all',{locals:true,webgl:true,enums:true}],['frequency',{locals:true,webgl:true,enums:true,frequency:true}],['inline',{locals:true,webgl:true,enums:true,inline:1}],['frequency-inline',{locals:true,webgl:true,enums:true,frequency:true,inline:1}],['numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true}],['scoped',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true}],['scoped-numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true,numbers:true}],['baked',{baked:true,locals:true,webgl:true,enums:true}]]){
  if(fast&&name!=='scoped-numbers')continue;
  const input=!['minified','shaders','properties'].includes(name)?compactSelectors(html,css,source):{html,css,source};
  const js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,options);new Script(js);
  const minified=await packageHTML(input.html,input.css,js);
  const roadrolled=await packJavaScriptHTML(minified);
  for(const variant of [{name,html:minified},{name:name+'-roadroller',...roadrolled}]){
    await addCandidate(variant,input);
  }
}
const baseline=Math.min(...candidates.filter(candidate=>!candidate.name.endsWith('-roadroller')).map(candidate=>candidate.zip.length));
const initialBest=candidates.reduce((a,b)=>a.zip.length<b.zip.length?a:b);
if(!fast){
  // Refine the three best packed variants; keep all earlier ZIPs because a
  // stronger model or more Deflate iterations can occasionally be larger.
  const finalists=candidates.filter(candidate=>candidate.roadrollerLevel)
    .sort((a,b)=>a.zip.length-b.zip.length).slice(0,3);
  for(const finalist of finalists){
    console.log(`Refining ${finalist.name}: Roadroller level 2, 64 MB cap, Zopfli 15/100.`);
    await addCandidate({...finalist,name:finalist.name+'-zopfli100'},finalist,[15,100]);
    const original=candidates.find(candidate=>candidate.name===finalist.name.replace(/-roadroller$/,''));
    const packed=await packJavaScriptHTML(original.html,{level:2,maxMemoryMB:64});
    await addCandidate({name:original.name+'-roadroller-strong',...packed},original,[15,100]);
  }
}
const best=candidates.reduce((a,b)=>a.zip.length<b.zip.length?a:b),{zip,deflateSaving}=best;
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',best.html);await writeFile('dist/sunwake-rush.zip',zip);
const report={selected:best.name,htmlBytes:best.bytes,zipBytes:zip.length,zopfliSaving:deflateSaving,zopfliIterations:best.iterations,
  cssBytes:best.cssBytes,selectors:best.mapping??{},roadrollerSaving:baseline-zip.length,unpackedZipBytes:baseline,decoderMemoryMB:best.decoderMemoryMB??0,
  roadrollerLevel:best.roadrollerLevel??0,decoderMemoryLimitMB:best.decoderMemoryLimitMB??0,
  standardCompressionZipBytes:initialBest.zip.length,strongerCompressionSaving:initialBest.zip.length-zip.length,
  candidates:candidates.map(({name,bytes,deflate,cssBytes,zip})=>({name,htmlBytes:bytes,cssBytes,deflateBytes:deflate,zipBytes:zip.length}))};
await writeFile('dist/size-report.json',JSON.stringify(report,null,2)+'\n');
console.table(report.candidates);
console.log(`Built offline dist/index.html (${best.bytes.toLocaleString()} bytes)`);
console.log(`ZIP: ${zip.length.toLocaleString()} bytes (${(zip.length/1024).toFixed(2)} KiB); stronger Deflate saved ${deflateSaving} bytes.`);
console.log(`Roadroller saved ${report.roadrollerSaving} bytes against the best unpacked ZIP (${baseline} bytes); estimated decoder memory ${report.decoderMemoryMB.toFixed(1)} MB.`);
console.log(`Stronger compression saved ${report.strongerCompressionSaving} bytes against the standard search (${initialBest.zip.length} bytes).`);
console.log(`13 KiB target: ${zip.length<=13312?'met':`${zip.length-13312} bytes over (informational)`}.`);
