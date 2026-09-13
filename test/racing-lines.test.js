import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES} from '../src/course.js';
import {LINE_CODES} from '../src/racing-lines.js';
import {racingLine} from '../src/simulation.js';
import {generateRacingLines} from '../scripts/racing-lines.mjs';
test('compiled racing lines exactly preserve every planned point for every rider',()=>{
  assert.deepEqual(LINE_CODES,generateRacingLines(),'Run npm run courses after editing courses or the planner');
  for(const course of Object.values(COURSES))for(let id=0;id<4;id++){
    const points=course.gates.map((g,i)=>{
      const offset=(LINE_CODES[course.id][id].charCodeAt(i)-52)*(g.width-8)/4;
      return {x:g.x+g.tangent.z*offset,z:g.z-g.tangent.x*offset};
    });
    assert.deepEqual(points,racingLine(course,id));
  }
});
