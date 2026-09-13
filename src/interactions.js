import { clamp } from './math.js';
import { gates, sampleWater } from './course.js';

export function createBuoys(course) {
  return (course?.gates||gates).flatMap((g,index) => (index === 0 ? [-1,1] : [g.side]).map(side => {
    const x=g.x+g.tangent.z*side*g.width,z=g.z-g.tangent.x*side*g.width;
    return {gate:index,side,x,z,y:0,leanX:0,leanZ:0};
  }));
}
export function stepBuoys(race) {
  for(const b of race.buoys){
    const water=sampleWater(b.x,b.z,race.worldTime);
    b.y=water.height;
    // Fixed anchors follow the water height and slope without recoil springs.
    b.leanX=-water.nx*.45;b.leanZ=-water.nz*.45;
  }
}

// One center circle per craft; the same contact calculation handles both pairs.
function contact(a,b,range) {
  const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
  return d<range?{nx:d>1e-6?dx/d:1,nz:d>1e-6?dz/d:0,depth:range-d,x:(a.x+b.x)/2,z:(a.z+b.z)/2}:null;
}
function impulse(r,x,z) {
  r.vx+=x;r.vz+=z;r.speed=Math.hypot(r.vx,r.vz);
}
function impact(race,a,other,hit,strength) {
  if(strength<2||a.impactCooldown>0)return;
  a.impactCooldown=.22;
  race.events.push({type:'impact',id:a.id,other,x:hit.x,z:hit.z,y:a.y,strength});

}
function resolveContact(race,a,b,range,moving=false){
  const hit=contact(a,b,range);if(!hit)return;
  const {nx,nz,depth}=hit,share=moving?.5:1;
  const closing=(a.vx-(moving?b.vx:0))*nx+(a.vz-(moving?b.vz:0))*nz;
  a.x+=nx*depth*share;a.z+=nz*depth*share;
  if(moving){b.x-=nx*depth*.5;b.z-=nz*depth*.5;}
  if(closing<0){
    const force=-closing*(moving?.58:.72);
    impulse(a,nx*force,nz*force);impact(race,a,moving?b.id:'buoy',hit,force);
    if(moving){impulse(b,-nx*force,-nz*force);impact(race,b,a.id,hit,force);}
  }
}
export function collideBuoys(race,r) {
  if(r.finishTime!==null)return;
  for(const b of race.buoys){
    const height=r.y-b.y;
    if(height<=4.7&&height>=-2.5)resolveContact(race,r,b,1.25+clamp(2-height*.3,.5,2));
  }
}
export function collideRacers(race) {
  const racers=race.racers;
  for(let i=0;i<racers.length;i++)for(let j=i+1;j<racers.length;j++){
    const a=racers[i],b=racers[j];
    if(a.finishTime===null&&b.finishTime===null&&Math.abs(a.y-b.y)<=1.8)resolveContact(race,a,b,2.7,true);
  }
}
