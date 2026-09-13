import { clamp } from './math.js';
import { MAX_SPEED_LEVEL } from './boat-physics.js';
import { landforms, shoreDistance } from './course.js';

export function rivalEngineMix(player,racer,yaw=player.yaw){
  const dx=racer.x-player.x,dz=racer.z-player.z,d=Math.hypot(dx,dz);
  const fade=Math.max(0,1-d/140);
  return {gain:(.045+Math.min(80,racer.speed)*.0007)*fade**5,
    pan:clamp((-dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(8,d),-.9,.9)};
}

export function shoreSurf(racer,time){
  let distance=Infinity,shore;
  for(const land of landforms){
    const coast=shoreDistance(racer.x,racer.z,land,.945);
    if(coast<distance){distance=coast;shore=land;}
  }
  const proximity=Math.max(0,Math.min(1,(110-distance)/102));
  // The .85 rad/s period matches the wide incoming beach waves. A short
  // tumbling crest gives way to a long retreating wash, rather than an impact.
  const period=Math.PI*2/.85,age=((time-(Math.PI/2-1.4)/.85)%period+period)%period;
  const wash=(1-Math.exp(-age/.16))*Math.exp(-age/1.45);
  const dx=shore.x-racer.x,dz=shore.z-racer.z;
  const pan=(dx*Math.cos(racer.yaw)-dz*Math.sin(racer.yaw))/Math.max(1,Math.hypot(dx,dz))*.65;
  return {gain:proximity*proximity*(.012+wash*.55)*(shore.reef?.65:1),cutoff:500+wash*1500,pan};
}

export class RaceAudio {
  constructor(){this.context=null;}
  gain(volume=0){
    const node=this.context.createGain();node.gain.value=volume;return node;
  }
  filter(frequency,type='lowpass',q=1){
    const node=this.context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.Q.value=q;return node;
  }
  play(nodes,start=0,stop){
    nodes=nodes.filter(Boolean);
    nodes.forEach((node,i)=>node.connect(nodes[i+1]||this.master));
    const source=nodes[0];source.onended=()=>nodes.forEach(node=>node.disconnect());
    source.start(start);if(stop!==undefined)source.stop(stop);
  }
  envelope(gain,time,duration,volume){
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.008);
    gain.gain.exponentialRampToValueAtTime(.001,time+duration);
  }
  engineVoice(detune=0,q=1,stereo=false){
    const engine=this.context.createOscillator(),filter=this.filter(350,'lowpass',q),gain=this.gain();
    const pan=stereo?this.context.createStereoPanner?.():null;
    engine.type='sawtooth';engine.detune.value=detune;
    this.play([engine,filter,gain,pan]);return {engine,filter,gain,pan};
  }
  async unlock(){
    if(!this.context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      const ctx=this.context=new AudioContext();
      this.master=this.gain(.45);this.master.connect(ctx.destination);
      const player=this.engineVoice();this.engine=player.engine;this.engineGain=player.gain;
      this.rivalEngines=Array.from({length:3},(_,i)=>this.engineVoice((i-1)*17,.5,true));
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
      let sample=0;for(let i=0;i<data.length;i++){sample=(sample+(Math.random()*2-1)*.08)/1.025;data[i]=sample*3;}
      const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
      this.waterGain=this.gain();
      this.play([noise,this.filter(650,'highpass'),this.waterGain]);
      this.splashNoise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
      const splashData=this.splashNoise.getChannelData(0);
      for(let i=0;i<splashData.length;i++)splashData[i]=Math.random()*2-1;
      const surf=ctx.createBufferSource();surf.buffer=this.splashNoise;surf.loop=true;
      this.surfFilter=this.filter(350,'lowpass',.55);this.surfGain=this.gain();
      this.surfPan=ctx.createStereoPanner?.();
      this.play([surf,this.surfFilter,this.surfGain,this.surfPan]);
    }
    if(this.context.state==='suspended')await this.context.resume();
  }
  tone(frequency,duration=.16,delay=0,shape='sine',endFrequency=frequency,volume=.22){
    if(!this.context)return;
    const ctx=this.context,t=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=this.gain();
    osc.type=shape;osc.frequency.setValueAtTime(frequency,t);
    osc.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);
    this.envelope(gain,t,duration,volume);this.play([osc,gain],t,t+duration+.03);
  }
  event(event){
    if(event.type==='beep')this.tone(440,.13);
    if(event.type==='go')this.tone(880,.4);
    if(event.id!==0)return;
    if(event.type==='splash')this.splash(event.strength);
    let notes={
      gate:[[740,.13,0,'triangle',988,.3],[1175,.25,.085,'sine',1319,.32]],
      miss:[[240,.2,0,'sawtooth',110,.17],[150,.3,.14,'triangle',65,.28]],
      lap:[[1047,.25,.15],[1319,.3,.29]],
      finish:[523,659,784,1047].map((f,i)=>[f,.42,i*.15]),
      lose:[330,247,165,110].map((f,i)=>[f,.35,i*.16]),
      impact:[[event.other==='buoy'?180:95,.12],[65,.18,.03]]
    }[event.type]||[];
    if(event.type==='speedLevel'&&event.level===MAX_SPEED_LEVEL){
      notes=[784,988,1175,1568].map((f,i)=>[f,i===3?.5:.18,.18+i*.09,'triangle',f,.3]);
      notes.push([2093,.42,.48,'sine',2093,.15]);
    }
    for(const note of notes)this.tone(...note);
  }
  splash(impact){
    if(!this.context)return;
    const ctx=this.context,t=ctx.currentTime;
    // Reserve the loud, bright wash for hard landings; small contacts stay subtle.
    const strength=Math.min(1,Math.max(0,(impact-1.5)/14.5))**2;
    const duration=.12+strength*.49,noise=ctx.createBufferSource(),filter=this.filter(350,'lowpass',.6),gain=this.gain();
    noise.buffer=this.splashNoise;
    // A sharp broadband slap gives way to a softer, falling wash of water.
    filter.frequency.setValueAtTime((900+strength*5100)*.5,t);
    filter.frequency.exponentialRampToValueAtTime(200,t+duration);
    this.envelope(gain,t,duration,(.03+strength*.78)*.5);
    this.play([noise,filter,gain],t,t+duration+.02);
  }
  seagull(){
    if(!this.context)return;
    const ctx=this.context,duration=.85,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
    const data=buffer.getChannelData(0),pitch=.85+Math.random()*.3;
    let phase=0;
    // Two breathy, raspy cries: a quick upward scoop and a falling, wavering tail.
    for(let i=0;i<data.length;i++){
      const t=i/ctx.sampleRate,second=t>.46,age=t-(second?.46:0),length=second?.29:.34;
      if(age>length)continue;
      const u=age/length,scoop=Math.min(1,u/.16);
      const frequency=(720+650*scoop-560*u+45*Math.sin(t*135))*pitch*(second?.9:1);
      phase+=Math.PI*2*frequency/ctx.sampleRate;
      const voice=Math.sin(phase)+.4*Math.sin(phase*2)+.18*Math.sin(phase*3)+(Math.random()*2-1)*.14;
      const envelope=Math.sin(Math.PI*u)**.65*(1-u*.45)*(.83+.17*Math.sin(t*190));
      data[i]=voice*envelope*(second?.7:1)*.45;
    }
    const source=ctx.createBufferSource(),pan=ctx.createStereoPanner?.();source.buffer=buffer;
    if(pan)pan.pan.value=(Math.random()*2-1)*.65;
    this.play([source,this.filter(2800),this.gain(.16),pan]);
  }
  update(race,cameraYaw=race.racers[0].yaw){
    if(!this.context)return;
    const active=race.phase==='racing',p=race.racers[0],t=this.context.currentTime;
    this.engine.frequency.setTargetAtTime(42+p.speed*3.4,t,.08);
    this.engineGain.gain.setTargetAtTime(active?.05+p.speed*.0018:0,t,.1);
    for(let i=0;i<this.rivalEngines.length;i++){
      const voice=this.rivalEngines[i],r= race.racers[i+1];
      const mix=r?rivalEngineMix(p,r,cameraYaw):{gain:0,pan:0};
      voice.gain.gain.setTargetAtTime(active?mix.gain:0,t,.1);
      voice.pan?.pan.setTargetAtTime(mix.pan,t,.08);
      if(r){
        voice.engine.frequency.setTargetAtTime(42+r.speed*(3.2+i*.16),t,.08);
        voice.filter.frequency.setTargetAtTime(260+r.speed*4,t,.12);
      }
    }
    this.waterGain.gain.setTargetAtTime(active?.03+p.speed*.004:0,t,.12);
    const surf=shoreSurf(p,race.worldTime);
    this.surfGain.gain.setTargetAtTime(active?surf.gain:0,t,active?.14:.04);
    this.surfFilter.frequency.setTargetAtTime(surf.cutoff,t,.15);
    this.surfPan?.pan.setTargetAtTime(surf.pan,t,.3);
    // Simulation time keeps the calls spaced across pauses, with a fresh delay on restart.
    if(this.gullRacer!==p){this.gullRacer=p;this.nextGull=race.worldTime+3+Math.random()*3;}
    if(active&&race.worldTime>=this.nextGull){
      this.nextGull=race.worldTime+7+Math.random()*8;
      this.seagull();
    }
  }
}
