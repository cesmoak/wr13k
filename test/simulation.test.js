import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace,startRace,stepRace,aiInput,checkGate,standings,updateRacer } from '../src/simulation.js';
import { COURSES,gates,GATE_COUNT,LAPS,coursePoint,waveHeight,islands,shoreRadius,courseSamples,GATE_WIDTH,courseBounds,offshoreExposure,sampleWater,LIGHTHOUSE } from '../src/course.js';

const dt=1/60;
test('water landings emit one impact-scaled splash and respect pause and restart',()=>{
  const drop=height=>{
    const race=createRace('main');startRace(race);race.phase='racing';race.racers.length=1;const r=race.racers[0];
    Object.assign(r,{x:-350,z:350,y:height,vy:-2,vx:0,vz:0,airborne:true});
    let contactTime;
    for(let i=0;i<180;i++){
      stepRace(race,{},dt);
      if(race.events.some(e=>e.type==='splash')){contactTime=race.worldTime;break;}
    }
    assert.ok(contactTime,'falling hull should trigger a splash');
    const events=race.events.filter(e=>e.type==='splash');
    assert.equal(events.length,1);assert.equal(events[0].id,0);
    for(let i=0;i<10;i++)stepRace(race,{},dt);
    assert.equal(race.events.filter(e=>e.type==='splash').length,1,'contact chatter must not retrigger the splash');
    race.phase='paused';const count=race.events.length;stepRace(race,{},1);
    assert.equal(race.events.length,count);
    startRace(race);assert.equal(race.racers[0].splashCooldown,0);assert.equal(race.racers[0].waterImpact,0);
    return events[0].strength;
  };
  assert.ok(drop(8)>drop(2)+3,'harder landings should produce stronger splashes');
});
function racing(){const race=createRace();startRace(race);for(let i=0;i<220;i++)stepRace(race,{},dt);return race;}
function cross(race,index,offset=0,reverse=false){
  const r=race.racers[0],g=gates[index],s=reverse?-1:1;
  const old={x:g.x-g.tangent.x*3*s+g.tangent.z*offset,z:g.z-g.tangent.z*3*s-g.tangent.x*offset};
  r.x=g.x+g.tangent.x*3*s+g.tangent.z*offset;r.z=g.z+g.tangent.z*3*s-g.tangent.x*offset;
  checkGate(r,old,race);
}
test('countdown holds racers and transitions to race',()=>{
  const race=createRace();startRace(race);const x=race.racers[0].x;
  stepRace(race,{throttle:1},1);assert.equal(race.phase,'countdown');assert.equal(race.racers[0].x,x);
  for(let i=0;i<160;i++)stepRace(race,{},dt);assert.equal(race.phase,'racing');
});
test('ordered gates, crossing width, direction, three laps, and finish',()=>{
  const race=racing(),r=race.racers[0];cross(race,2);assert.equal(r.passed,0);
  cross(race,0,0,true);assert.equal(r.passed,0);
  for(let i=0;i<LAPS*GATE_COUNT+1;i++){race.time+=1;cross(race,i%GATE_COUNT);}
  assert.equal(r.passed,LAPS*GATE_COUNT+1);assert.equal(r.lap,3);assert.equal(race.phase,'finished');assert.equal(r.finishTime,race.time);
  cross(race,1);assert.equal(r.passed,LAPS*GATE_COUNT+1);
});
test('speed bonus is automatic, ignores the old boost input, and braking reduces speed',()=>{
  const a=createRace('main'),b=createRace('main');
  for(const race of [a,b]){
    startRace(race);race.phase='racing';race.racers.length=1;
    Object.assign(race.racers[0],{x:-350,z:350,yaw:0});
  }
  a.racers[0].speedLevel=b.racers[0].speedLevel=5;
  for(let i=0;i<120;i++){
    stepRace(a,{throttle:1},dt);stepRace(b,{throttle:1,boost:true},dt);
  }
  assert.deepEqual(a,b,'No consumable boost or activation path remains');
  assert.ok(a.racers[0].speed>35);
  const speed=a.racers[0].speed;
  for(let i=0;i<30;i++)stepRace(a,{brake:true},dt);
  assert.ok(a.racers[0].speed<speed);
});
test('pause freezes time and racers; restart restores initial state',()=>{
  const race=racing();race.phase='paused';const before=JSON.stringify(race);stepRace(race,{throttle:1},dt);assert.equal(JSON.stringify(race),before);
  race.racers[0].passed=7;race.racers[0].speedLevel=5;startRace(race);assert.equal(race.racers[0].passed,0);assert.equal(race.racers[0].speedLevel,1);assert.equal(race.time,0);
});
test('going off course never teleports the racer or invents buoy misses',()=>{
  const race=racing(),r=race.racers[0];cross(race,0);cross(race,1);const passed=r.passed;
  Object.assign(r,{x:900,z:900,vx:0,vz:0,speed:0});
  for(let i=0;i<600;i++)updateRacer(r,{},dt,race);
  assert.equal(r.passed,passed);assert.equal(r.nextGate,2);assert.ok(Math.hypot(r.x,r.z)>1000);
  assert.equal(r.misses,0);assert.ok(!race.events.some(e=>e.type==='recover'));
});
test('shore and racer collisions remain finite and separate craft',()=>{
  const race=racing(),r=race.racers[0];r.x=80;r.z=0;r.speed=20;r.speedLevel=5;updateRacer(r,{throttle:1},dt,race);
  assert.ok(r.x>125);assert.ok(r.speed<21);
  assert.equal(r.speedLevel,1);assert.equal(r.misses,0);
  race.racers[1].x=r.x+1;race.racers[1].z=r.z;stepRace(race,{},dt);
  assert.ok(Math.hypot(r.x-race.racers[1].x,r.z-race.racers[1].z)>2.5);
});
test('rank respects checkpoints before distance and completed finish times',()=>{
  const race=racing();race.racers[2].passed=5;race.racers[1].passed=4;
  assert.equal(standings(race)[0].id,2);race.racers[1].finishTime=100;assert.equal(standings(race)[0].id,1);
});
test('holding throttle into shore stays local without automatic recovery',()=>{
  const race=racing(),r=race.racers[0];r.x=0;r.z=-87;r.yaw=0;r.speed=15;
  for(let i=0;i<360;i++)updateRacer(r,{throttle:1},dt,race);
  assert.ok(!race.events.some(e=>e.type==='recover'));assert.ok(Math.hypot(r.x,r.z+87)<50);
});
test('finished riders coast without interfering or recovering',()=>{
  const race=racing(),r=race.racers[1];r.finishTime=1;r.speed=30;r.x=800;r.z=800;
  for(let i=0;i<360;i++)stepRace(race,{},dt);
  assert.ok(r.speed<3);assert.equal(r.finishTime,1);assert.ok(!race.events.some(e=>e.type==='recover'&&e.id===1));
});
test('all AI drivers finish three laps without recovery or invalid physics',()=>{
  const race=racing();let recoveries=0,maxSpeed=0,maxAirGap=0;
  // Drive the player with the same controller; continue simulation after its finish.
  for(let i=0;i<60*240;i++){
    if(race.phase==='finished')race.phase='racing';
    stepRace(race,aiInput(race.racers[0],race),dt);
    maxSpeed=Math.max(maxSpeed,race.racers[0].speed);
    const player=race.racers[0];
    if(player.airborne)maxAirGap=Math.max(maxAirGap,player.y-waveHeight(player.x,player.z,race.worldTime)-.48);
    recoveries+=race.events.filter(e=>e.type==='recover').length;race.events.length=0;
    for(const r of race.racers)assert.ok(Number.isFinite(r.x+r.y+r.z));
    if(race.racers.every(r=>r.finishTime!==null))break;
  }
  assert.ok(race.racers.every(r=>r.finishTime!==null),JSON.stringify(race.racers.map(r=>({id:r.id,passed:r.passed,next:r.nextGate,x:r.x,z:r.z}))));
  assert.ok(maxSpeed>50,'AI target speeds follow the automatic buoy bonus');
  assert.ok(maxAirGap>1&&maxAirGap<6,`Rough-water jumps stay small without pinning the craft to waves: ${maxAirGap}`);
  assert.ok(race.racers[0].misses===0&&race.racers.slice(1).every(r=>r.misses<=2),'Player clears the course and opponents only rarely miss');
  assert.equal(recoveries,0);assert.ok(race.time>90&&race.time<180,`Shared look-ahead controller completes the offshore course promptly: ${race.time}`);
});
test('braking tightens turns and excess collision speed decays smoothly',()=>{
  const samples=[false,true].map(brake=>{
    const race=racing(),r=race.racers[0];Object.assign(r,{x:0,z:-400,yaw:0,speed:50,vx:0,vz:50,finishTime:1});
    for(let i=0;i<30;i++){race.worldTime+=dt;updateRacer(r,{throttle:1,steer:1,brake},dt,race);}
    return r;
  });
  assert.ok(samples[1].yaw>samples[0].yaw);assert.ok(samples[1].speed<samples[0].speed);
  const race=racing(),r=race.racers[0];Object.assign(r,{x:0,z:-400,yaw:0,speed:68,vx:0,vz:68,finishTime:1});
  updateRacer(r,{throttle:1},dt,race);assert.ok(r.speed>67&&r.speed<68);
});

