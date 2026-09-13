// Size probes for behavior-preserving pose and particle refactors.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readScripts,compactScript,packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';
const dir='dist/pose-particle-study';await mkdir(dir,{recursive:true});
const input=process.argv.includes('--snapshot')?JSON.parse(await readFile(`${dir}/input.json`,'utf8')):{source:await readScripts(),html:await readFile('index.html','utf8'),css:await readFile('style.css','utf8')};
await writeFile(`${dir}/input.json`,JSON.stringify(input));
const replace=(s,a,b='')=>{if(!s.includes(a))throw Error('Missing '+a);return s.replaceAll(a,b);};
const range=(s,a,b,value)=>{const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0)throw Error('Missing '+a);return s.slice(0,start)+value+s.slice(end);};
const cuts={
 limbs:s=>range(s,'  const limbs = [-1, 1].map','  for (let i = 0; i < 3; i++) torsoMatrix',`  const chest = hips.map((v, i) => v + chestOffset[i]);
  const limbs=[-1,1].map((side,i)=>{
    const hip=hips.map((v,j)=>v+(j?0:side*.23));
    const shoulder=chest.map((v,j)=>v+right[j]*side*.32-up[j]*.03);
    const foot=[side*.43,.64,-.35],hand=handlebar.grips[i];
    return {hip,shoulder,foot,hand,knee:solveJoint(hip,foot,[0,-.15,1]),elbow:solveJoint(shoulder,hand,[side,-.15,-.6])};
  });
`),
 merged:s=>range(s,'        for(const side of [-1,1]){','    this.particles=this.particles.filter',`        for(let i=0;i<8;i++){
          const foam=i>1,side=i%2?1:-1;
          const across=side*(foam?.3+this.random()*.65:.55),aft=foam?this.random()*2:0;
          const life=foam?.65+this.random()*.65:1.2;
          this.particles.push({x:x+c*across-s*aft,z:z-s*across-c*aft,y:foam?0:r.y,
            vx:foam?c*side*(.65+strength):-s*2+c*side*(1.5+this.random()),
            vz:foam?-s*side*(.65+strength):-c*2-s*side*(1.5+this.random()),
            vy:foam?0:1.3+this.random()*1.8+strength,life,max:life,
            size:foam?.16+this.random()*.2:.12+this.random()*.15,foam,
            color:tint(Math.floor((race.worldTime*5+(foam?i-2:side*2+7))%7))});
        }
      }
    }
`),
 transpose:s=>range(s,'  const hull = modelMatrix(0, 0, 0, r.yaw, r.pitch, r.roll);','  const right =',`  const extension=Math.max(0,p.y);
  const inverse=modelMatrix(0,0,0,0,r.pitch-p.pitch-RIDER_LEAN-extension*.35,r.roll);
  const torsoMatrix=inverse.map((v,i)=>inverse[i%4*4+(i/4|0)]);
`),
 fixedReach:s=>{
  s=replace(s,'iteration < 24','iteration < 8');
  s=replace(s,'    let correction = 0;\n','');
  s=replace(s,'        correction = Math.max(correction, length - reach);\n','');
  return replace(s,'    if (correction < .00001) break;\n','');
 },
 midpoint:s=>{
  s=replace(s,'along = clamp(distance,.001,1.099)/2','along = distance/2');
  return replace(s,'v + axis[i] * along + normal[i] / n * offset','(v+b[i])/2 + normal[i] / n * offset');
 },
 rotation:s=>range(s,'  const hull = modelMatrix(0, 0, 0, r.yaw, r.pitch, r.roll);','  const right =',`  const extension=Math.max(0,p.y),angle=p.pitch+RIDER_LEAN+extension*.35-r.pitch;
  const c=Math.cos(r.roll),s=Math.sin(r.roll),cp=Math.cos(angle),sp=Math.sin(angle);
  // Heading cancels: inverse hull roll, then rider pitch relative to hull pitch.
  const torsoMatrix=new Float32Array([c,-s,0,0,s*cp,c*cp,sp,0,-s*sp,-c*sp,cp,0,0,0,0,1]);
`),
 spawn:s=>{
  s=replace(s,'this.particles.push(','this.spawn(');
  s=replace(s,'  impact(event){','  spawn(p){p.max??=p.life;this.particles.push(p);}\n  impact(event){');
  return replace(s,'life,max:life,','life,').replaceAll('life:1.2,max:1.2,','life:1.2,');
 },
 palette:s=>{
  s=replace(s,'this.rainbowColors=RAINBOW_COLORS.map(rgb)','this.rainbowColors=RAINBOW_COLORS.map(color=>rgb(color).map(v=>v**2.2))');
  return replace(s,'this.rainbowColors[band].map(v=>v**2.2)','this.rainbowColors[band]');
 },
 draw:s=>range(s,'      const fade=clamp(p.life/p.max,0,1);','    this.drawDynamic(effects,-1);',`      const fade=clamp(p.life/p.max,0,1),foam=p.foam;
      const size=p.size*fade*(foam?fade:1),height=waveHeight(p.x,p.z,race.worldTime);
      const y=foam?height+.09:Math.max(p.y,height+.08);
      const color=foam?p.color:p.color?p.color.map(v=>v*(.7+.3*fade)):[.6+fade*.2,.9+fade*.08,.8+fade*.09];
      const points=foam?[[-size,0,-size],[0,0,size],[size,0,-size]]:[[-size,0,0],[size,0,0],[0,size*1.7,.05]];
      effects.triangle(...points.map(q=>[p.x+q[0],y+q[1],p.z+q[2]]),color);
    }
`)
};
const combinations={pose:['transpose','limbs'],combined:['transpose','limbs','merged'],mergedSpawn:['merged','spawn']};
const rows=[];
for(const name of ['baseline','transpose','limbs','merged',...Object.keys(combinations)]){
 let source=input.source;for(const key of combinations[name]??(cuts[name]?[name]:[]))source=cuts[key](source);
 const selected=compactSelectors(input.html,input.css,source),settings={locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true};
 const js=await compactScript(`(()=>{'use strict';\n${selected.source}\n})();`,settings);
 const html=await packageHTML(selected.html,selected.css,js),{zip}=await zipHTML(html);
 const row={name,zip:zip.length,saved:(rows[0]?.zip??zip.length)-zip.length};rows.push(row);console.log(JSON.stringify(row));
 await writeFile(`${dir}/${name}.js`,source);await writeFile(`${dir}/${name}.html`,html);
}
await writeFile(`${dir}/report.json`,JSON.stringify(rows,null,2));
