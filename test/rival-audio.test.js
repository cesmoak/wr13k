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
