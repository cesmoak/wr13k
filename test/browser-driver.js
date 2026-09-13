import { gameState } from '../src/main.js';
import { aiInput, checkGate } from '../src/simulation.js';
import { resetBoat } from '../src/boat-physics.js';
import { LAPS } from '../src/course.js';

// Exercise the real input listeners and UI; this file is never packaged.
const {race,renderer}=gameState,held=new Set(),results=[];
let auto=false,frames=0,started=0,maxSpeed=0,sawSpeedBonus=false,sawAir=false;
const report=text=>parent.postMessage({prismReport:text},location.origin);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function key(code,down){
  if(gameState.keys.has(code)===down)return;
  if(down)held.add(code);else held.delete(code);
  window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
}
function release(){for(const code of [...held])key(code,false);}
function tap(code){key(code,true);key(code,false);}
function check(condition,message){results.push(`${condition?'PASS':'FAIL'} ${message}`);report(results.join('\n'));if(!condition)throw Error(message);}

async function run(){
  auto=false;release();results.length=0;report('Running controls…');
  document.getElementById('start').click();
  // Isolate the controls from opponent bumps/wakes; R below restores all racers.
  for(const opponent of race.racers.slice(1))opponent.finishTime=0;
  await delay(4000);
  const idleYaw=race.racers[0].yaw;
  key('KeyD',true);await delay(1500);key('KeyD',false);
  check(race.racers[0].yaw<idleYaw-.15&&race.racers[0].speed<2,'Can pivot slowly without throttle');
  key('KeyW',true);await delay(1400);check(race.racers[0].speed>10,'W accelerates');
  let yaw=race.racers[0].yaw;key('KeyD',true);await delay(550);key('KeyD',false);check(race.racers[0].yaw<yaw,'D steers right in chase view');
  yaw=race.racers[0].yaw;key('KeyA',true);await delay(1000);key('KeyA',false);check(race.racers[0].yaw>yaw,'A steers left in chase view');
  check(!document.getElementById('boost-fill'),'No consumable boost meter');
  release();const speed=race.racers[0].speed;key('KeyS',true);await delay(350);key('KeyS',false);check(race.racers[0].speed<speed,'S brakes');
  tap('Escape');await delay(100);const time=race.time;await delay(250);check(race.phase==='paused'&&race.time===time&&!document.getElementById('pause-screen').hidden,'Escape pauses simulation and shows menu');
  tap('Escape');await delay(100);check(race.phase==='racing','Escape resumes');
  tap('KeyM');await delay(100);check(gameState.sound.muted,'M mutes');tap('KeyM');
  window.dispatchEvent(new Event('blur'));await delay(100);check(race.phase==='paused','Focus loss pauses');tap('Escape');
  tap('KeyR');await delay(100);check(race.time===0&&race.racers.every(r=>r.passed===0),'R resets the race');
  auto=true;frames=0;started=performance.now();maxSpeed=0;sawSpeedBonus=false;sawAir=false;
  report(results.join('\n')+'\nDriving full race with keyboard inputs…');
}
// Deterministic checkpoint fixtures exercise the real simulation events and HUD.
async function runLevels(){
  auto=false;release();results.length=0;
  document.getElementById('start').click();race.phase='racing';await delay(100);
  check(document.getElementById('speed-level-value').textContent==='1 / 5','HUD starts at speed level 1');
  const crossFixture=(offset=0)=>{
    const p=race.racers[0],g=race.course.gates[p.nextGate],n=g.tangent;
    const old={x:g.x-n.x*2+n.z*offset,z:g.z-n.z*2-n.x*offset};
    p.x=g.x+n.x*2+n.z*offset;p.z=g.z+n.z*2-n.x*offset;
    checkGate(p,old,race);
  };
  for(let i=0;i<5;i++){
    crossFixture();await delay(100);
    const expected=Math.min(5,i+2);
    check(document.getElementById('speed-level-value').textContent===`${expected} / 5`&&
      document.querySelectorAll('.speed-level-bars .active').length===expected,`Clean buoy displays level ${expected} and matching bars`);
  }
  await delay(2500);
  const p=race.racers[0],passed=p.passed;crossFixture(race.course.gates[p.nextGate].side*(race.course.gates[p.nextGate].width+5));await delay(100);
  check(p.speedLevel===1&&p.passed===passed+1&&p.misses===1,'Miss resets speed and advances to the next buoy');
  check(document.getElementById('speed-level-value').textContent==='1 / 5'&&document.getElementById('misses').textContent==='1 / 5','HUD shows reset and missed buoy count');
  crossFixture();await delay(100);check(p.speedLevel===2,'The next clean buoy rebuilds speed');
  while(p.misses<5){crossFixture(race.course.gates[p.nextGate].side*(race.course.gates[p.nextGate].width+5));await delay(100);}
  check(race.phase==='lost'&&!document.getElementById('results').hidden,'Fifth miss shows the loss screen');
  check(document.getElementById('finish-title').textContent==='Race over'&&document.getElementById('result-list').hidden,'HUD and results explain the loss');
  const time=race.worldTime;await delay(250);check(race.worldTime===time,'Loss freezes simulation');
  document.getElementById('retry').click();await delay(100);
  check(document.getElementById('speed-level-value').textContent==='1 / 5'&&race.racers[0].misses===0,'Retry clears misses and the speed chain');
  check(renderer.gl.getError()===renderer.gl.NO_ERROR,'Transparent water scene has no WebGL errors');
  report(results.join('\n')+'\nSPEED LEVEL CHECKS COMPLETE');
}
async function runInteractions(){
  auto=false;release();results.length=0;
  document.getElementById('start').click();race.phase='racing';await delay(100);
  const p=race.racers[0],b=race.buoys[2];
  Object.assign(p,{x:b.x-7,z:b.z,yaw:Math.PI/2,vx:35,vz:0,speed:35,nextGate:b.gate});
  resetBoat(p,race.worldTime,race.wakes);key('KeyW',true);await delay(300);release();
  check(p.impactCooldown>0&&p.vx<35,'Driving into a buoy deflects the craft');
  check(Math.hypot(b.x-b.anchorX,b.z-b.anchorZ)>.1,'Buoy recoils from its anchor');
  await delay(200);check(Math.abs(b.leanX)+Math.abs(b.leanZ)>.01,'Buoy visibly tilts after impact');
  check(renderer.particles.length>0,'Impact and water spray render');
  const opponent=race.racers[1],x=b.anchorX+20,z=b.anchorZ-12;
  Object.assign(p,{x:x-2,z,yaw:Math.PI/2,vx:25,vz:0,speed:25,impactCooldown:0});
  Object.assign(opponent,{x:x+2,z,yaw:-Math.PI/2,vx:-25,vz:0,speed:25,impactCooldown:0});
  resetBoat(p,race.worldTime,race.wakes);resetBoat(opponent,race.worldTime,race.wakes);
  await delay(120);
  check(p.impactCooldown>0&&opponent.impactCooldown>0,'Both racers register a physical collision');
  check(p.vx<25&&opponent.vx> -25,'Racer impact transfers momentum');
  check(Math.abs(p.rider.x)+Math.abs(p.rider.z)>.001,'Rider reacts independently to the bump');
  check(renderer.gl.getError()===renderer.gl.NO_ERROR,'Collision scene has no WebGL errors');
  report(results.join('\n')+'\nCOLLISION CHECKS COMPLETE');
}
async function runModes(){
  auto=false;release();results.length=0;
  document.querySelector('[data-course="free"]').click();await delay(100);
  const demo=gameState.titleRace,positions=demo.racers.map(r=>({x:r.x,z:r.z}));await delay(400);
  check(demo.racers.length===4&&demo.course.id==='main','Free-play title previews four riders on main-loop lines');
  check(demo.racers.every((r,i)=>Math.hypot(r.x-positions[i].x,r.z-positions[i].z)>1),'All four title riders are moving');
  check(race.time===0&&race.racers[0].passed===0,'Title racing does not advance the actual game');
  check(demo.buoys.length===0&&renderer.gateMeshes.length===0&&renderer.rainbow===null,'Free-play title shows riders without buoys or start arch');
  document.getElementById('start').click();await delay(100);
  check(race.freePlay&&race.phase==='racing'&&race.racers.length===4,'Free play starts immediately with four riders');
  check(race.buoys.length===0&&renderer.gateMeshes.length===0&&renderer.rainbow===null,'Free play has no buoys or start line geometry');
  check(getComputedStyle(document.querySelector('.race-stat')).display==='none'&&getComputedStyle(document.getElementById('miss-counter')).display==='none','Free play hides lap/time and miss HUD');
  key('KeyW',true);await delay(1300);release();
  check(race.racers[0].speed>10&&race.time===0&&race.racers[0].passed===0,'Free play drives without race progress');
  check(race.racers.slice(1).every(r=>r.speed>10),'All three other riders cruise in Free play');
  tap('Escape');await delay(100);check(race.phase==='paused','Free play pauses');
  document.getElementById('course-menu').click();await delay(100);check(race.phase==='title','Pause menu returns to course selection');
  for(const [id,count] of [['main',10],['reverse',16],['rocky',18],['sunrise',18]]){
    const titleTime=gameState.titleRace.worldTime,eye=[...renderer.eye];
    document.querySelector(`[data-course="${id}"]`).click();await delay(100);
    check(gameState.titleRace.worldTime>=titleTime&&gameState.titleRace.worldTime<titleTime+.5,`${id} preserves the camera and lighthouse clock`);
    check(Math.hypot(...renderer.eye.map((v,i)=>v-eye[i]))<2,`${id} keeps the title camera moving continuously`);
    check(race.course.id===id&&race.course.gates.length===count&&race.buoys.length===count+1,`${id} loads its own buoy layout`);
    check(renderer.gateMeshes.length===count+1&&!document.body.classList.contains('free-play'),`${id} rebuilds markers and restores racing HUD`);
    document.getElementById('start').click();await delay(100);
    check(race.phase==='countdown'&&race.racers.length===4,`${id} starts a four-rider race`);
    tap('KeyR');await delay(100);check(race.course.id===id&&race.racers[0].passed===0,`${id} restart retains the selected route`);
    tap('Escape');document.getElementById('course-menu').click();await delay(100);
  }
  check(renderer.gl.getError()===0,'Course switching has no WebGL errors');
  report(results.join('\n')+'\nMODE CHECKS COMPLETE');
}
async function runPacing(){
  auto=false;release();results.length=0;
  document.querySelector('[data-course="free"]').click();await delay(100);
  document.getElementById('start').click();key('KeyW',true);await delay(800);
  let rawLast,viewLast,rawRepeats=0,viewRepeats=0,count=0;
  const start=performance.now();
  await new Promise(resolve=>{
    function sample(now){
      const r=race.racers[0],v=gameState.presentation.view.racers[0];
      if(rawLast&&r.speed>8){
        count++;if(Math.hypot(r.x-rawLast.x,r.z-rawLast.z)<1e-9)rawRepeats++;
        if(Math.hypot(v.x-viewLast.x,v.z-viewLast.z)<1e-9)viewRepeats++;
      }
      rawLast={x:r.x,z:r.z};viewLast={x:v.x,z:v.z};
      if(now-start<2500)requestAnimationFrame(sample);else resolve();
    }requestAnimationFrame(sample);
  });
  release();const fps=count/((performance.now()-start)/1000);
  check(count>60,'Frame-pacing sample has enough moving frames');
  check(viewRepeats<Math.max(2,count*.03),'Rendered craft advances on each moving frame');
  if(fps>90)check(rawRepeats>count*.2&&viewRepeats<rawRepeats*.1,'Interpolation removes repeated 60 Hz poses on a high-refresh display');
  check(renderer.gl.getError()===0,'Interpolated scene has no WebGL errors');
  report(results.join('\n')+`\nFRAME PACING ${fps.toFixed(1)} fps · raw repeats ${rawRepeats}/${count} · rendered repeats ${viewRepeats}/${count}`);
}
window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  if(e.data.prismTest==='pacing')runPacing().catch(error=>report(results.join('\n')+'\nERROR '+error.message));
  const action=e.data.prismTest==='start'?run:e.data.prismTest==='levels'?runLevels:e.data.prismTest==='interactions'?runInteractions:e.data.prismTest==='modes'?runModes:null;
  if(action)action().catch(error=>report(results.join('\n')+'\nERROR '+error.message));
});

