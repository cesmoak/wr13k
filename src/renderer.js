import { clamp, lerp, blend, angleDelta, lookAt, modelMatrix, randomSeed, DEVELOPMENT } from './math.js';
import { waveHeight, WAVE_SCALE, WAVE_SPACING, WAVE_LAYERS, landforms, RAINBOW_COLORS, LIGHTHOUSE, OFFSHORE_SEA, COURSES, LAPS } from './course.js';
import { MAX_SPEED_LEVEL } from './boat-physics.js';
import { MeshBuilder, rgb, createIslandMesh, createCraftMesh, createBuoyMesh, createRiderMesh, createLighthouseMesh, createBeaconMesh, createSeabedMesh, createSeaGrassMesh } from './mesh.js';

// Each course has its own atmosphere.
export function courseLighting(racer={passed:0},course=COURSES.rocky) {
  const raceProgress=clamp((racer.passed-1)/(course.gates.length*LAPS),0,1);
  const altitude=course.lighting==='day'?.8:
    course.lighting==='night'?-.8:course.lighting==='sunrise'?lerp(-.24,.65,raceProgress):lerp(.24,-.20,raceProgress);
  const azimuth=1.25+(course.lighting==='sunrise'?-1:1)*Math.acos(altitude);
  return skyLighting(altitude,azimuth);
}
function skyLighting(altitude,azimuth){
  const blend=clamp((.28-altitude)/.56,0,1),night=blend*blend*(3-2*blend);
  const twilight=Math.max(0,1-Math.abs(altitude)/.55)**2;
  const elevation=altitude*.24,horizontal=Math.sqrt(1-elevation*elevation);
  return {altitude,night,twilight,sunDirection:[Math.sin(azimuth)*horizontal,elevation,Math.cos(azimuth)*horizontal]};
}
export function easeLighting(previous,target,dt){
  const f=blend(dt,1.4),altitude=lerp(previous.altitude,target.altitude,f);
  const a=Math.atan2(previous.sunDirection[0],previous.sunDirection[2]);
  const b=Math.atan2(target.sunDirection[0],target.sunDirection[2]);
  return skyLighting(altitude,a+angleDelta(b,a)*f);
}

// Directions have no translation: a distant sky rotates with the camera but
// does not slide when the camera moves sideways at the same heading.


// Fixed cruising distance and sea-level height, with smooth position and heading.
// Idle pivots hold the view; any movement above the threshold resumes following.
export function chaseCamera(state,racer,dt){
  const first=!state.cameraReady;
  if(first){state.cameraYaw=racer.yaw;state.cameraReady=true;}
  if(racer.speed>1)state.cameraYaw+=angleDelta(racer.yaw,state.cameraYaw)*blend(dt,1.15);
  const s=Math.sin(state.cameraYaw),c=Math.cos(state.cameraYaw);
  const wanted=[racer.x-s*13,7.25,racer.z-c*13];
  state.eye=first?wanted:state.eye.map((v,i)=>lerp(v,wanted[i],blend(dt,5)));
  const x=racer.x+s*13,z=racer.z+c*13;
  return [x,7.25-Math.hypot(x-state.eye[0],z-state.eye[2])*.2,z];
}

// Freeze the former 30-second-offset orbit at its initial menu view.
export const TITLE_CAMERA={eye:[255.85,39.92,329.53],target:[125,0,-90]};





