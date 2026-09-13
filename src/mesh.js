import { TAU, randomSeed, modelMatrix } from './math.js';
import { riderPose } from './boat-physics.js';
import { gates, shoreRadius, RACER_COLORS, islands, landforms, RAINBOW_COLORS, LIGHTHOUSE, seabedHeight, coursePoint, waveHeight } from './course.js';

export function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
export class MeshBuilder {
  constructor() { this.data = []; }
  triangle(a, b, c, color) {
    const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
    let normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal) || 1; normal = normal.map(n => n / length);
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
    for (let i = 0; i < sides; i++) {
      const a = i / sides * TAU, b = (i + 1) / sides * TAU;
      const p = [x+Math.cos(a)*bottom,y,z+Math.sin(a)*bottom], q = [x+Math.cos(b)*bottom,y,z+Math.sin(b)*bottom];
      const r = [x+Math.cos(b)*top,y+height,z+Math.sin(b)*top], s = [x+Math.cos(a)*top,y+height,z+Math.sin(a)*top];
      this.quad(p,s,r,q,color); this.triangle([x,y+height,z],r,s,color);
    }
  }
  sphere(x, y, z, rx, ry, rz, color, segments = 8, rings = 5) {
    const point = (a,b) => [x+Math.sin(b)*Math.cos(a)*rx,y+Math.cos(b)*ry,z+Math.sin(b)*Math.sin(a)*rz];
    for(let i=0;i<segments;i++) for(let j=0;j<rings;j++) {
      const a=i/segments*TAU,b=(i+1)/segments*TAU,c=j/rings*Math.PI,d=(j+1)/rings*Math.PI;
      this.quad(point(a,c),point(b,c),point(b,d),point(a,d),color);
    }
  }
  beam(a, b, width, color) {
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
    const shape=new MeshBuilder(); shape.box(0,0,length/2,width,width,length,color);
    this.append(shape,modelMatrix(...a,Math.atan2(dx,dz),-Math.asin(dy/length)));
  }
  append(mesh, matrix) {
    for (let i=0;i<mesh.data.length;i+=9) {
      const d=mesh.data,x=d[i],y=d[i+1],z=d[i+2],nx=d[i+3],ny=d[i+4],nz=d[i+5];
      this.data.push(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14],
        matrix[0]*nx+matrix[4]*ny+matrix[8]*nz,matrix[1]*nx+matrix[5]*ny+matrix[9]*nz,matrix[2]*nx+matrix[6]*ny+matrix[10]*nz,d[i+6],d[i+7],d[i+8]);
    }
  }
}

