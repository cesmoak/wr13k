import {Packer} from 'roadroller';
import {parse} from 'acorn';
import {runInNewContext,Script} from 'node:vm';

const canonical=source=>JSON.stringify(parse(source,{ecmaVersion:'latest'}),
  function(key,value){return key==='start'||key==='end'||key==='raw'&&this.type==='Literal'?undefined:value;});

export async function packJavaScriptHTML(html,{level=1,maxMemoryMB=32}={}){
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if(scripts.length!==1)throw Error('Roadroller requires one inline game script');
  const [script,source]=scripts[0];
  // Keep the decoder scoped: free variables could overwrite named DOM globals.
  const packer=new Packer([{data:source,type:'js',action:'eval'}],{maxMemoryMB,allowFreeVars:false});
  await packer.optimize(level);
  const {firstLine,secondLine}=packer.makeDecoder(),decoder=firstLine+secondLine;
  new Script(decoder);
  if(/<\/script/i.test(decoder))throw Error('Roadroller output would close its HTML script');
  let decoded;
  runInNewContext(decoder,{eval:value=>{decoded=value;}},{timeout:10000});
  // JS preprocessing changes whitespace; compare syntax trees, not raw text.
  if(typeof decoded!=='string'||canonical(decoded)!==canonical(source))throw Error('Roadroller changed the game JavaScript');
  // Insert after HTML minification; further minification can corrupt packed data.
  return {html:html.replace(script,()=>`<script>${decoder}</script>`),decoderMemoryMB:packer.memoryUsageMB,
    roadrollerLevel:level,decoderMemoryLimitMB:maxMemoryMB};
}
