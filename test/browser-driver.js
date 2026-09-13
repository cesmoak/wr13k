import { gameState } from '../src/main.js';
import { aiInput, checkGate } from '../src/simulation.js';
import { resetBoat } from '../src/boat-physics.js';
import { LAPS, COURSES, RACER_COLORS } from '../src/course.js';

// Exercise the real input listeners and UI; this file is never packaged.
const {race,renderer}=gameState,held=new Set(),results=[];
let auto=false,frames=0,started=0,maxSpeed=0,sawSpeedBonus=false,sawAir=false;
const report=text=>parent.postMessage({prismReport:text},location.origin);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const courseButton=id=>document.querySelectorAll('.course-menu button')[Object.keys(COURSES).indexOf(id)];
function key(code,down){
  if(!!gameState.keys[code]===down)return;
  if(down)held.add(code);else held.delete(code);
  window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
}
function release(){for(const code of [...held])key(code,false);}
function tap(code){key(code,true);key(code,false);}
function check(condition,message){results.push(`${condition?'PASS':'FAIL'} ${message}`);report(results.join('\n'));if(!condition)throw Error(message);}
async function startFromMenu(){
  if(race.phase==='lost'||race.phase==='finished')document.getElementById('course-menu').click();
  else if(race.phase!=='title'){
    if(race.phase!=='paused')tap('Escape');
    document.getElementById('course-menu').click();
  }
  await delay(100);document.getElementById('start').click();
}

