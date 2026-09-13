import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { minify as minifyHTML } from 'html-minifier-terser';

export const modules=['math','course','boat-physics','interactions','simulation','attract','mesh','atmosphere','renderer','audio','presentation','main'];
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
  const unused=new Set(['name','slalom','offshore','buoy','sideSpray']);
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
    if(node.type==='FunctionDeclaration'&&node.id.name==='buildCourse'){
      if(node.params[1]?.name!=='name'||node.params[2]?.name!=='points')throw Error('Course metadata signature changed');
      removeEntries(node.params,(_,i)=>i===1);
    }
    if(node.type==='CallExpression'&&node.callee.name==='buildCourse')removeEntries(node.arguments,(_,i)=>i===1);
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return source;
}
export function compactShaders(source){
  const edits=[],ast=parse(source,{ecmaVersion:'latest'});
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||!['vertexSource','fragmentSource','skyVertex','skyFragment','flareFragment'].includes(node.id.name))return;
    walk(node.init,part=>{
      if(part.type!=='TemplateElement')return;
      const text=source.slice(part.start,part.end).replace(/\/\/[^\n]*(?:\n|$)/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ')
        .replace(/\s+/g,' ').replace(/\s*([{}()[\],;:*\/=<>?])\s*/g,'$1');
      edits.push([part.start,part.end,text]);
    });
  });
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  // Rename the complete shader interface together with its JS lookup strings.
  const names=[...new Set(source.match(/\b[uva][A-Z]\w*/g)||[])].sort();
  const map=new Map(names.map((name,i)=>[name,`q${i}`]));
  return source.replace(/\b[uva][A-Z]\w*/g,name=>map.get(name));
}
// Only application-owned, statically accessed properties. Physics fields used
// through computed names (e.g. `${axis}Rate`) and all browser APIs stay intact.
const privateProperties=`activeGates cameraReady cameraYaw cameraPace crafts drawMesh drawLensFlare effectBuffer engineGain fishBuffer flareProgram gateMeshes gullRacer hideCourseMarkers lighthouse lightingReady makeProgram makeWater nextGull nightBlend particleClock rainbowColors riderBuffer rivalEngines seagullBuffer shadowStyle shadowUniforms skyBuffer skyProgram splashNoise sunScreen sunTexture surfFilter surfGain surfPan syncCourse updateEffects wakeUniforms waterGain speedLevel nextGate finishTime freePlay impactCooldown splashCooldown waterImpact worldTime finishOrder aiSkill contactFraction handlebar`.split(' ');
export async function compactScript(source,{properties=true,shaders=true,metadata=true}={}){
  source=source.replace(/\bconst DEVELOPMENT = true;/,'const DEVELOPMENT = false;');
  if(metadata)source=stripMetadata(source);
  const result=await minify(shaders?compactShaders(source):source,{
    ecma:2020,toplevel:true,
    compress:{passes:3,global_defs:{DEVELOPMENT:false}},
    mangle:{properties:properties?{regex:new RegExp(`^(?:${privateProperties.join('|')})$`)}:false},
    format:{comments:false,inline_script:true}
  });
  return result.code;
}
export async function packageHTML(html,css,script,{metadata=true}={}){
  if(metadata)html=html
    .replace(/\s*<meta\b[^>]*\bname="(?:description|theme-color)"[^>]*>/g,'')
    .replace(/\s*<link\b[^>]*\brel="icon"[^>]*>/g,'')
    .replace(/<title>[^<]*<\/title>/,'<title>Sunwake Rush</title>');
  const style=new CleanCSS({level:2}).minify(css);
  if(style.errors.length)throw Error(style.errors.join('\n'));
  html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${style.styles}</style>`)
    .replace('<script type="module" src="src/main.js"></script>',()=>`<script>${script}</script>`);
  return minifyHTML(html,{collapseWhitespace:true,removeComments:true,removeRedundantAttributes:true,
    removeEmptyAttributes:true,collapseBooleanAttributes:true,keepClosingSlash:false});
}
