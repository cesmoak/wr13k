// Independent, build-only deletion probes; does not modify game source or the
// production build. These are size upper bounds, not proposed visual changes.
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {Script} from 'node:vm';
import {compactScript,packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';
const base=JSON.parse(await readFile('dist/size-study/source-input.json','utf8'));
const source=base.parts.map(p=>p.source).join('\n');
const replace=(s,a,b='')=>{if(!s.includes(a))throw Error('Missing anchor: '+a);return s.replaceAll(a,b);};
const between=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0)throw Error('Missing range: '+a);return s.slice(0,start)+s.slice(end);};
function removeMethods(source,names){
 const edits=[];
 function visit(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&names.includes(n.key.name)){edits.push([n.start,n.end]);return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
 visit(parse(source,{ecmaVersion:'latest'}));
 for(const [start,end]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+source.slice(end);
 return source;
}
const cuts={
 audio:s=>{
  s=replace(s,',sound=new RaceAudio()');
  s=replace(s,'sound.unlock().catch(()=>{});');
  s=replace(s,'    sound.event(event);');
  return replace(s,'sound.update(race);');
 },
 particles:s=>{
  s=removeMethods(s,['impact','updateEffects']);
  s=replace(s,"    if(event.type==='impact')renderer.impact(event);");
  s=replace(s,'renderer.particles=[];');
  s=replace(s,'this.particles=[];this.rainbowColors=RAINBOW_COLORS.map(rgb);this.particleClock=0;this.random=randomSeed(83);');
  return between(s,"    if(race.phase!=='paused'&&race.phase!=='finished'&&race.phase!=='lost')this.updateEffects(race,dt);",'    gl.enable(gl.BLEND);');
 },
 birds:s=>replace(s,'    this.drawDynamic(createSeagullMesh(race.worldTime));'),
 riders:s=>{
  s=replace(s,'    const riders=new MeshBuilder();');
  s=replace(s,'      riders.append(createRiderMesh(r),hullMatrix);');
  s=replace(s,'    this.drawDynamic(riders);');
  return replace(s,'    springRider(r, moored ? 0 : fx, fy, moored ? 0 : fz, h);');
 }
};
const rows=[];
for(const name of ['baseline',...Object.keys(cuts)]){
 const changed=cuts[name]?cuts[name](source):source;new Script(changed);
 const input=compactSelectors(base.html,base.css,changed);
 const js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,base.options);new Script(js);
 const html=await packageHTML(input.html,input.css,js),archive=await zipHTML(html);
 const row={name,zipBytes:archive.zip.length,saved:(rows[0]?.zipBytes??archive.zip.length)-archive.zip.length};
 rows.push(row);console.log(JSON.stringify(row));
 await writeFile(`dist/size-study/without-${name}.html`,html);
}
await writeFile('dist/size-study/feature-probes.json',JSON.stringify(rows,null,2)+'\n');
