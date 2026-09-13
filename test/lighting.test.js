import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, RAINBOW_COLORS } from '../src/course.js';
import { Renderer, courseLighting, easeLighting } from '../src/renderer.js';
import { rgb } from '../src/mesh.js';

test('checkpoint lighting spans three laps monotonically and clamps before start and after finish',()=>{
  for(const id of ['reverse','sunrise']){
    const course=COURSES[id],total=course.gates.length*3;
    let last=courseLighting({passed:0},course).altitude;
    assert.equal(courseLighting({passed:1},course).altitude,last,'Crossing the start line begins progress at zero');
    for(let passed=1;passed<=total+1;passed++){
      const light=courseLighting({passed},course);
      assert.ok((light.altitude-last)*(id==='sunrise'?1:-1)>=-1e-12);
      last=light.altitude;
    }
    assert.ok(Math.abs(last-(id==='sunrise'?.65:-.2))<1e-12);
    assert.deepEqual(courseLighting({passed:total+100},course),courseLighting({passed:total+1},course));
    assert.deepEqual(courseLighting({passed:-10},course),courseLighting({passed:0},course));
  }
});

test('moving around a checkpoint or changing lap metadata cannot rewind daylight',()=>{
  for(const course of Object.values(COURSES)){
    const expected=courseLighting({passed:course.gates.length},course);
    for(const x of [-1000,0,1000])for(const z of [-1000,0,1000])for(const lap of [1,2,3]){
      assert.deepEqual(courseLighting({x,z,lap,passed:course.gates.length},course),expected);
    }
  }
});

test('main stays in daylight and rocky stays at night throughout all checkpoints',()=>{
  for(const [id,night] of [['main',0],['rocky',1]]){
    const course=COURSES[id];
    for(let passed=0;passed<=course.gates.length*3+1;passed++)assert.equal(courseLighting({passed},course).night,night);
  }
});

test('lighting eases checkpoint changes and course selection without sudden sun jumps',()=>{
  let current=courseLighting({passed:0},COURSES.main);
  for(const course of [COURSES.rocky,COURSES.sunrise,COURSES.reverse,COURSES.main]){
    for(const passed of [0,1,course.gates.length,course.gates.length*3+1]){
      const target=courseLighting({passed},course),held=easeLighting(current,target,0);
      assert.ok(Math.abs(held.altitude-current.altitude)<1e-12);
      for(let i=0;i<360;i++){
        const next=easeLighting(current,target,1/60);
        assert.ok(Math.hypot(...next.sunDirection.map((v,j)=>v-current.sunDirection[j]))<.08);
        assert.ok(Math.abs(Math.hypot(...next.sunDirection)-1)<1e-12);
        current=next;
      }
      assert.ok(Math.hypot(...current.sunDirection.map((v,j)=>v-target.sunDirection[j]))<.002);
      assert.ok(Math.abs(current.altitude-target.altitude)<.001);
    }
  }
});

test('sun directions stay normalized across all course checkpoints',()=>{
  for(const course of Object.values(COURSES))for(let passed=0;passed<=course.gates.length*3+1;passed++){
    assert.ok(Math.abs(Math.hypot(...courseLighting({passed},course).sunDirection)-1)<1e-12);
  }
});

function emit(speedLevel,boost=1,speed=48){
  const renderer={particleClock:0,particles:[],wakeHeads:[],rainbowColors:RAINBOW_COLORS.map(rgb),random:()=>.5};
  const r={id:0,x:0,y:0,z:0,yaw:0,speed,speedLevel,boost,airborne:false};
  const race={worldTime:1,phase:'racing',racers:[r]};
  Renderer.prototype.updateEffects.call(renderer,race,.07);
  r.z+=2;
  Renderer.prototype.updateEffects.call(renderer,race,.07);
  return renderer.particles;
}

test('spray and foam turn rainbow only at maximum level',()=>{
  const white=p=>p.color.every((v,i)=>v===[.8,.9,.9][i]);
  for(const charge of [0,.5,.999,1])for(const level of [1,2,3,4,5]){
    const particles=emit(level,charge),spray=particles.filter(p=>!p.foam),foam=particles.filter(p=>p.foam);
    assert.equal(spray.length,4,'two rear droplets per emission');
    assert.ok(foam.length>0);
    assert.ok(particles.every(p=>!p.corners),'no level emits ribbon quads');
    assert.ok(foam.every(p=>p.foam&&Math.hypot(p.vx,p.vz)>0));
    assert.equal(foam.length,12,'six foam flecks per emission');
    assert.ok(foam.every(p=>!p.ripple),'no wake ripple arcs');
    assert.ok(particles.every(p=>level===5?!white(p):white(p)));
  }
});

test('maximum-level spray and foam use full rainbow colors even at low speed',()=>{
  const palette=RAINBOW_COLORS.map(rgb).map(c=>c.map(v=>v**2.2));
  for(const speed of [4,16,48]){
    const particles=emit(5,1,speed);
    assert.ok(particles.every(p=>palette.some(c=>c.every((v,i)=>v===p.color[i]))));
  }
});

test('spray and foam keep separate motion and expire after stopping or jumping',()=>{
  const state={particleClock:0,particles:[],rainbowColors:RAINBOW_COLORS.map(rgb),random:()=>.5};
  const rider={x:0,y:1,z:0,yaw:0,speed:48,speedLevel:1,airborne:false};
  const race={worldTime:0,phase:'racing',racers:[rider]};
  const advance=dt=>{race.worldTime+=dt;Renderer.prototype.updateEffects.call(state,race,dt);};
  advance(.07);
  const spray=state.particles.filter(p=>!p.foam),foam=state.particles.filter(p=>p.foam);
  assert.equal(spray.length,2);assert.equal(foam.length,6);
  assert.ok(spray.every(p=>p.y>rider.y&&p.vy>0&&p.vz<0),'Droplets rise and trail behind');
  assert.ok(foam.every(p=>p.y===0&&p.vy===0&&p.vz===0),'Foam stays on its surface path');
  assert.ok(foam.some(p=>p.vx<0)&&foam.some(p=>p.vx>0),'Foam spreads to both sides');
  const old=state.particles.slice();rider.speed=3;advance(.1);
  assert.deepEqual(state.particles,old,'Stopping emits no new particles');
  rider.speed=48;rider.airborne=true;advance(.1);
  assert.deepEqual(state.particles,old,'Airborne craft emit no new particles');
  for(let i=0;i<120;i++)advance(1/60);
  assert.equal(state.particles.length,0,'Existing spray and foam finish their lifetimes');
});
