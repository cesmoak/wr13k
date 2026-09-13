import { RACER_COLORS, RACER_NAMES, landforms, shoreRadius } from './course.js';
import { createRace, startRace, stepRace, standings } from './simulation.js';
import { Renderer } from './renderer.js';
import { RaceAudio } from './audio.js';
import { RacePresentation } from './presentation.js';
import { createTitleRace, stepTitleRace } from './attract.js';

const element=id=>document.getElementById(id);
const gameCanvas=element('game'),race=createRace('main'),sound=new RaceAudio(),keys=new Set();
const presentation=new RacePresentation();
let titleRace;
let previous=0,accumulator=0,lastPhase='',pausePhase='racing';
const formatTime=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
const renderer=new Renderer(gameCanvas);

function begin(){
  if(race.phase!=='title')return;
  sound.unlock().catch(()=>{});keys.clear();startRace(race);accumulator=0;
  renderer.particles=[];renderer.cameraReady=false;
}
function pause(){
  if(race.phase==='racing'||race.phase==='countdown'){pausePhase=race.phase;race.phase='paused';keys.clear();}
  else if(race.phase==='paused'){race.phase=pausePhase;accumulator=0;sound.unlock().catch(()=>{});}
}
element('start').onclick=begin;
element('resume').onclick=pause;
function goHome(){Object.assign(race,createRace(race.course.id));titleRace=createTitleRace(race.course,titleRace?.worldTime);keys.clear();renderer.particles=[];}
element('course-menu').onclick=goHome;
element('back-home').onclick=goHome;
function selectCourse(id){
  Object.assign(race,createRace(id));keys.clear();
  titleRace=createTitleRace(race.course,titleRace?.worldTime);
  document.querySelectorAll('[data-course]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.course===id)));
  document.body.classList.toggle('free-play',race.freePlay);
}
for(const button of document.querySelectorAll('[data-course]'))button.onclick=()=>selectCourse(button.dataset.course);
selectCourse('main');
window.addEventListener('keydown',event=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)&&!event.target.closest?.('[data-course]'))event.preventDefault();
  keys.add(event.code);if(event.repeat)return;
  if(event.code==='Enter'&&!event.target.closest?.('button,a')&&race.phase==='title'){event.preventDefault();begin();}
  if(event.code==='Escape')pause();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();if(race.phase==='racing'||race.phase==='countdown')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(race.phase==='racing'||race.phase==='countdown')pause();}});