const vertexSource = `
attribute vec3 aPosition,aNormal,aColor;
uniform mat4 uView,uModel;
uniform vec4 uBuoy;
uniform float uTime,uWater;
varying vec3 vWorld,vNormal,vColor;
float waterHeight(vec2 p){
 float patch=.5+.5*sin(p.x*.013+p.y*.009);
 float exposed=1.-smoothstep(${OFFSHORE_SEA.inner.toFixed(5)},${OFFSHORE_SEA.outer.toFixed(5)},length((p-vec2(${OFFSHORE_SEA.x.toFixed(5)},${OFFSHORE_SEA.z.toFixed(5)}))/vec2(${OFFSHORE_SEA.rx.toFixed(5)},${OFFSHORE_SEA.rz.toFixed(5)})));
 float chop=.2+.8*patch*patch+exposed*${OFFSHORE_SEA.chop.toFixed(5)};
 float group=.78+.22*sin(p.x*.008-p.y*.006-uTime*.21);
 float height=0.;
 ${WAVE_LAYERS.map(([kx,kz,speed,amplitude,phase,localChop])=>
   `height+=sin(p.x*${(kx*WAVE_SPACING).toFixed(8)}+p.y*${(kz*WAVE_SPACING).toFixed(8)}+uTime*${speed.toFixed(5)}+${phase.toFixed(5)})*${amplitude.toFixed(5)}*(1.-${localChop.toFixed(5)}+${localChop.toFixed(5)}*chop);`).join('\n ')}
 height*=${WAVE_SCALE.toFixed(2)}*group*(1.+exposed*${OFFSHORE_SEA.swell.toFixed(5)});
 return height;
}
void main(){
 vec4 p=uModel*vec4(aPosition,1.);
 vNormal=normalize(mat3(uModel)*aNormal);
 if(uWater>.5 && uWater<1.5){
  // Settle the detailed patch into a flat ocean before its coarse outer ring.
  float waves=1.-smoothstep(420.,650.,max(abs(aPosition.x),abs(aPosition.z)));
  float height=waterHeight(p.xz);
  p.y=height*waves;
  // Reuse the center height for forward differences along both axes.
  vNormal=normalize(vec3((height-waterHeight(p.xz+vec2(.3,0.)))*waves,.3,(height-waterHeight(p.xz+vec2(0.,.3)))*waves));
 }

 if(uWater>2.5)p.xz+=vec2(sin(uTime*1.3+p.x*.25+p.z*.17),cos(uTime+p.z*.23))*.23;
 vWorld=p.xyz;vColor=aColor.r<0.?uBuoy.rgb*(1.-aColor.g*uBuoy.a):aColor;gl_Position=uView*p;
}`;
// Blend horizon and upper-sky colors, then share one elevation curve across
// daylight, night, and dusk for the sky, reflections, and distance haze.
export const skyGradientShader=`
vec3 skyColor(float elevation){
 return mix(
  mix(mix(vec3(.8,.9,.8),vec3(.07,.1,.2),uNight),vec3(.9,.4,.2),uTwilight*.88),
  mix(mix(vec3(.4,.7,.7),vec3(.01,.02,.07),uNight),vec3(.2,.09,.3),uTwilight*.88),
  smoothstep(0.,.75,elevation));
}`;
const fragmentSource = `
precision highp float;
uniform vec3 uEye,uLightDirection;
uniform float uWater,uTime,uNight,uTwilight,uFogScale;
uniform vec3 uBeacon;
uniform vec2 uShadows[4];

varying vec3 vWorld,vNormal,vColor;

float foamNoise(vec2 p){
 vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
 float b=fract(sin(dot(cell+vec2(1.,0.),vec2(127.1,311.7)))*43758.5453);
 float c=fract(sin(dot(cell+vec2(0.,1.),vec2(127.1,311.7)))*43758.5453);
 float d=fract(sin(dot(cell+vec2(1.),vec2(127.1,311.7)))*43758.5453);
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

${skyGradientShader}
void main(){


 float opacity=1.;
 vec3 light=normalize(uLightDirection),n=normalize(vNormal);
 vec3 color=vColor*mix(vec3(.64+.36*max(0.,dot(n,light))),vec3(.2,.3,.5)+vec3(.3,.4,.5)*max(0.,dot(n,light)),uNight);
 color*=mix(vec3(1.),vec3(1.2,.8,.6),uTwilight*.7);
 if(uWater< -1.5){
  float reach=distance(vWorld,uBeacon);
  gl_FragColor=vec4(vColor,(.1+.36*uNight)*(1.-smoothstep(160.,340.,reach)));return;
 }
 if(uWater>.5 && uWater<1.5){
  float shore=1000.,shoreDistance=1000.;
  ${landforms.map(i=>`{
   vec2 local=(vWorld.xz-vec2(${i.x.toFixed(1)},${i.z.toFixed(1)}))/vec2(${i.rx.toFixed(1)},${i.rz.toFixed(1)});
   float radius=length(local),a=atan(local.y,local.x);
   float coast=(radius-(1.+sin(a*5.)*.045+cos(a*7.)*.028)*.945)*${Math.min(i.rx,i.rz).toFixed(1)};
   shore=min(shore,radius);shoreDistance=min(shoreDistance,coast);
  }`).join('\n  ')}
  float depth=smoothstep(.96,1.8,shore);
  vec3 view=normalize(uEye-vWorld),reflected=reflect(-view,n);
  float facing=clamp(dot(n,view),0.,1.);
  float fresnel=.035+.965*pow(1.-facing,5.);
  // Long, grazing sightlines hide the floor, even on tilted wave faces.
  // Nearby downward views retain transparent shallows and underwater detail.
  float transmission=smoothstep(.12,.42,abs(view.y))*(1.-smoothstep(55.,160.,distance(uEye,vWorld)))*(1.-fresnel);
  opacity=1.-(.76-depth*.40)*transmission;
  vec3 sky=skyColor(reflected.y);
  vec3 water=mix(mix(vec3(.3,.8,.7),vec3(.06,.5,.6),depth),mix(vec3(.04,.2,.3),vec3(.01,.07,.2),depth),uNight);
  water=mix(water,water*vec3(1.3,.8,.9),uTwilight*.5);
  color=mix(water,sky,.12+fresnel*.38);
  color*=.78+.22*max(0.,dot(n,light));
  float glint=pow(max(0.,dot(reflected,light)),150.);
  float glow=pow(max(0.,dot(reflected,light)),12.);
  color+=mix(mix(vec3(1.,.9,.8),vec3(.5,.7,1.),uNight),vec3(1.,.5,.2),uTwilight)*(glint*.9+glow*.12);
  // Smooth random noise breaks up crests and shoreline wash.
  float patches=foamNoise(vWorld.xz*.32+vec2(uTime*.24,-uTime*.16));
  float texture=smoothstep(.22,.72,patches);
  float crest=smoothstep(1.1,2.35,vWorld.y+(patches-.5)*.8);
  float whitecaps=crest*texture*.92;
  float wash=(1.-smoothstep(1.,9.,abs(shoreDistance)))*texture;
  float foam=clamp(max(whitecaps,wash),0.,1.);
  foam*=1.-smoothstep(160.,360.,distance(uEye,vWorld));
  vec3 foamColor=mix(vec3(.9,1.,.9),vec3(.3,.4,.5),uNight);
  foamColor=mix(foamColor,vec3(.9,.7,.6),uTwilight*.4);
  color=mix(color,foamColor,foam);
  opacity=mix(opacity,1.,foam);

  // Shade the water itself: blobs follow its waves without floating or z-fighting.
  for(int i=0;i<4;i++){
   float radius=length(vWorld.xz-uShadows[i])/2.8;
   float blob=(1.-smoothstep(.12,1.,radius))*.64;
   color*=1.-blob;
  }
 }
 if(uWater>1.5){
  float ripple=sin(vWorld.x*.7+sin(vWorld.z*.43+uTime)*1.6)+sin(vWorld.z*.8-vWorld.x*.22-uTime*.8);
  float caustic=pow(max(0.,1.-abs(ripple)*.75),6.);
  color*=.9+.25*caustic*(1.-uNight*.8);
  float column=max(0.,-vWorld.y)/max(.25,abs(normalize(uEye-vWorld).y));
  color=mix(color,mix(vec3(.06,.4,.4),vec3(.01,.05,.1),uNight),clamp(column*.017,.12,.72));
 }
 if(uWater< -.5)color=mix(color,vColor*(.85+.15*max(0.,dot(n,light))),uNight);
 // The next buoy is self-lit in daylight, dusk and darkness.
 if(uWater<0. && uWater>-.5)color=vColor*1.25;
 // Light haze across the course, then a longer fade for the offshore cliffs.
 float fogDistance=distance(uEye,vWorld)*uFogScale;
 float fog=.28*smoothstep(180.,750.,fogDistance)+.72*smoothstep(650.,2300.,fogDistance);
 // Match the sky at this elevation so the ocean fades into the horizon.
 float elevation=normalize(vWorld-uEye).y;
 color=mix(color,skyColor(elevation),fog);
 gl_FragColor=vec4(color,opacity);
}`;
const skyVertex = `attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition;gl_Position=vec4(aPosition,.99999,1.);}`;
const skyFragment = `precision highp float;
varying vec2 vUv;uniform mat3 uCamera;uniform vec3 uSunDirection;
uniform float uAspect,uNight,uTwilight;
${skyGradientShader}
void main(){
 vec3 ray=normalize(uCamera*vec3(vUv*vec2(uAspect,1.)*${Math.tan(.99/2).toFixed(8)},-1.));
 vec3 color=skyColor(ray.y);
 float sunDistance=length(ray-uSunDirection),moonDistance=length(ray+uSunDirection);
 float sunVisible=smoothstep(-.025,.015,uSunDirection.y),moonVisible=smoothstep(-.025,.015,-uSunDirection.y)*uNight;
 float sunDisc=(1.-smoothstep(.038,.041,sunDistance))*sunVisible;
 float moonDisc=(1.-smoothstep(.038,.041,moonDistance))*moonVisible;
 color=mix(color,mix(vec3(1.,.9,.8),vec3(1.,.6,.2),uTwilight),sunDisc);
 color=mix(color,vec3(.8,.9,1.),moonDisc);
 color+=vec3(.04,.05,.09)*exp(-moonDistance*10.)*moonVisible;
 gl_FragColor=vec4(color,1.);}`;



