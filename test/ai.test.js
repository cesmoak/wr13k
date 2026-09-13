import test from 'node:test';
import assert from 'node:assert/strict';
import {createRace,racingLine,stepRace} from '../src/simulation.js';
import {resetBoat} from '../src/boat-physics.js';
import {collideBuoys,collideRacers,stepBuoys} from '../src/interactions.js';

for(const [course,index] of [['main',4],['sunrise',6]])for(const impact of ['buoy','racer left','racer right']){
  test(`${course} AI continues through checkpoints after a ${impact} impact near land`,()=>{
    const race=createRace(course),r=race.racers[1],other=race.racers[2];
    race.phase='racing';race.racers=[r];stepBuoys(race);
    const gate=race.course.gates[index],n=gate.tangent;
    const buoy=race.buoys.find(b=>b.gate===index),point=racingLine(race.course,r.id)[index];
    const anchor=impact==='buoy'?buoy:point,approach=impact==='buoy'?2.6:15;
    Object.assign(r,{x:anchor.x-n.x*approach,z:anchor.z-n.z*approach,
      yaw:Math.atan2(n.x,n.z),vx:n.x*35,vz:n.z*35,speed:35,speedLevel:5,nextGate:index,passed:index});
    resetBoat(r,0);
    if(impact==='buoy'){
      r.y=buoy.y+.35;
      collideBuoys(race,r);
    }else{
      const side=impact==='racer left'?1:-1,dx=n.z*side,dz=-n.x*side;
      Object.assign(other,{x:r.x+dx*2.2,z:r.z+dz*2.2,y:r.y,
        vx:r.vx-dx*16,vz:r.vz-dz*16});
      race.racers.push(other);collideRacers(race);
      // Isolate the controller's response to one verified collision.
      race.racers.pop();
    }
    assert.ok(race.events.some(e=>e.type==='impact'&&e.id===r.id),'Fixture must apply an actual impact');
    for(let i=0;i<60*20&&r.passed<index+2;i++){
      stepRace(race,{},1/60);race.events.length=0;
      assert.ok([r.x,r.y,r.z,r.vx,r.vy,r.vz,r.yaw,r.speed].every(Number.isFinite));
    }
    assert.ok(r.passed>=index+2,'The racer must clear two checkpoint planes within 20 seconds');
    assert.ok(r.misses<=1,'An impact must not cause repeated missed buoys');
  });
}
