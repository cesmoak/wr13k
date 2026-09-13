import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacer, createRace, stepRace, aiInput, startRace } from '../src/simulation.js';
import { stepBoat, steeringAuthority, resetBoat, riderPose, springRider, HULL_CONTACTS, RIDER_LEAN, handlebarPose } from '../src/boat-physics.js';
import { modelMatrix, multiply } from '../src/math.js';
import { waveHeight, sampleWater, MAX_WAKES } from '../src/course.js';

const flatWater = () => ({height:0,nx:0,ny:1,nz:0,velocity:0});
function boat() {
  return Object.assign(createRacer(0), {x:0,z:0,y:.35,yaw:0,vx:0,vy:0,vz:0,speed:0});
}
function run(r, seconds, input = {}, water = flatWater, dt = 1/60) {
  for(let i=0;i<Math.round(seconds/dt);i++)stepBoat(r,input,dt,(i+1)*dt,[],water);
  return r;
}
const separation = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));

test('player idle steering is tripled without forward thrust or changing cruising turns',()=>{
  const r=run(boat(),2,{steer:1});
  const opponent=boat();opponent.id=1;run(opponent,2,{steer:1});
  assert.ok(r.yaw>.9&&r.yaw<1.65,`Idle yaw: ${r.yaw}`);
  assert.ok(Math.abs(r.yaw/opponent.yaw-3)<.01);
  assert.ok(Math.abs(steeringAuthority(0)/steeringAuthority(0,false,1)-3)<1e-12);
  for(const speed of [8,25,50,68])assert.equal(steeringAuthority(speed),steeringAuthority(speed,false,1));
  assert.ok(r.speed<.001);assert.ok(Math.hypot(r.x,r.z)<.001);
  const reverse=run(boat(),2,{steer:-1});assert.ok(reverse.yaw<-.3);
  assert.ok(steeringAuthority(5)>steeringAuthority(0));
  assert.ok(steeringAuthority(25)>steeringAuthority(5));
  assert.ok(steeringAuthority(68)<steeringAuthority(25));
});
test('flat-water buoyancy settles without snapping or persistent oscillation',()=>{
  const r=boat();r.y=1.5;stepBoat(r,{},1/60,1/60,[],flatWater);
  assert.ok(r.y>1.45,'A falling hull must not teleport to the surface');
  run(r,8);assert.ok(r.y>.25&&r.y<.32);assert.ok(Math.abs(r.vy)<.01);
  assert.ok(Math.abs(r.pitch)<.03&&Math.abs(r.roll)<.03);
  assert.equal(r.contactPoints.length,HULL_CONTACTS.length);
  assert.ok(Math.abs(r.waterForce-22)<.05,'Buoyancy balances gravity');
});
test('separate contacts pitch and roll the hull along a sloping surface',()=>{
  const water=(x,z)=>({height:.12*x+.09*z,nx:-.12/Math.hypot(.12,1,.09),ny:1/Math.hypot(.12,1,.09),nz:-.09/Math.hypot(.12,1,.09),velocity:0});
  const r=boat();for(let i=0;i<480;i++)stepBoat(r,{},1/60,(i+1)/60,[],water,true);
  assert.ok(r.roll>.06);assert.ok(r.pitch<-.04);
  assert.ok(r.contactPoints.some(p=>p.force>0));
});
test('airborne momentum persists; water steering and engine thrust require contact',()=>{
  const r=boat();Object.assign(r,{y:10,vx:0,vz:40,speed:40,airborne:true,contactFraction:0});
  run(r,.3,{throttle:1,steer:1});
  assert.equal(r.contactFraction,0);assert.ok(Math.abs(r.yaw)<.01);
  assert.ok(Math.abs(r.vx)<.01&&r.vz>39);assert.ok(r.vy<-4);
});
test('a wave-like launch has a short arc and returns promptly to the water',()=>{
  const r=boat();Object.assign(r,{y:2,vy:8,airborne:true});
  let apex=r.y,landingTime=null;
  for(let i=0;i<360;i++){
    stepBoat(r,{},1/240,(i+1)/240,[],flatWater);apex=Math.max(apex,r.y);
    if(!r.airborne){landingTime=(i+1)/240;break;}
  }
  assert.ok(apex-2>1.2&&apex-2<1.6,'Keep a small ballistic hop rather than a floating launch');
  assert.ok(landingTime>.75&&landingTime<1.05,'The ski should land in under a second from this launch');
  run(r,3);assert.ok(Math.abs(r.vy)<.05,'Landing settles without repeated bouncing');
});
test('landing transmits an impact into the independently sprung rider',()=>{
  const r=boat();Object.assign(r,{y:2,vy:-5,airborne:true});
  let impact=0,compression=0;
  for(let i=0;i<180;i++){
    stepBoat(r,{},1/60,(i+1)/60,[],flatWater);
    impact=Math.max(impact,r.landingImpact);compression=Math.min(compression,r.rider.y);
  }
  assert.ok(impact>3);assert.ok(compression<-.03);
  assert.ok(r.y>0&&r.y<.5);assert.ok(Math.abs(r.rider.y)<.01);
});
test('rider inertia, anchored limbs, and rider weight affect the hull',()=>{
  const r=run(boat(),1,{throttle:1,steer:1});
  assert.ok(Math.abs(r.rider.x)+Math.abs(r.rider.z)>.01);
  for(const limb of riderPose(r).limbs){
    assert.ok(Math.abs(separation(limb.hip,limb.knee)-.55)<.005);
    assert.ok(Math.abs(separation(limb.knee,limb.foot)-.55)<.005);
    assert.ok(Math.abs(separation(limb.shoulder,limb.elbow)-.55)<.005);
    assert.ok(Math.abs(separation(limb.elbow,limb.hand)-.53)<.005);
    assert.equal(limb.foot[1],.64);assert.deepEqual(limb.hand,handlebarPose(r).grips[limb.hand[0]<0?0:1]);
  }
  const centered=boat(),leaning=boat();leaning.rider.x=.4;
  stepBoat(centered,{},1/60,1/60,[],flatWater);stepBoat(leaning,{},1/60,1/60,[],flatWater);
  assert.ok(leaning.rollRate<centered.rollRate);
});
test('generated wakes travel, expire, and change the sampled water forces',()=>{
  const wakes=[{x:0,z:0,time:0,amplitude:.3}],t=.7;
  assert.ok(Math.abs(waveHeight(6,0,t,wakes)-waveHeight(6,0,t))>.02);
  assert.notEqual(sampleWater(6,0,t,wakes).velocity,sampleWater(6,0,t).velocity);
  assert.equal(waveHeight(6,0,3,wakes),waveHeight(6,0,3));
  const race=createRace();startRace(race);
  for(let i=0;i<1200;i++)stepRace(race,aiInput(race.racers[0],race),1/60);
  assert.ok(race.wakes.length>0&&race.wakes.length<=MAX_WAKES);
  assert.ok(race.wakes.every(w=>race.worldTime-w.time<2.8));
});
test('extreme rider motion cannot stretch the arms off their handlebar anchors',()=>{
  const r=boat();Object.assign(r.rider,{x:.48,y:.16,z:-.27,vx:8,vy:4,vz:-8});
  stepBoat(r,{},1/60,1/60,[],flatWater);
  for(const limb of riderPose(r).limbs){
    assert.ok(Math.abs(separation(limb.shoulder,limb.elbow)-.55)<.005);
    assert.ok(Math.abs(separation(limb.elbow,limb.hand)-.53)<.005);
  }
});
test('substeps stay consistent across frame rates and boat reset clears spring energy',()=>{
  const a=run(boat(),2,{throttle:1,steer:.2},flatWater,1/60);
  const b=run(boat(),2,{throttle:1,steer:.2},flatWater,1/120);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.02);assert.ok(Math.abs(a.y-b.y)<.001);
  const race=createRace(),r=race.racers[0];Object.assign(r,{yawRate:4,rollRate:5,pitchRate:3,airborne:true});
  r.rider.x=.4;r.rider.vy=-7;resetBoat(r,race.worldTime);
  assert.equal(r.yawRate+r.rollRate+r.pitchRate,0);assert.equal(r.rider.vy,0);assert.equal(r.rider.x,0);assert.equal(r.airborne,false);
});

