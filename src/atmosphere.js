import { modelMatrix } from './math.js';
import { MeshBuilder } from './mesh.js';

// Small, deterministic flocks orbit the shores. Animation uses simulation time,
// so pausing freezes their flight and wing beats along with the race.
export function createSeagullMesh(time) {
  const flock=new MeshBuilder(),white=[.9,1,.9],gray=[.6,.6,.7];
  for(let i=0;i<18;i++){
    const group=Math.floor(i/6),home=[[0,0],[0,0],[270,5]][group];
    const radius=[172,125,80][group]+(i%6)*5,speed=(group===1?-.1:.085)+i*.0009;
    const angle=time*speed+i*2.399,rx=radius,rz=radius*(group===2?1.2:.65);
    const x=home[0]+Math.cos(angle)*rx,z=home[1]+Math.sin(angle)*rz;
    const y=[14,34,18][group]+(i%3)*3+Math.sin(time*.55+i)*2;
    const yaw=Math.atan2(-Math.sin(angle)*rx*speed,Math.cos(angle)*rz*speed);
    // A few beats, then a glide; the wing tip trails its root.
    const beating=Math.max(0,Math.sin(time*.65+i*.9));
    const flap=Math.sin(time*7.4+i*1.7)*.85*beating;
    const bird=new MeshBuilder();
    const nose=[0,0,.85],tail=[0,0,-.85],top=[0,.26,0],belly=[0,-.2,0];
    for(const side of [-1,1]){
      const flank=[side*.23,0,0];
      bird.quad(top,nose,flank,tail,white);
      bird.quad(flank,nose,belly,tail,gray);
      bird.triangle([side*.16,.1,.25],[side*2.5,.14+flap*1.4,-.65],[side*.2,.08,-.4],white);
    }
    flock.append(bird,modelMatrix(x,y,z,yaw,Math.cos(time*.55+i)*.05,-Math.sign(speed)*.17,1+(i%3)*.12));
  }
  return flock;
}
