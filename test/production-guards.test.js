import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readScripts,modules,compactScript} from '../scripts/optimize.mjs';

test('production title routing preserves fixed-step boat motion and race startup',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  const probe=`globalThis.probe=()=>{
    const output=[];
    const snapshot=race=>[race.time,race.worldTime,race.countdown,
      ['title','countdown','racing','paused','finished','lost'].indexOf(race.phase),
      race.racers.map(r=>[r.x,r.y,r.z,r.vx,r.vy,r.vz,r.yaw,r.pitch,r.roll,
        r.speed,r.speedLevel,r.nextGate,r.rider.x,r.rider.y,r.rider.z])];
    for(const course of Object.values(COURSES)){
      const race=createTitleRace(course.id);
      for(let i=0;i<120;i++)stepTitleRace(race,1/60);
      output.push(snapshot(race));
      startRace(race);
      for(let i=0;i<300;i++)stepRace(race,{throttle:1,steer:0,brake:false},1/60);
      output.push(snapshot(race));
    }
    return JSON.stringify(output);
  };`;
  const original={},packed={};
  runInNewContext(source+probe,original);
  runInNewContext(await compactScript(source+probe,{locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true}),packed);
  assert.equal(packed.probe(),original.probe());
});