test('shoreline and offshore circuit clears all three islands and varies buoy spacing and passing side',()=>{
  assert.equal(islands.length,3);
  for(const p of [...courseSamples,...gates.map(g=>g.buoy)])for(const island of islands){
    const x=(p.x-island.x)/island.rx,z=(p.z-island.z)/island.rz;
    assert.ok(Math.hypot(x,z)>shoreRadius(Math.atan2(z,x))+ .025,'Course markers remain offshore');
  }
  const spacing=gates.slice(1).map((g,i)=>Math.hypot(g.x-gates[i].x,g.z-gates[i].z));
  assert.ok(Math.max(...spacing)-Math.min(...spacing)>45);
  assert.equal(GATE_COUNT,18);
  assert.ok([...spacing].sort((a,b)=>a-b)[Math.floor(spacing.length/2)]>75,'Typical buoy spacing is roughly doubled');
  assert.ok(spacing[0]>110,'Opening run-up remains longer than the slalom');
  for(let i=1;i<gates.length;i++){
    const race=racing(),r=race.racers[0],g=gates[i];r.nextGate=i;
    assert.equal(g.side,-gates[i-1].side);
    if(g.slalom){
      // Nominal offshore slalom stations, before their lateral displacement.
      const station={1:1.35,2:2.4,12:12.25,13:13.05}[i];
      const nominal=coursePoint(station/18),offset=(nominal.x-g.x)*g.tangent.z-(nominal.z-g.z)*g.tangent.x;
      cross(race,i,offset);assert.equal(r.misses,1,'Middle line misses a slalom buoy');r.nextGate=i;
    }
    const misses=r.misses;cross(race,i,g.side*(GATE_WIDTH+3));assert.equal(r.misses,misses+1,'Wrong side counts as a miss');r.nextGate=i;
    cross(race,i);assert.equal(r.nextGate,(i+1)%GATE_COUNT);
  }
});
test('flat main island allows skimming beside the beach and blocks at the waterline',()=>{
  const island=islands[0];
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,c=Math.cos(a),s=Math.sin(a);
    // Interpolate the rendered sand slope from y=-2 to y=1.8 at sea level.
    const waterline=shoreRadius(a)*(1+(.89-1)*2/3.8);
    const extent=Math.hypot(c*island.rx,s*island.rz);
    const point=radius=>({x:island.x+c*island.rx*radius,z:island.z+s*island.rz*radius});
    for(const inland of [false,true]){
      const race=racing(),r=race.racers[0];
      const p=point(waterline+(inland?-2:.5)/extent);
      Object.assign(r,p,{speedLevel:5,vx:0,vz:0,speed:0});
      updateRacer(r,{},dt,race);
      if(inland){
        const radius=Math.hypot((r.x-island.x)/island.rx,(r.z-island.z)/island.rz);
        assert.ok(Math.abs(waterline-radius)*extent<1,'Land contact stops the hull at the beach waterline');
        assert.equal(r.speedLevel,1,'Contact with the beach still resets speed');
      }else{
        assert.ok(Math.hypot(r.x-p.x,r.z-p.z)<.25,'Skimming the beach edge does not push the hull away');
        assert.equal(r.speedLevel,5,'Riding beside the beach does not trigger land contact');
      }
    }
  }
});

