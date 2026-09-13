import { COURSES, RACER_COLORS } from './course.js';
import { createRace, startRace, stepRace, standings } from './simulation.js';
import { Renderer } from './renderer.js';
import { RaceAudio } from './audio.js';
import { stepTitleRace } from './attract.js';

const element=id=>document.getElementById(id);
const gameCanvas=element('game'),race=createRace('main'),sound=new RaceAudio();
let keys={};
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
  courseButtons.forEach(update=>update());
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



function updateUI(){
  const p=race.racers[0],order=standings(race),position=order.findIndex(r=>r.id===0)+1;
  if(lastPhase!==race.phase){
    lastPhase=race.phase;document.body.classList.toggle('playing',race.phase!=='title');
    const title=race.phase==='title',paused=race.phase==='paused',ended=race.phase==='finished'||race.phase==='lost';
    element('title-screen').hidden=!(title||paused||ended);element('hud').hidden=title;
    element('start').hidden=ended;element('start').textContent=paused?'RESUME':'START';
    element('course-menu').hidden=title;element('finish-title').hidden=!ended;
    element('result-list').hidden=race.phase!=='finished';
    if(ended){
      element('finish-title').textContent=race.phase==='lost'?'Race over':'Race complete';
      element('result-list').innerHTML=order.map(r=>`<div class="result-row ${r.id===0?'you':''}" style="color:${RACER_COLORS[r.id]}">${r.finishTime!==null?formatTime(r.finishTime):'ON COURSE'}</div>`).join('');
    }
  }
  element('position').textContent=position;element('timer').textContent=formatTime(race.time);
  element('misses').textContent=`${p.misses} / 5`;
  element('miss-counter').classList.toggle('danger',p.misses>=4);
  element('speed').textContent=Math.round(p.speed*2.4);
  element('speed-level-value').textContent=`${p.speedLevel} / 5`;
  const count=element('countdown');count.hidden=!(race.phase==='countdown'||race.phase==='racing'&&race.time<.8);
  count.textContent=race.phase==='countdown'?Math.min(3,Math.ceil(race.countdown)):'GO';

}
function frame(now){
  requestAnimationFrame(frame);
  accumulator+=Math.min((now-previous)/1000,.05);previous=now;
  // Draw only after fixed updates, keeping the camera and effects on the same clock.
  if(accumulator<1/60-1e-9)return;
  let dt=0;
  const input={throttle:+!!keys.KeyW,brake:!!keys.KeyS,
    steer:(!!keys.KeyA)-(!!keys.KeyD)};
  const title=race.phase==='title';
  while(accumulator>=1/60-1e-9){
    if(title)stepTitleRace(race,1/60);else stepRace(race,input,1/60);
    accumulator-=1/60;dt+=1/60;
  }
  for(const event of race.events){
    sound.event(event);
  }
  race.events.length=0;sound.update(race);renderer.draw(race,dt);updateUI();
}
requestAnimationFrame(frame);

// Read by the development-only browser harness. The build removes this export.
export const gameState = { race, renderer, get keys(){return keys;}, sound, get titleRace(){return race;} };
