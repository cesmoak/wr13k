import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { readScripts, modules, compactScript, stripMetadata, packageHTML } from '../scripts/optimize.mjs';
import { zipHTML } from '../scripts/zip.mjs';

test('build strips unused metadata and retains course selection attributes',async()=>{
  const source=await readScripts(),stripped=stripMetadata(source);
  assert.ok(!source.includes('Changing skies · explore three islands'));
  assert.ok(!stripped.includes('Changing skies · explore three islands'));
  assert.ok(!stripped.includes('sideSpray:true'));
  // If a future feature reads metadata, don't silently remove its input.
  assert.throws(()=>stripMetadata(source+'\nCOURSES.main.name;'),/now used at runtime/);
  assert.throws(()=>stripMetadata(source+'\nCOURSES.main["name"];'),/now used at runtime/);
  const html=await readFile('index.html','utf8');
  assert.ok(!html.includes('rel="icon"'),'no favicon markup remains');
  const packed=await packageHTML(html,'','');
  assert.ok(!packed.includes('data:image/svg+xml'));
  assert.ok(!packed.includes('theme-color')&&!packed.includes('name="description"'));
  assert.ok(packed.includes('charset=')&&packed.includes('viewport'));
  assert.ok(!packed.includes('aria-label=')&&packed.includes('aria-pressed="true"'));
  assert.ok(packed.includes('data-course="main"'));
});

test('production minification preserves physics, checkpoints, interpolation, and generated geometry',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  // Compile the probe alongside the game so explicit field accesses follow the
  // production property names. Numeric arrays give a stable comparison format.
  const probe=`
    globalThis.probe=()=>{
      const output=[];
      const pose=r=>[r.x,r.y,r.z,r.vx,r.vy,r.vz,r.yaw,r.pitch,r.roll,r.speed,
        r.speedLevel,r.nextGate,r.passed,r.misses,r.lap,r.finishTime,r.contactFraction,
        r.rider.x,r.rider.y,r.rider.z,r.rider.pitch,r.rider.roll,r.rider.handlePitch];
      for(const course of Object.values(COURSES)){
        const race=createRace(course.id),presentation=new RacePresentation();startRace(race);
        for(let i=0;i<900;i++){
          presentation.capture(race);
          stepRace(race,course.freePlay?{throttle:1,steer:Math.sin(i/130)*.3}:aiInput(race.racers[0],race),1/60);
          if(i%90===0)output.push([race.time,race.worldTime,race.phase,
            race.racers.map(pose),presentation.sample(race,.43).racers.map(pose)]);
          race.events.length=0;
        }
        if(!course.freePlay){
          for(const r of race.racers){
            r.passed=0;r.nextGate=0;r.misses=0;r.finishTime=null;race.phase='racing';
            for(let i=0;i<course.gates.length*3+1;i++){
              const g=course.gates[r.nextGate],n=g.tangent,offset=i===2?g.side*(g.width+4):0;
              const old={x:g.x-n.x*3+n.z*offset,z:g.z-n.z*3-n.x*offset};
              r.x=g.x+n.x*3+n.z*offset;r.z=g.z+n.z*3-n.x*offset;
              race.time+=1;checkGate(r,old,race);output.push(pose(r));
            }
          }
          output.push([race.phase,race.finishOrder,race.events.map(e=>[e.type,e.id,e.level])]);
        }
      }
      for(const mesh of [createIslandMesh(),createSeabedMesh(),createSeaGrassMesh(),
        createFishMesh(12,{x:0,z:0}),createLighthouseMesh(),createBeaconMesh(),
        ...[0,1,2,3].map(createCraftMesh)])output.push(mesh.data);
      return JSON.stringify(output);
    };`;
  const original={},packed={};
  runInNewContext(source+probe,original);
  const compiled=await compactScript(source+probe);
  assert.ok(!compiled.includes('contactPoints'),'development contact diagnostics are excluded');
  runInNewContext(compiled,packed);
  assert.equal(packed.probe(),original.probe());
});

test('ZIP is deterministic, contains just index.html, and round-trips Unicode',async()=>{
  const html='<!doctype html><title>Sunwake ↗</title>'+('procedural water '.repeat(100));
  const {zip}=await zipHTML(html),again=await zipHTML(html);
  assert.deepEqual(zip,again.zip);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  assert.equal(zip.readUInt16LE(8),8);
  const start=30+zip.readUInt16LE(26)+zip.readUInt16LE(28),size=zip.readUInt32LE(18);
  assert.equal(zip.subarray(30,start).toString(),'index.html');
  assert.equal(inflateRawSync(zip.subarray(start,start+size)).toString(),html);
  assert.equal(zip.readUInt16LE(zip.length-12),1);
});