test('steep green island uses the shared shoreline collision margin',()=>{
  const race=racing(),r=race.racers[0],island=islands[1];
  Object.assign(r,{x:island.x+island.rx*.6,z:island.z,vx:0,vz:0,speed:0,speedLevel:5});
  updateRacer(r,{},dt,race);
  assert.ok(Math.abs(r.x-island.x-island.rx*(shoreRadius(0)*.915+.028))<.1,'The steep island uses the same shore margin as the flat island');
  assert.equal(r.speedLevel,1);
});

test('offshore checkpoints take racers around a distinct rocky island and back',()=>{
  const rock=islands[2],sea=gates.filter(g=>g.offshore);
  assert.ok(rock.rocky&&rock.rx<islands[1].rx*.6);
  assert.ok(Math.hypot(rock.x-islands[1].x,rock.z-islands[1].z)>220);
  assert.ok(sea.some(g=>g.x<rock.x-rock.rx)&&sea.some(g=>g.x>rock.x+rock.rx));
  assert.ok(sea.some(g=>g.z<rock.z-rock.rz)&&sea.some(g=>g.z>rock.z+rock.rz));
  assert.ok(gates[sea.at(-1).index+1].channel,'Return leg rejoins the original channel');
  const race=racing(),r=race.racers[0];
  Object.assign(r,{x:rock.x+rock.rx*.6,z:rock.z,yaw:0});updateRacer(r,{},dt,race);
  assert.ok(Math.abs(r.x-rock.x-rock.rx*(shoreRadius(0)*.915+.028))<.1,'The rocky shoreline uses the shared collision margin');
});

