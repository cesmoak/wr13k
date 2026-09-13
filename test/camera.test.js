import test from 'node:test';
import assert from 'node:assert/strict';
import {chaseCamera} from '../src/renderer.js';
import {LIGHTHOUSE,islands} from '../src/course.js';

test('camera height and pitch ignore hull bobbing, flight, and boost',()=>{
  const state={cameraReady:false,eye:[0,110,0]},boat={x:0,y:0,z:0,yaw:0,speed:40,boosting:false};
  chaseCamera(state,boat,1/60);const height=state.eye[1];
  for(let i=0;i<600;i++){
    Object.assign(boat,{x:i*.3,z:Math.sin(i*.01)*15,y:Math.sin(i*.1)*8,yaw:Math.sin(i*.015),boosting:i%100<50});
    const target=chaseCamera(state,boat,1/60);
    assert.equal(state.eye[1],height);
    const pitch=(state.eye[1]-target[1])/Math.hypot(target[0]-state.eye[0],target[2]-state.eye[2]);
    assert.ok(Math.abs(pitch-.2)<1e-12);
  }
  const before=chaseCamera(state,boat,0);boat.y+=30;
  assert.deepEqual(chaseCamera(state,boat,0),before);
});

test('camera eases outward and upward with speed and closes back in when stopped',()=>{
  const state={cameraReady:false,eye:[0,110,0]},boat={x:0,y:0,z:0,yaw:0,speed:0};
  chaseCamera(state,boat,1/60);assert.deepEqual(state.eye,[0,5,-8.5]);
  boat.speed=48;let last=5;
  for(let i=0;i<360;i++){
    chaseCamera(state,boat,1/60);
    assert.ok(state.eye[1]>=last&&state.eye[1]-last<.06,'height changes gently');last=state.eye[1];
  }
  assert.ok(state.eye[1]>7.24&&state.eye[2]<-12.99);
  boat.speed=0;
  for(let i=0;i<360;i++)chaseCamera(state,boat,1/60);
  assert.ok(state.eye[1]<5.01&&state.eye[2]>-8.51);
});

test('camera still holds its heading for idle pivots and eases behind a moving craft',()=>{
  const state={cameraReady:false,eye:[0,0,0]},boat={x:0,y:0,z:0,yaw:0,speed:0};
  chaseCamera(state,boat,1/60);boat.yaw=1;
  for(let i=0;i<120;i++)chaseCamera(state,boat,1/60);
  assert.equal(state.cameraYaw,0);
  boat.speed=25;chaseCamera(state,boat,1/60);assert.ok(state.cameraYaw>0&&state.cameraYaw<.2);
  for(let i=0;i<120;i++)chaseCamera(state,boat,1/60);
  assert.ok(state.cameraYaw>.5&&state.cameraYaw<.9,'Re-centering stays gradual after two seconds');
  for(let i=0;i<600;i++)chaseCamera(state,boat,1/60);
  assert.ok(state.cameraYaw>.99,'Sustained forward travel eventually aligns the camera');
});

test('large heading changes return gently and sideways drift does not pull the camera around',()=>{
  const state={cameraReady:false},boat={x:0,z:0,yaw:0,speed:50,vx:0,vz:50};
  chaseCamera(state,boat,1/60);boat.yaw=Math.PI/2;
  for(let i=0;i<60;i++)chaseCamera(state,boat,1/60);
  assert.equal(state.cameraYaw,0,'Sideways movement alone keeps the viewing direction');
  boat.vx=50;boat.vz=0;
  for(let i=0;i<60;i++){
    const before=state.cameraYaw;chaseCamera(state,boat,1/60);
    assert.ok(state.cameraYaw-before<=.7/60+1e-9);
  }
  assert.ok(state.cameraYaw<.71&&state.cameraYaw>.5);
});

test('lighthouse foundation sits on the rocky island summit',()=>{
  const rock=islands.find(i=>i.rocky);
  assert.equal(LIGHTHOUSE.x,rock.x);assert.equal(LIGHTHOUSE.z,rock.z);
  assert.ok(LIGHTHOUSE.y<rock.height&&LIGHTHOUSE.y+2>rock.height-2);
});
