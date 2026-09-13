import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, startRace, stepRace } from '../src/simulation.js';
import { collideBuoys, collideRacers, stepBuoys } from '../src/interactions.js';
import { sampleWater } from '../src/course.js';
function pair(){
  const race=createRace(),[a,b]=race.racers;
  for(const r of race.racers)Object.assign(r,{x:1000+r.id*20,z:1000,y:0,yaw:0});
  Object.assign(a,{x:-1.1,z:0,vx:20,vz:0,speed:20,speedLevel:4});
  Object.assign(b,{x:1.1,z:0,vx:-20,vz:0,speed:20});
  return {race,a,b};
}
test('racer impacts conserve horizontal momentum and dissipate energy',()=>{
  const {race,a,b}=pair(),energy=a.vx*a.vx+b.vx*b.vx;
  a.yawRate=.3;a.rollRate=-.2;b.yawRate=-.4;b.rollRate=.1;
  const springs=race.racers.map(r=>structuredClone([r.yawRate,r.rollRate,r.rider]));
  collideRacers(race);
  assert.ok(Math.abs(a.vx+b.vx)<1e-9);
  assert.ok(a.vx*a.vx+b.vx*b.vx<energy);
  assert.ok(b.x-a.x>=2.7-1e-9);
  assert.deepEqual(race.racers.map(r=>[r.yawRate,r.rollRate,r.rider]),springs);
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
test('anchored buoy deflects and separates the hull without direct spring impulses',()=>{
  const race=createRace(),r=race.racers[0],b=race.buoys[2];
  Object.assign(r,{x:b.x-2.7,z:b.z,y:.35,yaw:.4,vx:40,vz:7,speed:Math.hypot(40,7),yawRate:.2,rollRate:-.3});
  const buoy=structuredClone(b),springs=structuredClone([r.yawRate,r.rollRate,r.rider]),passed=r.passed;
  collideBuoys(race,r);
  assert.ok(r.vx>0&&r.vx<40);assert.equal(r.vz,7);
  assert.equal(r.speed,Math.hypot(r.vx,r.vz));
  assert.deepEqual(b,buoy);assert.deepEqual([r.yawRate,r.rollRate,r.rider],springs);
  assert.equal(r.passed,passed);
  assert.ok(Math.hypot(r.x-b.x,r.z-b.z)>=1.25+2-.35*.3-1e-9);
  assert.ok(race.events.some(e=>e.type==='impact'&&e.other==='buoy'));
});
test('buoys stay anchored while following wave height and slope',()=>{
  const race=createRace(),anchors=race.buoys.map(b=>[b.x,b.z]);
  const heights=[];
  for(const time of [0,1,3,10]){
    race.worldTime=time;stepBuoys(race);
    assert.deepEqual(race.buoys.map(b=>[b.x,b.z]),anchors);
    for(const b of race.buoys){
      const water=sampleWater(b.x,b.z,time);
      assert.equal(b.y,water.height);assert.equal(b.leanX,-water.nx*.45);assert.equal(b.leanZ,-water.nz*.45);
    }
    heights.push(race.buoys[0].y);
  }
  assert.ok(new Set(heights).size>1);
});
test('center-circle collisions are independent of heading and ignore distant bow overlap',()=>{
  let expected;
  for(const yaw of [0,.7,Math.PI/2,Math.PI]){
    const {race,a,b}=pair();a.yaw=yaw;b.yaw=-yaw;collideRacers(race);
    const actual=[a.x,a.z,b.x,b.z,a.vx,a.vz,b.vx,b.vz];
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
    a.x=b.x=0;a.z=-1.5;b.z=1.5;
    const before=structuredClone(race);collideRacers(race);assert.deepEqual(race,before);
  }
});
test('coincident and separating buoy contacts remain finite and do not add impulses',()=>{
  const race=createRace(),r=race.racers[0],b=race.buoys[0];
  Object.assign(r,{x:b.x,z:b.z,y:0,vx:0,vz:0});
  collideBuoys(race,r);assert.ok(Number.isFinite(r.x+r.z));assert.ok(r.x-b.x>=3.25-1e-9);
  Object.assign(r,{x:b.x-2,z:b.z,vx:-5,vz:2});
  collideBuoys(race,r);assert.equal(r.vx,-5);assert.equal(r.vz,2);assert.equal(race.events.length,0);
});
test('jumping over a buoy clears its body and impacts do not run while paused',()=>{
  const race=createRace(),r=race.racers[0],b=race.buoys[0],initial=structuredClone(race.buoys);
  for(const y of [7,-3]){
    Object.assign(r,{x:b.x,z:b.z,y,vx:30,vz:0,speed:30});
    collideBuoys(race,r);assert.equal(r.vx,30);assert.deepEqual(race.buoys,initial);
  }
  r.y=0;r.finishTime=1;collideBuoys(race,r);assert.equal(r.vx,30);
  race.phase='paused';const before=JSON.stringify(race);stepRace(race,{},1/60);assert.equal(JSON.stringify(race),before);
  startRace(race);assert.deepEqual(race.buoys,initial);
});