test('exposed offshore water is taller and choppier than the sheltered channel',()=>{
  assert.equal(offshoreExposure(175,5),0);
  assert.equal(offshoreExposure(330,-280),1);
  const roughness=(x,z)=>{
    let height=0,slope=0;
    for(let i=0;i<400;i++){
      const s=sampleWater(x,z,i*.1);height+=s.height*s.height;
      slope+=(s.nx*s.nx+s.nz*s.nz)/(s.ny*s.ny);
    }
    return {height:Math.sqrt(height/400),slope:Math.sqrt(slope/400)};
  };
  const sheltered=roughness(175,5),offshore=roughness(330,-280);
  assert.ok(offshore.height>sheltered.height*1.4);
  assert.ok(offshore.slope>sheltered.slope*2);
  for(let z=-450;z<0;z++)assert.ok(Math.abs(offshoreExposure(310,z)-offshoreExposure(310,z+.1))<.005,'No abrupt boundary in wave exposure');
});

test('every rider earns buoy levels, resets on a miss, and can rebuild the bonus',()=>{
  const race=racing();race.events.length=0;
  for(const r of race.racers){
    const pass=(miss=false)=>{
      const g=race.course.gates[r.nextGate],n=g.tangent,offset=miss?g.side*(g.width+5):0;
      const old={x:g.x-n.x*3+n.z*offset,z:g.z-n.z*3-n.x*offset};
      r.x=g.x+n.x*3+n.z*offset;r.z=g.z+n.z*3-n.x*offset;checkGate(r,old,race);
    };
    for(let i=0;i<6;i++){pass();assert.equal(r.speedLevel,Math.min(5,i+2));}
    assert.equal(race.events.filter(e=>e.type==='speedLevel'&&e.id===r.id&&e.level===5).length,1);
    Object.assign(r,{vx:0,vz:120,speed:120,vy:4});
    pass(true);assert.equal(r.speedLevel,1);assert.equal(r.misses,1);
    assert.ok(Math.abs(r.speed-50*(r.id===0?1:1.15))<1e-9);
    assert.equal(r.vy,4);
    pass();assert.equal(r.speedLevel,2);assert.equal(r.misses,1);
  }
  startRace(race);assert.ok(race.racers.every(r=>r.speedLevel===1&&r.misses===0));
});

