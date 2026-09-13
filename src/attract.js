import { createRace, aiInput, stepRace } from './simulation.js';
import { resetBoat } from './boat-physics.js';

export function createTitleRace(course,worldTime=3){
  const demo=createRace(course.freePlay?'main':course.id);
  demo.phase='racing';demo.attract=true;
  demo.hideCourseMarkers=course.freePlay;
  if(demo.hideCourseMarkers)demo.buoys=[];
  // Reuse the normal grid at course point zero, aligned to the shared water clock.
  demo.worldTime=worldTime;
  for(const r of demo.racers)resetBoat(r,worldTime);
  return demo;
}
export function stepTitleRace(demo,dt){
  stepRace(demo,aiInput(demo.racers[0],demo),dt);
  for(const r of demo.racers)if(r.finishTime!==null){
    // Continue through the finish line instead of teleporting back to the grid.
    r.finishTime=null;r.passed=1;r.lap=1;r.misses=0;
  }
  demo.events.length=0;
}
