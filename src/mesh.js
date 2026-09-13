import { TAU, randomSeed, modelMatrix } from './math.js';
import { riderPose } from './boat-physics.js';
import { shoreRadius, RACER_COLORS, islands, landforms, RAINBOW_COLORS, LIGHTHOUSE, seabedHeight } from './course.js';

export function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
export class MeshBuilder {
  constructor() { this.data = []; }
  triangle(a, b, c, color) {
    const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
    // The vertex shader normalizes these face vectors after transforming them.
    const normal = [0,1,2].map(i=>u[(i+1)%3]*v[(i+2)%3]-u[(i+2)%3]*v[(i+1)%3]);
    for (const p of [a, b, c]) this.data.push(...p, ...normal, ...color);
  }
  quad(a, b, c, d, color) { this.triangle(a, b, c, color); this.triangle(a, c, d, color); }
  taperedBox(a,b,color,cap=false) {
    for(let i=0;i<4;i++){const j=(i+1)%4;this.quad(a[i],b[i],b[j],a[j],color);}
    if(cap)this.quad(...a,color);
    this.quad(b[3],b[2],b[1],b[0],color);
  }
  box(x, y, z, w, h, d, color) {
    const ends=[-d/2,d/2].map(dz=>[[-1,-1],[-1,1],[1,1],[1,-1]].map(([dx,dy])=>[x+dx*w/2,y+dy*h/2,z+dz]));
    this.taperedBox(...ends,color,true);
  }
  cone(x, y, z, bottom, top, height, color, sides = 8) {
    // The last ring collapses to the top center; zero-area cap triangles are harmless.
    this.grid(2,sides,(j,i)=>{
      const a=i/sides*TAU,r=j?j===1?top:0:bottom;
      return [x+Math.cos(a)*r,y+(j?height:0),z+Math.sin(a)*r];
    },()=>color);
  }
  grid(a,b,point,color){
    for(let i=0;i<a;i++)for(let j=0;j<b;j++)
      this.quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1),color(i,j));
  }
  sphere(x, y, z, rx, ry, rz, color, segments = 8, rings = 5) {
    const point = (a,b) => [x+Math.sin(b)*Math.cos(a)*rx,y+Math.cos(b)*ry,z+Math.sin(b)*Math.sin(a)*rz];
    this.grid(segments,rings,(i,j)=>point(i/segments*TAU,j/rings*Math.PI),()=>color);
  }
  beam(a, b, width, color) {
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
    const shape=new MeshBuilder(); shape.box(0,0,length/2,width,width,length,color);
    this.append(shape,modelMatrix(...a,Math.atan2(dx,dz),-Math.asin(dy/length)));
  }
  append(mesh, matrix) {
    for (let i=0;i<mesh.data.length;i+=9) {
      const d=mesh.data;
      for(let k=0;k<6;k+=3)for(let j=0;j<3;j++)
        this.data.push(matrix[j]*d[i+k]+matrix[j+4]*d[i+k+1]+matrix[j+8]*d[i+k+2]+(k?0:matrix[j+12]));
      this.data.push(...d.slice(i+6,i+9));
    }
  }
}

