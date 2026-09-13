import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

// Exercise the actual browser loop with deterministic display timestamps.
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
function loop(){
  const race={phase:'racing',events:[],ticks:0},draws=[],events=[];
  let scheduled=0;
  const context={race,keys:{},previous:0,accumulator:0,
    requestAnimationFrame(){scheduled++;},
    stepRace(scene,input,dt){assert.equal(dt,1/60);scene.ticks++;scene.events.push({type:'impact'});},
    stepTitleRace(scene,dt){assert.equal(dt,1/60);scene.ticks++;},
    sound:{event(e){events.push(e);},update(){}},
    renderer:{impact(){},draw(scene,dt){draws.push({scene,ticks:scene.ticks,dt});}},updateUI(){}};
  runInNewContext(source.slice(source.indexOf('function frame(now){'),source.indexOf('// Read by the development-only')),context);
  return {context,race,draws,events,get scheduled(){return scheduled;}};
}

test('60 Hz physics and drawing stay aligned at 60/120/144/240 Hz display rates',()=>{
  for(const hz of [60,120,144,240]){
    const l=loop();
    for(let i=1;i<=hz*2;i++)l.context.frame(i*1000/hz);
    assert.equal(l.race.ticks,120);
    assert.equal(l.draws.length,120);
    assert.equal(l.scheduled,hz*2+1);
    l.draws.forEach((draw,i)=>{
      assert.equal(draw.scene,l.race,'draw authoritative scene directly');
      assert.equal(draw.ticks,i+1,'no repeated or skipped simulation poses');
      assert.equal(draw.dt,1/60);
    });
    assert.equal(l.events.length,120);
    assert.equal(l.race.events.length,0);
  }
});

test('slow frames catch up once, advance effects by fixed elapsed time, and cap long stalls',()=>{
  const l=loop();
  l.context.frame(1000/30);
  assert.equal(l.draws.length,1);assert.equal(l.race.ticks,2);
  assert.equal(l.draws[0].dt,2/60);
  l.context.frame(5000);
  assert.equal(l.draws.length,2);assert.equal(l.race.ticks,5);
  assert.equal(l.draws[1].dt,3/60);
  assert.equal(l.events.length,5);
});

test('title scene uses the same capped loop and preserves title rendering metadata',()=>{
  const l=loop();l.race.phase='title';l.race.course={id:'main'};
  l.context.frame(1000/120);assert.equal(l.draws.length,0);
  l.context.frame(1000/60);
  assert.equal(l.race.ticks,1);assert.equal(l.draws[0].scene,l.race);
  assert.equal(l.draws[0].scene.phase,'title');
  assert.equal(l.draws[0].scene.course,l.race.course);
});
