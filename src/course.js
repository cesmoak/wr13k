// Uneven stations preserve an opening run-up, then tighten into slalom clusters.
const buoyStations = [0,1.35,2.4,3.35,4.35,5.35,6.25,7.05,8.05,9.25,10.25,11.25,12.25,13.05,14.05,15.05,16.15,17.25];
export const GATE_COUNT = buoyStations.length;
export const LAPS = 3;
export const GATE_WIDTH = 18;
// The south straight hugs the main island; the east leg threads the island channel.
export const islands = [
  // Keep the flat main island's collision close to the beach waterline.
  { x: 0, z: 0, rx: 150, rz: 84, height: 20, seed: 431, collisionScale: .915 },
  { x: 270, z: 5, rx: 62, rz: 90, height: 43, seed: 917, steep: true },
  { x: 345, z: -235, rx: 32, rz: 26, height: 19, seed: 1263, rocky: true }
];
// A broken reef reaches from the back of the beach to the lighthouse.
// Leave a navigable gap where the original offshore course crosses it.
export const outerReefRocks = [[397,70,12,10],[380,0,13,12],[424,-70,14,11],[391,-140,12,9]]
  .map(([x,z,r,height],i)=>({x,z,rx:r,rz:r*.85,height,seed:2101+i*43,rocky:true,reef:true}));
export const reefRocks = [...outerReefRocks,...[[291,-81,11,8],[300,-99,9,10],[307,-116,8,7],
  [322,-189,10,11],[333,-204,9,8],[340,-218,11,10]].map(([x,z,r,height],i)=>
  ({x,z,rx:r,rz:r*.85,height,seed:1701+i*43,rocky:true,reef:true}))];
export const landforms=[...islands,...reefRocks];
// Sail out past the sandy island beach, round the rocky outcrop, then return
// along the other side of the offshore loop before entering the island channel.
const route = [[-105,-112],[55,-124],[150,-166],[245,-248],[330,-300],[405,-267],
  [408,-195],[336,-147],[250,-137],[178,-66],[180,5],[168,62],
  [115,104],[40,129],[-55,129],[-137,90],[-190,24],[-171,-58]];
function splinePoint(t,points) {
  const u=((t%1+1)%1)*points.length,i=Math.floor(u),f=u-i;
  const [a,b,c,d]=[-1,0,1,2].map(offset=>points[(i+offset+points.length)%points.length]);
  const spline=axis=>.5*(2*b[axis]+(-a[axis]+c[axis])*f+(2*a[axis]-5*b[axis]+4*c[axis]-d[axis])*f*f+(-a[axis]+3*b[axis]-3*c[axis]+d[axis])*f*f*f);
  return {x:spline(0),z:spline(1)};
}
function buildCourse(id,name,description,points,stations,difficulty='rocky') {
  const course={id,name,description,points,freePlay:id==='free',
    lighting:{free:'cycle',main:'day',reverse:'sunset',rocky:'night',sunrise:'sunrise'}[id],
    aiSkill:{free:0,main:0,reverse:1,rocky:2,sunrise:2}[id]};
  course.samples=Array.from({length:240},(_,i)=>splinePoint(i/240,points));
  course.gates=stations.map((station,index)=>{
    const t=station/points.length,p=splinePoint(t,points),a=splinePoint(t-.0001,points),b=splinePoint(t+.0001,points),d=Math.hypot(b.x-a.x,b.z-a.z);
    const tangent={x:(b.x-a.x)/d,z:(b.z-a.z)/d},side=index%2?1:-1;
    const channel=difficulty==='rocky'?index>=9&&index<=11:p.x>155&&p.x<195&&Math.abs(p.z)<85;
    const reef=difficulty==='reef'&&p.x>350&&p.z> -185;
    const slalom=reef||(difficulty==='rocky'?[1,2,12,13].includes(index):difficulty==='hard'&&!channel&&index>0);
    const width=reef?12:difficulty==='easy'?(channel?14:index?22:18):difficulty==='hard'?(channel?12:14):18;
    const offset=difficulty==='reef'?0:index?-side*(channel?(difficulty==='rocky'?2:1):slalom?(difficulty==='hard'?20:22):difficulty==='rocky'?7:0):0;
    const x=p.x+tangent.z*offset,z=p.z-tangent.x*offset;
    return {x,z,tangent,index,t,side,width,slalom,channel,offshore:difficulty==='reef'?z< -130:difficulty==='rocky'&&index>=2&&index<=8,
      buoy:{x:x+tangent.z*side*width,z:z-tangent.x*side*width}};
  });
  course.bounds={
    minX:Math.min(...course.samples.map(p=>p.x),...landforms.map(i=>i.x-i.rx*1.08))-35,
    maxX:Math.max(...course.samples.map(p=>p.x),...landforms.map(i=>i.x+i.rx*1.08))+35,
    minZ:Math.min(...course.samples.map(p=>p.z),...landforms.map(i=>i.z-i.rz*1.08))-35,
    maxZ:Math.max(...course.samples.map(p=>p.z),...landforms.map(i=>i.z+i.rz*1.08))+35
  };
  return course;
}
const mainRoute=[[-105,-112],[55,-124],[135,-114],[170,-62],[180,5],[168,62],
  [115,104],[40,129],[-55,129],[-137,90],[-190,24],[-171,-58]];
