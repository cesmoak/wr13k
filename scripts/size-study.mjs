// Read-only game analysis: writes reports only under dist/size-study.
// Source-map ownership is approximate after inlining. Omission ZIPs are
// attribution probes, not runnable feature-removal builds or additive budgets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'acorn';
import {TraceMap,decodedMappings} from '@jridgewell/trace-mapping';
import {modules,compactScript,packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';

const directory='dist/size-study';await mkdir(directory,{recursive:true});
const parts=await Promise.all(modules.map(async name=>({name,source:(await readFile(`src/${name}.js`,'utf8')).replace(/^export const gameState = .*;$/gm,'').replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')})));
const source=parts.map(p=>`\n/*SIZE_MODULE:${p.name}*/\n${p.source}`).join('\n');
const html=await readFile('index.html','utf8'),css=await readFile('style.css','utf8');
const manifest=JSON.parse(await readFile('dist/size-report.json','utf8'));
const options={locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true,scoped:manifest.selected==='scoped-numbers'};
const input=compactSelectors(html,css,source);
const wrapped=`(()=>{'use strict';\n${input.source}\n})();`;

// Instrument the existing optimizer in memory, retaining its exact settings.
let optimizer=await readFile('scripts/optimize.mjs','utf8');
optimizer=optimizer.replace(/from (['"])([^'"]+)\1/g,(_,q,spec)=>`from ${JSON.stringify(import.meta.resolve(spec))}`);
optimizer=optimizer.replace('ecma:2020,toplevel:true,','ecma:2020,toplevel:true,sourceMap:{asObject:true},');
optimizer=optimizer.replace('const result=await minify(shaders?compactShaders(source):source,{','const minifyInput=shaders?compactShaders(source):source;const result=await minify(minifyInput,{');
optimizer=optimizer.replace('return result.code;','return {code:result.code,map:result.map,transformed:minifyInput};');
const instrumented=await import('data:text/javascript;base64,'+Buffer.from(optimizer).toString('base64'));
const result=await instrumented.compactScript(wrapped,options);
const reference=await compactScript(wrapped,options);
if(result.code!==reference)throw Error('Source map instrumentation changed emitted code');
const packed=await packageHTML(input.html,input.css,result.code),baseline=await zipHTML(packed);
const actual=await readFile('dist/index.html','utf8');
if(actual!==packed)throw Error('Study input differs from current production build; rebuild first');
await writeFile(`${directory}/source-input.json`,JSON.stringify({parts,html,css,options}));

const moduleRanges=[...result.transformed.matchAll(/\/\*SIZE_MODULE:([^*]+)\*\//g)].map(m=>({name:m[1],start:m.index}));
const moduleAt=offset=>moduleRanges.findLast(r=>r.start<=offset)?.name??'wrapper';
const ranges=[];
function walk(node){
 if(!node||typeof node!=='object')return;
 let label;
 const module=moduleAt(node.start),name=node.id?.name??node.key?.name;
 if(node.type==='VariableDeclarator'&&['vertexSource','fragmentSource','skyVertex','skyFragment','skyGradientShader'].includes(name))label='Shaders';
 if(module==='mesh'&&node.type==='ClassDeclaration')label='Mesh primitives';
 if(module==='mesh'&&node.type==='FunctionDeclaration')label=({createIslandMesh:'Terrain and scenery',createCraftMesh:'Craft mesh',createRiderMesh:'Rider mesh',createGateMesh:'Buoy mesh',createLighthouseMesh:'Lighthouse mesh',createBeaconMesh:'Lighthouse mesh'})[name];
 if(module==='renderer'&&['MethodDefinition','FunctionDeclaration'].includes(node.type))label=({impact:'Particles and spray',updateEffects:'Particles and spray',hullSprayContact:'Particles and spray',courseLighting:'Lighting and camera',skyLighting:'Lighting and camera',easeTitleLighting:'Lighting and camera',chaseCamera:'Lighting and camera'})[name];
 if(module==='boat-physics'&&name==='springRider'&&node.type==='FunctionDeclaration')label='Rider physics';
 if(module==='boat-physics'&&['riderPose','solveJoint','handlebarPose'].includes(name)&&node.type==='FunctionDeclaration')label='Rider posing';
 if(module==='course'&&['waveHeight','sampleWater','offshoreExposure','WAVE_LAYERS','WAVE_SCALE','WAVE_SPACING','OFFSHORE_SEA'].includes(name)&&['FunctionDeclaration','VariableDeclarator'].includes(node.type))label='Wave simulation';
 if(module==='simulation'&&['racingLine','aiInput','clearRacingLine'].includes(name)&&node.type==='FunctionDeclaration')label='AI';
 if(typeof label==='string')ranges.push({start:node.start,end:node.end,label});
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
}
walk(parse(result.transformed,{ecmaVersion:'latest'}));
const labels={math:'Math utilities',course:'Course, waves and shoreline data', 'boat-physics':'Hull physics',interactions:'Collisions and buoys','racing-lines':'AI',simulation:'Race simulation',attract:'Title simulation',mesh:'Mesh primitives',atmosphere:'Birds',renderer:'Renderer and draw calls',audio:'Audio',main:'UI and input',wrapper:'Wrapper'};
const classify=offset=>ranges.filter(r=>offset>=r.start&&offset<r.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]?.label??labels[moduleAt(offset)]??`Unclassified: ${moduleAt(offset)}`;
const lineStarts=[0];for(let i=0;i<result.transformed.length;i++)if(result.transformed[i]==='\n')lineStarts.push(i+1);
const chunks=[],lines=result.code.split('\n'),mapping=decodedMappings(new TraceMap(result.map));let previous='Wrapper';
for(let line=0;line<lines.length;line++){
 const entries=mapping[line]??[];
 let column=0;
 for(let i=0;i<entries.length;i++){
  const segment=entries[i];
  if(segment[0]>column)chunks.push({label:previous,text:lines[line].slice(column,segment[0])});
  previous=segment.length>=4?classify(lineStarts[segment[2]]+segment[3]):previous;
  column=segment[0];const end=entries[i+1]?.[0]??lines[line].length;
  chunks.push({label:previous,text:lines[line].slice(column,end)});column=end;
 }
 if(column<lines[line].length)chunks.push({label:previous,text:lines[line].slice(column)});
 if(line<lines.length-1)chunks.push({label:previous,text:'\n'});
}
if(chunks.map(c=>c.text).join('')!==result.code)throw Error('Incomplete source map coverage');
const scriptStart=packed.indexOf('<script>')+8,scriptEnd=packed.lastIndexOf('</script>');
if(packed.slice(scriptStart,scriptEnd)!==result.code)throw Error('HTML packaging changed script');
const rows=[];
for(const label of [...new Set(chunks.map(c=>c.label))]){
 const minifiedBytes=Buffer.byteLength(chunks.filter(c=>c.label===label).map(c=>c.text).join(''));
 const omitted=packed.slice(0,scriptStart)+chunks.filter(c=>c.label!==label).map(c=>c.text).join('')+packed.slice(scriptEnd);
 const archive=await zipHTML(omitted);
 rows.push({label,minifiedBytes,marginalZipBytes:baseline.zip.length-archive.zip.length});
}
const style=packed.match(/<style>([\s\S]*?)<\/style>/)[1];
const skeleton=packed.slice(0,scriptStart)+packed.slice(scriptEnd);
rows.push({label:'CSS',minifiedBytes:Buffer.byteLength(style),marginalZipBytes:baseline.zip.length-(await zipHTML(packed.replace(style,''))).zip.length});
const htmlBytes=Buffer.byteLength(skeleton)-Buffer.byteLength(style);
const groups=[];
const groupLabels={
 'Rendering and world meshes':['Renderer and draw calls','Mesh primitives','Terrain and scenery','Craft mesh','Buoy mesh','Lighthouse mesh','Math utilities'],
 'Water and sky shaders':['Shaders'],
 'Courses, waves and AI':['Course, waves and shoreline data','Wave simulation','AI'],
 'Hull physics and collisions':['Hull physics','Collisions and buoys'],
 'Riders: posing, springs and mesh':['Rider posing','Rider physics','Rider mesh'],
 'UI, input, CSS and HTML':['UI and input'],
 'Race and title simulation':['Race simulation','Title simulation'],
 'Audio':['Audio'],
 'Particle emission and motion':['Particles and spray'],
 'Lighting and camera':['Lighting and camera'],
 'Birds':['Birds']
};
for(const [label,owners]of Object.entries(groupLabels)){
 const isUI=label.startsWith('UI,');
 const reducedJS=chunks.filter(c=>!owners.includes(c.label)).map(c=>c.text).join('');
 const omitted=isUI?`<script>${reducedJS}</script>`:packed.slice(0,scriptStart)+reducedJS+packed.slice(scriptEnd);
 const bytes=chunks.filter(c=>owners.includes(c.label)).reduce((n,c)=>n+Buffer.byteLength(c.text),0)+(isUI?Buffer.byteLength(packed)-Buffer.byteLength(result.code):0);
 groups.push({label,minifiedBytes:bytes,marginalZipBytes:baseline.zip.length-(await zipHTML(omitted)).zip.length});
}
const report={zipBytes:baseline.zip.length,htmlBytes:Buffer.byteLength(packed),javascriptBytes:Buffer.byteLength(result.code),cssBytes:Buffer.byteLength(style),markupAndTagsBytes:htmlBytes,options,method:'Source-map attribution of the actual emitted JavaScript. Marginal ZIP values omit attributed text and recompress the whole document; they overlap and are not runnable feature cuts.',groups:groups.sort((a,b)=>b.marginalZipBytes-a.marginalZipBytes),rows:rows.sort((a,b)=>b.marginalZipBytes-a.marginalZipBytes)};
await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
