// Build-only rider alternatives. Does not edit game source or the production package.
// Run: node scripts/rider-study.mjs [--full] [--snapshot].
// --full searches all production candidates; --snapshot reuses the captured inputs.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script, runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {readScripts, modules, compactScript, packageHTML} from './optimize.mjs';
import {compactSelectors} from './selectors.mjs';
import {zipHTML} from './zip.mjs';

function editFunction(source, name, change) {
  const node=parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  if(!node)throw Error('Missing function '+name);
  return source.slice(0,node.start)+change(source.slice(node.start,node.end))+source.slice(node.end);
}
function replace(source, before, after='') {
  if(!source.includes(before))throw Error('Missing anchor: '+before);
  return source.replace(before,after);
}
function between(source, start, end, replacement='') {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0)throw Error('Missing range '+start);
  return source.slice(0,a)+replacement+source.slice(b);
}
function directRotation(source) {
  return editFunction(source,'riderPose',body=>between(body,'  const hull =','  const right =',`
  const extension=Math.max(0,p.y),angle=p.pitch+RIDER_LEAN+extension*.35-r.pitch;
  const c=Math.cos(r.roll),s=Math.sin(r.roll),cp=Math.cos(angle),sp=Math.sin(angle);
  // Rz(-hull roll) * Rx(rider pitch - hull pitch); heading cancels exactly.
  const torsoMatrix=new Float32Array([c,-s,0,0,s*cp,c*cp,sp,0,-s*sp,-c*sp,cp,0,0,0,0,1]);
`));
}
function proceduralJoints(source) {
  source=editFunction(source,'solveJoint',()=>`function solveJoint(a,b,bend) {
    return a.map((v,i)=>(v+b[i])/2+bend[i]*.3);
  }`);
  return editFunction(source,'riderPose',body=>between(body,'  const supports =','  const chest ='));
}
function smoothedMotion(source) {
  source=editFunction(source,'newBoatState',body=>replace(body,
    'vx: 0, vy: 0, vz: 0, pitch: 0, pitchRate: 0,','pitch: 0,').replace('handlePitch:0,handlePitchRate:0','handlePitch:0'));
  source=editFunction(source,'springRider',()=>`function springRider(r,ax,ay,az,dt) {
    const p=r.rider,s=Math.sin(r.yaw),c=Math.cos(r.yaw),a=ax*s+az*c,t=1-Math.exp(-10*dt);
    const targets=[clamp(r.steer*.3*clamp(r.speed/20,0,1)+r.roll*.65-(ax*c-az*s)*.0015,-.48,.48),
      r.airborne?.24:clamp(-ay*.012,-.38,.28),clamp(-r.pitch*.55-a*.002,-.27,.25)];
    ['x','y','z'].forEach((axis,i)=>p[axis]+=(targets[i]-p[axis])*t);
    p.pitch+=(clamp(a*.0025,-.12,.12)-p.pitch)*t;
    p.handlePitch=clamp(p.y*(p.y>0?1.7:.3),-.12,.24);
  }`);
  // Convert collision velocity kicks to small displacement kicks with exponential recovery.
  source=replace(source,'r.rider.vx=clamp(r.rider.vx-side*.055,-3,3);','r.rider.x=clamp(r.rider.x-side*.005,-.48,.48);');
  return replace(source,'r.rider.vz=clamp(r.rider.vz-forward*.045,-3,3);','r.rider.z=clamp(r.rider.z-forward*.004,-.27,.25);');
}
function fixedPose(source) {
  source=editFunction(source,'springRider',()=> 'function springRider() {}');
  source=editFunction(source,'riderPose',()=>`function riderPose(r) {
    return {hips:[0,1.42,-.41],torsoMatrix:modelMatrix(0,1.83,-.27,0,RIDER_LEAN),handlebar:handlebarPose(r),
      limbs:[-1,1].map(s=>({hip:[s*.23,1.42,-.41],knee:[s*.31,1.05,-.01],foot:[s*.43,.64,-.35],
        shoulder:[s*.32,1.92,-.25],elbow:[s*.69,1.61,.02],hand:[s*.7,1.35,.5]}))};
  }`);
  source=editFunction(source,'handlebarPose',body=>between(body,'  const pitch=','  const pivot=','  const pitch=0;\n'));
  source=editFunction(source,'newBoatState',body=>between(body,'    rider:',' } };','    rider: {'));
  source=replace(source,'r.rider.x * 4 + ','');
  source=replace(source,'r.rider.z * 4 - thrust * .025','-thrust * .025');
  source=replace(source,'  r.rider.vx=clamp(r.rider.vx-side*.055,-3,3);');
  return replace(source,'  r.rider.vz=clamp(r.rider.vz-forward*.045,-3,3);');
}
const alternatives=[
  ['baseline',s=>s,'Current springs and fixed-length limb constraints.'],
  ['direct-rotation',directRotation,'Same dynamics and limb constraints; algebraically simplified torso rotation.'],
  ['procedural-joints',s=>proceduralJoints(directRotation(s)),'Keep springs and anchor contacts; replace reach projection and fixed-length joints with midpoint bends. Limb lengths vary.'],
  ['smoothed-motion',s=>smoothedMotion(directRotation(s)),'Keep fixed-length limbs; use exponential following instead of spring velocities. Collision displacement remains, but rebound and momentum change.'],
  ['animated-rider',s=>proceduralJoints(smoothedMotion(directRotation(s))),'Combine exponential following and procedural joints. Retain visible leaning/crouching, planted anchors and moving pole; lose fixed lengths and spring rebound.'],
  ['fixed-pose',fixedPose,'Authored neutral pose fixed relative to hull; remove all rider solvers, collision reactions and rider weight feedback. Same model parts, no independent balance.'],
];
const full=process.argv.includes('--full');
const settings=[['minified',{properties:false,shaders:false}],['shaders',{properties:false}],['properties',{}],['selectors',{}],['locals',{locals:true}],['webgl',{webgl:true}],['enums',{enums:true}],['all',{locals:true,webgl:true,enums:true}],['frequency',{locals:true,webgl:true,enums:true,frequency:true}],['inline',{locals:true,webgl:true,enums:true,inline:1}],['frequency-inline',{locals:true,webgl:true,enums:true,frequency:true,inline:1}],['numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,numbers:true}],['scoped',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true}],['scoped-numbers',{locals:true,webgl:true,enums:true,frequency:true,inline:1,scoped:true,numbers:true}],['baked',{baked:true,locals:true,webgl:true,enums:true}]].filter(([name])=>full||['scoped','scoped-numbers'].includes(name));
const dir='dist/rider-study';await mkdir(dir,{recursive:true});
let source,logic,html,css;
if(process.argv.includes('--snapshot')){
  ({source,logic,html,css}=JSON.parse(await readFile(`${dir}/source-input.json`,'utf8')));
  // Compatibility with the first study capture, before logic was saved explicitly.
  if(!logic){const marker="const element=id=>document.getElementById(id);",end=source.indexOf(marker);if(end<0)throw Error('Missing main boundary');logic=source.slice(0,end);}
}else{
  [source,logic,html,css]=await Promise.all([readScripts(),readScripts(modules.filter(n=>n!=='main')),readFile('index.html','utf8'),readFile('style.css','utf8')]);
}
const report={inputSHA256:createHash('sha256').update(source+html+css).digest('hex'),full,compressionIterations:15,targetBytes:13312,variants:[]};
await writeFile(`${dir}/source-input.json`,JSON.stringify({source,logic,html,css}));
// Check the algebra separately, allowing Float32 rounding from the original matrices.
const original={},simplified={};
const rotationProbe=`
globalThis.rotationSamples=()=>{
  const output=[];
  for(const yaw of [-3,-1,0,1,3])for(const pitch of [-.75,0,.75])for(const roll of [-.85,0,.85])
    for(const y of [-.38,0,.28]){
      const r=createRace('main').racers[0];resetBoat(r,0);
      Object.assign(r,{yaw,pitch,roll});Object.assign(r.rider,{x:.48,y,z:-.27,pitch:.24});
      output.push(...riderPose(r).torsoMatrix);
    }
  return output;
};`;
runInNewContext(logic+rotationProbe,original);runInNewContext(directRotation(logic)+rotationProbe,simplified);
const originalSamples=original.rotationSamples(),simpleSamples=simplified.rotationSamples();
report.rotationMaxError=Math.max(...originalSamples.map((v,i)=>Math.abs(v-simpleSamples[i])));
if(report.rotationMaxError>1e-5)throw Error('Direct rotation differs beyond Float32 tolerance');
// Sanity checks deliberately do not claim changed physics is behaviorally equivalent.
const probe=`
globalThis.check=()=>{
  let meshes=0,maxSegmentError=0,trajectoryChecksum=0;
  const finite=v=>{if(!Number.isFinite(v))throw Error('Non-finite simulation or geometry');};
  for(const course of Object.values(COURSES)){
    const race=createRace(course.id);startRace(race);
    for(let i=0;i<900;i++){
      stepRace(race,aiInput(race.racers[0],race),1/60);
      for(const r of race.racers)[r.x,r.y,r.z,r.pitch,r.roll,r.speed].forEach(v=>{finite(v);trajectoryChecksum+=v;});
      if(i%90===0)for(const r of race.racers){createRiderMesh(r).data.forEach(finite);meshes++;}
      race.events.length=0;
    }
  }
  for(const pitch of [-.75,0,.75])for(const roll of [-.85,0,.85])for(const y of [-.38,0,.28]){
    const r=createRace('main').racers[0];resetBoat(r,0);Object.assign(r,{yaw:1.7,pitch,roll});
    Object.assign(r.rider,{x:.48,y,z:-.27,pitch:.24,handlePitch:.24});
    const pose=riderPose(r);createRiderMesh(r).data.forEach(finite);
    for(const l of pose.limbs)for(const [a,b] of [[l.hip,l.knee],[l.knee,l.foot],[l.shoulder,l.elbow],[l.elbow,l.hand]])
      maxSegmentError=Math.max(maxSegmentError,Math.abs(Math.hypot(...a.map((v,i)=>v-b[i]))-.55));
  }
  return {meshes,extremePoses:27,maxSegmentError,trajectoryChecksum};
};`;
for(const [id,apply,detail] of alternatives){
  const variant=apply(source),candidates=[];
  const checkSource=await compactScript(apply(logic)+probe,{shaders:false});
  const context={};runInNewContext(checkSource,context);const checks=context.check();
  for(const [name,options] of settings){
    const input=['minified','shaders','properties'].includes(name)?{source:variant,html,css}:compactSelectors(html,css,variant);
    const js=await compactScript(`(()=>{'use strict';\n${input.source}\n})();`,options);new Script(js);
    const packed=await packageHTML(input.html,input.css,js),archive=await zipHTML(packed,[15]);
    candidates.push({name,htmlBytes:Buffer.byteLength(packed),zipBytes:archive.zip.length});
    if(candidates.length===1||archive.zip.length<Math.min(...candidates.slice(0,-1).map(c=>c.zipBytes))){
      await writeFile(`${dir}/${id}.html`,packed);await writeFile(`${dir}/${id}.zip`,archive.zip);
    }
  }
  const best=candidates.reduce((a,b)=>a.zipBytes<b.zipBytes?a:b);
  const row={id,detail,...best,saved:(report.variants[0]?.zipBytes??best.zipBytes)-best.zipBytes,overTarget:best.zipBytes-13312,checks,candidates};
  report.variants.push(row);console.log(id,JSON.stringify(row));
  await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');
}
