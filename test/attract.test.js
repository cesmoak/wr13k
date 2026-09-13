import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,LIGHTHOUSE} from '../src/course.js';
import {createTitleRace,stepTitleRace} from '../src/attract.js';
import {createRace,startRace} from '../src/simulation.js';
import {TITLE_CAMERA} from '../src/renderer.js';
import {lookAt,perspective,multiply} from '../src/math.js';

test('selected-course title racing resets the same race for a clean start',()=>{
  for(const course of Object.values(COURSES)){
    const demo=createTitleRace(course.id),old=demo.racers.map(r=>({x:r.x,z:r.z}));
    for(let i=0;i<120;i++)stepTitleRace(demo,1/60);
    assert.equal(demo.course,course);assert.equal(demo.phase,'title');
    assert.ok(demo.racers.every((r,i)=>Math.hypot(r.x-old[i].x,r.z-old[i].z)>10));
    assert.equal(demo.events.length,0);
    startRace(demo);
    assert.equal(demo.course,course);assert.equal(demo.phase,'countdown');
    assert.ok(!demo.attract,'Normal races must still finish and enforce misses');
    assert.equal(demo.time,0);assert.equal(demo.worldTime,0);
    assert.ok(demo.racers.every(r=>r.passed===0&&r.speedLevel===1&&r.misses===0));
  }
});

test('finished title riders continue from their current position without a grid reset',()=>{
  const demo=createTitleRace(),r=demo.racers[0];
  r.finishTime=80;r.passed=31;r.nextGate=1;r.lap=3;r.misses=5;
  const x=r.x,z=r.z;stepTitleRace(demo,1/60);
  assert.equal(r.finishTime,null);assert.equal(r.passed,1);assert.equal(r.nextGate,1);
  assert.equal(r.lap,1);assert.equal(r.misses,0);assert.equal(demo.phase,'title');
  assert.ok(Math.hypot(r.x-x,r.z-z)<2);
});

test('title starts on the normal main-course grid with visible buoys',()=>{
  const demo=createTitleRace(),grid=createRace('main');
  assert.equal(demo.worldTime,0);assert.deepEqual(demo.buoys,grid.buoys);
  assert.equal(demo.buoys.length,11);
  for(const r of demo.racers){
    assert.deepEqual(r,grid.racers[r.id]);
    assert.equal(r.nextGate,0);assert.equal(r.passed,0);assert.equal(r.lap,1);
    assert.equal(r.speed,0,'No custom velocity or warm-up simulation');
  }
});

test('title riders keep moving through repeated three-lap finishes',()=>{
  const demo=createTitleRace(),crossings=[0,0,0,0];
  for(let i=0;i<60*160;i++){
    const targets=demo.racers.map(r=>r.nextGate);
    stepTitleRace(demo,1/60);
    for(const r of demo.racers){
      if(r.nextGate!==targets[r.id])crossings[r.id]++;
      assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.z));
      assert.equal(r.finishTime,null);
    }
    assert.equal(demo.phase,'title');assert.equal(demo.events.length,0);
  }
  assert.ok(crossings.every(n=>n>demo.course.gates.length*6),`Repeated circuits: ${crossings}`);
  assert.ok(demo.racers.every(r=>r.speed>10));
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
