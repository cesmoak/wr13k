import { LINE_CODES } from './racing-lines.js';
import { clamp, lerp, angleDelta, distance, DEVELOPMENT } from './math.js';
import { COURSES, LAPS, coursePoint, courseTangent, shoreRadius, shoreDistance, landforms } from './course.js';
import { resetBoat, stepBoat, MAX_SPEED_LEVEL, speedMultiplier, steeringAuthority } from './boat-physics.js';

import { createBuoys, stepBuoys, collideBuoys, collideRacers } from './interactions.js';

export function createRacer(id,course=COURSES.rocky) {
  const t = -.019 - Math.floor(id / 2) * .013;
  const p = coursePoint(t,course), tangent = courseTangent(t,course), lane = id % 2 ? 5 : -5;
  const racer = { id, x: p.x + tangent.z * lane, z: p.z - tangent.x * lane,
    yaw: Math.atan2(tangent.x, tangent.z), speed: 0, vx: 0, vz: 0,
    speedLevel: 1, impactCooldown: 0, misses: 0, passed: 0, nextGate: 0, lap: 1, finishTime: null };
  resetBoat(racer, 0);
  return racer;
}
export function createRace(mode='rocky') {
  const course=COURSES[mode]||COURSES.rocky;
  return { course,freePlay:course.freePlay,phase: 'title', racers: [0,1,2,3].map(id=>createRacer(id,course)), time: 0, worldTime: 0, countdown: 3.6, events: [], buoys: createBuoys(course) };
}
export function startRace(race) {
  Object.assign(race, createRace(race.course.id), { phase: race.freePlay?'racing':'countdown' });
}
function resetRacerSpeed(racer) {
  racer.speedLevel = 1;
  const speed = Math.hypot(racer.vx, racer.vz), limit = 50*speedMultiplier(racer);
  if (speed > limit) { racer.vx *= limit / speed; racer.vz *= limit / speed; }
  racer.speed = Math.hypot(racer.vx, racer.vz);
}
function clearRacingLine(a,b){
  const steps=Math.ceil(distance(a,b)/5);
  for(const land of landforms){
    if(Math.max(a.x,b.x)<land.x-land.rx*1.2||Math.min(a.x,b.x)>land.x+land.rx*1.2||
      Math.max(a.z,b.z)<land.z-land.rz*1.2||Math.min(a.z,b.z)>land.z+land.rz*1.2)continue;
    for(let i=0;i<=steps;i++){
      const t=steps?i/steps:0;
      if(shoreDistance(lerp(a.x,b.x,t),lerp(a.z,b.z,t),land)<5)return false;
    }
  }
  return true;
}
const racingLines=new WeakMap();
export function racingLine(course,id){
  let lines=racingLines.get(course);if(!lines){lines=[];racingLines.set(course,lines);}
  if(lines[id])return lines[id];
  const gates=course.gates,points=gates.map(g=>({x:g.x,z:g.z})),count=points.length;
  // Relax the line inside each safe buoy corridor, with clearance for the hull.
  for(let pass=0;pass<5;pass++)for(let i=0;i<count;i++){
    const g=gates[i],a=points[(i+count-1)%count],b=points[(i+1)%count];
    let best=Infinity,chosen=points[i];
    for(let j=-4;j<=4;j++){
      const offset=j*(g.width-8)/4,p={x:g.x+g.tangent.z*offset,z:g.z-g.tangent.x*offset};
      const bend=Math.abs(angleDelta(Math.atan2(b.x-p.x,b.z-p.z),Math.atan2(p.x-a.x,p.z-a.z)));
      const cost=distance(a,p)+distance(p,b)+bend*bend*12+Math.abs(offset-(id-2)*1.2)*.025;
      if(cost<best&&clearRacingLine(a,p)&&clearRacingLine(p,b)){best=cost;chosen=p;}
    }
    points[i]=chosen;
  }
  return lines[id]=points;
}
export function aiInput(r,race){
  if(race.freePlay&&r.id===0)return {};
  const course=race.freePlay?COURSES.main:race.course;
  const gates=course.gates,count=gates.length,i=r.nextGate;
  const [a,b,c]=[0,1,2].map(n=>{
    const index=(i+n)%count;
    if(DEVELOPMENT)return racingLine(course,r.id)[index];
    const g=gates[index],offset=(LINE_CODES[course.id][r.id].charCodeAt(index)-52)*(g.width-8)/4;
    return {x:g.x+g.tangent.z*offset,z:g.z-g.tangent.x*offset};
  });
  const gate=gates[i],d=distance(r,a);
  // Steer beyond the next buoy as it approaches, retaining the required crossing.
  const preview=clamp(r.speed*.45,8,26)*clamp(1-d/65,0,1),length=distance(a,b);
  let aim={x:lerp(a.x,b.x,preview/length),z:lerp(a.z,b.z,preview/length)};
  const n=gate.tangent,before=(r.x-gate.x)*n.x+(r.z-gate.z)*n.z;
  const along=(aim.x-r.x)*n.x+(aim.z-r.z)*n.z,t=-before/along;
  const across=(lerp(r.x,aim.x,t)-gate.x)*n.z-(lerp(r.z,aim.z,t)-gate.z)*n.x;
  if(along<=0||t<0||(i===0?Math.abs(across):across*gate.side)>gate.width-4||!clearRacingLine(r,aim))aim=a;
  const velocityAlong=r.vx*n.x+r.vz*n.z,arrival=-before/velocityAlong;
  const driftAcross=(r.x+r.vx*arrival-gate.x)*n.z-(r.z+r.vz*arrival-gate.z)*n.x;
  const correcting=arrival>0&&arrival<1.4&&(i===0?Math.abs(driftAcross):driftAcross*gate.side)>gate.width-4;
  if(correcting)aim={x:gate.x-n.z*gate.side*3,z:gate.z+n.x*gate.side*3};
  const heading=Math.atan2(aim.x-r.x,aim.z-r.z),turn=angleDelta(heading,r.yaw),pace=speedMultiplier(r);
  const exit=Math.atan2(b.x-a.x,b.z-a.z),later=Math.atan2(c.x-b.x,c.z-b.z);
  const corner=Math.abs(angleDelta(exit,Math.atan2(a.x-r.x,a.z-r.z)));
  const nextCorner=Math.abs(angleDelta(later,exit));
  const rank=Math.max(0,r.id-1);
  const cornerSpeed=angle=>(47+race.course.aiSkill*2-rank) / (1+angle*.6)*pace;
  const target=Math.min(correcting?22*pace:Infinity,50*pace/(1+Math.abs(turn)*.8),
    (43+race.course.aiSkill*4-rank)/(1+corner*.55*clamp((100-d)/75,0,1)+Math.abs(turn)*.5)*pace,
    Math.sqrt(cornerSpeed(nextCorner)**2+44*Math.max(0,d+length-12)));
  const brake=r.speed>target+3;
  const gain=clamp(2*r.speed/Math.max(8,distance(r,aim))/steeringAuthority(r.speed,brake,r.id),2.1,6);
  return {throttle:r.speed<target?1:0,brake,steer:clamp(turn*gain,-1,1)};
}
export function checkGate(racer, old, race) {
  if(race.freePlay)return;
  const gates=race.course.gates,GATE_COUNT=gates.length;
  if (racer.finishTime !== null || race.phase === 'lost') return;
  const gate = gates[racer.nextGate], n = gate.tangent;
  const before = (old.x - gate.x) * n.x + (old.z - gate.z) * n.z;
  const after = (racer.x - gate.x) * n.x + (racer.z - gate.z) * n.z;
  if (before >= 0 || after < 0) return;
  const t = -before / (after - before);
  const x = lerp(old.x, racer.x, t) - gate.x, z = lerp(old.z, racer.z, t) - gate.z;
  const across = x * n.z - z * n.x;
  // Single buoys constrain only the marked side; the start line has two buoys.
  const missed = (racer.nextGate === 0 ? Math.abs(across) : across * gate.side) > gate.width;
  const crossed = racer.nextGate;
  // Both outcomes consume this checkpoint. A miss never asks for a U-turn.
  racer.passed++;
  if (missed) {
    racer.misses++;
    resetRacerSpeed(racer);
    race.events.push({ type: 'miss', id: racer.id, ...(DEVELOPMENT?{gate:crossed,misses:racer.misses}:{}) });
  } else if (racer.speedLevel < MAX_SPEED_LEVEL) {
    racer.speedLevel++;
    race.events.push({ type: 'speedLevel', id: racer.id, level: racer.speedLevel });
  }
  racer.nextGate = (crossed + 1) % GATE_COUNT;
  racer.lap = Math.min(LAPS, Math.floor((racer.passed - 1) / GATE_COUNT) + 1);
  if (!missed) race.events.push({ type: 'gate', id: racer.id, ...(DEVELOPMENT?{gate:crossed}:{}) });
  if (racer.id === 0 && racer.misses >= 5 && !race.attract) {
    race.phase = 'lost';race.events.push({ type: 'lose', id: 0 });return;
  }
  if (racer.passed >= LAPS * GATE_COUNT + 1) {
    racer.finishTime = race.time;
    race.events.push({ type: 'finish', id: racer.id });
    if (racer.id === 0 && !race.attract) race.phase = 'finished';
  } else if (crossed === 0 && racer.passed > 1) race.events.push({ type: 'lap', id: racer.id });
}

