import { MAX_SPEED_LEVEL } from './boat-physics.js';
import { landforms, shoreRadius } from './course.js';

export function rivalEngineMix(player,racer,yaw=player.yaw){
  const dx=racer.x-player.x,dz=racer.z-player.z,d=Math.hypot(dx,dz);
  const fade=Math.max(0,1-d/140);
  return {gain:(.045+Math.min(80,racer.speed)*.0007)*fade*fade/(1+d*d/900),
    pan:Math.max(-.9,Math.min(.9,(-dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(8,d)))};
}

export function shoreSurf(racer,time){
  let distance=Infinity,shore;
  for(const land of landforms){
    const x=(racer.x-land.x)/land.rx,z=(racer.z-land.z)/land.rz;
    const coast=(Math.hypot(x,z)-shoreRadius(Math.atan2(z,x))*.945)*Math.min(land.rx,land.rz);
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
  constructor(){this.context=null;this.muted=false;}
  async unlock(){
    if(!this.context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      const ctx=this.context=new AudioContext();
      this.master=ctx.createGain();this.master.gain.value=this.muted?0:.45;this.master.connect(ctx.destination);
      this.engine=ctx.createOscillator();this.engine.type='sawtooth';
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350;
      this.engineGain=ctx.createGain();this.engineGain.gain.value=0;
      this.engine.connect(filter);filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      this.rivalEngines=Array.from({length:3},(_,i)=>{
        const engine=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
        engine.type='sawtooth';engine.detune.value=(i-1)*17;
        filter.type='lowpass';filter.Q.value=.5;filter.frequency.value=350;
        gain.gain.value=0;engine.connect(filter);filter.connect(gain);
        if(pan){gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);
        engine.start();return {engine,filter,gain,pan};
      });
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
      let sample=0;for(let i=0;i<data.length;i++){sample=(sample+(Math.random()*2-1)*.08)/1.025;data[i]=sample*3;}
      const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const waterFilter=ctx.createBiquadFilter();waterFilter.type='highpass';waterFilter.frequency.value=650;
      this.waterGain=ctx.createGain();this.waterGain.gain.value=0;
      noise.connect(waterFilter);waterFilter.connect(this.waterGain);this.waterGain.connect(this.master);noise.start();
      this.splashNoise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
      const splashData=this.splashNoise.getChannelData(0);
      for(let i=0;i<splashData.length;i++)splashData[i]=Math.random()*2-1;
      const surf=ctx.createBufferSource();surf.buffer=this.splashNoise;surf.loop=true;
      this.surfFilter=ctx.createBiquadFilter();this.surfFilter.type='lowpass';this.surfFilter.Q.value=.55;
      this.surfGain=ctx.createGain();this.surfGain.gain.value=0;
      surf.connect(this.surfFilter);this.surfFilter.connect(this.surfGain);
      this.surfPan=ctx.createStereoPanner?.();
      if(this.surfPan){this.surfGain.connect(this.surfPan);this.surfPan.connect(this.master);}
      else this.surfGain.connect(this.master);
      surf.start();
    }
    if(this.context.state==='suspended')await this.context.resume();
  }
  toggle(){this.muted=!this.muted;if(this.context)this.master.gain.setTargetAtTime(this.muted?0:.45,this.context.currentTime,.04);return this.muted;}
  tone(frequency,duration=.16,delay=0,shape='sine',endFrequency=frequency,volume=.22){
    if(!this.context||this.muted)return;
    const ctx=this.context,t=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=shape;osc.frequency.setValueAtTime(frequency,t);
    osc.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.03);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  event(event){
    if(event.type==='beep')this.tone(440,.13);
    if(event.type==='go')this.tone(880,.4);
    if(event.id!==0)return;
    if(event.type==='splash')this.splash(event.strength);
    if(event.type==='gate'){
      this.tone(740,.13,0,'triangle',988,.3);
      this.tone(1175,.25,.085,'sine',1319,.32);
    }
    // Emitted only on entering level five, so holding maximum never repeats it.
    if(event.type==='speedLevel'&&event.level===MAX_SPEED_LEVEL){
      [784,988,1175,1568].forEach((f,i)=>this.tone(f,i===3?.5:.18,.18+i*.09,'triangle',f,.3));
      this.tone(2093,.42,.48,'sine',2093,.15);
    }
    if(event.type==='impact'){this.tone(event.other==='buoy'?180:95,.12);this.tone(65,.18,.03);}
    if(event.type==='miss'){
      this.tone(240,.2,0,'sawtooth',110,.17);
      this.tone(150,.3,.14,'triangle',65,.28);
    }
    if(event.type==='lap'){this.tone(1047,.25,.15);this.tone(1319,.3,.29);}
    if(event.type==='finish')[523,659,784,1047].forEach((f,i)=>this.tone(f,.42,i*.15));
    if(event.type==='lose')[330,247,165,110].forEach((f,i)=>this.tone(f,.35,i*.16));
  }
  splash(impact){
    if(!this.context||this.muted)return;
    const ctx=this.context,t=ctx.currentTime;
    // Reserve the loud, bright wash for hard landings; small contacts stay subtle.
    const strength=Math.min(1,Math.max(0,(impact-1.5)/14.5))**2;
    const duration=.12+strength*.49,noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    noise.buffer=this.splashNoise;
    // A sharp broadband slap gives way to a softer, falling wash of water.
    filter.type='lowpass';filter.Q.value=.6;
    filter.frequency.setValueAtTime((900+strength*5100)*.5,t);
    filter.frequency.exponentialRampToValueAtTime(200,t+duration);
    gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime((.03+strength*.78)*.5,t+.008);
    gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    noise.connect(filter);filter.connect(gain);gain.connect(this.master);
    noise.start(t);noise.stop(t+duration+.02);
    noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
  }
  seagull(){
    if(!this.context||this.muted)return;
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
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type='lowpass';filter.frequency.value=2800;gain.gain.value=.16;
    source.connect(filter);filter.connect(gain);
    const pan=ctx.createStereoPanner?.();
    if(pan){pan.pan.value=(Math.random()*2-1)*.65;gain.connect(pan);pan.connect(this.master);}
    else gain.connect(this.master);
    source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();};
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
