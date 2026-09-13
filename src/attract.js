import { createRace, aiInput, stepRace } from './simulation.js';

export function createTitleRace(mode='main'){
  const demo=createRace(mode);
  return demo;
}
export function stepTitleRace(demo,dt){
  demo.phase='racing';demo.attract=true;
  stepRace(demo,aiInput(demo.racers[0],demo),dt);
  for(const r of demo.racers)if(r.finishTime!==null){
    // Continue through the finish line instead of teleporting back to the grid.
    r.finishTime=null;r.passed=1;r.lap=1;r.misses=0;
  }
  demo.events.length=0;demo.phase='title';demo.attract=false;
}