async function run(){
  auto=false;release();results.length=0;report('Running controls…');
  await startFromMenu();
  // Isolate controls from opponents; starting from Courses restores the grid.
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
  tap('Escape');await delay(100);const time=race.time;await delay(250);check(race.phase==='paused'&&race.time===time&&!document.getElementById('title-screen').hidden,'Escape pauses simulation and shows menu');
  tap('Escape');await delay(100);check(race.phase==='racing','Escape resumes');
  window.dispatchEvent(new Event('blur'));await delay(100);check(race.phase==='paused','Focus loss pauses');
  const pausedTime=race.time;tap('KeyR');tap('Enter');await delay(100);
  check(race.phase==='paused'&&race.time===pausedTime,'Removed restart shortcuts leave the race paused');
  document.getElementById('course-menu').click();await delay(100);document.getElementById('start').click();await delay(100);
  check(race.time===0&&race.racers.every(r=>r.passed===0),'Starting from Courses creates a fresh race');
  auto=true;frames=0;started=performance.now();maxSpeed=0;sawSpeedBonus=false;sawAir=false;
  report(results.join('\n')+'\nDriving full race with keyboard inputs…');
}
// Deterministic checkpoint fixtures exercise the real simulation events and HUD.
async function runLevels(){
  auto=false;release();results.length=0;
  await startFromMenu();race.phase='racing';await delay(100);
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
    check(document.getElementById('speed-level-value').textContent===`${expected} / 5`,`Clean buoy displays numeric level ${expected}`);
  }
  await delay(2500);
  const p=race.racers[0],passed=p.passed;crossFixture(race.course.gates[p.nextGate].side*(race.course.gates[p.nextGate].width+5));await delay(100);
  check(p.speedLevel===1&&p.passed===passed+1&&p.misses===1,'Miss resets speed and advances to the next buoy');
  check(document.getElementById('speed-level-value').textContent==='1 / 5'&&document.getElementById('misses').textContent==='1 / 5','HUD shows reset and missed buoy count');
  crossFixture();await delay(100);check(p.speedLevel===2,'The next clean buoy rebuilds speed');
  while(p.misses<5){crossFixture(race.course.gates[p.nextGate].side*(race.course.gates[p.nextGate].width+5));await delay(100);}
  check(race.phase==='lost'&&!document.getElementById('title-screen').hidden,'Fifth miss shows the loss screen');
  check(document.getElementById('finish-title').textContent==='Race over'&&document.getElementById('result-list').hidden,'HUD and results explain the loss');
  const time=race.worldTime;await delay(250);check(race.worldTime===time,'Loss freezes simulation');
  tap('KeyR');tap('Enter');await delay(100);
  check(race.phase==='lost'&&race.racers[0].misses===5,'Removed restart shortcuts leave the loss screen unchanged');
  document.getElementById('course-menu').click();await delay(100);document.getElementById('start').click();await delay(100);
  check(document.getElementById('speed-level-value').textContent==='1 / 5'&&race.racers[0].misses===0,'Starting from Courses clears misses and the speed chain');
  check(renderer.gl.getError()===renderer.gl.NO_ERROR,'Opaque water scene has no WebGL errors');
  race.racers.forEach((r,i)=>r.finishTime=[92,null,90,94][i]);race.phase='finished';await delay(100);
  check(!document.getElementById('title-screen').hidden&&document.getElementById('finish-title').textContent==='Race complete'&&document.getElementById('start').hidden,'Finished race uses the shared panel without a start/resume action');
  check(!document.getElementById('result-list').hidden&&document.getElementById('result-list').children.length===4,'Shared results panel lists all four racers');
  const rows=[...document.getElementById('result-list').children],order=[2,0,3,1];
  check(rows.every((row,i)=>{
    const color=document.createElement('div');color.style.color=RACER_COLORS[order[i]];
    return row.children.length===0&&row.style.color===color.style.color;
  }),'Results use each racer’s color on its time, without ranks, names or squares');
  check(rows.map(row=>row.textContent).join(',')==='01:30.00,01:32.00,01:34.00,ON COURSE'&&rows[1].classList.contains('you'),'Results retain sorted times, unfinished status, and player emphasis');
  document.getElementById('course-menu').click();await delay(100);
  check(race.phase==='title'&&document.getElementById('finish-title').hidden&&document.getElementById('result-list').hidden&&!document.getElementById('start').hidden&&document.getElementById('start').textContent==='START','Returning to Courses restores the shared title panel');
  report(results.join('\n')+'\nSPEED LEVEL CHECKS COMPLETE');
}
async function runInteractions(){
  auto=false;release();results.length=0;
  await startFromMenu();race.phase='racing';await delay(100);
  const p=race.racers[0],b=race.buoys[2],anchor=[b.x,b.z];
  Object.assign(p,{x:b.x-7,z:b.z,yaw:Math.PI/2,vx:35,vz:0,speed:35,nextGate:b.gate});
  resetBoat(p,race.worldTime);key('KeyW',true);await delay(300);release();
  check(p.impactCooldown>0&&p.vx<35,'Driving into a buoy deflects the craft');
  check(b.x===anchor[0]&&b.z===anchor[1],'Buoy stays anchored through impact');
  await delay(200);check(Math.abs(b.leanX)+Math.abs(b.leanZ)>.01,'Anchored buoy follows the wave slope');
  check(renderer.particles.length>0&&renderer.particles.every(p=>p.color),'Wake spray remains without collision bursts');
  const opponent=race.racers[1],x=b.x+20,z=b.z-12;
  Object.assign(p,{x:x-2,z,yaw:Math.PI/2,vx:25,vz:0,speed:25,impactCooldown:0});
  Object.assign(opponent,{x:x+2,z,yaw:-Math.PI/2,vx:-25,vz:0,speed:25,impactCooldown:0});
  resetBoat(p,race.worldTime);resetBoat(opponent,race.worldTime);
  await delay(120);
  check(p.impactCooldown>0&&opponent.impactCooldown>0,'Both racers register a physical collision');
  check(p.vx<25&&opponent.vx> -25,'Racer impact transfers momentum');
  check(Number.isFinite(p.speed)&&Number.isFinite(opponent.speed),'Collision velocities remain finite');
  check(renderer.gl.getError()===renderer.gl.NO_ERROR,'Collision scene has no WebGL errors');
  report(results.join('\n')+'\nCOLLISION CHECKS COMPLETE');
}
async function runModes(){
  auto=false;release();results.length=0;
  if(race.phase!=='title'){
    if(race.phase==='racing'||race.phase==='countdown')tap('Escape');
    document.getElementById('course-menu').click();
  }
  courseButton('main').click();await delay(100);
  check(document.querySelector('.course-menu').children.length===4,'Exactly four race courses');
  const demo=gameState.titleRace,positions=demo.racers.map(r=>({x:r.x,z:r.z}));await delay(400);
  check(demo.racers.length===4&&demo.course.id==='main','Title previews four riders on main-loop lines');
  check(demo.racers.every((r,i)=>Math.hypot(r.x-positions[i].x,r.z-positions[i].z)>1),'All four title riders are moving');
  check(demo===race&&race.phase==='title'&&race.events.length===0,'Title reuses the selected race without feedback events');
  check(demo.buoys.length===11&&renderer.buoyMesh.count>0,'Title shows main-island buoys');
  for(const [id,count] of [['main',10],['reverse',16],['rocky',18],['sunrise',18]]){
    const eye=[...renderer.eye],mesh=renderer.buoyMesh;
    courseButton(id).click();
    check(gameState.titleRace===race&&race.worldTime===0&&renderer.particles.length===0,`${id} selection resets the shared preview and trails`);
    await delay(100);
    check(race.worldTime>0&&race.phase==='title',`${id} preview advances`);
    check(renderer.eye.every((v,i)=>v===eye[i]),`${id} keeps the title camera fixed`);
    check(renderer.buoyMesh===mesh&&renderer.course===COURSES[id],`${id} uses selected-course preview markers`);
    check(race.course.id===id&&race.course.gates.length===count&&race.buoys.length===count+1,`${id} prepares its own race layout`);
    document.getElementById('start').click();await delay(100);
    check(race.phase==='countdown'&&race.racers.length===4,`${id} starts a four-rider race`);
    check(renderer.buoyMesh===mesh&&renderer.course===race.course,`${id} displays the selected race markers`);
    check(race.time===0&&race.racers.every(r=>r.passed===0&&r.misses===0&&r.speedLevel===1)&&!race.attract,`${id} resets demonstration progress and enables normal race rules`);
    const countdown=race.countdown;tap('KeyR');await delay(100);
    check(race.course.id===id&&race.countdown<countdown,`${id} countdown continues when R is pressed`);
    tap('Escape');document.getElementById('course-menu').click();await delay(100);
    check(gameState.titleRace===race&&race.phase==='title'&&renderer.course===COURSES[id]&&renderer.buoyMesh.count>0,`${id} returns to its selected-course preview`);
  }
  check(renderer.gl.getError()===0,'Course switching has no WebGL errors');
  report(results.join('\n')+'\nMODE CHECKS COMPLETE');
}
async function runPacing(){
  auto=false;release();results.length=0;
  await startFromMenu();race.phase='racing';
  race.racers.length=1;Object.assign(race.racers[0],{x:-350,z:350,yaw:0});
  key('KeyW',true);await delay(800);
  let last,repeats=0,count=0,elapsed=0;
  const draw=renderer.draw,start=performance.now();
  renderer.draw=function(scene,dt){
    const r=scene.racers[0];
    if(last&&r.speed>8){
      count++;if(Math.hypot(r.x-last.x,r.z-last.z)<1e-9)repeats++;
    }
    last={x:r.x,z:r.z};elapsed+=dt;
    return draw.call(this,scene,dt);
  };
  try{await delay(2500);}finally{renderer.draw=draw;release();}
  const seconds=(performance.now()-start)/1000,fps=count/seconds;
  check(count>60,'Frame-pacing sample has enough moving frames');
  check(fps<=61,'Rendering stays capped at 60 Hz');
  check(repeats<Math.max(2,count*.03),'Rendered craft advances on each moving frame');
  check(Math.abs(elapsed-seconds)<.15,'Camera and effects track elapsed simulation time');
  check(renderer.gl.getError()===0,'60 Hz scene has no WebGL errors');
  report(results.join('\n')+`\nFRAME PACING ${fps.toFixed(1)} fps · repeated poses ${repeats}/${count}`);
}
async function runCamera(){
  auto=false;release();results.length=0;report('Running camera checks…');
  try{
    await startFromMenu();
    for(const opponent of race.racers.slice(1))opponent.finishTime=0;
    await delay(200);
    check(renderer.eye[1]===7.25,'Title-to-race transition resets camera height');
    const p=race.racers[0];
    check(Math.abs(Math.hypot(renderer.eye[0]-p.x,renderer.eye[2]-p.z)-13)<.05,'Countdown starts 13 units behind the craft');
    await delay(3800);
    check(race.phase==='racing','Race starts with the simplified camera');
    key('KeyW',true);await delay(2200);
    check(p.speed>10&&renderer.eye[1]===7.25,'Acceleration keeps the fixed sea-level height');
    const yaw=renderer.cameraYaw;
    key('KeyA',true);key('KeyS',true);await delay(900);release();
    check(renderer.cameraYaw>yaw+.05&&renderer.eye[1]===7.25,'Braking turn smoothly follows the craft without changing height');
    key('KeyS',true);
    for(let i=0;i<80&&p.speed>1;i++)await delay(100);
    key('KeyS',false);
    check(p.speed<=1,'Braking returns below the camera heading threshold');
    const heldYaw=renderer.cameraYaw,boatYaw=p.yaw;
    key('KeyD',true);await delay(700);key('KeyD',false);
    check(Math.abs(p.yaw-boatYaw)>.05&&renderer.cameraYaw===heldYaw,'Stopped pivot turns the hull while holding the view');
    check(renderer.eye.every(Number.isFinite)&&renderer.gl.getError()===renderer.gl.NO_ERROR,'Camera remains finite and WebGL stays healthy');
    tap('Escape');await delay(100);document.getElementById('course-menu').click();await delay(100);
    check(renderer.eye[1]===39.92,'Returning to Courses restores the fixed title view');
    report(results.join('\n')+'\nPASS — '+results.length+' camera checks.');
  }finally{release();}
}

