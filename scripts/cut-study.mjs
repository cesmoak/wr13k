// Independent build-only feature experiments. Never writes src or dist/index.html.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'acorn';
import {Script} from 'node:vm';
import {readScripts,compactScript,packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';
const replace=(s,a,b='')=>{if(!s.includes(a))throw Error('Cut anchor missing: '+a);return s.replace(a,b);};
const between=(s,a,b,text='')=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);if(start<0||end<0)throw Error('Cut range missing: '+a);return s.slice(0,start)+text+s.slice(end);};
function removeNodes(source,predicate){
 const edits=[];
 function visit(n){if(!n||typeof n!=='object')return;if(predicate(n)){edits.push([n.start,n.end]);return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
 visit(parse(source,{ecmaVersion:'latest'}));
 for(const [start,end] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+source.slice(end);
 return source;
}
const method=(s,name)=>removeNodes(s,n=>n.type==='MethodDefinition'&&n.key.name===name);
const cuts={
 'lens-flare':{label:'Lens flare',detail:'Remove flare shader, occlusion texture, projection and drawing; keep sun, moon and sky.',apply(p){
  p.source=between(p.source,'    this.flareProgram=this.makeProgram(skyVertex,flareFragment);','    this.loc=');
  p.source=replace(p.source,'    this.sunScreen=projectSkyDirection(this.view,this.lighting.sunDirection);');
  p.source=replace(p.source,'    this.drawLensFlare(width,height);');p.source=method(p.source,'drawLensFlare');
 }},
 'underwater':{label:'Visible underwater',detail:'Opaque water; remove seabed, seagrass, fish, caustics, transparency and the water depth prepass. Keep waves, reflections, foam and depth-based water colors.',apply(p){
  p.source=replace(p.source,'this.seabed=this.upload(createSeabedMesh());this.seagrass=this.upload(createSeaGrassMesh());');
  p.source=replace(p.source,'    this.drawMesh(this.seabed,modelMatrix(),2);this.drawMesh(this.seagrass,modelMatrix(),3);');
  p.source=replace(p.source,'    this.drawDynamic(createFishMesh(race.worldTime,p),2);');
  p.source=replace(p.source,' if(uWater>2.5)p.xz+=vec2(sin(uTime*1.3+p.x*.25+p.z*.17),cos(uTime+p.z*.23))*.23;');
  p.source=between(p.source,' if(uWater>1.5){',' // The same rotating prism');
  p.source=between(p.source,'  float transmission=','  vec3 sky=');
  p.source=replace(p.source,' float opacity=1.;');p.source=replace(p.source,'  opacity=mix(opacity,1.,foam);');
  p.source=replace(p.source,'gl_FragColor=vec4(color,opacity);','gl_FragColor=vec4(color,1.);');
  p.source=between(p.source,'    gl.enable(gl.POLYGON_OFFSET_FILL);','    if(race.phase', '    this.drawMesh(this.water,waterMatrix,1);\n');
 }},
 'simple-palms':{label:'Simpler palm trees',detail:'Same trees, trunks and seven fronds; one flat triangle per frond instead of four folded triangles.',apply(p){
  p.source=between(p.source,'        const angle=j/7*TAU','      const ground=',`        const angle=j/7*TAU,dx=Math.cos(angle),dz=Math.sin(angle);
        tree.triangle([1-dz*.7,h,dx*.7],[1+dx*7,h-1.2,dz*7],[1+dz*.7,h,-dx*.7],rgb('#458d62'));
      }
`);
 }},
 'surf-bird-audio':{label:'Surf and bird audio',detail:'Remove shoreline surf and seagull calls; keep birds, engines, movement-water sound, splashes and race cues.',apply(p){
  p.source=between(p.source,'      const surf=ctx.createBufferSource();','    }\n    if(this.context.state');
  p.source=between(p.source,'    const surf=shoreSurf(p,race.worldTime);','\n  }\n}\n');
  p.source=method(p.source,'seagull');
 }},
 'rainbow-gate':{label:'Rainbow gate',detail:'Remove the start-line rainbow arch and its material; retain checkpoint buoys, lighthouse rainbow and earned rainbow spray.',apply(p){
  p.source=replace(p.source,'    this.rainbow=null;');
  p.source=replace(p.source,'...this.activeGates,this.rainbow','...this.activeGates');
  p.source=replace(p.source,'    this.rainbow=race.freePlay||race.hideCourseMarkers?null:this.upload(createRainbowMesh(race.course.gates));');
  p.source=between(p.source,'    if(this.rainbow){','    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);');
  p.source=replace(p.source,' if(uWater< -2.5){\n  vec4 band=rainbowBand((length(vColor.xy)-31.65)/7.35);\n  gl_FragColor=vec4(band.rgb,band.a*.55);return;\n }');
  // Remove the rainbow helper only from the scene shader; lens flare still needs it.
  const a=p.source.indexOf('const fragmentSource ='),b=p.source.indexOf('const skyVertex',a);
  p.source=p.source.slice(0,a)+replace(p.source.slice(a,b),'${rainbowShader}')+p.source.slice(b);
 }},
 'minimap':{label:'Minimap',detail:'Remove minimap canvas, CSS, drawing, sampled map routes and map bounds; retain racing checkpoints and AI routes.',apply(p){
  p.source=replace(p.source,"const mapCanvas=element('map'),mapContext=mapCanvas.getContext('2d');");
  p.source=removeNodes(p.source,n=>n.type==='FunctionDeclaration'&&n.id.name==='drawMap');
  p.source=replace(p.source,'  drawMap();');
  p.source=removeNodes(p.source,n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.object?.name==='course'&&['samples','bounds'].includes(n.expression.left.property?.name));
  const map=p.html.match(/<div class="(?:map-panel|hud-item)"><canvas id="map"[^>]*><\/canvas><\/div>/);
  if(!map)throw Error('Minimap HTML missing');
  p.html=replace(p.html,map[0]);
  p.css=p.css.replace(/(?:\.map-panel(?: canvas)?|\.hud-item canvas)\{[^}]*\}/g,'');
 }},
 'pavilion':{label:'Beach pavilion',detail:'Remove its platform, four posts and roof; retain surrounding beach, palms and rocks.',apply(p){
  p.source=between(p.source,'  // A tiny beach pavilion','  // Larger offshore silhouettes');
 }}
};
const combinedCuts=Object.keys(cuts);
const base={source:await readScripts(),html:await readFile('index.html','utf8'),css:await readFile('style.css','utf8')};
const dir='dist/cut-study';await mkdir(dir,{recursive:true});
await writeFile(`${dir}/source-input.json`,JSON.stringify(base));
const report={settings:{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true,numbers:true},variants:[]};
for(const id of ['baseline',...Object.keys(cuts),'all-cuts']){
 const p={...base};
 for(const key of id==='all-cuts'?combinedCuts:cuts[id]?[id]:[])cuts[key].apply(p);
 new Script(p.source);
 const input=compactSelectors(p.html,p.css,p.source);
 const js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,report.settings);new Script(js);
 const html=await packageHTML(input.html,input.css,js),archive=await zipHTML(html);
 const row={id,label:cuts[id]?.label??(id==='baseline'?'Baseline':'All cuts together'),detail:cuts[id]?.detail??(id==='all-cuts'?'All seven cuts combined, including fully opaque water without underwater scenery or effects.':''),htmlBytes:Buffer.byteLength(html),zipBytes:archive.zip.length,saved:0,selectors:input.mapping};
 row.saved=(report.variants[0]?.zipBytes??row.zipBytes)-row.zipBytes;report.variants.push(row);
 await writeFile(`${dir}/${id}.html`,html);await writeFile(`${dir}/${id}.zip`,archive.zip);
 console.log(`${row.label}: ${row.zipBytes} ZIP bytes; saves ${row.saved}`);
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');
}
await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');
