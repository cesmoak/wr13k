import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readScripts,compactScript,packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';
import {Script} from 'node:vm';
// Historical pre-adoption baseline; generated alongside this experiment.
const base=JSON.parse(await readFile('dist/hud-study/source-input.json','utf8'));
const dir='dist/hud-study';await mkdir(dir,{recursive:true});
const shared=`#hud{position:fixed;left:12px;right:12px;top:12px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;pointer-events:none}.hud-item{display:grid;gap:6px;min-width:124px;padding:12px;background:#133b;border:1px solid #eed3;border-radius:4px;color:#efe;font-size:20px;font-variant-numeric:tabular-nums}.hud-item span{font-size:10px}.hud-item b{font:inherit}.hud-item canvas{width:124px;height:auto}.free-play .race-only{display:none}.danger{color:#faa;border-color:#f76}#countdown{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}`;
const bars=base.css.match(/\.speed-level-bars\{[^}]*\}/)[0];
const report={settings:{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true,numbers:true},variants:[]};
for(const id of ['baseline','shared-hud','text-hud']){
 let {source,html,css}=base;
 if(id!=='baseline'){
  const a=css.indexOf('#hud{'),b=css.indexOf('.night{',a);if(a<0||b<0)throw Error('HUD CSS boundaries missing');
  css=css.slice(0,a)+shared+(id==='shared-hud'?bars+'[data-level="5"]{border-color:#cf7}':'')+css.slice(b);
  css=css.replace('@media(max-width:600px){.map-panel{top:25%}.race-top{gap:12px}.race-stat{padding-left:12px}}','');
  const start=html.indexOf('  <section id="hud"'),end=html.indexOf('  <script type="module"',start);if(start<0||end<0)throw Error('HUD HTML boundaries missing');
  html=html.slice(0,start)+`  <section id="hud" hidden>
    <div class="hud-item race-only"><span>POSITION / 4</span><b id="position">4</b></div>
    <div class="hud-item race-only"><span>RACE TIME</span><b id="timer">00:00.00</b></div>
    <div class="hud-item race-only" id="miss-counter" role="status"><span>MISSED BUOYS</span><b id="misses">0 / 5</b></div>
    <div class="hud-item race-only" id="speed-level" role="status"><span>SPEED LEVEL</span><b id="speed-level-value">1 / 5</b>${id==='shared-hud'?'<div class="speed-level-bars"></div>':''}</div>
    <div class="hud-item"><span>KM/H</span><b id="speed">0</b></div>
    <div class="hud-item"><canvas id="map" width="300" height="228"></canvas></div>
  </section>
  <div id="countdown" class="hud-item" hidden>3</div>
`+html.slice(end);
  if(id==='text-hud')source=source.replace("const level=element('speed-level');level.dataset.level=p.speedLevel;",'').replace("level.style.setProperty('--level',p.speedLevel);",'');
 }
 const input=compactSelectors(html,css,source),js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,report.settings);new Script(js);
 const packed=await packageHTML(input.html,input.css,js),archive=await zipHTML(packed);
 const row={id,label:{baseline:'Baseline','shared-hud':'Shared HUD styles','text-hud':'Shared HUD, numeric level only'}[id],detail:id==='baseline'?'Original race HUD.':`Same race information and minimap, using shared tiles, typography and spacing.${id==='text-hud'?' Removes redundant level bars; the numeric level remains.':' Keeps level bars and level-five highlight.'}`,htmlBytes:Buffer.byteLength(packed),cssBytes:packed.match(/<style>([\s\S]*?)<\/style>/)[1].length,zipBytes:archive.zip.length,saved:(report.variants[0]?.zipBytes??archive.zip.length)-archive.zip.length,selectors:input.mapping};
 report.variants.push(row);await writeFile(`${dir}/${id}.html`,packed);await writeFile(`${dir}/${id}.zip`,archive.zip);console.log(row.label,row.zipBytes,'ZIP bytes; saves',row.saved,'CSS bytes',row.cssBytes);
}
await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');
