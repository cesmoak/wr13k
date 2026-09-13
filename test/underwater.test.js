import test from 'node:test';
import assert from 'node:assert/strict';
import {seabedHeight,landforms,shoreDistance} from '../src/course.js';
import {createSeabedMesh,createSeaGrassMesh} from '../src/mesh.js';

test('sand shelf follows every shoreline and remains below the water',()=>{
  for(let x=-700;x<900;x+=40)for(let z=-650;z<650;z+=40){
    const distance=Math.min(...landforms.map(land=>shoreDistance(x,z,land)));
    assert.equal(seabedHeight(x,z),-2-Math.min(34,Math.max(0,distance)*.16));
  }
  for(const mesh of [createSeabedMesh(),createSeaGrassMesh()]){
    assert.ok(mesh.data.length>0&&mesh.data.every(Number.isFinite));
    for(let i=1;i<mesh.data.length;i+=9)assert.ok(mesh.data[i]<0,'Scenery stays submerged');
  }
});
