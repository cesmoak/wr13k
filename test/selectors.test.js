import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { compactSelectors } from '../scripts/selectors.mjs';

test('selector renaming preserves mode strings, attributes, dynamic classes, and DOM lookups',()=>{
  const html='<main id="race-screen" class="night"><button aria-label="night" data-course="night">night</button></main>';
  const css='@media(max-width:600px){.night #race-screen{color:#abcdef}}.rider-row.you{opacity:.5}.rider-dot{color:red}';
  const source=`
    const mode='night',color='#abcdef';
    element('race-screen');document.getElementById('race-screen');
    document.querySelector('.night #race-screen');
    document.body.classList.toggle('night',true);
    for(const active of [false,true]){
      output.innerHTML=\`<div class="rider-row \${active?'you':''}"><i class="rider-dot"></i><span>\${mode}</span></div>\`;
    }
    output.innerHTML='<b class="you">night</b>';
    globalThis.unchanged=[mode,color];`;
  const packed=compactSelectors(html,css,source),m=packed.mapping,calls=[],markup=[];
  const context={element:id=>calls.push(id),document:{getElementById:id=>calls.push(id),
    querySelector:s=>calls.push(s),body:{classList:{toggle:(c,on)=>calls.push([c,on])}}},
    output:{set innerHTML(html){markup.push(html);}}};
  runInNewContext(packed.source,context);
  assert.deepEqual(calls,[m['race-screen'],m['race-screen'],`.${m.night} #${m['race-screen']}`,[m.night,true]]);
  assert.deepEqual(markup,[`<div class="${m['rider-row']} "><i class="${m['rider-dot']}"></i><span>night</span></div>`,
    `<div class="${m['rider-row']} ${m.you}"><i class="${m['rider-dot']}"></i><span>night</span></div>`,
    `<b class="${m.you}">night</b>`]);
  assert.equal(JSON.stringify(context.unchanged),'["night","#abcdef"]');
  assert.ok(packed.html.includes('aria-label="night" data-course="night"'));
  assert.ok(packed.css.includes(`.${m.night} #${m['race-screen']}{color:#abcdef}`));
});
