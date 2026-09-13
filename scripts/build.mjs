import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// A deliberately narrow bundler for these dependency-free, ordered modules.
// Source stays readable; size optimization belongs to the next pass.
const modules=['math','course','boat-physics','interactions','simulation','attract','mesh','atmosphere','renderer','audio','presentation','main'];
const sources=await Promise.all(modules.map(name=>readFile(`src/${name}.js`,'utf8')));
const script=sources.map((source,i)=>`// ${modules[i]}.js\n${source.replace(/^export const gameState = .*;$/gm,'').replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')}`).join('\n');
let html=await readFile('index.html','utf8');
const css=await readFile('style.css','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>',()=>`<script>(()=>{\n'use strict';\n${script}\n})();</script>`);
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',html);
const zip=resolve('dist/sunwake-rush.zip');await rm(zip,{force:true});
execFileSync('zip',['-X','-9','-j',zip,'dist/index.html'],{stdio:'pipe'});
const bytes=(await stat(zip)).size;
console.log(`Built dist/index.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
console.log(`Packaged dist/sunwake-rush.zip (${bytes.toLocaleString()} bytes / ${(bytes/1024).toFixed(2)} KB)`);
console.log('Playable-first build: the 13 KB competition limit is informational, not enforced.');