export function updateRacer(racer, input, dt, race, deferChecks = false) {
  const old = DEVELOPMENT?{ x: racer.x, z: racer.z }:null;
  racer.impactCooldown = Math.max(0,racer.impactCooldown-dt);
  stepBoat(racer, input, dt, race.worldTime);
  racer.splashCooldown = Math.max(0,racer.splashCooldown-dt);
  if(racer.waterImpact>1.5&&racer.splashCooldown===0&&racer.finishTime===null){
    race.events.push({type:'splash',id:racer.id,strength:racer.waterImpact});
    racer.splashCooldown=.22;
  }

  // All shores use the same waterline contact margin.
  for (const island of landforms) {
    const x = racer.x - island.x, z = racer.z - island.z;
    const a = Math.atan2(z / island.rz, x / island.rx);
    const boundary = shoreRadius(a)*.915, radius = Math.hypot(x / island.rx, z / island.rz);
    if (radius < boundary + .025) {
      racer.x = island.x + Math.cos(a) * island.rx * (boundary + .028);
      racer.z = island.z + Math.sin(a) * island.rz * (boundary + .028);
      racer.vx *= .65; racer.vz *= .65; racer.speed *= .94;
      if (racer.id === 0) resetRacerSpeed(racer);
    }
  }

  if(DEVELOPMENT&&!deferChecks){collideBuoys(race,racer);updateProgress(racer,old,race);}
}
function updateProgress(racer,old,race){
  if(race.freePlay){
    // Riders cruise the main loop indefinitely using invisible waypoints.
    // Advancing their steering target never awards race progress or speed levels.
    if(racer.id>0){
      const gates=COURSES.main.gates,gate=gates[racer.nextGate],n=gate.tangent;
      const before=(old.x-gate.x)*n.x+(old.z-gate.z)*n.z;
      const after=(racer.x-gate.x)*n.x+(racer.z-gate.z)*n.z;
      if(before<0&&after>=0)racer.nextGate=(racer.nextGate+1)%gates.length;
    }
    return;
  }
  checkGate(racer, old, race);
}

