import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,designCourses,unpackCourse,coursePoint,courseTangent} from '../src/course.js';
import {COURSE_CODES} from '../src/course-codes.js';
import {encodeCourse,generateCourseCodes} from '../scripts/course-codes.mjs';
import {createRace,startRace} from '../src/simulation.js';

test('checked-in layouts match the editable designs within the declared quantization error',()=>{
  assert.deepEqual(COURSE_CODES,generateCourseCodes(),'Run npm run courses after editing a route');
  for(const [id,design] of Object.entries(designCourses())){
    const course=COURSES[id];assert.equal(course.gates.length,design.gates.length);
    for(const [i,g] of course.gates.entries()){
      const expected=design.gates[i];assert.equal(g.width,expected.width);assert.equal(g.side,expected.side);
      assert.ok(Math.hypot(g.x-expected.x,g.z-expected.z)<=Math.SQRT2/8);
      assert.ok(Math.abs(Math.atan2(g.tangent.x,g.tangent.z)-Math.atan2(expected.tangent.x,expected.tangent.z))<=.0005);
      assert.ok(Math.abs(Math.hypot(g.tangent.x,g.tangent.z)-1)<1e-12);
    }
    const race=createRace(id);
    for(let i=0;i<4;i++){
      const t=-.019-Math.floor(i/2)*.013,p=coursePoint(t,design),n=courseTangent(t,design),lane=i%2?5:-5,r=race.racers[i];
      assert.ok(Math.hypot(r.x-p.x-n.z*lane,r.z-p.z+n.x*lane)<=Math.SQRT2/8);
      assert.ok(Math.abs(r.yaw-Math.atan2(n.x,n.z))<=.0005);
    }
    const grid=race.racers.map(r=>[r.x,r.z,r.yaw]);startRace(race);
    assert.deepEqual(race.racers.map(r=>[r.x,r.z,r.yaw]),grid);
  }
});

test('packed layout rows preserve signed coordinates and headings and reject overflow',()=>{
  const rows=[[-100.25,40.5,-3.14,12],[0,0,0,22],[450,-320,3.14,0]];
  const decoded=unpackCourse(encodeCourse(rows));
  rows.forEach((row,i)=>row.forEach((value,j)=>assert.ok(Math.abs(decoded[i][j]-value)<1e-12)));
  assert.throws(()=>encodeCourse([[10000,0,0,18]]),/range/);
  assert.throws(()=>encodeCourse([[0,0,0,91]]),/width/);
});
