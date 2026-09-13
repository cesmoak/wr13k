// A token renamer for this project's GLSL ES 1.00 shaders. Declarations supply
// the candidate names; uniforms/attributes/varyings and field swizzles stay put.
const tokenPattern=/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[^\s]/g;
const types=new Set(['float','int','bool','vec2','vec3','vec4','mat2','mat3','mat4','sampler2D']);
const qualifiers=new Set(['in','out','inout','const','lowp','mediump','highp']);
const interfaces=new Set(['uniform','attribute','varying']);
const identifier=s=>/^[A-Za-z_]\w*$/.test(s);
export function shaderNames(shader,frequency=false,scoped=false){
  const clean=shader.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,' '),tokens=clean.match(tokenPattern)||[];
  if(tokens.includes('struct')||tokens.includes('#'))throw Error('Shader renamer needs explicit support for structs/preprocessor directives');
  const names=new Set(),publicNames=new Set();
  for(let i=0;i<tokens.length-1;i++)if(types.has(tokens[i])&&identifier(tokens[i+1])){
    const target=interfaces.has(tokens[i-1])?publicNames:names;
    target.add(tokens[i+1]);
    if(tokens[i+2]==='(')continue;
    let depth=0;
    for(let j=i+2;j<tokens.length;j++){
      const t=tokens[j];
      if(!depth&&(t===';'||t===')'))break;
      if(!depth&&t===','&&identifier(tokens[j+1])&&!types.has(tokens[j+1])&&!qualifiers.has(tokens[j+1]))target.add(tokens[j+1]);
      if(t==='('||t==='[')depth++;if(t===')'||t===']')depth--;
    }
  }
  for(const name of publicNames)names.delete(name);
  const reserved=new Set(tokens.filter(t=>identifier(t)&&!names.has(t)));
  const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',short=i=>i<52?alphabet[i]:short(Math.floor(i/52)-1)+alphabet[i%52];
  // Reuse names only between disjoint whole functions. All names occurring
  // outside function bodies/parameters conflict globally; nested blocks remain
  // conservative. Token occurrences also keep called function names distinct.
  const regions=tokens.map(()=>0);
  let region=0;
  for(let i=0;i<tokens.length;i++)if((types.has(tokens[i])||tokens[i]==='void')&&identifier(tokens[i+1])&&tokens[i+2]==='('){
    let end=i+3,depth=1;
    while(end<tokens.length&&depth){if(tokens[end]==='(')depth++;if(tokens[end]===')')depth--;end++;}
    if(tokens[end]!=='{')continue;
    const first=i+3;depth=1;end++;
    while(end<tokens.length&&depth){if(tokens[end]==='{')depth++;if(tokens[end]==='}')depth--;end++;}
    if(depth)throw Error('Unclosed shader function');
    region++;for(let j=first;j<end;j++)regions[j]=region;
    i=end-1;
  }
  const uses=new Map([...names].map(name=>[name,new Set()]));
  tokens.forEach((token,i)=>{if(tokens[i-1]!=='.')uses.get(token)?.add(regions[i]);});
  const conflicts=(a,b)=>uses.get(a).has(0)||uses.get(b).has(0)||[...uses.get(a)].some(r=>uses.get(b).has(r));
  const mapping={};let next=0;
  const count=name=>tokens.filter(t=>t===name).length;
  const ordered=[...names].sort((a,b)=>(frequency?count(b)-count(a):0)||(a<b?-1:a>b?1:0));
  for(const name of ordered){
    if(scoped)next=0;
    let value;do{value=short(next++);}while(reserved.has(value)||(scoped&&Object.keys(mapping).some(other=>mapping[other]===value&&conflicts(name,other))));
    mapping[name]=value;
  }
  return mapping;
}
export function renameShaderTokens(text,mapping){
  let previous='';
  return text.replace(tokenPattern,token=>{const value=previous!=='.'&&Object.hasOwn(mapping,token)?mapping[token]:token;previous=token;return value;});
}

// Preserve numeric value and GLSL float type, including exponent notation.
export function compactShaderNumbers(text){
  return text.replace(tokenPattern,token=>{
    if(!/^(?:\d|\.\d)/.test(token)||!/[.eE]/.test(token))return token;
    const value=String(Number(token));
    if(!Number.isFinite(Number(token)))return token;
    const compact=/[.e]/.test(value)?value.replace(/^0\./,'.'):value+'.';
    const exponent=Number(token).toExponential().replace('e+','e');
    return [compact,exponent].reduce((best,candidate)=>candidate.length<best.length?candidate:best,token);
  });
}
