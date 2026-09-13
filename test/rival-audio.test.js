import test from 'node:test';
import assert from 'node:assert/strict';
import { rivalEngineMix } from '../src/audio.js';

test('rival engines fade with distance and pan relative to the camera',()=>{
  const player={x:0,z:0,yaw:0},r={x:12,z:0,speed:45};
  const near=rivalEngineMix(player,r),far=rivalEngineMix(player,{...r,x:80});
  assert.ok(near.gain>far.gain*10&&near.gain<.1);
  assert.equal(rivalEngineMix(player,{...r,x:140}).gain,0);
  assert.ok(near.pan<0);
  assert.ok(rivalEngineMix(player,{...r,x:-12}).pan>0);
  assert.ok(rivalEngineMix(player,r,Math.PI).pan>0);
  assert.ok(rivalEngineMix(player,{...r,speed:0}).gain<near.gain);
  const overlap=rivalEngineMix(player,{...r,x:0});
  assert.ok(Number.isFinite(overlap.gain+overlap.pan));
});

test('simplified rival attenuation stays bounded and fades monotonically to silence',()=>{
  const player={x:0,z:0,yaw:0};
  let previous=Infinity;
  for(let distance=0;distance<=180;distance++){
    const mix=rivalEngineMix(player,{x:distance,z:0,speed:80});
    assert.ok(mix.gain>=0&&mix.gain<=previous&&mix.gain<=.101);
    assert.ok(Number.isFinite(mix.pan)&&Math.abs(mix.pan)<=.9);
    if(distance>=140)assert.equal(mix.gain,0);
    previous=mix.gain;
  }
  assert.deepEqual(rivalEngineMix(player,{x:12,z:4,speed:80}),rivalEngineMix(player,{x:12,z:4,speed:160}));
});
