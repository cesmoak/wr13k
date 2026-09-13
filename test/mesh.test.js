import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, createGateMesh, createFishMesh } from '../src/mesh.js';
import { createSeagullMesh } from '../src/atmosphere.js';

test('boxes keep outward unit normals and the requested surface area',()=>{
  const mesh=new MeshBuilder(),center=[2,-3,7],size=[4,6,8];
  mesh.box(...center,...size,[.2,.4,.6]);
  let area=0;
  for(let i=0;i<mesh.data.length;i+=27){
    const d=mesh.data,a=d.slice(i,i+3),b=d.slice(i+9,i+12),c=d.slice(i+18,i+21),n=d.slice(i+3,i+6);
    assert.ok(Math.abs(Math.hypot(...n)-1)<1e-12);
    assert.ok(n.reduce((sum,v,j)=>sum+v*(a[j]-center[j]),0)>0);
    for(const p of [a,b,c])p.forEach((v,j)=>assert.equal(Math.abs(v-center[j]),size[j]/2));
    const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
    area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
  }
  assert.equal(area,2*(4*6+4*8+6*8));
});

test('buoy arrows point toward the passing side and markings appear only on the approach face',()=>{
  for(const side of [-1,1])for(const active of [false,true])for(const index of [0,1]){
    const mesh=createGateMesh(index,active,side),planes=new Map([[-.06,[]],[.06,[]]]);
    for(let i=0;i<mesh.data.length;i+=27){
      const p=[0,9,18].map(offset=>mesh.data.slice(i+offset,i+offset+3));
      if(p.every(v=>v[2]===p[0][2])&&planes.has(p[0][2]))planes.get(p[0][2]).push(p);
    }
    assert.equal(planes.get(.06).length,0);
    for(const triangles of [planes.get(-.06)]){
      assert.equal(triangles.length,index===0?16:1);
      if(index){
        const tip=triangles[0].find(p=>p[1]===7.35),rear=triangles[0].filter(p=>p!==tip);
        assert.ok(rear.every(p=>(tip[0]-p[0])*-side>0));
      }
    }
  }
});

test('wildlife stays deterministic when paused and animates as time advances',()=>{
  for(const build of [createSeagullMesh,time=>createFishMesh(time,{x:-105,z:-112})]){
    const still=build(12).data;
    assert.ok(still.length>0);
    assert.ok(still.every(Number.isFinite));
    assert.deepEqual(build(12).data,still);
    assert.notDeepEqual(build(12.25).data,still);
  }
  assert.equal(createSeagullMesh(12).data.length/27,18*10);
});
