import test from 'node:test';
import assert from 'node:assert/strict';
import {RacePresentation} from '../src/presentation.js';
import {createRace,startRace} from '../src/simulation.js';

test('60 Hz simulation renders even motion at 60, 120, 144, and 240 Hz',()=>{
  for(const hz of [60,120,144,240]){
    const race=createRace('main'),display=new RacePresentation();race.phase='racing';
    const r=race.racers[0];r.x=0;let accumulator=0,last;
    for(let frame=0;frame<hz*2;frame++){
      accumulator+=1/hz;
      while(accumulator>=1/60){display.capture(race);r.x+=1;race.worldTime+=1/60;accumulator-=1/60;}
      const view=display.sample(race,accumulator*60);
      if(frame>5){assert.ok(Math.abs(view.racers[0].x-last-60/hz)<1e-9,`${hz} Hz should not repeat alternating poses`);}
      last=view.racers[0].x;
    }
  }
});

test('hull, rider, buoy and water time share an interpolated instant without mutating physics',()=>{
  const race=createRace(),display=new RacePresentation(),r=race.racers[0];race.phase='racing';
  Object.assign(r,{x:0,y:1,yaw:Math.PI-.1});r.rider.x=0;r.rider.roll=.1;race.worldTime=2;race.buoys[0].leanX=0;
  display.capture(race);
  Object.assign(r,{x:2,y:3,yaw:-Math.PI+.1});r.rider.x=.4;r.rider.roll=.3;race.worldTime=2+1/60;race.buoys[0].leanX=.2;
  r.rider.handlePitch=.24;r.rider.handleYaw=.2;
  const snapshot=JSON.stringify(race),view=display.sample(race,.5);
  assert.equal(view.racers[0].x,1);assert.equal(view.racers[0].y,2);assert.equal(view.racers[0].yaw,Math.PI);
  assert.equal(view.racers[0].rider.x,.2);assert.ok(Math.abs(view.racers[0].rider.roll-.2)<1e-12);
  assert.ok(Math.abs(view.racers[0].rider.handlePitch-.12)<1e-12);
  assert.ok(Math.abs(view.racers[0].rider.handleYaw-.1)<1e-12);
  assert.equal(view.buoys[0].leanX,.1);assert.ok(Math.abs(view.worldTime-(2+1/120))<1e-12);
  assert.equal(JSON.stringify(race),snapshot);
});

test('pause, race restart, course changes and teleports do not blend old poses',()=>{
  const race=createRace(),display=new RacePresentation();race.phase='racing';display.capture(race);
  race.phase='paused';assert.equal(display.sample(race,.5),race);
  startRace(race);assert.equal(display.sample(race,.5),race);
  race.phase='racing';display.capture(race);race.racers[0].x+=100;
  assert.equal(display.sample(race,.5).racers[0],race.racers[0]);
  const next=createRace('free');assert.equal(display.sample(next,.5),next);
});
