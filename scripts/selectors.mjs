import { parse } from 'acorn';

// Rename only DOM identifiers, never ordinary strings such as the "night"
// lighting mode. Source files and data/ARIA attributes keep their readable names.
export function compactSelectors(html,css,source){
  const names=new Set(),pattern=/([.#])([a-zA-Z_][\w-]*)/g;
  const eachSelector=(text,fn)=>text.replace(/([^{}]+)(?=\{)/g,fn);
  eachSelector(css,selector=>{for(const m of selector.matchAll(pattern))names.add(m[2]);return selector;});
  for(const m of html.matchAll(/\s(?:id|class)=["']([^"']*)["']/g))for(const name of m[1].split(/\s+/))if(name)names.add(name);
  const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const shortName=i=>i<52?alphabet[i]:shortName(Math.floor(i/52)-1)+alphabet[i%52];
  const mapping=Object.fromEntries([...names].sort().map((name,i)=>[name,shortName(i)]));
  const rename=name=>mapping[name]??name;
  const classes=value=>value.replace(/[\w-]+/g,rename);
  const selector=value=>value.replace(pattern,(_,prefix,name)=>prefix+rename(name));
  // Also accepts an unfinished attribute in a template's static segment.
  const attributes=value=>value.replace(/(\s(?:id|class)=)(["'])([^"']*)/g,
    (_,prefix,quote,names)=>prefix+quote+classes(names));
  const edits=new Map();
  const replace=(node,value)=>edits.set(node.start,[node.end,value]);
  const literal=(node,transform)=>{
    if(node?.type==='Literal'&&typeof node.value==='string')replace(node,JSON.stringify(transform(node.value)));
  };
  const walk=(node,visit)=>{
    if(!node||typeof node!=='object')return;
    if(node.type)visit(node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(v=>walk(v,visit));else if(value&&typeof value==='object')walk(value,visit);
  };
  walk(parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type==='CallExpression'){
      const call=node.callee,method=call.property?.name;
      if(call.name==='element'||method==='getElementById')literal(node.arguments[0],rename);
      if(['querySelector','querySelectorAll','closest','matches'].includes(method))literal(node.arguments[0],selector);
      if(call.object?.property?.name==='classList'){
        const args=method==='toggle'?node.arguments.slice(0,1):node.arguments;
        for(const arg of args)literal(arg,classes);
      }
    }
    if(node.type==='AssignmentExpression'&&node.left.property?.name==='innerHTML'){
      walk(node.right,part=>{
        if(part.type==='Literal'&&typeof part.value==='string'&&part.value.includes('<'))literal(part,attributes);
        if(part.type!=='TemplateLiteral')return;
        part.quasis.forEach((q,i)=>{
          replace(q,attributes(source.slice(q.start,q.end)));
          // Conditional classes, e.g. class="row ${isPlayer?'you':''}".
          if(/\sclass=["'][^"']*$/.test(q.value.raw)&&part.expressions[i])
            walk(part.expressions[i],expression=>literal(expression,classes));
        });
      });
    }
  });
  for(const [start,[end,text]] of [...edits].sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return {html:attributes(html),css:eachSelector(css,selector),source,mapping};
}