// Isolate handling from wave phase: rough water can briefly unload the jet.
test('cruising acceleration and moderated U-turns remain responsive on flat water',()=>{
  const r=run(boat(),3,{throttle:1});
  assert.ok(r.speed>45,`Speed after three seconds: ${r.speed}`);
  Object.assign(r,{x:0,z:0,yaw:0,speed:50,vx:0,vz:50,steer:0});
  let time=0,footprint=0;
  while(r.yaw<Math.PI&&time<4){
    stepBoat(r,{throttle:1,steer:1},1/60,time,[],flatWater);time+=1/60;
    footprint=Math.max(footprint,Math.hypot(r.x,r.z));
  }
  assert.ok(time>2&&time<3,`U-turn time: ${time}`);
  assert.ok(footprint<75,`U-turn footprint: ${footprint}`);
});

test('player speed levels increase actual acceleration and automatic top speed',()=>{
  const base=run(boat(),2,{throttle:1});
  const powered=run(Object.assign(boat(),{speedLevel:5}),2,{throttle:1});
  assert.ok(powered.speed>base.speed*1.2,'Higher levels accelerate the hull, not just the HUD');
  run(base,8,{throttle:1});run(powered,8,{throttle:1});
  assert.ok(Math.abs(base.speed-50)<.1);assert.ok(Math.abs(powered.speed-66)<.1);
  const ai=run(Object.assign(boat(),{id:1,speedLevel:5}),10,{throttle:1});
  assert.ok(Math.abs(ai.speed-75.9)<.1,'Opponents earn the same 32% maximum bonus on their base pace');
  ai.speedLevel=1;run(ai,2,{throttle:1});
  assert.ok(Math.abs(ai.speed-57.5)<.1,'Reset removes the earned bonus while retaining the opponent base pace');

});


