import test from 'node:test';
import assert from 'node:assert/strict';
import {chaseCamera} from '../src/renderer.js';
import {LIGHTHOUSE,islands} from '../src/course.js';
import {lookAt,multiply,perspective,randomSeed} from '../src/math.js';
import {readFile} from 'node:fs/promises';

test('renderer fixed projection matches general matrix multiplication across viewports',async()=>{
  const source=await readFile(new URL('../src/renderer.js',import.meta.url),'utf8');
  const anchor='const camera=lookAt(this.eye,target);',start=source.indexOf(anchor);
  const end=source.indexOf('gl.disable(gl.DEPTH_TEST)',start);
  assert.ok(start>=0&&end>start);
  const project=new Function('camera','width','height',source.slice(start+anchor.length,end)+'return this.view;');
  const random=randomSeed(7331);
  for(let i=0;i<2000;i++){
    const eye=[random()*4000-2000,random()*100+1,random()*4000-2000];
    const target=[random()*400-200,0,random()*400-200];
    const width=320+Math.floor(random()*3000),height=240+Math.floor(random()*1800),camera=lookAt(eye,target);
    const expected=multiply(perspective(.99,width/height,.25,4000),camera);
    const actual=project.call({},camera,width,height);
    assert.ok(actual instanceof Float32Array);
    assert.ok(actual.every((v,j)=>v===expected[j]),'Projection values must match, including Float32 rounding');
  }
});

// Supply a complete moving hull, as the simulation does.
const followForward=(state,boat,dt)=>chaseCamera(state,{...boat,
  vx:Math.sin(boat.yaw)*boat.speed,vz:Math.cos(boat.yaw)*boat.speed},dt);

test('camera height and pitch ignore hull bobbing, flight, and boost',()=>{
  const state={cameraReady:false,eye:[0,110,0]},boat={x:0,y:0,z:0,yaw:0,speed:40,boosting:false};
  followForward(state,boat,1/60);const height=state.eye[1];
  for(let i=0;i<600;i++){
    Object.assign(boat,{x:i*.3,z:Math.sin(i*.01)*15,y:Math.sin(i*.1)*8,yaw:Math.sin(i*.015),boosting:i%100<50});
    const target=followForward(state,boat,1/60);
    assert.equal(state.eye[1],height);
    const pitch=(state.eye[1]-target[1])/Math.hypot(target[0]-state.eye[0],target[2]-state.eye[2]);
    assert.ok(Math.abs(pitch-.2)<1e-12);
  }
  const before=followForward(state,boat,0);boat.y+=30;
  assert.deepEqual(followForward(state,boat,0),before);
});

test('camera uses fixed cruising geometry at every speed',()=>{
  const state={cameraReady:false,eye:[0,110,0]},boat={x:0,y:0,z:0,yaw:0,speed:0};
  for(const speed of [0,1,2,25,48,66,0]){
    boat.speed=speed;
    const target=followForward(state,boat,1/60);
    assert.deepEqual(state.eye,[0,7.25,-13]);
    assert.equal(target[0],0);assert.equal(target[2],13);
    assert.ok(Math.abs(target[1]-2.05)<1e-12);
  }
});

test('camera still holds its heading for idle pivots and eases behind a moving craft',()=>{
  const state={cameraReady:false,eye:[0,0,0]},boat={x:0,y:0,z:0,yaw:0,speed:0};
  followForward(state,boat,1/60);boat.yaw=1;
  for(const speed of [0,.5,1]){
    boat.speed=speed;
    for(let i=0;i<120;i++)followForward(state,boat,1/60);
  }
  assert.equal(state.cameraYaw,0);
  boat.speed=1.01;followForward(state,boat,1/60);assert.ok(state.cameraYaw>0&&state.cameraYaw<.02);
  for(let i=1;i<120;i++)followForward(state,boat,1/60);
  assert.ok(state.cameraYaw>.89&&state.cameraYaw<.91,'Re-centering closes about 90% of the gap in two seconds');
  for(let i=0;i<600;i++)followForward(state,boat,1/60);
  assert.ok(state.cameraYaw>.99,'Sustained forward travel eventually aligns the camera');
});

