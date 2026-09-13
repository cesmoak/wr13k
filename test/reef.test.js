import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,landforms,reefRocks,outerReefRocks,islands,shoreRadius,coursePoint} from '../src/course.js';
import {createRace,updateRacer} from '../src/simulation.js';
import {courseLighting} from '../src/renderer.js';

test('reef connects the beach toward the lighthouse while every buoy corridor clears land',()=>{
  assert.ok(reefRocks.some(r=>r.z<islands[1].z-islands[1].rz*.8));
  assert.ok(Math.hypot(reefRocks.at(-1).x-islands[2].x,reefRocks.at(-1).z-islands[2].z)<25);
  for(const course of Object.values(COURSES))for(const g of course.gates)
    for(let lane=-g.width;lane<=g.width;lane++)for(const land of landforms){
      const x=(g.x+g.tangent.z*lane-land.x)/land.rx,z=(g.z-g.tangent.x*lane-land.z)/land.rz;
      const clearance=(Math.hypot(x,z)-shoreRadius(Math.atan2(z,x)))*Math.min(land.rx,land.rz);
      assert.ok(clearance>4,`${course.id} buoy ${g.index} clears land at ${land.x},${land.z}`);
    }
  const course=COURSES.sunrise;
  assert.ok(course.samples.some(p=>p.x>islands[1].x+islands[1].rx+30&&p.z>0));
  assert.ok(course.samples.some(p=>p.z<islands[2].z-islands[2].rz));
});

test('outer reef forces alternating turns beyond the smaller island',()=>{
  const c=COURSES.sunrise;
  for(const [i,rock] of outerReefRocks.entries()){
    assert.ok(rock.x-rock.rx>islands[1].x+islands[1].rx);
    const gate=c.gates.find(g=>g.x>350&&Math.abs(g.z-rock.z)<1);
    assert.ok(gate&&gate.slalom&&gate.width===12);
    assert.ok((gate.x-rock.x)*(i%2?1:-1)>25,'pass alternating sides of the outcrops');
    assert.ok(Math.abs(400-rock.x)<rock.rx+15,'a straight offshore line encounters rocks');
  }
});

test('reef rocks repel a hull instead of allowing it through the scenery',()=>{
  const race=createRace('free'),r=race.racers[0],rock=reefRocks[2];
  Object.assign(r,{x:rock.x+rock.rx*.5,z:rock.z,speedLevel:5});
  updateRacer(r,{},1/60,race);
  assert.ok(r.x>rock.x+rock.rx);
  assert.equal(r.speedLevel,1);assert.equal(r.misses,0);
});

test('sunrise rises continuously from predawn through the horizon to daylight over three laps',()=>{
  const course=COURSES.sunrise;let last=-1;
  for(const lap of [1,2,3])for(let i=0;i<100;i++){
    const p=coursePoint(i/100,course),l=courseLighting(p.x,p.z,'auto',{lap},course);
    assert.ok(l.altitude>=last-.0001);last=l.altitude;
  }
  const p=coursePoint(0,course);
  const start=courseLighting(p.x,p.z,'auto',{lap:1,passed:0},course);
  const finish=courseLighting(p.x,p.z,'auto',{lap:3,finishTime:120},course);
  assert.ok(start.sunDirection[1]<0&&finish.sunDirection[1]>0);
  assert.ok(start.night>.9);assert.equal(finish.night,0);
  assert.equal(start.label,'SUNRISE');assert.equal(finish.label,'DAY');
  for(const lap of [1,2]){
    const a=coursePoint(.99999,course),b=coursePoint(.00001,course);
    assert.ok(Math.abs(courseLighting(a.x,a.z,'auto',{lap},course).altitude-
      courseLighting(b.x,b.z,'auto',{lap:lap+1},course).altitude)<.001);
  }
});
