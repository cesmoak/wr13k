import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { readScripts, modules, compactScript, stripMetadata, packageHTML, precompileShaders, markPropertyKeys, shortenShaderLocals } from '../scripts/optimize.mjs';
import { zipHTML } from '../scripts/zip.mjs';
import {shaderNames,renameShaderTokens} from '../scripts/glsl.mjs';

test('build strips unused metadata and retains labels for generated course buttons',async()=>{
  const source=await readScripts(),stripped=stripMetadata(source);
  assert.ok(!source.includes('Changing skies · explore three islands'));
  assert.ok(!stripped.includes('Changing skies · explore three islands'));
  assert.ok(!stripped.includes('sideSpray:true'));
  // If a future feature reads metadata, don't silently remove its input.
  assert.throws(()=>stripMetadata(source+'\nCOURSES.main.slalom;'),/now used at runtime/);
  assert.throws(()=>stripMetadata(source+'\nCOURSES.main["slalom"];'),/now used at runtime/);
  const html=await readFile('index.html','utf8');
  assert.ok(!html.includes('rel="icon"'),'no favicon markup remains');
  const packed=await packageHTML(html,'','');
  assert.ok(!packed.includes('data:image/svg+xml'));
  assert.ok(!packed.includes('theme-color')&&!packed.includes('name="description"'));
  assert.equal(Buffer.from(packed).subarray(0,3).toString('hex'),'efbbbf','UTF-8 BOM survives HTML minification');
  assert.ok(packed.startsWith('\ufeff<!doctype html>')&&!packed.includes('name=viewport'));
  assert.ok(!packed.includes('charset=')&&!/<(?:html|head|body|title)\b/.test(packed));
  assert.ok(!/\srole=/.test(packed));
  assert.ok(!packed.includes('aria-label=')&&!packed.includes('aria-pressed=')&&!packed.includes('data-course='));
  assert.ok(stripped.includes('Main island loop')&&stripped.includes('course.name'));
});

test('build-time shaders preserve all four generated shader programs',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  const probe='\nglobalThis.shaders=[vertexSource,fragmentSource,skyVertex,skyFragment];';
  const original={},baked={};
  runInNewContext(source+probe,original);
  runInNewContext(precompileShaders(source)+probe,baked);
  const tokens=s=>s.replace(/\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,'')
    .replace(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*/g,value=>/^\d|^\.\d/.test(value)?String(Number(value)):value).replace(/\s+/g,'');
  for(let i=0;i<4;i++)assert.equal(tokens(baked.shaders[i]),tokens(original.shaders[i]));
});

test('shader-local shortening also rewrites conditional and generated GLSL strings',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  const probe='\nglobalThis.shaders=[vertexSource,fragmentSource,skyVertex,skyFragment];';
  for(const frequency of [false,true]){
    const original={},packed={};runInNewContext(source+probe,original);runInNewContext(shortenShaderLocals(source,frequency)+probe,packed);
    for(let i=0;i<4;i++)assert.equal(packed.shaders[i],renameShaderTokens(original.shaders[i],shaderNames(original.shaders[i],frequency)));
  }
});

test('property shortening coordinates indirect keys without renaming DOM IDs or APIs',async()=>{
  const source=`
    const state={handlePitch:.4,handlePitchRate:.2,leanZ:12,leanX:.1};
    const output=[];
    for(const [axis,rate] of [['handlePitch','handlePitchRate']])output.push(state[axis],state[rate]);
    for(const key of ['leanZ','leanX'])output.push(state[key]);
    output.push(document.getElementById('speed').textContent);
    globalThis.probe=()=>output;
  `;
  const packed=await compactScript(source,{shaders:false,metadata:false});
  assert.ok(!packed.includes('handlePitch')&&!packed.includes('leanZ'));
  assert.ok(packed.includes('getElementById')&&packed.includes('textContent'));
  const context={document:{getElementById:id=>{assert.equal(id,'speed');return {textContent:'42'};}}};
  runInNewContext(packed,context);
  assert.equal(JSON.stringify(context.probe()),JSON.stringify([.4,.2,12,.1,'42']));
  assert.throws(()=>markPropertyKeys('const key=axis+"Rate";'),/explicit property pair/);
  assert.throws(()=>markPropertyKeys('const key=`${axis}Rate`;'),/explicit property pair/);
});

