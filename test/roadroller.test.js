import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {packJavaScriptHTML} from '../scripts/roadroller.mjs';

test('Roadroller preserves Unicode, JS literals, and existing DOM globals in inline HTML',async()=>{
  const source=`(()=>{'use strict';const shader=\`void main(){gl_FragColor=vec4(1.);}\`;globalThis.result=['Sunwake ↗',shader,/a+b/i.test('AAB'),String.raw\`a\\nb\`];})();`;
  const before='\ufeff<!doctype html><style>body{margin:0}</style><canvas id=a></canvas>';
  const {html}=await packJavaScriptHTML(before+`<script>${source}</script>`,{level:2,maxMemoryMB:64});
  assert.ok(html.startsWith(before));
  const decoder=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const globals=Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map(id=>[id,{id}]));
  const context={...globals},original={};
  runInNewContext(source,original);
  runInNewContext(decoder,context,{timeout:10000});
  assert.equal(JSON.stringify(context.result),JSON.stringify(original.result));
  for(const [id,value] of Object.entries(globals))assert.equal(context[id],value);
  assert.deepEqual(Object.keys(context).sort(),[...Object.keys(globals),'result'].sort());
});

test('Roadroller rejects missing or multiple inline game scripts',async()=>{
  await assert.rejects(packJavaScriptHTML('<!doctype html>'),/one inline game script/);
  await assert.rejects(packJavaScriptHTML('<script>1</script><script>2</script>'),/one inline game script/);
});