const reverseRoute=[[-105,-112],[-180,-65],[-210,20],[-150,98],[-55,144],[48,146],
  [128,118],[175,65],[180,5],[175,-64],[135,-130],[55,-140]];
const sunriseRoute=[[180,0],[190,70],[240,125],[315,125],[365,70],[419,0],
  [383,-70],[431,-140],[440,-220],[393,-291],[325,-305],[257,-250],[240,-190],
  [222,-140],[184,-92],[180,-40]];
export const COURSES={
  free:buildCourse('free','Free play','Changing skies · explore three islands · no race or buoys.',mainRoute,[],'easy'),
  main:buildCourse('main','Main island loop','Daylight · clockwise · easy buoys · 3 laps.',mainRoute,Array.from({length:10},(_,i)=>i*1.2),'easy'),
  reverse:buildCourse('reverse','Main island reverse','Sunset to dusk · tight reverse slalom · strong rivals · 3 laps.',reverseRoute,Array.from({length:16},(_,i)=>i*.75),'hard'),
  rocky:buildCourse('rocky','Rocky island loop','Night · choppy offshore seas · expert rivals · 3 laps.',route,buoyStations),
  sunrise:buildCourse('sunrise','Sunrise reef loop','Dawn to daylight · dodge the outer reef · 3 laps.',sunriseRoute,[0,1,2,2.5,3,4,5,6,7,8,9,9.5,10,11,12,13,14,15],'reef')
};
export function coursePoint(t,course=COURSES.rocky){return splinePoint(t,course.points);}
export function courseTangent(t,course=COURSES.rocky){
  const a=coursePoint(t-.0001,course),b=coursePoint(t+.0001,course),d=Math.hypot(b.x-a.x,b.z-a.z);
  return {x:(b.x-a.x)/d,z:(b.z-a.z)/d};
}
// Default exports retain the offshore course for standalone development fixtures.
export const gates=COURSES.rocky.gates,courseSamples=COURSES.rocky.samples,courseBounds=COURSES.rocky.bounds;
export const LIGHTHOUSE = { x: islands[2].x, y: islands[2].height-3, z: islands[2].z, lampHeight: 37 };
export const RAINBOW_COLORS = ['#ff655f','#ffab55','#ffe46b','#9ee36b','#58d8d9','#6095ee','#b87ae4'];
export const RACER_COLORS = ['#9dff00', '#ff382f', '#8844ff', '#ffbd00'];
export const RACER_NAMES = ['YOU', 'CORAL', 'IRIS', 'SOL'];

