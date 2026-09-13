import test from 'node:test';
import assert from 'node:assert/strict';
import {shoreSurf} from '../src/audio.js';

test('surf swells near land, fades offshore, and pans toward the shore',()=>{
  const p={x:0,z:-100,yaw:0};
  const near=shoreSurf(p,1),far=shoreSurf({...p,z:-190},1),ocean=shoreSurf({...p,x:-600,z:-600},1);
  assert.ok(near.gain>.1);assert.ok(far.gain<near.gain*.1);assert.equal(ocean.gain,0);
  assert.ok(shoreSurf({...p,yaw:Math.PI/2},1).pan<-.6);
  assert.ok(shoreSurf({...p,yaw:-Math.PI/2},1).pan>.6);
  const retreat=shoreSurf(p,5);
  assert.ok(retreat.gain<near.gain*.15);assert.ok(retreat.cutoff<near.cutoff);
});