window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  if(e.data.prismTest==='pacing')runPacing().catch(error=>report(results.join('\n')+'\nERROR '+error.message));
  const action=e.data.prismTest==='start'?run:e.data.prismTest==='levels'?runLevels:e.data.prismTest==='interactions'?runInteractions:e.data.prismTest==='modes'?runModes:e.data.prismTest==='camera'?runCamera:null;
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
        check(!document.getElementById('title-screen').hidden,'Results screen shown');
        check(document.getElementById('result-list').children.length===4,'Four riders listed in results');
        check(race.racers[0].misses<5,'Keyboard-controlled race finishes within its miss allowance');
        check(sawSpeedBonus&&maxSpeed>50,'Buoy bonuses automatically exceed base speed during the race');
        check(sawAir,'Wave jumps occur during race');
        check(race.racers[0].contactPoints.length===6,'Six hull contacts are simulated');
        check(race.racers.some(r=>Math.abs(r.rider.x)+Math.abs(r.rider.y)+Math.abs(r.rider.z)>.01),'Rider moves independently of hull');
        check(!('wakes' in race),'Wake effects do not feed back into boat physics');
        check(renderer.gl.getError()===renderer.gl.NO_ERROR,'No WebGL errors');
        report(results.join('\n')+`\nFINISHED ${race.time.toFixed(2)}s | ${(frames/(performance.now()-started)*1000).toFixed(1)} fps`);
      }catch(error){report(results.join('\n')+'\nERROR '+error.message);}
    }
  }
  requestAnimationFrame(drive);
}
requestAnimationFrame(drive);