export function createIslandMesh() {
  const mesh=new MeshBuilder();
  for (const island of landforms) {
    const land=new MeshBuilder(),random=randomSeed(island.seed), sand=rgb(island.rocky?'#8d9697':'#edd8a3'), grass=rgb(island.rocky?'#65777c':'#779f60');
    const ringScales=[1,.89,.71,.38,0],ringHeights=[-2,1.8,island.steep?12:4,island.height*(island.steep?.78:.6),island.height], segments=island.reef?14:56;
    for(let ring=0;ring<4;ring++) for(let i=0;i<segments;i++) {
      const point=(index,r)=>{ const a=index/segments*TAU, radius=shoreRadius(a)*ringScales[r]; return [Math.cos(a)*island.rx*radius,ringHeights[r]+(r&&r<4?Math.sin(a*7+r)*(island.rocky?2.7:.6):0),Math.sin(a)*island.rz*radius]; };
      const base=ring<1?sand:grass, color=base.map(v=>v*(.9+random()*.13));
      land.quad(point(i,ring),point(i,ring+1),point(i+1,ring+1),point(i+1,ring),color);
    }
    for(let i=0;i<(island.rocky?0:island.rx>100?32:16);i++) {
      const a=random()*TAU,r=.73+random()*.1,x=Math.cos(a)*island.rx*r,z=Math.sin(a)*island.rz*r;
      const tree=new MeshBuilder(),h=8+random()*6;
      tree.beam([0,0,0],[1,h,0],.65,rgb('#8e7960'));
      for(let j=0;j<7;j++) {
        const angle=j/7*TAU,dx=Math.cos(angle),dz=Math.sin(angle),w=1.2;
        const base=[1,h,0],mid=[1+dx*3.4,h+1,dz*3.4],tip=[1+dx*7,h-1.2,dz*7];
        const left=[mid[0]-dz*w,mid[1]-.5,mid[2]+dx*w],right=[mid[0]+dz*w,mid[1]-.5,mid[2]-dx*w];
        tree.triangle(base,left,mid,rgb('#3e8863'));tree.triangle(base,mid,right,rgb('#65aa6d'));
        tree.triangle(mid,left,tip,rgb('#458d62'));tree.triangle(mid,tip,right,rgb('#70ac69'));
      }
      const ground=island.steep?1.8+10.2*Math.max(0,Math.min(1,(.89-r/shoreRadius(a))/.18)):3.2;
      land.append(tree,modelMatrix(x,ground,z,random()*TAU));
    }
    for(let i=0;i<(island.reef?4:24);i++) {
      const a=random()*TAU,r=.87+random()*.035,size=1.8+random()*3.5;
      land.sphere(Math.cos(a)*island.rx*r,1.7,Math.sin(a)*island.rz*r,size,size*.7,size*.9,rgb(island.rocky?'#889499':'#a6aa91'),5,3);
    }
    mesh.append(land,modelMatrix(island.x,0,island.z));
  }
  // A tiny beach pavilion gives the course a memorable home straight.
  mesh.box(-30,3.7,-72,13,1,7,rgb('#cab388'));
  for(const x of [-35,-25]) for(const z of [-74,-70]) mesh.box(x,6,z,.4,5,.4,rgb('#e8d4a5'));
  mesh.cone(-30,8.3,-72,9,0,3,rgb('#da8267'),4);
  // Larger offshore silhouettes sit beyond a broad stretch of open water.
  for(const [x,z,s] of [[-550,420,1.4],[510,590,1.8],[-600,-430,.8],[620,-440,1.1]]) {
    mesh.sphere(x*2.2,0,z*2.2,275*s,112.5*s,187.5*s,rgb('#86ada0'),7,3);
    mesh.sphere(x*2.2+85,20,z*2.2,150*s,162.5*s,125*s,rgb('#93b6a6'),6,3);
  }
  return mesh;
}
export function createCraftMesh(id) {
  const mesh=new MeshBuilder(),color=rgb(RACER_COLORS[id]),white=rgb('#f7f0dc');
  const hull=(y,w,l,c)=>{
    const a=[-w,y,-l*.8],b=[w,y,-l*.8],d=[w*.68,y,l*.55],e=[0,y,l],f=[-w*.68,y,l*.55];
    const low=[0,y-.6,-.1];
    mesh.triangle(a,d,b,c);mesh.triangle(a,f,d,c);mesh.triangle(f,e,d,c);
    for(const [p,q] of [[a,b],[b,d],[d,e],[e,f],[f,a]]) mesh.triangle(p,low,q,c);
  };
  hull(.1,1.05,2.7,white); hull(.42,.89,2.35,color);
  // Low, tapered fairing follows the bow instead of a freestanding console cube.
  const rear=[[-.36,.43,.28],[.36,.43,.28],[.29,.65,.4],[-.29,.65,.4]];
  const nose=[[-.16,.46,2.05],[.16,.46,2.05],[.12,.84,1.95],[-.12,.84,1.95]];
  mesh.taperedBox(rear,nose,color,true);
  const horn=new MeshBuilder();horn.cone(0,0,0,.13,0,.70,white,5);
  mesh.append(horn,modelMatrix(0,.48,1.85,0,.65));
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
export function createGateMesh(index, active=false, buoySide=gates[index].side,courseGates=gates) {
  const mesh=new MeshBuilder(), gate=courseGates[index], white=rgb('#fff6df'),dark=rgb('#203f49');
  const color=rgb(gate.side>0?(active?'#ff9582':'#ff7669'):(active?'#8ffdf3':'#66e6ed'));
  // A single marker alternates sides; the start/finish keeps a checkered pair.
  mesh.cone(0,-.65,0,2.2,1.7,1.25,dark);
  mesh.cone(0,.6,0,1.7,1.15,1.2,white);
  mesh.cone(0,1.8,0,1.15,.3,3.4,color);
  mesh.box(0,6.2,0,.18,4,.18,dark);
  mesh.quad([0,8.2,0],[-buoySide*3.7,8.2,0],[-buoySide*3.7,6.5,0],[0,6.5,0],color);
  // The approach face is local -Z; the flag hides markings from behind.
  const z=-.06;
  if(index===0)for(let row=0;row<2;row++)for(let col=0;col<4;col++) {
    const x=-buoySide*col*.9,y=6.525+row*.75,end=x-buoySide*.9;
    mesh.quad([x,y,z],[end,y,z],[end,y+.75,z],[x,y+.75,z],(row+col)%2?dark:white);
  }
  else {
    const mid=-buoySide*1.8;
    mesh.triangle([mid+buoySide*.6,7.9,z],[mid-buoySide*.6,7.35,z],[mid+buoySide*.6,6.8,z],dark);
  }
  return mesh;
}

// A Wide, drive-through opening, aligned with the start/finish checkpoint.
export function createRainbowMesh(courseGates=gates){
  const mesh=new MeshBuilder(),gate=courseGates[0],arc=new MeshBuilder(),segments=56;
  const point=(radius,angle)=>[Math.cos(angle)*radius,Math.sin(angle)*radius*.8-.6,0];
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI,b=(i+1)/segments*Math.PI;
    arc.quad(point(39,a),point(39,b),point(31.65,b),point(31.65,a),[0,0,0]);
  }
  // Carry local circular coordinates in the color attribute for spectral shading.
  // One two-sided surface avoids stacking transparency across seven solid bands.
  for(let i=0;i<arc.data.length;i+=9){arc.data[i+6]=arc.data[i];arc.data[i+7]=(arc.data[i+1]+.6)/.8;}
  mesh.append(arc,modelMatrix(gate.x,0,gate.z,Math.atan2(gate.tangent.x,gate.tangent.z)));
  return mesh;
}