test('a real launch lifts the posed torso and extends the legs, then landing compresses them',()=>{
  const r=boat();r.y=2;r.vy=5;
  const standing=riderPose(r);let high=0,low=Infinity,longest=0,shortest=Infinity;
  for(let i=0;i<300;i++){
    stepBoat(r,{},1/240,(i+1)/240,[],flatWater);
    const p=riderPose(r),l=p.limbs[0],reach=separation(l.hip,l.foot);
    if(r.airborne){high=Math.max(high,p.chest[1]);longest=Math.max(longest,reach);}
    else{low=Math.min(low,p.chest[1]);shortest=Math.min(shortest,reach);}
    for(const limb of p.limbs){
      assert.deepEqual(limb.foot,[Math.sign(limb.foot[0])*.43,.64,-.35]);
      assert.deepEqual(limb.hand,handlebarPose(r).grips[limb.hand[0]<0?0:1]);
    }
  }
  assert.ok(high>standing.chest[1]+.15,'Torso visibly rises relative to the hull in flight');
  assert.ok(low<standing.chest[1]-.2,'Landing sinks the torso into a crouch');
  assert.ok(longest>.98&&shortest<.7,'Knees straighten in flight and fold on impact');
});
test('steering pole lifts and twists within its stops while hands follow the grips',()=>{
  const r=boat(),initial=handlebarPose(r);r.airborne=true;r.steer=1;
  for(let i=0;i<240;i++)springRider(r,0,-22,0,1/240);
  const lifted=handlebarPose(r);
  assert.ok(lifted.center[1]>initial.center[1]+.2);
  assert.ok(r.rider.handlePitch<=.24&&r.rider.handlePitch>0);
  assert.ok(r.rider.handleYaw<=.25&&r.rider.handleYaw>.2);
  assert.ok(Math.abs(separation(lifted.pivot,lifted.center)-separation(initial.pivot,initial.center))<1e-6);
  for(const [i,l] of riderPose(r).limbs.entries())assert.deepEqual(l.hand,lifted.grips[i]);
  resetBoat(r,0);
  for(const key of ['handlePitch','handlePitchRate','handleYaw','handleYawRate'])assert.equal(r.rider[key],0);
});
test('neutral rider has a hip hinge, raised elbows, and knees above planted boots',()=>{
  const pose=riderPose(boat());
  assert.ok(pose.chest[2]>pose.hips[2]+.1,'Chest leans forward from the hips');
  for(const l of pose.limbs){
    assert.ok(l.hip[1]>l.knee[1]&&l.knee[1]>l.foot[1]+.3);
    assert.ok(l.knee[2]>l.foot[2]&&l.knee[2]<l.foot[2]+.4,'Knees bend forward over the boots');
    assert.ok(l.elbow[1]>l.hand[1]+.15&&l.elbow[1]<l.shoulder[1],'Relaxed arms slope toward the grips');
  }
});
test('upper body preserves its forward riding lean across hull rotations and heading',()=>{
  const r=boat();
  for(const yaw of [-2.7,0,1.4])for(const pitch of [-.75,0,.75])for(const roll of [-.85,0,.85]){
    Object.assign(r,{yaw,pitch,roll});
    const world=multiply(modelMatrix(0,0,0,yaw,pitch,roll),riderPose(r).torsoMatrix);
    const expected=modelMatrix(0,0,0,yaw,RIDER_LEAN,0);
    for(const i of [0,1,2,4,5,6,8,9,10])assert.ok(Math.abs(world[i]-expected[i])<1e-6,'Resting lean stays independent of hull tilt');
  }
});
test('balanced torso reacts smoothly to acceleration and hull impacts, then recovers',()=>{
  const r=boat();r.roll=.7;r.rollRate=3;
  springRider(r,50,0,0,1/240);
  assert.ok(r.rider.roll<0&&r.rider.roll>-.01,'Angular spring does not snap to its goal');
  for(let i=0;i<120;i++)springRider(r,50,0,0,1/240);
  assert.ok(r.rider.roll<-.08&&r.rider.roll>-.38,'Limited balance wobble under load');
  r.rollRate=0;
  for(let i=0;i<720;i++)springRider(r,0,0,0,1/240);
  assert.ok(Math.abs(r.rider.roll)<.001&&Math.abs(r.rider.rollRate)<.001);
  assert.equal(r.roll,.7,'Torso settles upright even while the hull remains banked');
  const race=createRace(),p=race.racers[0];
  Object.assign(p.rider,{pitch:.2,roll:-.2,pitchRate:2,rollRate:-3});resetBoat(p,race.worldTime);
  for(const key of ['pitch','roll','pitchRate','rollRate'])assert.equal(p.rider[key],0);
});
test('rider leans into both turns, with a small slow-speed cue and stronger loaded corners',()=>{
  const settled=(speed,steer,accel)=>{
    const r=boat();r.yaw=0;r.speed=speed;r.steer=steer;
    for(let i=0;i<720;i++)springRider(r,accel,0,0,1/240);
    return r;
  };
  const slow=settled(2,1,0),fast=settled(40,1,25),other=settled(40,-1,-25);
  assert.ok(slow.rider.roll<-.025&&slow.rider.roll>-.06);
  assert.ok(fast.rider.roll<-.2&&fast.rider.roll>-.38);
  assert.ok(Math.abs(fast.rider.roll+other.rider.roll)<1e-9,'Left and right response is symmetric');
  for(const r of [fast,other]){
    const p=riderPose(r),world=multiply(modelMatrix(0,0,0,r.yaw,r.pitch,r.roll),p.torsoMatrix);
    assert.ok(world[4]*r.steer>0,'Torso leans toward the turning side');
    assert.equal(p.limbs[1].foot[0]-p.limbs[0].foot[0],.86,'Boots use the narrower stance');
    r.steer=0;
    for(let i=0;i<720;i++)springRider(r,0,0,0,1/240);
    assert.ok(Math.abs(r.rider.roll)<.001,'Straightening up remains smooth and settles');
  }
});
test('crouching stance preserves bent, fixed-length limbs at extreme hull and rider poses',()=>{
  const r=boat();
  for(const pitch of [-.75,0,.75])for(const roll of [-.85,0,.85])
  for(const x of [-.48,.48])for(const y of [-.38,.28])for(const z of [-.27,.25])for(const lean of [-.24,.24])for(const handlePitch of [-.12,.24]){
    Object.assign(r,{pitch,roll,yaw:1.7});Object.assign(r.rider,{x,y,z,pitch:lean,roll:-lean*.38/.24,handlePitch,handleYaw:lean});
    for(const l of riderPose(r).limbs){
      for(const [a,b,length] of [[l.hip,l.knee,.55],[l.knee,l.foot,.55],[l.shoulder,l.elbow,.55],[l.elbow,l.hand,.53]])
        assert.ok(Math.abs(separation(a,b)-length)<.00001,'Limb segment retains its length');
      assert.ok(separation(l.hip,l.foot)<1.08,'Knees retain flexion');
      assert.ok(separation(l.shoulder,l.hand)<1.05,'Elbows retain flexion');
      assert.deepEqual(l.foot,[Math.sign(l.foot[0])*.43,.64,-.35]);
      assert.deepEqual(l.hand,handlebarPose(r).grips[l.hand[0]<0?0:1]);
    }
  }
});
