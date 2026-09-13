import test from 'node:test';
import assert from 'node:assert/strict';
import { coursePoint, COURSES, RAINBOW_COLORS } from '../src/course.js';
import { Renderer, courseLighting, projectSkyDirection, easeTitleLighting, flareAlignment } from '../src/renderer.js';
import { lookAt, multiply, perspective } from '../src/math.js';
import { rgb } from '../src/mesh.js';

test('main stays in daylight, rocky stays at night, and reverse fades from sunset to dusk',()=>{
  for(const [id,label,night] of [['main','DAY',0],['rocky','NIGHT',1]]){
    const course=COURSES[id];
    for(const lap of [1,2,3])for(const t of [0,.5,.9999]){
      const p=coursePoint(t,course),l=courseLighting(p.x,p.z,'auto',{lap},course,180);
      assert.equal(l.label,label);assert.equal(l.night,night);
    }
  }
  const course=COURSES.reverse;let last=1;
  for(const lap of [1,2,3])for(const t of [0,.25,.5,.75,.9999]){
    const p=coursePoint(t,course),l=courseLighting(p.x,p.z,'auto',{lap},course);
    assert.ok(l.altitude<=last+.001);last=l.altitude;
  }
  const p=coursePoint(0,course);
  assert.equal(courseLighting(p.x,p.z,'auto',{lap:1,passed:0},course).label,'SUNSET');
  const finish=courseLighting(p.x,p.z,'auto',{lap:3,passed:49,finishTime:130},course);
  assert.equal(finish.label,'DUSK');assert.ok(Math.abs(finish.altitude+.2)<1e-12);
});

test('reverse sunset remains continuous over lap seams and manual lighting overrides all courses',()=>{
  const course=COURSES.reverse,before=coursePoint(.9999,course),after=coursePoint(.0001,course);
  for(const lap of [1,2]){
    const a=courseLighting(before.x,before.z,'auto',{lap},course);
    const b=courseLighting(after.x,after.z,'auto',{lap:lap+1},course);
    assert.ok(Math.abs(a.altitude-b.altitude)<.001);
  }
  assert.equal(courseLighting(after.x,after.z,'auto',{lap:2,passed:32,nextGate:0},course).progress,1);
  assert.equal(courseLighting(before.x,before.z,'auto',{lap:3,passed:33,nextGate:1},course).progress,0);
  for(const c of Object.values(COURSES)){
    assert.equal(courseLighting(0,0,'night',{},c,60).night,1);
    assert.equal(courseLighting(0,0,'day',{},c,120).night,0);
  }
});

test('free play cycles through day, sunset, night and sunrise by time even when stationary',()=>{
  const course=COURSES.free;
  for(const [time,label] of [[0,'DAY'],[60,'SUNSET'],[120,'NIGHT'],[180,'SUNRISE'],[240,'DAY']]){
    const a=courseLighting(0,0,'auto',{passed:0},course,time);
    const b=courseLighting(300,-200,'auto',{passed:0},course,time);
    assert.equal(a.label,label);assert.equal(a.altitude,b.altitude);
    assert.deepEqual(a.sunDirection,b.sunDirection);
  }
  const a=courseLighting(0,0,'auto',{},course,239.999),b=courseLighting(0,0,'auto',{},course,240.001);
  assert.ok(Math.hypot(...a.sunDirection.map((v,i)=>v-b.sunDirection[i]))<.001);
});

test('title lighting rotates smoothly between course settings without a sudden sun jump',()=>{
  let current=courseLighting(0,0,'auto',{},COURSES.main);
  for(const course of [COURSES.rocky,COURSES.sunrise,COURSES.reverse,COURSES.main]){
    const target=courseLighting(0,0,'auto',{},course);
    const held=easeTitleLighting(current,target,0);
    assert.ok(Math.abs(held.altitude-current.altitude)<1e-12);
    for(let i=0;i<360;i++){
      const next=easeTitleLighting(current,target,1/60);
      assert.ok(Math.hypot(...next.sunDirection.map((v,j)=>v-current.sunDirection[j]))<.08);
      assert.ok(Math.abs(Math.hypot(...next.sunDirection)-1)<1e-12);
      current=next;
    }
    assert.ok(Math.hypot(...current.sunDirection.map((v,j)=>v-target.sunDirection[j]))<.002);
    assert.ok(Math.abs(current.altitude-target.altitude)<.001);
  }
});
test('lens flare is concentrated near straight ahead and fades by viewing angle',()=>{
  for(const aspect of [1.2,16/9,21/9]){
    const strength=degrees=>flareAlignment({x:Math.tan(degrees*Math.PI/180)/Math.tan(.99/2)/aspect,y:0},aspect);
    assert.equal(strength(0),1);
    assert.ok(strength(10)>.4&&strength(10)<.6);
    assert.ok(strength(20)<.1&&strength(30)<.005);
  }
});
test('distant sky follows camera rotation and pitch, without translation parallax',()=>{
  const view=(eye,target)=>multiply(perspective(.99,1.5,.25,1300),lookAt(eye,target));
  const direction=[0,.1,1],forward=view([0,0,0],[0,0,1]);
  const initial=projectSkyDirection(forward,direction);
  const moved=projectSkyDirection(view([73,8,-49],[73,8,-48]),direction);
  assert.deepEqual(moved,initial);
  const turned=projectSkyDirection(view([0,0,0],[.5,0,1]),direction);
  assert.ok(Math.abs(turned.x-initial.x)>.5);
  const pitched=projectSkyDirection(view([0,0,0],[0,.3,1]),direction);
  assert.ok(pitched.y<initial.y-.4);
  assert.equal(projectSkyDirection(view([0,0,0],[0,0,-1]),direction),null);
});

test('sun directions stay normalized across course profiles and the free-play cycle',()=>{
  for(const course of Object.values(COURSES))for(const lap of [1,2,3])for(const t of [0,.25,.5,.75,.9999]){
    const p=coursePoint(t,course),l=courseLighting(p.x,p.z,'auto',{lap},course,t*240);
    assert.ok(Math.abs(Math.hypot(...l.sunDirection)-1)<1e-12);
  }
});

function emit(speedLevel,boost=1){
  const renderer={particleClock:0,particles:[],wakeHeads:[],rainbowColors:RAINBOW_COLORS.map(rgb),random:()=>.5};
  const r={id:0,x:0,y:0,z:0,yaw:0,speed:48,speedLevel,boost,airborne:false};
  const race={worldTime:1,phase:'racing',racers:[r]};
  Renderer.prototype.updateEffects.call(renderer,race,.07);
  r.z+=2;
  Renderer.prototype.updateEffects.call(renderer,race,.07);
  return renderer.particles;
}

test('only spray turns rainbow at maximum level; wakes remain broken white foam',()=>{
  const white=p=>p.color.every((v,i)=>v===[.82,.94,.9][i]);
  for(const charge of [0,.5,.999,1])for(const level of [1,2,3,4,5]){
    const particles=emit(level,charge),spray=particles.filter(p=>!p.wake),foam=particles.filter(p=>p.wake);
    assert.ok(spray.length>0&&foam.length>0);
    assert.ok(particles.every(p=>!p.corners),'no level emits ribbon quads');
    assert.ok(foam.every(p=>p.foam&&white(p)&&Math.hypot(p.vx,p.vz)>0));
    assert.ok(foam.some(p=>p.ripple)&&foam.some(p=>!p.ripple));
    assert.ok(spray.every(p=>level===5?!white(p):white(p)));
  }
});