export function createLighthouseMesh() {
  const mesh=new MeshBuilder(),white=rgb('#f5eed5'),coral=rgb('#ed796b'),dark=rgb('#243c55');
  mesh.cone(0,-7,0,9,7,9,white,12);
  for(let i=0;i<6;i++)mesh.cone(0,2+i*5,0,6-i*.45,6-(i+1)*.45,5,i%2?coral:white,12);
  mesh.cone(0,32,0,6,6,1.2,dark,12);
  mesh.cone(0,39.5,0,5,0,4,coral,12);
  return mesh;
}

export function createBeaconMesh() {
  const mesh=new MeshBuilder(),drop=LIGHTHOUSE.y+LIGHTHOUSE.lampHeight-2;
  // Seven adjacent translucent shafts, widening and dipping toward the sea.
  for(let band=0;band<7;band++){
    const left=(band/7-.5)*128,right=((band+1)/7-.5)*128,color=rgb(RAINBOW_COLORS[band]);
    const a=[left,-drop-20,320],b=[right,-drop-20,320],c=[right,-drop+20,320],d=[left,-drop+20,320],origin=[0,0,0];
    mesh.triangle(origin,a,b,color);mesh.triangle(origin,c,d,color);
    mesh.triangle(origin,d,a,color);mesh.triangle(origin,b,c,color);
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
export function createFishMesh(time,player) {
  const mesh=new MeshBuilder();
  // Small deterministic schools swim around the circuit, entirely underwater.
  for(let school=0;school<24;school++){
    const home=coursePoint(school/24),phase=time*.28+school*2.4;
    if(Math.hypot(home.x-player.x,home.z-player.z)>155)continue;
    for(let fish=0;fish<4;fish++){
      const angle=phase+fish*.18,x=home.x+Math.sin(angle)*9+fish*1.5,z=home.z+Math.cos(angle)*7;
      const floor=seabedHeight(x,z);if(floor> -5.5)continue;
      const y=Math.min(-3.8,waveHeight(x,z,time)-1.3,floor+2.2+Math.sin(time*1.1+fish)*.4),shape=new MeshBuilder();
      const color=rgb(['#ffd56b','#fa927a','#94dae0'][school%3]);
      for(const side of [-1,1])for(const vertical of [-1,1]) {
        const flank=[side*.27,0,0],edge=[0,vertical*.35,0];
        const [a,b]=side*vertical>0?[flank,edge]:[edge,flank];
        shape.triangle([0,0,.95],a,b,color);
        shape.triangle([0,0,-.95],b,a,color);
      }
      const wag=Math.sin(time*8+fish+school)*.3;
      shape.triangle([0,0,-.7],[wag,.55,-1.5],[wag,-.55,-1.5],color);
      mesh.append(shape,modelMatrix(x,y,z,Math.atan2(Math.cos(angle)*9,-Math.sin(angle)*7)));
    }
  }
  return mesh;
}
