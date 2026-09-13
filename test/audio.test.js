import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceAudio} from '../src/audio.js';
import {MAX_SPEED_LEVEL} from '../src/boat-physics.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {compactScript} from '../scripts/optimize.mjs';

function notes(event){
  const sound=new RaceAudio(),output=[];
  sound.tone=(...note)=>output.push(note);
  sound.event(event);
  return output;
}

test('tones retain their envelope, connections, stop time, and cleanup',()=>{
  const sound=new RaceAudio(),envelope=[],timing=[],disconnected=[];
  const gain={gain:{
    setValueAtTime:(...args)=>envelope.push(['set',...args]),
    linearRampToValueAtTime:(...args)=>envelope.push(['rise',...args]),
    exponentialRampToValueAtTime:(...args)=>envelope.push(['fall',...args])
  },connect:node=>assert.equal(node,sound.master),disconnect:()=>disconnected.push('gain')};
  const oscillator={frequency:{setValueAtTime:(...args)=>timing.push(['frequency',...args])},
    connect:node=>assert.equal(node,gain),start:t=>timing.push(['start',t]),stop:t=>timing.push(['stop',t]),
    disconnect:()=>disconnected.push('oscillator')};
  sound.master={};sound.context={currentTime:12,createGain:()=>gain,createOscillator:()=>oscillator};
  sound.tone(440);
  assert.equal(gain.gain.value,0);
  assert.deepEqual(envelope,[['set',0,12],['rise',.22,12.008],['fall',.001,12.16]]);
  assert.deepEqual(timing,[['frequency',440,12],['start',12],['stop',12.19]]);
  oscillator.onended();assert.deepEqual(disconnected,['oscillator','gain']);
});

test('countdown cues are global while rider cues only play for the player',()=>{
  for(const type of ['beep','go']){
    const cue=notes({type});assert.equal(cue.length,1);
    for(const id of [0,1,3])assert.deepEqual(notes({type,id}),cue);
  }
  for(const type of ['gate','miss','lap','finish','lose','impact','splash','speedLevel']){
    const event={type,strength:8,level:MAX_SPEED_LEVEL};
    assert.ok(notes({...event,id:0}).length>0,type);
    for(const id of [undefined,1,3])assert.deepEqual(notes({...event,id}),[],type);
  }
  assert.deepEqual(notes({type:'unknown',id:0}),[]);
  assert.deepEqual(notes({type:'speedLevel',id:0,level:MAX_SPEED_LEVEL-1}),[]);
});

test('event feedback uses one distinct pitch and splashes have a consistent cue',()=>{
  const pitches=[];
  for(const type of ['beep','go','splash','gate','miss','lap','finish','lose','impact','speedLevel']){
    const cue=notes({type,id:0,level:MAX_SPEED_LEVEL});
    assert.equal(cue.length,1);assert.equal(cue[0].length,1);
    assert.ok(cue[0][0]>0&&Number.isFinite(cue[0][0]));pitches.push(cue[0][0]);
  }
  assert.equal(new Set(pitches).size,pitches.length);
  for(const strength of [-10,0,3,16,100])
    assert.deepEqual(notes({type:'splash',id:0,strength}),notes({type:'splash',id:0}));
});

test('production enum and property shortening preserve event sound selection',async()=>{
  const events=['beep','go','gate','miss','lap','finish','lose','impact','speedLevel','unknown'].flatMap(type=>
    [undefined,0,1,3].flatMap(id=>[1,MAX_SPEED_LEVEL].flatMap(level=>
      ['buoy','racer'].map(other=>({type,id,level,other})))));
  events.push(...[0,1,3].flatMap(id=>[0,3,8,16,100].map(strength=>({type:'splash',id,strength}))));
  const source=(await readFile(new URL('../src/audio.js',import.meta.url),'utf8'))
    .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  // Compile the event fixtures and capture together so their keys follow the
  // production enum/property mappings; compare only the resulting note values.
  const input=`const MAX_SPEED_LEVEL=${MAX_SPEED_LEVEL};
    ${source}
    globalThis.result=(()=>{
      const sound=new RaceAudio();let output;sound.tone=(...note)=>output.push(note);
      return JSON.stringify(${JSON.stringify(events)}.map(event=>{
        output=[];sound.event(event);return output;
      }));
    })();`;
  const original={},packed={};runInNewContext(input,original);
  runInNewContext(await compactScript(input,{enums:true,shaders:false,metadata:false,defaults:false}),packed);
  assert.equal(packed.result,original.result);
});

test('water rush loops filtered noise, follows speed, and mutes outside racing',async()=>{
  const gains=[],filters=[],sources=[];
  const parameter=()=>({value:0,setTargetAtTime(value){this.value=value;}});
  const node=()=>({connections:[],connect(n){this.connections.push(n);},disconnect(){},start(){this.started=true;}});
  const context={sampleRate:128,currentTime:12,state:'suspended',destination:{},
    async resume(){this.state='running';},
    createGain(){const n={...node(),gain:parameter()};gains.push(n);return n;},
    createOscillator(){return {...node(),frequency:parameter()};},
    createBiquadFilter(){const n={...node(),frequency:parameter(),Q:parameter()};filters.push(n);return n;},
    createBuffer(channels,length,rate){assert.equal(channels,1);assert.equal(length,rate*2);const data=new Float32Array(length);return {getChannelData:()=>data};},
    createBufferSource(){const n=node();sources.push(n);return n;}
  };
  const source=(await readFile(new URL('../src/audio.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  const scope={window:{AudioContext:function(){return context;}}};
  runInNewContext(source+'\nglobalThis.sound=new RaceAudio();',scope);
  const sound=scope.sound;await sound.unlock();
  assert.equal(context.state,'running');assert.equal(sources.length,1);
  const noise=sources[0],filter=filters[1],data=noise.buffer.getChannelData(0);
  assert.ok(noise.loop&&noise.started&&data.every(Number.isFinite)&&data.some(v=>Math.abs(v)>.01));
  assert.equal(filter.type,'highpass');assert.equal(filter.frequency.value,650);
  assert.equal(noise.connections[0],filter);assert.equal(filter.connections[0],sound.waterGain);
  assert.equal(sound.waterGain.connections[0],sound.master);assert.equal(sound.waterGain.gain.value,0);
  for(const speed of [0,45,80]){
    sound.update({phase:'racing',racers:[{speed}]});
    assert.equal(sound.waterGain.gain.value,.03+speed*.004);
  }
  for(const phase of ['title','countdown','paused','finished','lost']){
    sound.update({phase,racers:[{speed:80}]});assert.equal(sound.waterGain.gain.value,0);
  }
  await sound.unlock();assert.equal(sources.length,1,'Unlock reuses its looping source');
});