test('production minification preserves physics, checkpoints, buoy poses, and generated geometry',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  // Compile the probe alongside the game so explicit field accesses follow the
  // production property names. Numeric arrays give a stable comparison format.
  const probe=`
    globalThis.probe=()=>{
      const output=[];
      const pose=r=>[r.x,r.y,r.z,r.vx,r.vy,r.vz,r.yaw,r.pitch,r.roll,r.speed,
        r.speedLevel,r.nextGate,r.passed,r.misses,r.lap,r.finishTime,
        r.rider.x,r.rider.y,r.rider.z,r.rider.pitch,r.rider.handlePitch,
        r.rider.pitchRate];
      for(const course of Object.values(COURSES)){
        const race=createRace(course.id);startRace(race);
        for(let i=0;i<900;i++){
          stepRace(race,aiInput(race.racers[0],race),1/60);
          if(i%90===0)output.push([race.time,race.worldTime,['title','countdown','racing','paused','finished','lost'].indexOf(race.phase),
            race.racers.map(pose),
            race.buoys.map(b=>[b.x,b.y,b.z,b.leanX,b.leanZ])]);
          race.events.length=0;
        }
        for(const r of race.racers)output.push(createRiderMesh(r).data);
        for(const r of race.racers){
          r.passed=0;r.nextGate=0;r.misses=0;r.finishTime=null;race.phase='racing';
          for(let i=0;i<course.gates.length*3+1;i++){
            const g=course.gates[r.nextGate],n=g.tangent,offset=i===2?g.side*(g.width+4):0;
            const old={x:g.x-n.x*3+n.z*offset,z:g.z-n.z*3-n.x*offset};
            r.x=g.x+n.x*3+n.z*offset;r.z=g.z+n.z*3-n.x*offset;
            race.time+=1;checkGate(r,old,race);output.push(pose(r));
          }
        }
        output.push([['title','countdown','racing','paused','finished','lost'].indexOf(race.phase),race.racers.map(r=>r.finishTime),race.events.map(e=>[['beep','go','splash','gate','speedLevel','impact','miss','lap','finish','lose'].indexOf(e.type),e.id,e.level])]);
      }
      for(const mesh of [createIslandMesh(),createLighthouseMesh(),createBeaconMesh(),createSeabedMesh(),createSeaGrassMesh(),
        ...[0,1,2,3].map(createCraftMesh)])output.push(mesh.data);
      return JSON.stringify(output);
    };`;
  const original={},packed={};
  runInNewContext(source+probe,original);
  const compiled=await compactScript(source+probe,{baked:true,locals:true,webgl:true,enums:true,frequency:true,inline:1});
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

test('scope reuse and numeric shortening preserve generated shader tokens',async()=>{
  const source=await readScripts(modules.filter(name=>name!=='main'));
  const probe='\nglobalThis.shaders=[vertexSource,fragmentSource,skyVertex,skyFragment];';
  const original={},packed={};
  runInNewContext(source+probe,original);
  runInNewContext(shortenShaderLocals(source,true,{scoped:true,numbers:true})+probe,packed);
  const normalize=s=>s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'').replace(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[^\s]/g,t=>/^(?:\d|\.\d)/.test(t)?String(Number(t)):t).replace(/\s+/g,'');
  for(let i=0;i<4;i++)assert.equal(normalize(packed.shaders[i]),normalize(renameShaderTokens(original.shaders[i],shaderNames(original.shaders[i],true,true))));
});