export function createIslandMesh() {
  const mesh=new MeshBuilder();
  for (const island of landforms) {
    const land=new MeshBuilder(),random=randomSeed(island.seed), sand=rgb(island.rocky?'#8d9697':'#edd8a3'), grass=rgb(island.rocky?'#65777c':'#779f60');
    const ringScales=[1,.89,.71,.38,0],ringHeights=[-2,1.8,island.steep?12:4,island.height*(island.steep?.78:.6),island.height], segments=island.reef?14:56;
    // Ring-first order preserves winding and seeded color/decor placement.
    land.grid(4,segments,(r,index)=>{
      const a=index/segments*TAU,radius=shoreRadius(a)*ringScales[r];
      return [Math.cos(a)*island.rx*radius,ringHeights[r]+(r&&r<4?Math.sin(a*7+r)*(island.rocky?2.7:.6):0),Math.sin(a)*island.rz*radius];
    },ring=>(ring<1?sand:grass).map(v=>v*(.9+random()*.13)));
    for(let i=0;i<(island.rocky?0:island.rx>100?32:16);i++) {
      const a=random()*TAU,r=.73+random()*.1,x=Math.cos(a)*island.rx*r,z=Math.sin(a)*island.rz*r;
      const tree=new MeshBuilder(),h=8+random()*6;
      tree.beam([0,0,0],[1,h,0],.65,rgb('#8e7960'));
      for(let j=0;j<7;j++) {
        const angle=j/7*TAU,dx=Math.cos(angle),dz=Math.sin(angle);
        tree.triangle([1-dz*.7,h,dx*.7],[1+dx*7,h-1.2,dz*7],[1+dz*.7,h,-dx*.7],rgb('#458d62'));
      }
      const ground=island.steep?1.8+10.2*Math.max(0,Math.min(1,(.89-r/shoreRadius(a))/.18)):3.2;
      land.append(tree,modelMatrix(x,ground,z,random()*TAU));
    }
    for(let i=0;i<(island.reef?4:24);i++) {
      const a=random()*TAU,r=.87+random()*.035,size=1.8+random()*3.5;
      land.sphere(Math.cos(a)*island.rx*r,1.7,Math.sin(a)*island.rz*r,size,size*.7,size*.9,rgb(island.rocky?'#889499':'#a6aa91'),5,3);
    }
    mesh.append(land,modelMatrix(island.x,0,island.z));
    // Reuse the first reef rock for distant scenery without adding collision landforms.
    if(island===landforms[3])for(const [x,z,s] of [[-550,420,1.4],[510,590,1.8],[-600,-430,.8],[620,-440,1.1]])
      mesh.append(land,modelMatrix(x*2.2,0,z*2.2,0,0,0,s*18));
  }
  return mesh;
}
export function createCraftMesh(id) {
  const mesh=new MeshBuilder(),color=rgb(RACER_COLORS[id]),white=rgb('#f7f0dc');
  const hull=(y,w,l,c)=>{
    const points=[[-w,y,-l*.8],[w,y,-l*.8],[w*.68,y,l*.55],[0,y,l],[-w*.68,y,l*.55]];
    for(let i=0;i<5;i++){
      const p=points[i],q=points[(i+1)%5];
      mesh.triangle(p,[0,y,0],q,c);
      mesh.triangle(p,[0,y-.6,-.1],q,c);
    }
  };
  hull(.1,1.05,2.7,white); hull(.42,.89,2.35,color);
  // Low, tapered fairing follows the bow instead of a freestanding console cube.
  const rear=[[-.36,.43,.28],[.36,.43,.28],[.29,.65,.4],[-.29,.65,.4]];
  const nose=[[-.16,.46,2.05],[.16,.46,2.05],[.12,.84,1.95],[-.12,.84,1.95]];
  mesh.taperedBox(rear,nose,color,true);
  // Seat the horn in the fairing surface so its taper stays exposed.
  mesh.cone(0,.8,1.85,.13,0,.55,white,5);
  return mesh;
}
export function createRiderMesh(racer) {
  const mesh = new MeshBuilder(), color = rgb(RACER_COLORS[racer.id]), dark = rgb('#263f43'), white = rgb('#f7f0dc');
  const suit = color.map(channel=>channel*.8);
  const pose = riderPose(racer), { hips } = pose;
  mesh.beam(pose.handlebar.pivot,pose.handlebar.center,.16,dark);
  mesh.beam(...pose.handlebar.ends,.12,dark);
  mesh.box(hips[0], hips[1], hips[2], .56, .27, .34, suit);
  for (const limb of pose.limbs) {
    mesh.beam(limb.hip, limb.knee, .28, suit);
    mesh.beam(limb.knee, limb.foot, .25, suit);
    mesh.beam(limb.shoulder, limb.elbow, .20, suit);
    mesh.beam(limb.elbow, limb.hand, .18, white);
    // One boot reaches the deck without a separate footrest underneath.
    mesh.box(limb.foot[0],.56,limb.foot[2]+.10,.27,.28,.48,dark);
  }
  const upper = new MeshBuilder();
  upper.box(0,-.05,0,.66,.7,.38,suit);
  upper.sphere(0, .57, .02, .26, .29, .28, color, 8, 5);
  upper.box(0, .60, .27, .39, .12, .07, dark);
  mesh.append(upper, pose.torsoMatrix);
  return mesh;
}
export function createBuoyMesh() {
  const mesh=new MeshBuilder(), white=rgb('#fff6df'),dark=rgb('#203f49');
  const color=[-1,0,0];
  // Negative red tags body/arrow colors for the per-buoy shader palette.
  mesh.cone(0,-.65,0,2.2,1.7,1.25,dark);
  mesh.cone(0,.6,0,1.7,1.15,1.2,white);
  mesh.cone(0,1.8,0,1.15,.3,3.4,color);
  mesh.box(0,6.2,0,.18,4,.18,dark);
  // The shader makes start/finish arrows black; the model mirrors passing direction.
  const z=-.06;
  mesh.triangle([0,8.2,z],[-3.7,7.35,z],[0,6.5,z],[-1,1,0]);
  return mesh;
}

