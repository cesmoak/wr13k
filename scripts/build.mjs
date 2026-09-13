import {writeRacingLines} from './racing-lines.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { Script } from 'node:vm';
import { readScripts, compactScript, packageHTML } from './optimize.mjs';
import { zipHTML } from './zip.mjs';
import { compactSelectors } from './selectors.mjs';

const fast=process.argv.includes('--fast');
await writeRacingLines();
const [source,html,css]=await Promise.all([readScripts(),readFile('index.html','utf8'),readFile('style.css','utf8')]);
const candidates=[];
for(const [name,options] of [['minified',{properties:false,shaders:false}],['shaders',{properties:false}],['properties',{}],['selectors',{}],['locals',{locals:true}],['webgl',{webgl:true}],['enums',{enums:true}],['all',{locals:true,webgl:true,enums:true}],['frequency',{locals:true,webgl:true,enums:true,frequency:true}],['inline',{locals:true,webgl:true,enums:true,inline:1}],['frequency-inline',{locals:true,webgl:true,enums:true,frequency:true,inline:1}],['numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true}],['scoped',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true}],['scoped-numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true,numbers:true}],['baked',{baked:true,locals:true,webgl:true,enums:true}]]){
  if(fast&&name!=='scoped-numbers')continue;
  const input=!['minified','shaders','properties'].includes(name)?compactSelectors(html,css,source):{html,css,source};
  const js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,options);new Script(js);
  const packed=await packageHTML(input.html,input.css,js),archive=await zipHTML(packed,fast?[15]:undefined);
  candidates.push({name,html:packed,bytes:Buffer.byteLength(packed),deflate:deflateRawSync(packed,{level:9}).length,
    cssBytes:Buffer.byteLength(packed.match(/<style>([\s\S]*?)<\/style>/)[1]),mapping:input.mapping,...archive});
}
const best=candidates.reduce((a,b)=>a.zip.length<b.zip.length?a:b),{zip,deflateSaving}=best;
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',best.html);await writeFile('dist/sunwake-rush.zip',zip);
const report={selected:best.name,htmlBytes:best.bytes,zipBytes:zip.length,zopfliSaving:deflateSaving,zopfliIterations:best.iterations,
  cssBytes:best.cssBytes,selectors:best.mapping??{},
  candidates:candidates.map(({name,bytes,deflate,cssBytes,zip})=>({name,htmlBytes:bytes,cssBytes,deflateBytes:deflate,zipBytes:zip.length}))};
await writeFile('dist/size-report.json',JSON.stringify(report,null,2)+'\n');
console.table(report.candidates);
console.log(`Built offline dist/index.html (${best.bytes.toLocaleString()} bytes)`);
console.log(`ZIP: ${zip.length.toLocaleString()} bytes (${(zip.length/1024).toFixed(2)} KiB); stronger Deflate saved ${deflateSaving} bytes.`);
console.log(`13 KiB target: ${zip.length<=13312?'met':`${zip.length-13312} bytes over (informational)`}.`);
