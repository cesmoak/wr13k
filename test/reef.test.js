import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,landforms,reefRocks,outerReefRocks,islands,shoreRadius} from '../src/course.js';
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
  const race=createRace('main'),r=race.racers[0],rock=reefRocks[2];
  Object.assign(r,{x:rock.x+rock.rx*.5,z:rock.z,speedLevel:5});
  updateRacer(r,{},1/60,race,true);
  assert.ok(Math.abs(r.x-rock.x-rock.rx*(shoreRadius(0)*.915+.028))<.1,'Reef rocks repel the hull to the shared waterline');
  assert.equal(r.speedLevel,1);assert.equal(r.misses,0);
});

test('sunrise reaches daylight through the three-lap checkpoint sequence',()=>{
  const course=COURSES.sunrise,total=course.gates.length*3;
  let last=-1;
  for(let passed=0;passed<=total+1;passed++){
    const light=courseLighting({passed},course);
    assert.ok(light.altitude>=last);last=light.altitude;
  }
  const start=courseLighting({passed:0},course),finish=courseLighting({passed:total+1},course);
  assert.ok(start.sunDirection[1]<0&&finish.sunDirection[1]>0);
  assert.ok(start.night>.9);assert.equal(finish.night,0);
});