export function standings(race) {
  const gates=race.course.gates;
  if(race.freePlay)return [...race.racers];
  return [...race.racers].sort((a, b) => {
    if (a.finishTime !== null || b.finishTime !== null) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    return b.passed - a.passed || distance(a, gates[a.nextGate]) - distance(b, gates[b.nextGate]);
  });
}
export function stepRace(race, input, dt) {
  if (race.phase === 'paused' || race.phase === 'finished' || race.phase === 'lost') return;
  race.worldTime += dt;
  stepBuoys(race,dt);
  if (race.phase === 'title' || race.phase === 'countdown') {
    for (const racer of race.racers) stepBoat(racer, {}, dt, race.worldTime, undefined, true);
    if(race.phase==='title')return;
    const previous = Math.ceil(race.countdown);
    race.countdown -= dt;
    if (Math.ceil(race.countdown) !== previous) race.events.push({ type: 'beep' });
    if (race.countdown <= 0) { race.phase = 'racing'; race.events.push({ type: 'go' }); }
    return;
  }
  if(!race.freePlay)race.time += dt;
  const old=race.racers.map(r=>({x:r.x,z:r.z}));
  const controls=race.racers.map(r=>r.finishTime!==null?{}:r.id===0?input:aiInput(r,race));
  race.racers.forEach((r,i)=>updateRacer(r,controls[i],dt,race,true));
  collideRacers(race);
  for(const r of race.racers)collideBuoys(race,r);
  race.racers.forEach((r,i)=>updateProgress(r,old[i],race));
}
