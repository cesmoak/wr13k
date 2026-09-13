import { COURSES, RACER_COLORS, RACER_NAMES, landforms, shoreRadius } from './course.js';
import { createRace, startRace, stepRace, standings } from './simulation.js';
import { Renderer } from './renderer.js';
import { RaceAudio } from './audio.js';
import { RacePresentation } from './presentation.js';
import { createTitleRace, stepTitleRace } from './attract.js';

const element=id=>document.getElementById(id);
const gameCanvas=element('game'),race=createRace('main'),sound=new RaceAudio();
let keys={};
const presentation=new RacePresentation();
let titleRace;
let previous=0,accumulator=0,lastPhase='',pausePhase='racing';
const formatTime=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
const renderer=new Renderer(gameCanvas);

function begin(){
  if(race.phase!=='title')return;
  sound.unlock().catch(()=>{});keys={};startRace(race);accumulator=0;
  renderer.particles=[];renderer.cameraReady=false;
}
function pause(){
  if(race.phase==='racing'||race.phase==='countdown'){pausePhase=race.phase;race.phase='paused';keys={};}
  else if(race.phase==='paused'){race.phase=pausePhase;accumulator=0;sound.unlock().catch(()=>{});}
}
element('start').onclick=()=>race.phase==='paused'?pause():begin();
function goHome(){selectCourse(race.course.id);}
element('course-menu').onclick=goHome;
function selectCourse(id){
  Object.assign(race,createRace(id));keys={};renderer.particles=[];
  titleRace=createTitleRace(race.course,titleRace?.worldTime);
  courseButtons.forEach(update=>update());
  document.body.classList.toggle('free-play',race.freePlay);
}
const courseButtons=Object.entries(COURSES).map(([id,course])=>{
  const button=document.createElement('button');button.textContent=course.name;
  button.onclick=()=>selectCourse(id);document.querySelector('.course-menu').append(button);
  return ()=>button.classList.toggle('selected',race.course.id===id);
});
selectCourse('main');
window.addEventListener('keydown',event=>{
  keys[event.code]=true;if(event.repeat)return;
  if(event.code==='Enter'&&!event.target.closest?.('button,a')&&race.phase==='title'){event.preventDefault();begin();}
  if(event.code==='Escape')pause();
});
window.addEventListener('keyup',event=>delete keys[event.code]);
function loseFocus(){keys={};if(race.phase==='racing'||race.phase==='countdown')pause();}
window.addEventListener('blur',loseFocus);
document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});

const mapCanvas=element('map'),mapContext=mapCanvas.getContext('2d');
function drawMap(){
  const ctx=mapContext,w=mapCanvas.width,h=mapCanvas.height;
  const bounds=race.course.bounds, scale=Math.min(w/(bounds.maxX-bounds.minX),h/(bounds.maxZ-bounds.minZ));
  const mapPoint=p=>[w/2+(p.x-(bounds.minX+bounds.maxX)/2)*scale,h/2+(p.z-(bounds.minZ+bounds.maxZ)/2)*scale];
  const path=points=>{ctx.beginPath();points.forEach((p,i)=>{const xy=mapPoint(p);if(i)ctx.lineTo(...xy);else ctx.moveTo(...xy);});ctx.closePath();};
  ctx.clearRect(0,0,w,h);ctx.lineJoin='round';
  for(const island of landforms){
    path(Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2,r=shoreRadius(a);return {x:island.x+Math.cos(a)*island.rx*r,z:island.z+Math.sin(a)*island.rz*r};}));
    ctx.fillStyle=island.rocky?'#a7c1cc88':'#e8edbc55';ctx.fill();
  }
  if(!race.freePlay){
    path(race.course.samples);
    ctx.strokeStyle='#e5f0da33';ctx.lineWidth=19;ctx.stroke();ctx.strokeStyle='#f0f5de8a';ctx.lineWidth=1.4;ctx.stroke();
  }
  for(const r of [...race.racers].reverse()){
    const [x,y]=mapPoint(r);ctx.beginPath();ctx.arc(x,y,r.id===0?5:3.8,0,Math.PI*2);ctx.fillStyle=RACER_COLORS[r.id];ctx.fill();
    if(r.id===0){ctx.strokeStyle='#25473b';ctx.lineWidth=1.5;ctx.stroke();}
  }
}
function updateUI(){
  document.body.classList.toggle('night',renderer.nightBlend>.45);
  const p=race.racers[0],order=standings(race),position=order.findIndex(r=>r.id===0)+1;
  if(lastPhase!==race.phase){
    lastPhase=race.phase;document.body.classList.toggle('playing',race.phase!=='title');
    const title=race.phase==='title',paused=race.phase==='paused',ended=race.phase==='finished'||race.phase==='lost';
    element('title-screen').hidden=!(title||paused||ended);element('hud').hidden=title;
    element('start').hidden=ended;element('start').textContent=paused?'RESUME':'START';
    element('course-menu').hidden=title;element('finish-title').hidden=!ended;
    element('result-list').hidden=race.phase!=='finished';
    if(race.phase==='finished'||race.phase==='lost'){
      element('finish-title').textContent=race.phase==='lost'?'Race over':'Race complete';
      element('result-list').innerHTML=order.map((r,i)=>`<div class="result-row ${r.id===0?'you':''}"><b>${i+1}</b><i style="background:${RACER_COLORS[r.id]}"></i><span>${RACER_NAMES[r.id]}</span><span>${r.finishTime!==null?formatTime(r.finishTime):'ON COURSE'}</span></div>`).join('');
    }
  }
  element('position').textContent=position;element('timer').textContent=formatTime(race.time);
  element('misses').textContent=`${p.misses} / 5`;
  element('miss-counter').classList.toggle('danger',p.misses>=4);
  element('speed').textContent=Math.round(p.speed*2.4);
  {
    const level=element('speed-level');level.dataset.level=p.speedLevel;
    element('speed-level-value').textContent=`${p.speedLevel} / 5`;
    level.style.setProperty('--level',p.speedLevel);
  }
  const count=element('countdown');count.hidden=!(race.phase==='countdown'||race.phase==='racing'&&race.time<.8);
  count.textContent=race.phase==='countdown'?Math.min(3,Math.ceil(race.countdown)):'GO';
  if(race.freePlay)count.hidden=true;
  drawMap();
}
function frame(now){
  const dt=Math.min((now-previous)/1000||0,.05);previous=now;
  accumulator+=dt;
  const input={throttle:!!keys.KeyW?1:0,brake:!!keys.KeyS,
    steer:(!!keys.KeyA?1:0)-(!!keys.KeyD?1:0)};
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
export const gameState = { race, renderer, get keys(){return keys;}, sound, presentation, get titleRace(){return titleRace;} };
