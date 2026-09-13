import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,islands,shoreRadius,courseTangent} from '../src/course.js';
import {createRace,startRace,stepRace,aiInput,checkGate} from '../src/simulation.js';

test('free play has no race, markers, gate events, or out-of-course penalty',()=>{
  const race=createRace('free');startRace(race);
  assert.equal(race.phase,'racing');assert.equal(race.racers.length,4);assert.equal(race.buoys.length,0);
  const p=race.racers[0];p.x=-400;p.z=-300;
  for(let i=0;i<600;i++)stepRace(race,{throttle:1},1/60);
  checkGate(p,{x:0,z:0},race);
  assert.ok(p.speed>10);assert.equal(race.time,0);assert.equal(p.passed,0);assert.equal(p.misses,0);assert.equal(p.offCourse,0);
  assert.ok(!race.events.some(e=>['gate','lap','finish','miss','go','beep'].includes(e.type)));
  race.phase='paused';const time=race.worldTime;stepRace(race,{throttle:1},1);assert.equal(race.worldTime,time);
  startRace(race);assert.equal(race.course.id,'free');assert.equal(race.phase,'racing');
});

test('free-play riders keep cruising beyond three circuits, pause together, and restart',()=>{
  const race=createRace('free');startRace(race);
  race.racers[0].x=-400;race.racers[0].z=-300;
  const crossings=[0,0,0,0];
  for(let i=0;i<60*240;i++){
    const targets=race.racers.map(r=>r.nextGate);
    stepRace(race,{},1/60);
    for(const r of race.racers){
      if(r.nextGate!==targets[r.id])crossings[r.id]++;
      assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.z));
      assert.equal(r.finishTime,null);assert.equal(r.passed,0);
      assert.equal(r.misses,0);assert.equal(r.speedLevel,1);
    }
    assert.ok(!race.events.some(e=>['gate','lap','finish','miss','speedLevel','go','beep'].includes(e.type)));
    race.events.length=0;
  }
  assert.ok(crossings.slice(1).every(n=>n>COURSES.main.gates.length*3),`Each rider keeps circling: ${crossings}`);
  assert.equal(race.phase,'racing');assert.equal(race.time,0);
  assert.deepEqual(race.finishOrder,[]);assert.equal(race.buoys.length,0);
  race.phase='paused';const paused=structuredClone(race.racers);
  stepRace(race,{},1);assert.deepEqual(race.racers,paused);
  startRace(race);
  assert.equal(race.course.id,'free');assert.equal(race.racers.length,4);
  assert.ok(race.racers.every(r=>r.nextGate===0&&r.speed===0));
});

test('main and reverse have opposite directions, distinct lines, and different difficulty',()=>{
  const easy=COURSES.main,hard=COURSES.reverse,a=courseTangent(0,easy),b=courseTangent(0,hard);
  assert.ok(a.x*b.x+a.z*b.z<-.9);
  assert.ok(easy.gates.every(g=>!g.slalom));assert.ok(hard.gates.filter(g=>g.slalom).length>8);
  assert.ok(hard.gates.length>easy.gates.length);
  assert.ok(hard.gates.every(g=>g.width<easy.gates[1].width));
  for(const course of [easy,hard])for(const g of course.gates)for(let lane=-g.width;lane<=g.width;lane++)for(const island of islands){
    const x=(g.x+g.tangent.z*lane-island.x)/island.rx,z=(g.z-g.tangent.x*lane-island.z)/island.rz;
    assert.ok((Math.hypot(x,z)-shoreRadius(Math.atan2(z,x)))*Math.min(island.rx,island.rz)>4,`${course.id} gate ${g.index} clears land`);
  }
});

test('a wide passing line accepted by the easy route is a miss on the hard route',()=>{
  for(const [id,misses] of [['main',0],['reverse',1]]){
    const race=createRace(id);startRace(race);race.phase='racing';
    const p=race.racers[0],g=race.course.gates[1],n=g.tangent;
    p.nextGate=1;p.x=g.x+n.x*3+n.z*20;p.z=g.z+n.z*3-n.x*20;
    checkGate(p,{x:g.x-n.x*3+n.z*20,z:g.z-n.z*3-n.x*20},race);
    assert.equal(p.misses,misses);assert.equal(p.nextGate,2);
  }
});

for(const id of ['main','reverse','rocky','sunrise'])test(`${id} AI racers complete all three laps with rare misses and restart the same route`,()=>{
  const race=createRace(id);startRace(race);
  for(let i=0;i<60*240;i++){
    if(race.phase==='finished')race.phase='racing';
    stepRace(race,aiInput(race.racers[0],race),1/60);race.events.length=0;
    if(race.racers.every(r=>r.finishTime!==null))break;
  }
  assert.ok(race.racers.every(r=>r.finishTime!==null));
  assert.ok(race.racers.slice(1).every(r=>r.misses<=2),'No opponent should repeatedly miss buoys');
  assert.ok(race.racers.slice(1).reduce((sum,r)=>sum+r.misses,0)/(race.course.gates.length*9)<.03,'Opponent misses stay below 3% of crossings');
  assert.ok(race.racers.every(r=>r.passed===race.course.gates.length*3+1));
  const average=race.racers.slice(1).reduce((sum,r)=>sum+r.finishTime,0)/3;
  assert.ok(average<{main:70,reverse:106,rocky:120,sunrise:85}[id],`${id} look-ahead lines improve average finish time: ${average}`);
  if(id!=='main')assert.ok(race.racers.slice(1).every(r=>r.finishTime<(id==='reverse'?130:165)),'later-course opponents maintain their faster pace');
  startRace(race);assert.equal(race.course.id,id);assert.equal(race.racers[0].passed,0);
  assert.equal(race.buoys.length,race.course.gates.length+1);
});
