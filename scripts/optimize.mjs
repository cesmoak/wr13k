import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { minify as minifyHTML } from 'html-minifier-terser';
import { runInNewContext } from 'node:vm';
import * as course from '../src/course.js';
import {skyGradientShader} from '../src/renderer.js';
import {stripCourseDefaults,inlineWebGLConstants,encodeEnums} from './transforms.mjs';
import {shaderNames as localShaderNames,renameShaderTokens,compactShaderNumbers} from './glsl.mjs';

export const modules=['math','course-codes','course','boat-physics','interactions','racing-lines','simulation','attract','mesh','renderer','audio','main'];
export async function readScripts(names=modules){
  return (await Promise.all(names.map(name=>readFile(`src/${name}.js`,'utf8')))).map(source=>source
    .replace(/^export const gameState = .*;$/gm,'')
    .replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
}
function walk(node,visit){
  if(!node||typeof node!=='object')return;
  if(node.type)visit(node);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(v=>walk(v,visit));else if(value&&typeof value==='object')walk(value,visit);
}
export function stripMetadata(source){
  const ast=parse(source,{ecmaVersion:'latest'}),edits=[];
  const unused=new Set(['channel','slalom','offshore','buoy','sideSpray']);
  // Remove whole list entries, including their commas, without rewriting code
  // or accidentally treating a string/comment as an application field.
  const removeEntries=(entries,remove)=>{
    for(let i=0;i<entries.length;i++)if(remove(entries[i],i)){
      const first=i;
      while(i+1<entries.length&&remove(entries[i+1],i+1))i++;
      const start=i===entries.length-1&&first?entries[first-1].end:entries[first].start;
      const end=i+1<entries.length?entries[i+1].start:entries[i].end;
      edits.push([start,end,'']);
    }
  };
  walk(ast,node=>{
    // Fail closed if a later feature starts reading a stripped field. Computed
    // property names must also be considered when extending this explicit list.
    if(node.type==='MemberExpression'){
      const key=node.computed?node.property.value:node.property.name;
      if(unused.has(key))throw Error(`Production metadata is now used at runtime: ${key}`);
    }
    if(node.type==='ObjectExpression')removeEntries(node.properties,p=>
      p.type==='Property'&&!p.computed&&unused.has(p.key.name??p.key.value));
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return source;
}
const shaderNames=['vertexSource','fragmentSource','skyVertex','skyFragment'];
const compactGLSL=text=>text.replace(/\/\/[^\n]*(?:\n|$)/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/\s+/g,' ').replace(/\s*([{}()[\],;:*\/=<>?])\s*/g,'$1');
export function precompileShaders(source){
  source=source.replaceAll('${skyGradientShader}',skyGradientShader);
  const edits=[];
  walk(parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type!=='VariableDeclarator'||!shaderNames.includes(node.id.name))return;
    // Evaluate only the project's shader expressions, using the same course
    // constants as development. No renderer or browser APIs run during build.
    const shader=runInNewContext('('+source.slice(node.init.start,node.init.end)+')',{...course},{timeout:1000});
    if(typeof shader!=='string')throw Error(`Invalid shader: ${node.id.name}`);
    const compact=compactShaderNumbers(compactGLSL(shader));
    edits.push([node.init.start,node.init.end,JSON.stringify(compact)]);
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return source;
}
export function shortenShaderLocals(source,frequency=false,{scoped=false,numbers=false}={}){
  source=source.replaceAll('${skyGradientShader}',skyGradientShader);
  const edits=[];
  walk(parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type!=='VariableDeclarator'||!shaderNames.includes(node.id.name))return;
    const shader=runInNewContext('('+source.slice(node.init.start,node.init.end)+')',{...course},{timeout:1000});
    const mapping=localShaderNames(shader,frequency,scoped);
    const rename=text=>{const renamed=renameShaderTokens(text,mapping);return numbers?compactShaderNumbers(renamed):renamed;};
    walk(node.init,part=>{
      if(part.type==='TemplateElement')edits.push([part.start,part.end,rename(source.slice(part.start,part.end))]);
      if(part.type==='Literal'&&typeof part.value==='string')edits.push([part.start,part.end,JSON.stringify(rename(part.value))]);
    });
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return source;
}
export function compactShaders(source){
  source=source.replaceAll('${skyGradientShader}',skyGradientShader);
  const edits=[],ast=parse(source,{ecmaVersion:'latest'});
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||!shaderNames.includes(node.id.name))return;
    walk(node.init,part=>{
      if(part.type!=='TemplateElement')return;
      const text=compactGLSL(source.slice(part.start,part.end));
      edits.push([part.start,part.end,text]);
    });
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  // Rename the complete shader interface together with its JS lookup strings.
  const names=[...new Set(source.match(/\b[uva][A-Z]\w*/g)||[])].sort();
  const map=new Map(names.map((name,i)=>[name,`q${i}`]));
  return source.replace(/\b[uva][A-Z]\w*/g,name=>map.get(name));
}
// Explicit application fields only: DOM, WebGL, Web Audio, and dataset keys
// retain their public names. Dynamic physics keys are annotated together below.
const dynamicProperties=`yaw pitch roll speed handlePitch pitchRate rollRate handlePitchRate leanX leanZ`.split(' ');
const privateProperties=[...new Set((`fullscreen taperedBox buoyMesh cameraReady cameraYaw crafts drawMesh drawDynamic drawLensFlare effectBuffer engineGain envelope fishBuffer flareProgram gullRacer lighthouse lightingReady makeProgram makeWater nextGull nightBlend particleClock rainbowColors riderBuffer seagullBuffer shadowUniforms skyBuffer skyProgram splashNoise sunScreen sunTexture surfFilter surfGain surfPan syncCourse updateEffects wakeUniforms waterGain speedLevel nextGate finishTime impactCooldown splashCooldown waterImpact worldTime course aiSkill contactFraction handlebar racers wakes rider gates buoys passed misses lap attract wakeClock countdown tangent samples bounds progressCenter aiSkill
steep reef lampHeight sunDirection twilight altitude lighting lightingCourse
particles loc attr crafts island rainbow beacon lamp seabed seagrass
triangle quad box cone sphere beam upload tone splash seagull unlock
hipOffset shoulderOffset hip shoulder knee elbow foot hand hips chest torsoMatrix grips ends limbs pivot
grid data context master engine program water eye view random count night foam life center points events gl
maxX minX maxZ minZ airborne yawRate steer throttle brake amplitude contactFraction
`).trim().split(/\s+/).concat(dynamicProperties))];
export function markPropertyKeys(source){
  const edits=new Set(),keys=new Set(dynamicProperties),ast=parse(source,{ecmaVersion:'latest'});
  const mark=node=>{
    if(node.type==='Literal'&&keys.has(node.value))edits.add(node.start);
  };
  walk(ast,node=>{
    // Interpolation field lists, buoy solver tuples, and axis/rate pairs.
    if(node.type==='ArrayExpression')for(const item of node.elements)if(item)mark(item);
    // The rider chooses different spring limits for roll and pitch.
    if(node.type==='BinaryExpression'&&node.left.name==='axis')mark(node.right);
    // Concatenating a shortened key cannot produce another shortened key.
    // Require explicit axis/rate pairs if future physics adds another loop.
    if((node.type==='TemplateLiteral'&&node.quasis.some(q=>q.value.raw==='Rate'))||
      (node.type==='BinaryExpression'&&node.operator==='+'&&node.right.value==='Rate'))
      throw Error('Computed physics rate needs an explicit property pair');
  });
  for(const start of [...edits].sort((a,b)=>b-a))source=source.slice(0,start)+'/*@__KEY__*/'+source.slice(start);
  return source;
}
export async function compactScript(source,{properties=true,shaders=true,metadata=true,baked=false,locals=false,webgl=false,enums=false,defaults=true,inline=3,frequency=false,scoped=false,numbers=false}={}){
  source=source.replace(/\bconst DEVELOPMENT = true;/,'const DEVELOPMENT = false;');
  if(defaults)source=stripCourseDefaults(source);
  if(locals)source=shortenShaderLocals(source,frequency,{scoped,numbers});
  if(baked)source=precompileShaders(source);
  if(webgl)source=inlineWebGLConstants(source);
  if(enums)source=encodeEnums(source);
  if(metadata)source=stripMetadata(source);
  if(properties)source=markPropertyKeys(source);
  const result=await minify(shaders?compactShaders(source):source,{
    ecma:2020,toplevel:true,
    compress:{passes:3,inline,global_defs:{DEVELOPMENT:false}},
    mangle:{properties:properties?{regex:new RegExp(`^(?:${privateProperties.join('|')})$`)}:false},
    format:{comments:false,inline_script:true}
  });
  return result.code;
}
export async function packageHTML(html,css,script,{metadata=true}={}){
  if(metadata)html=html
    .replace(/\s*<meta\b[^>]*\bname="(?:description|theme-color)"[^>]*>/g,'')
    .replace(/\s*<link\b[^>]*\brel="icon"[^>]*>/g,'')
    .replace(/<title>[^<]*<\/title>/,'');
  const style=new CleanCSS({level:2}).minify(css);
  if(style.errors.length)throw Error(style.errors.join('\n'));
  html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${style.styles}</style>`)
    .replace('<script type="module" src="src/main.js"></script>',()=>`<script>${script}</script>`);
  // Keep the UTF-8 BOM outside minification, which treats it as whitespace.
  return '\ufeff'+await minifyHTML(html.replace(/^\ufeff/,''),{collapseWhitespace:true,removeComments:true,removeRedundantAttributes:true,
    removeEmptyAttributes:true,collapseBooleanAttributes:true,keepClosingSlash:false,removeOptionalTags:true,removeAttributeQuotes:true});
}
