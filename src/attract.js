import { createRace, aiInput, stepRace } from './simulation.js';
import { coursePoint, courseTangent } from './course.js';
import { resetBoat } from './boat-physics.js';

export function createTitleRace(course,worldTime=3){
  const demo=createRace(course.freePlay?'main':course.id);
  demo.phase='racing';demo.attract=true;
  demo.hideCourseMarkers=course.freePlay;
  if(demo.hideCourseMarkers)demo.buoys=[];
  // Warm up the new grid without rewinding the shared scenery/camera clock.
  demo.worldTime=worldTime-3;
  // Start the pack in the visible island channel, rather than behind the menu
  // or on the hidden far shore. Keep the selected route and direction.
  const entry={main:.29,reverse:.53,rocky:.53,sunrise:0}[demo.course.id];
  for(const r of demo.racers){
    const t=(entry-r.id*.009+1)%1,p=coursePoint(t,demo.course),n=courseTangent(t,demo.course),lane=r.id%2?3:-3;
    Object.assign(r,{x:p.x+n.z*lane,z:p.z-n.x*lane,yaw:Math.atan2(n.x,n.z),speed:28,vx:n.x*28,vz:n.z*28});
    r.nextGate=demo.course.gates.findIndex(g=>g.t>t);if(r.nextGate<0)r.nextGate=0;
    r.passed=r.nextGate||demo.course.gates.length;
    resetBoat(r,demo.worldTime);
  }
  for(let i=0;i<180;i++)stepTitleRace(demo,1/60);
  demo.worldTime=worldTime;
  return demo;
}
export function stepTitleRace(demo,dt){
  stepRace(demo,aiInput(demo.racers[0],demo),dt);
  for(const r of demo.racers)if(r.finishTime!==null){
    // Continue through the finish line instead of teleporting back to the grid.
    r.finishTime=null;r.passed=1;r.lap=1;r.misses=0;
  }
  demo.events.length=0;demo.finishOrder.length=0;
}
