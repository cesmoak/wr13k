import {parse} from 'acorn';
export function walk(node,visit){
  if(!node||typeof node!=='object')return;
  if(node.type)visit(node);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(v=>walk(v,visit));else if(value&&typeof value==='object')walk(value,visit);
}
const rewrite=(source,edits)=>{
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return source;
};
export function stripCourseDefaults(source){
  const required={createRace:1,createRacer:2,courseTangent:2,createGateMesh:4,createRainbowMesh:1,createBuoys:1},edits=[];
  walk(parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type==='FunctionDeclaration'&&required[node.id.name]){
      for(const p of node.params)if(p.type==='AssignmentPattern')edits.push([p.left.end,p.end,'']);
      if(node.id.name==='createRace'||node.id.name==='createBuoys')walk(node.body,part=>{
        if(part.type==='LogicalExpression'&&part.operator==='||'){
          if(node.id.name==='createRace'&&source.slice(part.left.start,part.left.end)==='COURSES[mode]')edits.push([part.left.end,part.end,'']);
          if(node.id.name==='createBuoys'&&source.slice(part.left.start,part.left.end)==='course?.gates')edits.push([part.start,part.end,'course.gates']);
        }
      });
    }
    if(node.type==='CallExpression'&&required[node.callee.name]&&node.arguments.length<required[node.callee.name])
      throw Error(`Production call requires explicit course arguments: ${node.callee.name}`);
  });
  return rewrite(source,edits);
}
export const WEBGL_CONSTANTS={ARRAY_BUFFER:34962,STATIC_DRAW:35044,DYNAMIC_DRAW:35048,FLOAT:5126,TRIANGLES:4,
  POLYGON_OFFSET_FILL:32823,DEPTH_TEST:2929,BLEND:3042,SRC_ALPHA:770,ONE_MINUS_SRC_ALPHA:771,ONE:1,LEQUAL:515,LESS:513,
  COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
  TEXTURE_2D:3553,TEXTURE0:33984,RGB:6407,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR:9729,CLAMP_TO_EDGE:33071,
  TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NO_ERROR:0,SCISSOR_TEST:3089};
export function inlineWebGLConstants(source){
  const edits=[];
  walk(parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type==='MemberExpression'&&!node.computed&&(node.object.name==='gl'||node.object.property?.name==='gl')&&Object.hasOwn(WEBGL_CONSTANTS,node.property.name))
      edits.push([node.start,node.end,String(WEBGL_CONSTANTS[node.property.name])]);
  });
  return rewrite(source,edits);
}
export const ENUMS={phase:['title','countdown','racing','paused','finished','lost'],
  type:['beep','go','splash','gate','speedLevel','impact','miss','lap','finish','lose'],
  lighting:['cycle','day','night','sunrise','sunset']};
export function encodeEnums(source){
  const edits=new Map(),ast=parse(source,{ecmaVersion:'latest'});
  const domain=node=>node?.type==='MemberExpression'&&!node.computed?node.property.name:null;
  const mark=(node,kind)=>{
    if(node?.type!=='Literal')return;
    const index=ENUMS[kind]?.indexOf(node.value)??-1;
    if(index>=0)edits.set(node.start,[node.start,node.end,String(index)]);
  };
  const values=(node,kind)=>{
    if(!node)return;
    if(node.type==='Literal')mark(node,kind);
    if(node.type==='ConditionalExpression'){values(node.consequent,kind);values(node.alternate,kind);}
    if(node.type==='MemberExpression'&&node.computed&&node.object.type==='ObjectExpression')for(const p of node.object.properties)values(p.value,kind);
  };
  walk(ast,node=>{
    if(node.type==='Property'&&!node.computed)values(node.value,node.key.name??node.key.value);
    if(node.type==='AssignmentExpression')values(node.right,domain(node.left));
    if(node.type==='BinaryExpression'){mark(node.right,domain(node.left));mark(node.left,domain(node.right));}
    if(node.type==='CallExpression'&&['includes','indexOf'].includes(node.callee.property?.name)&&node.callee.object.type==='ArrayExpression')
      for(const e of node.callee.object.elements)mark(e,domain(node.arguments[0]));
    // Sound tables are indexed by event.type; their keys must use the same codes.
    if(node.type==='MemberExpression'&&node.computed&&node.object.type==='ObjectExpression'&&domain(node.property)==='type')
      for(const p of node.object.properties){const index=ENUMS.type.indexOf(p.key.name??p.key.value);if(index>=0)edits.set(p.key.start,[p.key.start,p.key.end,String(index)]);}
  });
  return rewrite(source,[...edits.values()]);
}