export class Renderer {
  constructor(canvas) {
    this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(DEVELOPMENT&&!this.gl) throw Error('WebGL is unavailable.');
    const gl=this.gl;
    this.program=this.makeProgram(vertexSource,fragmentSource);
    this.skyProgram=this.makeProgram(skyVertex,skyFragment);
    this.loc=Object.fromEntries(['uBuoy','uView','uModel','uTime','uWater','uLightDirection','uEye','uNight','uTwilight','uFogScale','uBeacon','uShadows[0]'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
    this.attr=['aPosition','aNormal','aColor'].map(k=>gl.getAttribLocation(this.program,k));
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    this.island=this.upload(createIslandMesh());
    this.seabed=this.upload(createSeabedMesh());this.seagrass=this.upload(createSeaGrassMesh());

    this.lighthouse=this.upload(createLighthouseMesh());this.beacon=this.upload(createBeaconMesh());
    const lamp=new MeshBuilder();lamp.cone(0,-2,0,2.6,2.6,4,rgb('#fff3cc'),12);this.lamp=this.upload(lamp);
    this.nightBlend=0;this.lighting=courseLighting();
    this.crafts=[0,1,2,3].map(i=>this.upload(createCraftMesh(i)));
    this.buoyMesh=this.upload(createBuoyMesh());

    this.water=this.makeWater();

    this.shadowUniforms=new Float32Array(8);
    this.effectBuffer=gl.createBuffer();this.particles=[];this.rainbowColors=RAINBOW_COLORS.map(rgb);this.particleClock=0;this.random=randomSeed(83);
    this.cameraReady=false;
    gl.enable(gl.DEPTH_TEST);
  }
  fullscreen(program){
    const gl=this.gl;gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);
    for(const a of this.attr)gl.disableVertexAttribArray(a);
    const attr=gl.getAttribLocation(program,'aPosition');
    gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    return attr;
  }
  makeProgram(vs,fs){
    const gl=this.gl,p=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]) {
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(DEVELOPMENT&&!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);
    }
    gl.linkProgram(p);if(DEVELOPMENT&&!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));return p;
  }
  upload(mesh){
    const gl=this.gl,buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.STATIC_DRAW);
    return {buffer,count:mesh.data.length/9};
  }
  drawDynamic(mesh,water=0){
    const buffer=this.effectBuffer;
    const gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);
    this.drawMesh({buffer,count:mesh.data.length/9},modelMatrix(),water);
  }
  makeWater(){
    const mesh=new MeshBuilder();
    // Fine contact-scale water near the player, coarse geometry at the horizon.
    for (const [size,step,inner] of [[224,3.5,0],[700,14,224],[2100,140,700],[4200,300,2100]]) {
      for(let x=-size;x<size;x+=step) for(let z=-size;z<size;z+=step) {
        if(x>=-inner&&x<inner&&z>=-inner&&z<inner)continue;
        mesh.quad([x,0,z],[x,0,z+step],[x+step,0,z+step],[x+step,0,z],[0,0,0]);
      }
    }
    return this.upload(mesh);
  }
  drawMesh(mesh,matrix=modelMatrix(),water=0){
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    this.attr.forEach((a,i)=>{gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*12);});
    gl.uniformMatrix4fv(this.loc.uModel,false,matrix);gl.uniform1f(this.loc.uWater,water);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  updateEffects(race,dt){
    this.particleClock+=dt;
    if(this.particleClock>.065&&(race.phase==='racing'||race.phase==='title')) {
      this.particleClock=0;
      for(const r of race.racers){
        if(r.speed<=3||r.airborne)continue;
        const s=Math.sin(r.yaw),c=Math.cos(r.yaw),x=r.x-s*2,z=r.z-c*2;
        const strength=clamp((r.speed-8)/40,0,1);
        // Rainbow effects reward the maximum buoy-earned speed level.
        const tint=band=>r.speedLevel===MAX_SPEED_LEVEL?this.rainbowColors[band].map(v=>v**2.2):[.8,.9,.9];
        // Two rear droplets followed by six drifting foam flecks share one
        // emitter, retaining their random sequence and separate motion rules.
        for(let i=0;i<8;i++){
          const foam=i>1,side=i%2?1:-1;
          const across=side*(foam?.3+this.random()*.65:.55),aft=foam?this.random()*2:0;
          const life=foam?.65+this.random()*.65:1.2;
          this.particles.push({x:x+c*across-s*aft,z:z-s*across-c*aft,y:foam?0:r.y,
            vx:foam?c*side*(.65+strength):-s*2+c*side*(1.5+this.random()),
            vz:foam?-s*side*(.65+strength):-c*2-s*side*(1.5+this.random()),
            vy:foam?0:1.3+this.random()*1.8+strength,life,max:life,
            size:foam?.16+this.random()*.2:.12+this.random()*.15,foam,
            color:tint(Math.floor((race.worldTime*5+(foam?i-2:side*2+7))%7))});
        }
      }
    }
    this.particles=this.particles.filter(p=>p.life>0).slice(-650);
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;if(!p.foam){p.vy-=dt*6;p.y+=p.vy*dt;} }
  }
  syncCourse(race){
    if(this.course===race.course)return;

    this.course=race.course;



    this.particles=[];this.cameraReady=false;
  }
  draw(race,dt){
    this.syncCourse(race);
    const gl=this.gl,canvas=this.gl.canvas,pixelRatio=Math.min(devicePixelRatio||1,1.7);
    const player=race.racers[0];
    const lighting=courseLighting(player,race.lightingCourse||race.course);
    const lightingDt=race.phase==='paused'?0:dt;
    this.lighting=this.lightingReady?easeLighting(this.lighting,lighting,lightingDt):lighting;
    this.lightingReady=true;
    this.nightBlend=lerp(this.nightBlend,this.lighting.night,blend(lightingDt,3));
    const width=Math.round(canvas.clientWidth*pixelRatio),height=Math.round(canvas.clientHeight*pixelRatio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const p=race.racers[0],title=race.phase==='title';
    let target;
    if(title){
      this.eye=TITLE_CAMERA.eye;target=TITLE_CAMERA.target;this.cameraReady=false;
    } else target=chaseCamera(this,p,dt);
    const camera=lookAt(this.eye,target);
    // Fixed perspective times an affine view; retain the projection's Float32 rounding.
    const f=1/Math.tan(.99/2),nf=1/(.25-4000),projection=new Float32Array([f/(width/height),f,(4000+.25)*nf,2*4000*.25*nf]);
    this.view=camera.map((v,i)=>i%4===3?-camera[i-1]:projection[i%4]*v+(i===14?projection[3]:0));

    gl.disable(gl.DEPTH_TEST);const skyAttr=this.fullscreen(this.skyProgram);
    gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uTwilight'),this.lighting.twilight);
    gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uNight'),this.nightBlend);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.skyProgram,'uCamera'),false,new Float32Array([camera[0],camera[4],camera[8],camera[1],camera[5],camera[9],camera[2],camera[6],camera[10]]));
    gl.uniform3fv(gl.getUniformLocation(this.skyProgram,'uSunDirection'),this.lighting.sunDirection);
    gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uAspect'),width/height);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(skyAttr);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);
    const sunlight=this.lighting.sunDirection,n=this.nightBlend;
    gl.uniform3fv(this.loc.uLightDirection,[sunlight[0]*(1-2*n),Math.max(.12,Math.abs(sunlight[1])),sunlight[2]*(1-2*n)]);
    gl.uniformMatrix4fv(this.loc.uView,false,this.view);gl.uniform3fv(this.loc.uEye,this.eye);gl.uniform1f(this.loc.uTime,race.worldTime);
    const beaconAngle=race.worldTime*.24-1.8,lampY=LIGHTHOUSE.y+LIGHTHOUSE.lampHeight;
    gl.uniform1f(this.loc.uTwilight,this.lighting.twilight);
    gl.uniform1f(this.loc.uFogScale,title?.85:1);
    gl.uniform1f(this.loc.uNight,this.nightBlend);gl.uniform3f(this.loc.uBeacon,LIGHTHOUSE.x,lampY,LIGHTHOUSE.z);
    race.racers.forEach((r,i)=>this.shadowUniforms.set([r.x,r.z],i*2));
    gl.uniform2fv(this.loc['uShadows[0]'],this.shadowUniforms);



    this.drawMesh(this.seabed,modelMatrix(),2);this.drawMesh(this.seagrass,modelMatrix(),3);
    this.drawMesh(this.island);
    this.drawMesh(this.lighthouse,modelMatrix(LIGHTHOUSE.x,LIGHTHOUSE.y,LIGHTHOUSE.z));
    this.drawMesh(this.lamp,modelMatrix(LIGHTHOUSE.x,lampY,LIGHTHOUSE.z),-1);
    race.buoys.forEach(b=>{
      const gate=race.course.gates[b.gate],n=gate.tangent;
      const pitch=b.leanX*n.x+b.leanZ*n.z,roll=-(b.leanX*n.z-b.leanZ*n.x);
      const active=b.gate===p.nextGate&&!title;
      const model=modelMatrix(b.x,b.y,b.z,Math.atan2(n.x,n.z),pitch,roll);
      for(let j=0;j<3;j++)model[j]*=b.side;
      gl.uniform4f(this.loc.uBuoy,...rgb(gate.side>0?'#ff7669':'#66e6ed'),b.gate?0:1);
      this.drawMesh(this.buoyMesh,model,active?-.25:-1);
    });
    const riders=new MeshBuilder();
    for(const r of race.racers){
      const hullMatrix=modelMatrix(r.x,r.y,r.z,r.yaw,r.pitch,r.roll);
      this.drawMesh(this.crafts[r.id],hullMatrix);
      riders.append(createRiderMesh(r),hullMatrix);
    }
    this.drawDynamic(riders);
    // The panoramic title camera watches the course, not a moving racer patch.
    const waterMatrix=title?modelMatrix(140,0,-70):modelMatrix(Math.round(p.x/14)*14,0,Math.round(p.z/14)*14);
    // Select the nearest wave surface before blending, so overlapping crests
    // do not accumulate transparency or reveal distant triangles through them.
    // Bias only the depth prepass: equal-depth rounding between the masked and
    // blended passes can otherwise punch flickering holes through the foam.
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);
    gl.colorMask(false,false,false,false);this.drawMesh(this.water,waterMatrix,1);gl.colorMask(true,true,true,true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);
    this.drawMesh(this.water,waterMatrix,1);
    gl.depthFunc(gl.LESS);gl.depthMask(true);gl.disable(gl.BLEND);
    if(race.phase!=='paused'&&race.phase!=='finished'&&race.phase!=='lost')this.updateEffects(race,dt);
    const effects=new MeshBuilder();
    for(const p of this.particles){
      const fade=clamp(p.life/p.max,0,1);
      const size=p.size*fade,y=p.foam?waveHeight(p.x,p.z,race.worldTime)+.09:Math.max(p.y,waveHeight(p.x,p.z,race.worldTime)+.08);
      // Every wake particle is a flat shrinking triangle; droplets retain gravity.
      effects.triangle([p.x-size,y,p.z-size],[p.x,y,p.z+size],[p.x+size,y,p.z-size],p.color);
    }
    this.drawDynamic(effects,-1);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
    this.drawMesh(this.beacon,modelMatrix(LIGHTHOUSE.x,lampY,LIGHTHOUSE.z,beaconAngle),-2);
    gl.depthMask(true);gl.disable(gl.BLEND);

  }


}