test('clean buoys build player speed to level five; missed buoys reset immediately',()=>{
  const race=racing(),r=race.racers[0];
  assert.equal(r.speedLevel,1);
  for(let i=0;i<6;i++){
    cross(race,i);assert.equal(r.speedLevel,Math.min(5,i+2));
  }
  assert.equal(race.events.filter(e=>e.type==='speedLevel'&&e.level===5).length,1,'maximum cue triggers once per streak');
  assert.ok(race.racers.slice(1).every(ai=>ai.speedLevel===1));
  const passed=r.passed,next=r.nextGate;
  Object.assign(r,{speed:64,vx:0,vz:64});
  cross(race,next,gates[next].side*(GATE_WIDTH+3));
  assert.equal(r.speedLevel,1);assert.equal(r.speed,50);assert.equal(Math.hypot(r.vx,r.vz),50);
  assert.equal(r.passed,passed+1);assert.equal(r.nextGate,(next+1)%GATE_COUNT);
  const misses=race.events.filter(e=>e.type==='miss').length;
  cross(race,next,gates[next].side*(GATE_WIDTH+3));assert.equal(race.events.filter(e=>e.type==='miss').length,misses);
  cross(race,next,0,true);assert.equal(r.speedLevel,1,'Backward crossings cannot farm levels');
  cross(race,r.nextGate);assert.equal(r.speedLevel,2,'The next clean buoy rebuilds speed');
  r.speedLevel=5;startRace(race);assert.equal(race.racers[0].speedLevel,1);
});
test('channel runs between both islands and full checkpoint corridors remain navigable',()=>{
  for(const g of gates)for(let lane=-GATE_WIDTH;lane<=GATE_WIDTH;lane++)for(const island of islands){
    const x=(g.x+g.tangent.z*lane-island.x)/island.rx,z=(g.z-g.tangent.x*lane-island.z)/island.rz;
    const clearance=(Math.hypot(x,z)-shoreRadius(Math.atan2(z,x)))*Math.min(island.rx,island.rz);
    assert.ok(clearance>4,`Gate ${g.index}, offset ${lane}: ${clearance}`);
  }
  const shoreline=islands.map(island=>Array.from({length:360},(_,i)=>{
    const a=i/360*Math.PI*2,r=shoreRadius(a);
    return {x:island.x+Math.cos(a)*island.rx*r,z:island.z+Math.sin(a)*island.rz*r};
  }));
  const shoreDistance=(p,edge)=>Math.min(...edge.map(q=>Math.hypot(p.x-q.x,p.z-q.z)));
  const clearance=courseSamples.filter(p=>p.z>-120).map(p=>Math.min(...shoreline.map(edge=>shoreDistance(p,edge))));
  assert.ok(Math.max(...clearance)<60,'The original coastal stretch stays near a shoreline');
  const channel=gates.filter(g=>g.channel&&Math.abs(g.z)<35);
  assert.ok(channel.length>=1,'A checkpoint traverses the central channel');
  for(const gate of channel){
    assert.ok(gate.x>islands[0].x+islands[0].rx&&gate.x<islands[1].x-islands[1].rx);
    for(const edge of shoreline.slice(0,2))assert.ok(shoreDistance(gate,edge)<40,'Land is close on both sides');
  }
  for(const edge of shoreline)for(const p of edge){
    assert.ok(p.x>courseBounds.minX&&p.x<courseBounds.maxX&&p.z>courseBounds.minZ&&p.z<courseBounds.maxZ,'Minimap contains all three islands');
  }
});


test('five total misses lose the race; each miss advances once without moving the craft',()=>{
  const race=racing(),r=race.racers[0];
  for(let miss=1;miss<=5;miss++){
    const index=r.nextGate,g=gates[index],offset=g.side*(GATE_WIDTH+8);
    cross(race,index,offset);
    assert.equal(r.misses,miss);assert.equal(r.nextGate,(index+1)%GATE_COUNT);
    assert.equal(r.x,g.x+g.tangent.x*3+g.tangent.z*offset);
    assert.equal(r.z,g.z+g.tangent.z*3-g.tangent.x*offset);
    assert.equal(r.speedLevel,1);
    if(miss<5){assert.equal(race.phase,'racing');cross(race,r.nextGate);assert.equal(r.misses,miss,'Clean buoys do not erase misses');}
  }
  assert.equal(race.phase,'lost');assert.equal(r.finishTime,null);assert.ok(race.racers.every(r=>r.finishTime===null));
  assert.equal(race.events.filter(e=>e.type==='lose').length,1);
  const snapshot=JSON.stringify(race);stepRace(race,{throttle:1},1);assert.equal(JSON.stringify(race),snapshot);
  startRace(race);assert.equal(race.racers[0].misses,0);assert.equal(race.phase,'countdown');
});
test('fifth miss at the finish line is a loss, while four misses can still finish',()=>{
  for(const misses of [3,4]){
    const race=racing(),r=race.racers[0];Object.assign(r,{passed:LAPS*GATE_COUNT,nextGate:0,misses});
    cross(race,0,GATE_WIDTH+4);
    assert.equal(race.phase,misses===4?'lost':'finished');
    assert.equal(r.finishTime===null,misses===4);
  }
});


test('single buoys accept wide correct-side passes and reject the wrong side on every course',()=>{
  for(const course of Object.values(COURSES))for(const g of course.gates){
    for(const direction of [-1,1]){
      const race=createRace(course.id),r=race.racers[0],n=g.tangent;
      race.phase='racing';r.nextGate=g.index;
      const offset=direction*g.side*(g.width+80);
      const old={x:g.x-n.x*3+n.z*offset,z:g.z-n.z*3-n.x*offset};
      Object.assign(r,{x:g.x+n.x*3+n.z*offset,z:g.z+n.z*3-n.x*offset});
      checkGate(r,old,race);
      const missed=g.index===0||direction===1;
      assert.equal(r.misses,Number(missed),`${course.id} buoy ${g.index}, side ${direction}`);
      assert.equal(r.speedLevel,missed?1:2);
      assert.equal(r.nextGate,(g.index+1)%course.gates.length);
    }
  }
});
