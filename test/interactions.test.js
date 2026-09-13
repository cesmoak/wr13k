import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, startRace, stepRace } from '../src/simulation.js';
import { collideBuoys, collideRacers, stepBuoys } from '../src/interactions.js';
function pair(){
  const race=createRace(),[a,b]=race.racers;
  for(const r of race.racers)Object.assign(r,{x:1000+r.id*20,z:1000,y:0,yaw:0});
  Object.assign(a,{x:-1.1,z:0,vx:20,vz:0,speed:20,speedLevel:4});
  Object.assign(b,{x:1.1,z:0,vx:-20,vz:0,speed:20});
  return {race,a,b};
}
test('racer impacts conserve horizontal momentum and dissipate energy',()=>{
  const {race,a,b}=pair(),energy=a.vx*a.vx+b.vx*b.vx;
  collideRacers(race);
  assert.ok(Math.abs(a.vx+b.vx)<1e-9);
  assert.ok(a.vx*a.vx+b.vx*b.vx<energy);
  assert.ok(b.x-a.x>=2.7-1e-9);
  assert.ok(a.rider.vx!==0&&b.rider.vx!==0);
  assert.equal(a.speed,Math.hypot(a.vx,a.vz));
  assert.equal(a.speedLevel,4,'A bump alone does not count as a missed buoy');
  assert.equal(race.events.filter(e=>e.type==='impact').length,2);
});
test('glancing bumps preserve tangential motion and separating hulls receive no new impulse',()=>{
  const {race,a,b}=pair();a.vz=7;b.vz=7;
  collideRacers(race);assert.equal(a.vz,7);assert.equal(b.vz,7);
  const v=[a.vx,b.vx],events=race.events.length;
  a.x=-1.1;b.x=1.1;collideRacers(race);
  assert.deepEqual([a.vx,b.vx],v);assert.equal(race.events.length,events);
});
test('coincident craft separate safely; airborne and finished racers can clear another hull',()=>{
  const {race,a,b}=pair();a.x=b.x=0;a.vx=b.vx=0;
  collideRacers(race);assert.ok(Number.isFinite(a.x+b.x));assert.ok(Math.abs(a.x-b.x)>=2.7);
  a.x=-1;b.x=1;a.y=4;const before=[a.x,b.x];collideRacers(race);assert.deepEqual([a.x,b.x],before);
  a.y=0;b.finishTime=1;collideRacers(race);assert.deepEqual([a.x,b.x],before);
});
test('buoy impact deflects the hull, recoils the buoy, then the mooring settles',()=>{
  const race=createRace(),r=race.racers[0],b=race.buoys[2];
  Object.assign(r,{x:b.x-2.7,z:b.z,y:.35,yaw:0,vx:40,vz:0,speed:40});
  const anchor=[b.anchorX,b.anchorZ],passed=r.passed;
  collideBuoys(race,r);
  assert.ok(r.vx<40&&b.vx>0);assert.ok(b.tiltVX>0);assert.ok(r.rider.vx!==0);
  assert.equal(r.passed,passed);assert.deepEqual([b.anchorX,b.anchorZ],anchor);
  assert.ok(race.events.some(e=>e.type==='impact'&&e.other==='buoy'));
  let maxLean=0;
  for(let i=0;i<600;i++){race.worldTime+=1/60;stepBuoys(race,1/60);maxLean=Math.max(maxLean,Math.abs(b.leanX));}
  assert.ok(maxLean>.03);assert.ok(Math.hypot(b.x-b.anchorX,b.z-b.anchorZ)<.001);
});
test('jumping over a buoy clears its body and impacts do not run while paused',()=>{
  const race=createRace(),r=race.racers[0],b=race.buoys[0];
  Object.assign(r,{x:b.x,z:b.z,y:7,vx:30,vz:0,speed:30});
  collideBuoys(race,r);assert.equal(r.vx,30);assert.equal(b.vx,0);
  race.phase='paused';b.vx=8;const before=JSON.stringify(race);stepRace(race,{},1/60);assert.equal(JSON.stringify(race),before);
  startRace(race);assert.ok(race.buoys.every(b=>b.x===b.anchorX&&b.z===b.anchorZ&&b.vx===0&&b.leanX===0));
});
