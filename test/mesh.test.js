import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, createBuoyMesh, createCraftMesh, createBeaconMesh, rgb } from '../src/mesh.js';
import { RAINBOW_COLORS } from '../src/course.js';
import { modelMatrix } from '../src/math.js';

test('rainbow beacon has depth without overlapping internal walls',()=>{
  const mesh=createBeaconMesh(),far=[],colors=new Set();
  assert.ok(mesh.data.every(Number.isFinite));
  for(let i=0;i<mesh.data.length;i+=27){
    const points=[0,9,18].map(k=>mesh.data.slice(i+k,i+k+3));
    far.push(...points.filter(p=>p[2]>0));
    colors.add(JSON.stringify(mesh.data.slice(i+6,i+9)));
  }
  const left=Math.min(...far.map(p=>p[0])),right=Math.max(...far.map(p=>p[0]));
  assert.ok(right>left);
  assert.ok(Math.max(...far.map(p=>p[1]))-Math.min(...far.map(p=>p[1]))>0,'Beam has vertical thickness');
  assert.deepEqual(colors,new Set(RAINBOW_COLORS.map(c=>JSON.stringify(rgb(c)))));
  for(let i=0;i<mesh.data.length;i+=27){
    const edge=[0,9,18].map(k=>mesh.data.slice(i+k,i+k+3)).filter(p=>p[2]>0);
    if(edge[0][0]===edge[1][0])assert.ok(edge[0][0]===left||edge[0][0]===right,'Only outer side walls contribute additive light');
  }
});

test('cone grids retain outward sides, a closed top, and the expected polygon area',()=>{
  const bottom=1.5,height=4,sides=8,center=[2,-1,3];
  for(const top of [0,.5,1.5]){
    const mesh=new MeshBuilder();mesh.cone(...center,bottom,top,height,[.2,.4,.6],sides);
    assert.ok(mesh.data.every(Number.isFinite),'Collapsed cap cells remain finite');
    let area=0;
    for(let i=0;i<mesh.data.length;i+=27){
      const [a,b,c]=[0,9,18].map(k=>mesh.data.slice(i+k,i+k+3)),n=mesh.data.slice(i+3,i+6);
      const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
      const faceArea=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
      area+=faceArea;if(faceArea<1e-9)continue;
      assert.ok(Math.abs(Math.hypot(...n)-2*faceArea)<1e-12);
      if([a,b,c].every(p=>p[1]===center[1]+height))assert.ok(n[1]/Math.hypot(...n)>.999999);
      else assert.ok(n[0]*(a[0]-center[0])+n[2]*(a[2]-center[2])>0,'Sides face outward');
    }
    const angle=Math.PI/sides,slant=Math.hypot(height,(bottom-top)*Math.cos(angle));
    const expected=sides*(bottom+top)*Math.sin(angle)*slant+sides*top*top*Math.sin(angle*2)/2;
    assert.ok(Math.abs(area-expected)<1e-10,'No bottom cap, duplicate surface, or missing top');
  }
});

test('mesh append rotates normals without translating them and preserves colors',()=>{
  const source=new MeshBuilder(),color=[.2,.4,.6];
  source.triangle([0,0,0],[2,0,0],[0,3,0],color);
  const rotation=modelMatrix(0,0,0,.7,.3,-.4),moved=modelMatrix(3,-2,7,.7,.3,-.4);
  const a=new MeshBuilder(),b=new MeshBuilder();a.append(source,rotation);b.append(source,moved);
  for(let i=0;i<a.data.length;i+=9){
    for(let j=0;j<3;j++){
      assert.ok(Math.abs(b.data[i+j]-a.data[i+j]-[3,-2,7][j])<1e-12);
      assert.equal(b.data[i+3+j],a.data[i+3+j]);
      assert.equal(b.data[i+3+j],rotation[8+j]*6);
    }
    assert.deepEqual(b.data.slice(i+6,i+9),color);
  }
});

test('boxes keep outward face vectors and the requested surface area',()=>{
  const mesh=new MeshBuilder(),center=[2,-3,7],size=[4,6,8];
  mesh.box(...center,...size,[.2,.4,.6]);
  let area=0;
  for(let i=0;i<mesh.data.length;i+=27){
    const d=mesh.data,a=d.slice(i,i+3),b=d.slice(i+9,i+12),c=d.slice(i+18,i+21),n=d.slice(i+3,i+6);
    assert.ok(n.reduce((sum,v,j)=>sum+v*(a[j]-center[j]),0)>0);
    for(const p of [a,b,c])p.forEach((v,j)=>assert.equal(Math.abs(v-center[j]),size[j]/2));
    const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
    const faceArea=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
    assert.ok(Math.abs(Math.hypot(...n)-2*faceArea)<1e-12);
    area+=faceArea;
  }
  assert.equal(area,2*(4*6+4*8+6*8));
});

test('shared buoy mesh separates colored bodies and arrows from fixed trim',()=>{
  const mesh=createBuoyMesh(),arrows=[];
  for(let i=0;i<mesh.data.length;i+=27){
    const p=[0,9,18].map(offset=>mesh.data.slice(i+offset,i+offset+3));
    const color=mesh.data.slice(i+6,i+9);
    if(color[0]<0){
      assert.ok(color[1]===0||color[1]===1);
      if(color[1]===1)arrows.push(p);
      else assert.ok(p.every(v=>v[1]>=1.8&&v[1]<=5.2),'Colored upper body');
    }else assert.ok(color.every(v=>v>=0&&v<=1),'Trim keeps real RGB colors');
  }
  assert.equal(arrows.length,1);
  const tip=arrows[0].find(p=>p[1]===7.35),rear=arrows[0].filter(p=>p!==tip);
  assert.ok(rear.every(p=>tip[0]<p[0]&&p[0]===0));
  assert.ok(arrows[0].every(p=>p[2]===-.06),'One arrow without a rectangular flag');
});

test('craft hull fans preserve deck area, closed edges, and surface orientation',()=>{
  const mesh=createCraftMesh(0);
  for(const [tier,[y,w,l]] of [[.1,1.05,2.7],[.42,.89,2.35]].entries()){
    let deckArea=0,volume=0;
    const edges=new Map();
    for(let i=tier*270;i<(tier+1)*270;i+=27){
      const p=[0,9,18].map(k=>mesh.data.slice(i+k,i+k+3));
      const n=mesh.data.slice(i+3,i+6);
      if(p.every(v=>v[1]===y)){
        assert.ok(n[1]>0,'Deck faces upward');
        deckArea+=Math.hypot(...n)/2;
      }
      volume+=p[0].reduce((sum,v,j)=>sum+v*n[j],0)/6;
      for(let j=0;j<3;j++){
        const a=JSON.stringify(p[j]),b=JSON.stringify(p[(j+1)%3]);
        const key=[a,b].sort().join('|');
        edges.set(key,(edges.get(key)||0)+1);
      }
    }
    const expectedArea=(1+.68)*w*(.8+.55)*l+.68*w*(1-.55)*l;
    assert.ok(Math.abs(deckArea-expectedArea)<1e-12,'Deck covers the original pentagon');
    // Keep the existing underside winding as well as its shape.
    assert.ok(Math.abs(volume-expectedArea*(2*y-.6)/3)<1e-12,'Original oriented surface integral');
    assert.ok([...edges.values()].every(count=>count===2),'Closed surface without missing or duplicated faces');
  }
});