const mapCanvas=element('map'),mapContext=mapCanvas.getContext('2d');
function drawMap(){
  const ctx=mapContext,w=mapCanvas.width,h=mapCanvas.height;
  const bounds=race.course.bounds, scale=Math.min(w/(bounds.maxX-bounds.minX),h/(bounds.maxZ-bounds.minZ));
  const mapPoint=p=>[w/2+(p.x-(bounds.minX+bounds.maxX)/2)*scale,h/2+(p.z-(bounds.minZ+bounds.maxZ)/2)*scale];
  ctx.clearRect(0,0,w,h);ctx.lineJoin='round';
  for(const island of landforms){
    ctx.beginPath();
    for(let i=0;i<48;i++){
      const a=i/48*Math.PI*2,r=shoreRadius(a),p=mapPoint({x:island.x+Math.cos(a)*island.rx*r,z:island.z+Math.sin(a)*island.rz*r});
      if(!i)ctx.moveTo(...p);else ctx.lineTo(...p);
    }
    ctx.closePath();ctx.fillStyle=island.rocky?'#a7c1cc88':'#e8edbc55';ctx.fill();
  }
  if(!race.freePlay){
    ctx.beginPath();
    race.course.samples.forEach((p,i)=>{const [x,y]=mapPoint(p);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();
    ctx.strokeStyle='#e5f0da33';ctx.lineWidth=19;ctx.stroke();ctx.strokeStyle='#f0f5de8a';ctx.lineWidth=1.4;ctx.stroke();

  }
  for(const r of [...race.racers].reverse()){
    const [x,y]=mapPoint(r);ctx.beginPath();ctx.arc(x,y,r.id===0?5:3.8,0,Math.PI*2);ctx.fillStyle=RACER_COLORS[r.id];ctx.fill();
    if(r.id===0){ctx.strokeStyle='#25473b';ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.moveTo(x+Math.sin(r.yaw)*9,y+Math.cos(r.yaw)*9);ctx.lineTo(x+Math.sin(r.yaw-2)*4,y+Math.cos(r.yaw-2)*4);ctx.lineTo(x+Math.sin(r.yaw+2)*4,y+Math.cos(r.yaw+2)*4);ctx.fill();}
  }
}
let boardOrder='',displayedSpeedLevel=0;
function updateUI(){
  document.body.classList.toggle('night',renderer.nightBlend>.45);
  const p=race.racers[0],order=standings(race),position=order.findIndex(r=>r.id===0)+1;
  if(lastPhase!==race.phase){
    lastPhase=race.phase;document.body.classList.toggle('playing',race.phase!=='title');
    element('title-screen').hidden=race.phase!=='title';element('hud').hidden=race.phase==='title';
    element('pause-screen').hidden=race.phase!=='paused';element('results').hidden=race.phase!=='finished'&&race.phase!=='lost';
    if(race.phase==='finished'||race.phase==='lost'){
      element('finish-title').textContent=race.phase==='lost'?'Race over':position===1?'Making waves.':position===2?'So close.':'Nice wake.';
      element('finish-summary').textContent=race.phase==='lost'?'5 buoys missed':`${['','1st','2nd','3rd','4th'][position]} place · ${formatTime(p.finishTime)}`;
      element('result-list').hidden=race.phase==='lost';
      element('result-list').innerHTML=order.map((r,i)=>`<div class="result-row ${r.id===0?'you':''}"><b>0${i+1}</b><i style="background:${RACER_COLORS[r.id]}"></i><span>${RACER_NAMES[r.id]}</span><span>${r.finishTime!==null?formatTime(r.finishTime):'ON COURSE'}</span></div>`).join('');
    }
  }
  element('position').textContent=position;element('timer').textContent=formatTime(race.time);
  element('misses').textContent=`${p.misses} / 5`;
  element('miss-counter').classList.toggle('danger',p.misses>=4);
  element('speed').textContent=Math.round(p.speed*2.4);
  if(displayedSpeedLevel!==p.speedLevel){
    displayedSpeedLevel=p.speedLevel;
    const level=element('speed-level');level.dataset.level=p.speedLevel;
    element('speed-level-value').textContent=`${p.speedLevel} / 5`;
    level.querySelectorAll('i').forEach((bar,i)=>bar.classList.toggle('active',i<p.speedLevel));
  }
  const signature=order.map(r=>r.id).join('');
  if(signature!==boardOrder){boardOrder=signature;element('leaderboard').innerHTML=order.map((r,i)=>`<div class="rider-row ${r.id===0?'you':''}"><b>${i+1}</b><i class="rider-dot" style="background:${RACER_COLORS[r.id]}"></i><span>${RACER_NAMES[r.id]}</span></div>`).join('');}
  const count=element('countdown');count.hidden=!(race.phase==='countdown'||race.phase==='racing'&&race.time<.8);
  count.textContent=race.phase==='countdown'?Math.min(3,Math.ceil(race.countdown)):'GO';
  if(race.freePlay)count.hidden=true;
  drawMap();
}
function frame(now){
  const dt=Math.min((now-previous)/1000||0,.05);previous=now;
  accumulator+=dt;
  const input={throttle:keys.has('KeyW')||keys.has('ArrowUp')?1:0,brake:keys.has('KeyS')||keys.has('ArrowDown'),
    steer:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0)};
  const title=race.phase==='title',scene=title?titleRace:race;
  while(accumulator>=1/60){
    presentation.capture(scene);
    if(title)stepTitleRace(scene,1/60);else stepRace(race,input,1/60);
    accumulator-=1/60;
  }
  for(const event of race.events){
    sound.event(event);
    if(event.type==='impact')renderer.impact(event);
  }
  const view=presentation.sample(scene,accumulator*60);
  race.events.length=0;sound.update(race,renderer.cameraYaw);renderer.draw(title?{...view,phase:'title',lightingCourse:race.course}:view,dt);updateUI();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read by the development-only browser harness. The build removes this export.
export const gameState = { race, renderer, keys, sound, presentation, get titleRace(){return titleRace;} };
