import { clamp } from './math.js';
import { gates, sampleWater } from './course.js';

export function createBuoys(course) {
  return (course?.gates||gates).flatMap((g,index) => (index === 0 ? [-1,1] : [g.side]).map(side => {
    const x=g.x+g.tangent.z*side*g.width,z=g.z-g.tangent.x*side*g.width;
    return {gate:index,side,anchorX:x,anchorZ:z,x,z,y:0,vx:0,vz:0,leanX:0,leanZ:0,tiltVX:0,tiltVZ:0};
  }));
}
export function stepBuoys(race,dt) {
  for(const b of race.buoys){
    const water=sampleWater(b.x,b.z,race.worldTime);
    b.y=water.height;
    // A damped mooring returns each buoy to its course position after a bump.
    for(const [axis,anchor,velocity,lean,tilt,normal] of [
      ['x','anchorX','vx','leanX','tiltVX','nx'],['z','anchorZ','vz','leanZ','tiltVZ','nz']]){
      b[velocity]+=((b[anchor]-b[axis])*12-b[velocity]*5)*dt;
      b[axis]+=b[velocity]*dt;
      const target=clamp((b[axis]-b[anchor])*.12-water[normal]*.45,-.42,.42);
      b[tilt]+=((target-b[lean])*22-b[tilt]*6)*dt;
      b[lean]=clamp(b[lean]+b[tilt]*dt,-.55,.55);
    }
    const dx=b.x-b.anchorX,dz=b.z-b.anchorZ,d=Math.hypot(dx,dz);
    if(d>3){b.x=b.anchorX+dx*3/d;b.z=b.anchorZ+dz*3/d;b.vx*=.5;b.vz*=.5;}
  }
}

// Three overlapping circles approximate the long hull, including bow/stern hits.
function hullContacts(r) {
  const s=Math.sin(r.yaw),c=Math.cos(r.yaw);
  return [-1.05,0,1.15].map(offset=>({x:r.x+s*offset,z:r.z+c*offset}));
}
function contact(a,b,range) {
  const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
  return d<range?{nx:d>1e-6?dx/d:1,nz:d>1e-6?dz/d:0,depth:range-d,x:(a.x+b.x)/2,z:(a.z+b.z)/2}:null;
}
function deepestHit(a,b,range) {
  let hit=null;
  for(const p of a)for(const q of b){const h=contact(p,q,range);if(h&&(!hit||h.depth>hit.depth))hit=h;}
  return hit;
}
function impulse(r,x,z,point) {
  r.vx+=x;r.vz+=z;r.speed=Math.hypot(r.vx,r.vz);
  // Offset impacts yaw the hull and kick the existing rider spring.
  r.yawRate=clamp(r.yawRate+((point.z-r.z)*x-(point.x-r.x)*z)*.12,-2.5,2.5);
  const side=x*Math.cos(r.yaw)-z*Math.sin(r.yaw),forward=x*Math.sin(r.yaw)+z*Math.cos(r.yaw);
  r.rollRate=clamp(r.rollRate-side*.018,-3,3);
  r.rider.vx=clamp(r.rider.vx-side*.055,-3,3);
  r.rider.vz=clamp(r.rider.vz-forward*.045,-3,3);
}
function impact(race,a,other,hit,strength) {
  if(strength<2||a.impactCooldown>0)return;
  a.impactCooldown=.22;
  race.events.push({type:'impact',id:a.id,other,x:hit.x,z:hit.z,y:a.y,strength});

}
export function collideBuoys(race,r) {
  if(r.finishTime!==null)return;
  for(const b of race.buoys){
    const height=r.y-b.y;
    if(height>4.7||height< -2.5)continue;
    const radius=clamp(2-height*.3,.5,2);
    const hit=deepestHit(hullContacts(r),[b],1.25+radius);
    if(!hit)continue;
    // The buoy is lighter than the craft, but tethered to its anchor.
    const nx=hit.nx,nz=hit.nz,closing=(r.vx-b.vx)*nx+(r.vz-b.vz)*nz;
    r.x+=nx*hit.depth*.7;r.z+=nz*hit.depth*.7;
    b.x-=nx*hit.depth*.3;b.z-=nz*hit.depth*.3;
    if(closing<0){
      const force=-closing*.72;
      impulse(r,nx*force,nz*force,hit);
      b.vx-=nx*force*1.4;b.vz-=nz*force*1.4;
      b.tiltVX=clamp(b.tiltVX-nx*force*.05,-3,3);b.tiltVZ=clamp(b.tiltVZ-nz*force*.05,-3,3);
      impact(race,r,'buoy',hit,force);
    }
  }
}
export function collideRacers(race) {
  const racers=race.racers;
  for(let i=0;i<racers.length;i++)for(let j=i+1;j<racers.length;j++){
    const a=racers[i],b=racers[j];
    if(a.finishTime!==null||b.finishTime!==null||Math.abs(a.y-b.y)>1.8)continue;
    const hit=deepestHit(hullContacts(a),hullContacts(b),2.7);
    if(!hit)continue;
    const nx=hit.nx,nz=hit.nz;
    const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
    a.x+=nx*hit.depth*.5;a.z+=nz*hit.depth*.5;b.x-=nx*hit.depth*.5;b.z-=nz*hit.depth*.5;
    if(closing<0){
      // Equal/opposite impulses transfer momentum; low restitution keeps bumps forgiving.
      const force=-closing*.58;
      impulse(a,nx*force,nz*force,hit);impulse(b,-nx*force,-nz*force,hit);
      impact(race,a,b.id,hit,force);impact(race,b,a.id,hit,force);
    }
  }
}