// Layer coefficients also generate the GPU wave equations in renderer.js.
export const MAX_WAKES = 12;
export const WAVE_SCALE = 2.4;
export const WAVE_SPACING = 1.35;
// x/z frequency, angular speed, height, phase, dependence on local chop.
// Long crossing swells, rolling wave trains, short chop, and wind ripples.
export const WAVE_LAYERS = [
  [.041, .026, -1.05, .52, 0, 0],
  [-.032, .067, 1.34, .34, 1.8, 0],
  [.075, -.018, 1.65, .30, .7, .25],
  [.10, .15, -2.4, .24, 2.6, 1],
  [-.23, .17, -3.1, .11, 1.2, 1],
  [.31, .12, 3.8, .065, 4.1, 1]
];
// Smoothly exposed water between the sandy island beach and the rocky island.
// The shader interpolates these same parameters to keep hulls and water aligned.
export const OFFSHORE_SEA={x:310,z:-240,rx:245,rz:175,inner:.45,outer:1.15,chop:1.2,swell:.25};
export function offshoreExposure(x,z){
  const sea=OFFSHORE_SEA,d=Math.hypot((x-sea.x)/sea.rx,(z-sea.z)/sea.rz);
  const f=Math.max(0,Math.min(1,(sea.outer-d)/(sea.outer-sea.inner)));
  return f*f*(3-2*f);
}
export function waveHeight(x, z, time, wakes = []) {
  // Smooth spatial patches and slowly traveling groups avoid abrupt zone edges.
  // Keep these two envelopes in sync with waterHeight() in the vertex shader.
  const exposed=offshoreExposure(x,z);
  const chop = .2 + .8 * (.5 + .5 * Math.sin(x * .013 + z * .009)) ** 2 + exposed*OFFSHORE_SEA.chop;
  const group = .78 + .22 * Math.sin(x * .008 - z * .006 - time * .21);
  let height = 0;
  for (const [kx,kz,speed,amplitude,phase,localChop] of WAVE_LAYERS) {
    height += Math.sin((x*kx + z*kz)*WAVE_SPACING + time*speed + phase) * amplitude
      * (1 - localChop + localChop*chop);
  }
  height *= WAVE_SCALE * group * (1+exposed*OFFSHORE_SEA.swell);
  for (const wake of wakes) {
    const age = time - wake.time;
    if (age < 0 || age > 2.8) continue;
    const radius = Math.hypot(x - wake.x, z - wake.z), front = (radius - age * 8) / 4;
    height += wake.amplitude * Math.exp(-age * .9 - front * front) * Math.sin(radius * .8 - age * 6);
  }
  return height;
}
export function sampleWater(x, z, time, wakes = []) {
  const h = waveHeight(x, z, time, wakes);
  const dx = (waveHeight(x + .2, z, time, wakes) - waveHeight(x - .2, z, time, wakes)) / .4;
  const dz = (waveHeight(x, z + .2, time, wakes) - waveHeight(x, z - .2, time, wakes)) / .4;
  const velocity = (waveHeight(x, z, time + .01, wakes) - waveHeight(x, z, time - .01, wakes)) / .02;
  const length = Math.hypot(dx, 1, dz);
  return { height: h, nx: -dx / length, ny: 1 / length, nz: -dz / length, velocity };
}
export function shoreRadius(angle) {
  return 1 + Math.sin(angle * 5) * .045 + Math.cos(angle * 7) * .028;
}
export function nearestCourse(x, z, course=COURSES.rocky) {
  let best = Infinity, index = 0;
  course.samples.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) { best = d; index = i; }
  });
  return { distance: best, index };
}


// A shallow sandy shelf slopes continuously away from each generated shore.
export function seabedHeight(x,z) {
  let shore=Infinity;
  for(const island of landforms){
    const dx=(x-island.x)/island.rx,dz=(z-island.z)/island.rz;
    shore=Math.min(shore,(Math.hypot(dx,dz)-shoreRadius(Math.atan2(dz,dx)))*Math.min(island.rx,island.rz));
  }
  return -2-Math.min(34,Math.max(0,shore)*.16);
}


// Project onto the closed circuit, including the final segment across the seam.
// Continuous progress keeps the sky smooth between sampled course points.
export function courseProgress(x,z,course=COURSES.rocky) {
  const courseSamples=course.samples;
  let best=Infinity,progress=0;
  for(let i=0;i<courseSamples.length;i++){
    const a=courseSamples[i],b=courseSamples[(i+1)%courseSamples.length],dx=b.x-a.x,dz=b.z-a.z;
    const f=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const distance=(x-a.x-dx*f)**2+(z-a.z-dz*f)**2;
    if(distance<best){best=distance;progress=(i+f)/courseSamples.length;}
  }
  return progress%1;
}
