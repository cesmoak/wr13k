import { MAX_SPEED_LEVEL } from './boat-physics.js';

export class RaceAudio {
  constructor(){this.context=null;}
  gain(volume=0){
    const node=this.context.createGain();node.gain.value=volume;return node;
  }
  play(nodes,start=0,stop){
    nodes.forEach((node,i)=>node.connect(nodes[i+1]||this.master));
    const source=nodes[0];source.onended=()=>nodes.forEach(node=>node.disconnect());
    source.start(start);if(stop!==undefined)source.stop(stop);
  }
  async unlock(){
    if(!this.context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      const ctx=this.context=new AudioContext();
      this.master=this.gain(.45);this.master.connect(ctx.destination);
      this.engine=ctx.createOscillator();this.engine.type='sawtooth';this.engineGain=this.gain();
      const filter=ctx.createBiquadFilter();filter.frequency.value=350;filter.Q.value=1;
      this.play([this.engine,filter,this.engineGain]);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);
      let sample=0;for(let i=0;i<data.length;i++){sample=(sample+(Math.random()*2-1)*.08)/1.025;data[i]=sample*3;}
      const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const waterFilter=ctx.createBiquadFilter();waterFilter.type='highpass';waterFilter.frequency.value=650;waterFilter.Q.value=1;
      this.waterGain=this.gain();this.play([noise,waterFilter,this.waterGain]);
    }
    if(this.context.state==='suspended')await this.context.resume();
  }
  tone(frequency){
    if(!this.context)return;
    const ctx=this.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=this.gain();
    osc.frequency.setValueAtTime(frequency,t);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.22,t+.008);
    gain.gain.exponentialRampToValueAtTime(.001,t+.16);this.play([osc,gain],t,t+.19);
  }
  event(event){
    // Countdown cues are global; rider feedback belongs to the player.
    if(event.id!==0&&event.type!=='beep'&&event.type!=='go')return;
    const frequency={beep:440,go:880,splash:180,gate:740,miss:240,lap:1047,finish:1319,lose:110,impact:95,
      speedLevel:event.level===MAX_SPEED_LEVEL?1568:0}[event.type];
    if(frequency)this.tone(frequency);
  }

  update(race){
    if(!this.context)return;
    const active=race.phase==='racing',p=race.racers[0],t=this.context.currentTime;
    this.engine.frequency.setTargetAtTime(42+p.speed*3.4,t,.08);
    this.engineGain.gain.setTargetAtTime(active?.05+p.speed*.0018:0,t,.1);
    this.waterGain.gain.setTargetAtTime(active?.03+p.speed*.004:0,t,.12);
  }
}
