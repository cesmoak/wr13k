import { clamp, lerp, angleDelta, DEVELOPMENT } from './math.js';

// Render one tick behind simulation, filling the gaps between fixed updates.
// These copies never feed back into collision, checkpoint, or rider physics.
export class RacePresentation {
  capture(race){
    this.source=race.racers[0];
    this.previous={...race,racers:race.racers.map(r=>({...r,rider:{...r.rider}})),buoys:race.buoys.map(b=>({...b}))};
  }
  sample(race,alpha){
    const before=this.previous;
    if(!before||this.source!==race.racers[0]||before.course!==race.course||before.phase!==race.phase||
      ['paused','finished','lost'].includes(race.phase))return DEVELOPMENT?(this.view=race):race;
    const t=clamp(alpha,0,1);
    const blend=(a,b,fields,angles=[])=>{
      const out={...b};
      for(const key of fields)out[key]=lerp(a[key],b[key],t);
      for(const key of angles)out[key]=a[key]+angleDelta(b[key],a[key])*t;
      return out;
    };
    const view={...race,worldTime:lerp(before.worldTime,race.worldTime,t),
      racers:race.racers.map((r,i)=>{
        const old=before.racers[i];
        if(!old||Math.hypot(r.x-old.x,r.z-old.z)>20)return r;
        const pose=blend(old,r,['x','y','z','speed'],['yaw','pitch','roll']);
        pose.rider=blend(old.rider,r.rider,['x','y','z'],['pitch',...(DEVELOPMENT?['roll']:[]),'handlePitch']);
        return pose;
      }),
      buoys:race.buoys.map((b,i)=>before.buoys[i]?blend(before.buoys[i],b,['x','y','z','leanX','leanZ']):b)
    };
    if(DEVELOPMENT)this.view=view;
    return view;
  }
}