test('sideways drift follows heading smoothly without the former turn-rate cap',()=>{
  const state={cameraReady:false},boat={x:0,z:0,yaw:0,speed:50,vx:0,vz:50};
  chaseCamera(state,boat,1/60);boat.yaw=Math.PI/2;
  chaseCamera(state,boat,1/60);
  assert.ok(state.cameraYaw>.7/60&&state.cameraYaw<.04,'Smooth first step exceeds the old rate cap');
  for(let i=0;i<60;i++){
    const before=state.cameraYaw;chaseCamera(state,boat,1/60);
    assert.ok(state.cameraYaw>before&&state.cameraYaw<boat.yaw,'Approaches the heading without snapping or overshooting');
  }
  assert.ok(state.cameraYaw>1&&state.cameraYaw<1.2);
});

test('camera follows the short turn across either heading wraparound',()=>{
  for(const direction of [-1,1]){
    const state={cameraReady:false},boat={x:0,z:0,yaw:direction*(Math.PI-.05),speed:25};
    chaseCamera(state,boat,1/60);const start=state.cameraYaw;
    boat.yaw=-direction*(Math.PI-.05);
    for(let i=0;i<120;i++){
      const target=chaseCamera(state,boat,1/60);
      assert.ok(direction*(state.cameraYaw-start)>0&&direction*(state.cameraYaw-start)<.1);
      assert.ok([...state.eye,...target].every(Number.isFinite));
    }
    assert.ok(direction*(state.cameraYaw-start)>.089);
  }
});

test('position eases independently of frame rate and zero-time updates hold state',()=>{
  const run=steps=>{
    const state={cameraReady:false},boat={x:0,z:0,yaw:0,speed:25};
    chaseCamera(state,boat,0);boat.x=20;boat.z=30;boat.yaw=1;
    const before=structuredClone(state);
    const target=chaseCamera(state,boat,0);
    assert.deepEqual(state,before);
    assert.deepEqual(chaseCamera(state,boat,0),target);
    for(let i=0;i<steps;i++)chaseCamera(state,boat,1/steps);
    return state;
  };
  const a=run(60),b=run(120);
  assert.ok(Math.abs(a.cameraYaw-b.cameraYaw)<1e-12);
  assert.ok(Math.hypot(a.eye[0]-b.eye[0],a.eye[2]-b.eye[2])<.05);
  assert.equal(a.eye[1],7.25);
  const state={cameraReady:false},boat={x:0,z:0,yaw:0,speed:0};
  chaseCamera(state,boat,0);boat.x=20;
  chaseCamera(state,boat,.1);
  assert.ok(state.eye[0]>0&&state.eye[0]<20,'Position follows rather than teleports');
  for(let i=0;i<120;i++)chaseCamera(state,boat,1/60);
  assert.ok(Math.abs(state.eye[0]-20)<.001);
});

test('race initialization discards the title or previous race camera position',()=>{
  const state={cameraReady:false,cameraYaw:2,eye:[255.85,39.92,329.53]};
  const boat={x:20,z:30,yaw:Math.PI/2,speed:0};
  chaseCamera(state,boat,0);
  assert.equal(state.cameraYaw,boat.yaw);assert.equal(state.eye[1],7.25);
  assert.ok(Math.abs(state.eye[0]-7)<1e-12&&Math.abs(state.eye[2]-30)<1e-12);
  assert.equal(state.cameraReady,true);
  state.cameraReady=false;boat.x=-100;boat.z=80;boat.yaw=0;
  chaseCamera(state,boat,1/60);
  assert.deepEqual(state.eye,[-100,7.25,67]);
});

test('lighthouse foundation sits on the rocky island summit',()=>{
  const rock=islands.find(i=>i.rocky);
  assert.equal(LIGHTHOUSE.x,rock.x);assert.equal(LIGHTHOUSE.z,rock.z);
  assert.ok(LIGHTHOUSE.y<rock.height&&LIGHTHOUSE.y+2>rock.height-2);
});