function drive(){
  if(auto){
    frames++;
    if(race.phase==='racing'){
      const p=race.racers[0],input=aiInput(p,race);
      key('KeyW',!!input.throttle);key('KeyS',!!input.brake);key('KeyA',input.steer>.08);key('KeyD',input.steer<-.08);
      maxSpeed=Math.max(maxSpeed,p.speed);sawSpeedBonus ||= p.speedLevel>1;sawAir ||= p.airborne;

      if(frames%120===0)report(results.join('\n')+`\nRacing: lap ${p.lap}, gate ${p.nextGate}, ${race.time.toFixed(1)}s, ${(frames/(performance.now()-started)*1000).toFixed(0)} fps`);
    }
    if(race.phase==='lost'){release();auto=false;report(results.join('\n')+'\nFAIL Auto driver lost after five misses');}
    if(race.phase==='finished'){
      release();auto=false;
      try{
        check(race.racers[0].passed===LAPS*race.course.gates.length+1,'Player completes all ordered gates over three laps');
        check(!document.getElementById('results').hidden,'Results screen shown');
        check(document.getElementById('result-list').children.length===4,'Four riders listed in results');
        check(race.racers[0].misses<5,'Keyboard-controlled race finishes within its miss allowance');
        check(sawSpeedBonus&&maxSpeed>50,'Buoy bonuses automatically exceed base speed during the race');
        check(sawAir,'Wave jumps occur during race');
        check(race.racers[0].contactPoints.length===6,'Six hull contacts are simulated');
        check(race.racers.some(r=>Math.abs(r.rider.x)+Math.abs(r.rider.y)+Math.abs(r.rider.z)>.01),'Rider moves independently of hull');
        check(race.wakes.length>0&&race.wakes.length<=12,'Boat wakes feed the water simulation');
        check(renderer.gl.getError()===renderer.gl.NO_ERROR,'No WebGL errors');
        report(results.join('\n')+`\nFINISHED ${race.time.toFixed(2)}s | ${(frames/(performance.now()-started)*1000).toFixed(1)} fps`);
      }catch(error){report(results.join('\n')+'\nERROR '+error.message);}
    }
  }
  requestAnimationFrame(drive);
}
requestAnimationFrame(drive);
