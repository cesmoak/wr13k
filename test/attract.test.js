import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,LIGHTHOUSE} from '../src/course.js';
import {createTitleRace,stepTitleRace} from '../src/attract.js';
import {createRace,startRace} from '../src/simulation.js';
import {TITLE_CAMERA} from '../src/renderer.js';
import {lookAt,perspective,multiply} from '../src/math.js';

test('every title mode previews four moving riders on the selected route; free uses main',()=>{
  for(const course of Object.values(COURSES)){
    const demo=createTitleRace(course),old=demo.racers.map(r=>({x:r.x,z:r.z}));
    assert.equal(demo.racers.length,4);assert.equal(demo.course.id,course.freePlay?'main':course.id);
    for(let i=0;i<120;i++)stepTitleRace(demo,1/60);
    assert.ok(demo.racers.every((r,i)=>Math.hypot(r.x-old[i].x,r.z-old[i].z)>10));
    assert.equal(demo.phase,'racing');assert.equal(demo.events.length,0);
    const game=createRace(course.id);startRace(game);
    assert.equal(game.racers.length,4);
    assert.ok(game.racers.every(r=>r.passed===0&&r.speedLevel===1));assert.equal(game.time,0);
  }
});

test('finished title riders continue from their current position without a grid reset',()=>{
  const demo=createTitleRace(COURSES.main),r=demo.racers[0];
  r.finishTime=80;r.passed=31;r.nextGate=1;r.lap=3;r.misses=5;
  const x=r.x,z=r.z;stepTitleRace(demo,1/60);
  assert.equal(r.finishTime,null);assert.equal(r.passed,1);assert.equal(r.nextGate,1);
  assert.equal(r.lap,1);assert.equal(r.misses,0);assert.equal(demo.phase,'racing');
  assert.ok(Math.hypot(r.x-x,r.z-z)<2);
});

test('every title pack uses the normal course-zero grid; free hides markers',()=>{
  for(const id of Object.keys(COURSES)){
    const demo=createTitleRace(COURSES[id]),grid=createRace(id==='free'?'main':id);
    for(const r of demo.racers){
      const start=grid.racers[r.id];
      assert.deepEqual([r.x,r.z,r.yaw],[start.x,start.z,start.yaw]);
      assert.equal(r.nextGate,0);assert.equal(r.passed,0);assert.equal(r.lap,1);
      assert.equal(r.speed,0,'No custom velocity or warm-up simulation');
    }
    assert.equal(demo.hideCourseMarkers,id==='free');
    if(id==='free')assert.equal(demo.buoys.length,0);
  }
});

test('changing title courses preserves lighthouse and water time',()=>{
  let demo=createTitleRace(COURSES.main);
  for(let i=0;i<600;i++)stepTitleRace(demo,1/60);
  for(const course of Object.values(COURSES)){
    const time=demo.worldTime;
    demo=createTitleRace(course,time);
    assert.equal(demo.worldTime,time);
    assert.ok(demo.racers.every(r=>r.speed===0));
    stepTitleRace(demo,1/60);
    assert.ok(demo.racers.every(r=>r.speed>0),'The shared grid accelerates immediately');
  }
});

test('fixed title camera keeps the lighthouse on the right at desktop aspect ratios',()=>{
  for(const aspect of [1.2,16/9,21/9]){
    const c=TITLE_CAMERA,m=multiply(perspective(.99,aspect,.25,1300),lookAt(c.eye,c.target));
    const p=[LIGHTHOUSE.x,LIGHTHOUSE.y+LIGHTHOUSE.lampHeight,LIGHTHOUSE.z,1];
    const q=[0,1,2,3].map(row=>p.reduce((sum,v,i)=>sum+v*m[i*4+row],0));
    const x=(q[0]/q[3]+1)/2,y=(1-q[1]/q[3])/2;
    assert.ok(q[3]>0&&x>.65&&x<.95&&y>.15&&y<.6,`${aspect}: lighthouse ${x},${y}`);
    const dx=LIGHTHOUSE.x-c.eye[0],dz=LIGHTHOUSE.z-c.eye[2];
    const horizon=(m[1]*dx+m[9]*dz)/(m[3]*dx+m[11]*dz);
    assert.ok(q[1]/q[3]>horizon+.025,'Lighthouse lamp rises visibly above the horizon');
  }
});