// A Wide, drive-through opening, aligned with the start/finish checkpoint.



export function createLighthouseMesh() {
  const mesh=new MeshBuilder(),white=rgb('#f5eed5'),coral=rgb('#ed796b'),dark=rgb('#243c55');
  mesh.cone(0,-7,0,9,7,9,white,12);
  mesh.cone(0,2,0,6,3.3,30,white,12);
  mesh.cone(0,32,0,6,6,1.2,dark,12);
  mesh.cone(0,39.5,0,5,0,4,coral,12);
  return mesh;
}

export function createBeaconMesh() {
  const mesh=new MeshBuilder(),drop=LIGHTHOUSE.y+LIGHTHOUSE.lampHeight-2;
  // Rainbow top/bottom bands and outer walls form a widening light volume.
  for(let band=0;band<7;band++){
    const left=(band/7-.5)*128,right=((band+1)/7-.5)*128,color=rgb(RAINBOW_COLORS[band]);
    const a=[left,-drop-20,320],b=[right,-drop-20,320],c=[right,-drop+20,320],d=[left,-drop+20,320],origin=[0,0,0];
    mesh.triangle(origin,a,b,color);mesh.triangle(origin,c,d,color);
    // Internal walls would stack all seven colors into an opaque white beam.
    if(!band)mesh.triangle(origin,d,a,color);
    if(band===6)mesh.triangle(origin,b,c,color);
  }
  return mesh;
}

export function createSeabedMesh() {
  const mesh=new MeshBuilder();
  for(let x=-700;x<900;x+=16)for(let z=-650;z<650;z+=16){
    const point=(dx,dz)=>[x+dx,seabedHeight(x+dx,z+dz),z+dz];
    const shade=.92+.08*Math.sin(x*.31+z*.24);
    mesh.quad(point(0,0),point(0,16),point(16,16),point(16,0),[.7*shade,.7*shade,.4*shade]);
  }
  return mesh;
}
export function createSeaGrassMesh() {
  const mesh=new MeshBuilder(),random=randomSeed(712);
  for(const island of islands)for(let patch=0;patch<190;patch++){
    const a=random()*TAU,r=1.14+random()*.8;
    const x=island.x+Math.cos(a)*island.rx*r,z=island.z+Math.sin(a)*island.rz*r,y=seabedHeight(x,z);
    if(y> -5.8||y< -19)continue;
    for(let blade=0;blade<6;blade++){
      const angle=random()*TAU,h=1+random()*1.8,dx=Math.cos(angle),dz=Math.sin(angle);
      const base=[x+dx*.9,y,z+dz*.9],tip=[base[0]+dx*.8,y+h,base[2]+dz*.8];
      mesh.triangle([base[0]-dz*.25,y,base[2]+dx*.25],tip,[base[0]+dz*.25,y,base[2]-dx*.25],[.1+random()*.1,.4+random()*.2,.2]);
    }
  }
  return mesh;
}
