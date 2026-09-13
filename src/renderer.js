import { clamp, lerp, angleDelta, multiply, perspective, lookAt, modelMatrix, randomSeed, DEVELOPMENT } from './math.js';
import { waveHeight, WAVE_SCALE, WAVE_SPACING, WAVE_LAYERS, landforms, RAINBOW_COLORS, LIGHTHOUSE, courseProgress, OFFSHORE_SEA, COURSES, LAPS } from './course.js';
import { MAX_SPEED_LEVEL } from './boat-physics.js';
import { createSeagullMesh } from './atmosphere.js';
import { MeshBuilder, rgb, createIslandMesh, createCraftMesh, createGateMesh, createRiderMesh, createRainbowMesh, createLighthouseMesh, createBeaconMesh, createSeabedMesh, createSeaGrassMesh, createFishMesh } from './mesh.js';

// Each course has its own atmosphere; free exploration follows a four-minute day.
export function courseLighting(x,z,racer={lap:1},course=COURSES.rocky,time=0) {
  let progress=courseProgress(x,z,course);
  // Checkpoint state disambiguates the angular seam: the opening run-up
  // is morning, and approaching a lap line cannot rewind the sky early.
  if(racer.passed===0)progress=0;
  else if(racer.finishTime!=null)progress=1;
  else if(racer.passed>0){
    if(racer.nextGate===0&&progress<.5)progress=1;
    if(racer.nextGate===1&&progress>.5)progress=0;
  }
  const lap=clamp(racer.lap||1,1,LAPS),raceProgress=(lap-1+progress)/LAPS;
  const phase=time*Math.PI*2/240,cycle=course.lighting==='cycle';
  const altitude=cycle?Math.cos(phase):course.lighting==='day'?.8:
    course.lighting==='night'?-.8:course.lighting==='sunrise'?lerp(-.24,.65,raceProgress):lerp(.24,-.20,raceProgress);
  const azimuth=1.25+(cycle?phase:(course.lighting==='sunrise'?-1:1)*Math.acos(altitude));
  return skyLighting(altitude,azimuth);
}
function skyLighting(altitude,azimuth){
  const blend=clamp((.28-altitude)/.56,0,1),night=blend*blend*(3-2*blend);
  const twilight=Math.max(0,1-Math.abs(altitude)/.55)**2;
  const elevation=altitude*.24,horizontal=Math.sqrt(1-elevation*elevation);
  return {altitude,night,twilight,sunDirection:[Math.sin(azimuth)*horizontal,elevation,Math.cos(azimuth)*horizontal]};
}
export function easeTitleLighting(previous,target,dt){
  const f=1-Math.exp(-dt*1.4),altitude=lerp(previous.altitude,target.altitude,f);
  const a=Math.atan2(previous.sunDirection[0],previous.sunDirection[2]);
  const b=Math.atan2(target.sunDirection[0],target.sunDirection[2]);
  return skyLighting(altitude,a+angleDelta(b,a)*f);
}

// Directions have no translation: a distant sky rotates with the camera but
// does not slide when the camera moves sideways at the same heading.
export function projectSkyDirection(view,direction) {
  const [x,y,z]=direction,w=view[3]*x+view[7]*y+view[11]*z;
  if(w<=0)return null;
  return {x:(view[0]*x+view[4]*y+view[8]*z)/w,y:(view[1]*x+view[5]*y+view[9]*z)/w};
}

// Speed eases the view from a close idle position to a wider, higher chase.
// Height remains relative to sea level, never to the bobbing or airborne hull.
export function chaseCamera(state,racer,dt){
  const first=!state.cameraReady;
  if(first){state.cameraYaw=racer.yaw;state.cameraReady=true;}
  const forward=racer.vx*Math.sin(racer.yaw)+racer.vz*Math.cos(racer.yaw);
  const moving=clamp((forward-1)/35,0,1),turnFollow=moving*moving*(3-2*moving);
  const correction=angleDelta(racer.yaw,state.cameraYaw)*(1-Math.exp(-dt*1.15*turnFollow));
  state.cameraYaw+=clamp(correction,-dt*.7*turnFollow,dt*.7*turnFollow);
  const speed=clamp((racer.speed-2)/46,0,1),pace=speed*speed*(3-2*speed);
  state.cameraPace=first?pace:lerp(state.cameraPace,pace,1-Math.exp(-dt*1.2));
  const behind=8.5+state.cameraPace*4.5,height=5+state.cameraPace*2.25;
  const s=Math.sin(state.cameraYaw),c=Math.cos(state.cameraYaw);
  const wanted=[racer.x-s*behind,height,racer.z-c*behind],follow=1-Math.exp(-dt*5);
  state.eye=first?wanted:[lerp(state.eye[0],wanted[0],follow),height,lerp(state.eye[2],wanted[2],follow)];
  const x=racer.x+s*13,z=racer.z+c*13;
  return [x,height-Math.hypot(x-state.eye[0],z-state.eye[2])*.2,z];
}

// Freeze the former 30-second-offset orbit at its initial menu view.
export const TITLE_CAMERA={eye:[255.85,39.92,329.53],target:[125,0,-90]};

export function flareAlignment(sun,aspect){
  // Keep heading alignment tight while allowing a broader vertical range.
  const angle=Math.atan(Math.hypot(sun.x*aspect,sun.y*.4)*Math.tan(.99/2));
  return Math.exp(-((angle/.22)**2));
}

export const rainbowShader=`
vec3 spectrum(float t){vec3 c=.5+.5*cos(6.283185*(t+vec3(0.,-.333,.333)));return c*c;}
vec4 rainbowBand(float band){
 float envelope=smoothstep(0.,.18,band)*(1.-smoothstep(.82,1.,band));
 return vec4(spectrum((1.-clamp(band,0.,1.))*.78),envelope);
}`;

// Approximate side contact with one water sample and bank/trim height offsets.
export function hullSprayContact(r,side,station,time,water=waveHeight){
  const s=Math.sin(r.yaw),c=Math.cos(r.yaw),across=side*.7;
  const x=r.x+c*across+s*station,z=r.z-s*across+c*station;
  const height=water(x,z,time),depth=height-r.y-across*Math.sin(DEVELOPMENT?(r.roll||0):r.roll)+station*Math.sin(DEVELOPMENT?(r.pitch||0):r.pitch);
  return depth<-.45||depth>.32?null:{x,y:height+.05,z};
}

const vertexSource = `
attribute vec3 aPosition,aNormal,aColor;
uniform mat4 uView,uModel;
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
  p.y=waterHeight(p.xz)*waves;
  vNormal=normalize(vec3((waterHeight(p.xz-vec2(.3,0.))-waterHeight(p.xz+vec2(.3,0.)))*waves,.6,(waterHeight(p.xz-vec2(0.,.3))-waterHeight(p.xz+vec2(0.,.3)))*waves));
 }
 if(uWater>2.5)p.xz+=vec2(sin(uTime*1.3+p.x*.25+p.z*.17),cos(uTime+p.z*.23))*.23;
 vWorld=p.xyz;vColor=aColor;gl_Position=uView*p;
}`;
// One atmosphere palette for the sky, reflected sky, and distance haze.
export const skyGradientShader=`
vec3 skyColor(float elevation){
 vec3 day=mix(vec3(.8,.9,.8),vec3(.4,.7,.7),smoothstep(0.,.75,elevation));
 vec3 night=mix(vec3(.07,.1,.2),vec3(.01,.02,.07),smoothstep(0.,.85,elevation));
 vec3 dusk=mix(vec3(.9,.4,.2),vec3(.2,.09,.3),smoothstep(0.,.65,elevation));
 return mix(mix(day,night,uNight),dusk,uTwilight*.88);
}`;
const fragmentSource = `
precision highp float;
uniform vec3 uEye,uLightDirection;
uniform float uWater,uTime,uNight,uTwilight,uFogScale;
uniform vec4 uBeacon;
uniform vec4 uShadows[4];
uniform vec2 uShadowStyle[4];
varying vec3 vWorld,vNormal,vColor;
${rainbowShader}
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
 if(uWater< -2.5){
  vec4 band=rainbowBand((length(vColor.xy)-31.65)/7.35);
  gl_FragColor=vec4(band.rgb,band.a*.55);return;
 }
 float opacity=1.;
 vec3 light=normalize(uLightDirection),n=normalize(vNormal);
 vec3 color=vColor*mix(vec3(.64+.36*max(0.,dot(n,light))),vec3(.2,.3,.5)+vec3(.3,.4,.5)*max(0.,dot(n,light)),uNight);
 color*=mix(vec3(1.),vec3(1.2,.8,.6),uTwilight*.7);
 if(uWater< -1.5){
  float reach=distance(vWorld,uBeacon.xyz);
  gl_FragColor=vec4(vColor,(.025+.09*uNight)*(1.-smoothstep(160.,340.,reach)));return;
 }
 if(uWater>.5 && uWater<1.5){
  float shore=1000.,beachDistance=1000.,shoreDistance=1000.;
  ${landforms.map(i=>`{
   vec2 local=(vWorld.xz-vec2(${i.x.toFixed(1)},${i.z.toFixed(1)}))/vec2(${i.rx.toFixed(1)},${i.rz.toFixed(1)});
   float radius=length(local),a=atan(local.y,local.x);
   float coast=(radius-(1.+sin(a*5.)*.045+cos(a*7.)*.028)*.945)*${Math.min(i.rx,i.rz).toFixed(1)};
   shore=min(shore,radius);shoreDistance=min(shoreDistance,coast);
   ${i.rocky?'':'beachDistance=min(beachDistance,coast);'}
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
  // Foam belongs to the moving water surface, with holes instead of solid paint.
  float patches=foamNoise(vWorld.xz*.32+vec2(uTime*.24,-uTime*.16));
  float bubbles=foamNoise(vWorld.xz*1.65+vec2(-uTime*.45,uTime*.3));
  float texture=smoothstep(.22,.72,patches*.65+bubbles*.35);
  float crest=smoothstep(1.1,2.35,vWorld.y+(patches-.5)*.8);
  float whitecaps=crest*texture*.92;
  // Positive time moves constant-phase bands toward decreasing shore distance.
  // Long curved fronts wrap around the sandy coastline and break up as they wash in.
  float front=sin(beachDistance*.35+uTime*.85+(patches-.5)*.55);
  float breaker=smoothstep(.48,.9,front)*smoothstep(-1.,4.,beachDistance)*(1.-smoothstep(28.,52.,beachDistance));
  float wash=(1.-smoothstep(1.,9.,abs(shoreDistance-1.5-sin(uTime*.85)*1.5)))*(.45+.35*patches);
  float foam=clamp(max(whitecaps,max(breaker*texture*.9,wash*texture)),0.,1.);
  foam*=1.-smoothstep(160.,360.,distance(uEye,vWorld));
  vec3 foamColor=mix(vec3(.9,1.,.9),vec3(.3,.4,.5),uNight);
  foamColor=mix(foamColor,vec3(.9,.7,.6),uTwilight*.4);
  color=mix(color,foamColor,foam);
  opacity=mix(opacity,1.,foam);
  // Shade the water itself: blobs follow its waves without floating or z-fighting.
  for(int i=0;i<4;i++){
   vec4 shadow=uShadows[i];vec2 delta=vWorld.xz-shadow.xy;
   vec2 local=vec2(dot(delta,vec2(shadow.w,-shadow.z)),dot(delta,shadow.zw));
   float radius=length(local/(vec2(2.1,3.6)*uShadowStyle[i].x));
   float blob=(1.-smoothstep(.12,1.,radius))*uShadowStyle[i].y;
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
 // The same rotating prism lights the sea and shore beneath its visible shaft.
 vec3 delta=vWorld-uBeacon.xyz;
 vec2 direction=vec2(sin(uBeacon.w),cos(uBeacon.w));
 float ahead=dot(delta.xz,direction),across=dot(delta.xz,vec2(direction.y,-direction.x))/max(ahead,1.);
 float cone=(1.-smoothstep(.16,.20,abs(across)))*(1.-smoothstep(.045,.075,abs(delta.y/max(ahead,1.)+${((LIGHTHOUSE.y+LIGHTHOUSE.lampHeight-2)/320).toFixed(8)})));
 float beam=cone*smoothstep(0.,15.,ahead)*(1.-smoothstep(240.,340.,ahead));
 vec3 prism=.55+.45*cos(6.28318*(clamp(across/.4+.5,0.,1.)*.8+vec3(0.,-.333,.333)));
 color+=prism*beam*(.18+uNight*.85);
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
uniform float uAspect,uNight,uTime,uTwilight;
${skyGradientShader}
void main(){
 vec3 ray=normalize(uCamera*vec3(vUv*vec2(uAspect,1.)*${Math.tan(.99/2).toFixed(8)},-1.));
 vec3 color=skyColor(ray.y);
 // Spherical coordinates give every star a fixed direction in the world.
 vec2 grid=vec2(atan(ray.z,ray.x)/6.2831853+.5,asin(clamp(ray.y,-1.,1.))/3.1415927+.5)*vec2(420.,210.);
 vec2 cell=floor(grid);cell.x=mod(cell.x,420.);
 float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
 float stars=step(.968,seed)*(1.-smoothstep(.035,.18,length(fract(grid)-.5)))*smoothstep(0.,.15,ray.y);
 color+=vec3(.7,.8,1.)*stars*(.75+.25*sin(uTime*.7+seed*80.))*uNight*(1.-uTwilight*.88);
 float sunDistance=length(ray-uSunDirection),moonDistance=length(ray+uSunDirection);
 float sunVisible=smoothstep(-.025,.015,uSunDirection.y),moonVisible=smoothstep(-.025,.015,-uSunDirection.y)*uNight;
 float sunDisc=(1.-smoothstep(.038,.041,sunDistance))*sunVisible;
 float moonDisc=(1.-smoothstep(.038,.041,moonDistance))*moonVisible;
 color=mix(color,mix(vec3(1.,.9,.8),vec3(1.,.6,.2),uTwilight),sunDisc);
 color=mix(color,vec3(.8,.9,1.),moonDisc);
 color+=vec3(.04,.05,.09)*exp(-moonDistance*10.)*moonVisible;
 gl_FragColor=vec4(color,1.);}`;

const flareFragment=`precision mediump float;
varying vec2 vUv;uniform sampler2D uSource;uniform vec2 uSun;
uniform float uAspect,uStrength,uTwilight;
float visible(vec2 uv,vec3 source){
 vec3 pixel=texture2D(uSource,uv).rgb;
 return 1.-smoothstep(.09,.22,length(pixel-source));
}
${rainbowShader}
vec3 rainbowRing(float radius,float center,float width){
 vec4 band=rainbowBand((radius-center)/width+.5);
 return band.rgb*band.a;
}
void main(){
 // A tiny copy of the light center provides GPU-only occlusion. Land,
 // craft and waves covering the sun suppress the lens effect.
 vec3 source=mix(vec3(1.,.9,.8),vec3(1.,.6,.2),uTwilight);
 float mask=(visible(vec2(.5),source)+visible(vec2(.15,.5),source)+visible(vec2(.85,.5),source)+visible(vec2(.5,.15),source)+visible(vec2(.5,.85),source))*.2;
 vec2 uv=vUv*vec2(uAspect,1.),sun=uSun*vec2(uAspect,1.);
 // Keep the spectral lens halo, without the sun's warm bloom or starburst.
 vec3 color=rainbowRing(length(uv-sun),.28,.16)*.42;
 // Internal lens reflections lie on the optical axis through the image center.
 // Different aperture sizes and spectral rims suggest coated camera elements.
 for(int i=0;i<6;i++){
  float f=float(i),size=.045+fract(f*.37+.13)*.13;
  vec2 q=uv-sun*(.62-f*.43);
  q=abs(q);
  float radius=max(q.x,dot(q,vec2(.5,.866025)));
  float d=radius/size;
  float ghost=(1.-smoothstep(.65,1.,d))*.15;
  vec3 tint=spectrum(f*.17+.08);
  color+=tint*ghost+rainbowRing(d,.88,.44)*.25;
 }
 // A second rainbow lens reflection follows the opposite end of the optical axis.
 vec2 halo=uv+sun*.72;
 float ringRadius=.28;
 color+=rainbowRing(length(halo),ringRadius,.13)*.32;
 float edge=1.-smoothstep(.82,1.,max(abs(uSun.x),abs(uSun.y)));
 gl_FragColor=vec4(color*mask*uStrength*edge,1.);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(DEVELOPMENT&&!this.gl) throw Error('WebGL is unavailable.');
    const gl=this.gl;
    this.program=this.makeProgram(vertexSource,fragmentSource);
    this.skyProgram=this.makeProgram(skyVertex,skyFragment);
    this.flareProgram=this.makeProgram(skyVertex,flareFragment);
    this.sunTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.sunTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,9,9,0,gl.RGB,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.loc=Object.fromEntries(['uView','uModel','uTime','uWater','uLightDirection','uEye','uNight','uTwilight','uFogScale','uBeacon','uShadows[0]','uShadowStyle[0]'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
    this.attr=['aPosition','aNormal','aColor'].map(k=>gl.getAttribLocation(this.program,k));
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    this.island=this.upload(createIslandMesh());
    this.rainbow=null;
    this.lighthouse=this.upload(createLighthouseMesh());this.beacon=this.upload(createBeaconMesh());
    const lamp=new MeshBuilder();lamp.cone(0,-2,0,2.6,2.6,4,rgb('#fff3cc'),12);this.lamp=this.upload(lamp);
    this.nightBlend=0;this.lighting=courseLighting(0,0);
    this.crafts=[0,1,2,3].map(i=>this.upload(createCraftMesh(i)));
    this.gateMeshes=[];
    this.activeGates=[];
    this.water=this.makeWater();this.seabed=this.upload(createSeabedMesh());this.seagrass=this.upload(createSeaGrassMesh());

    this.shadowUniforms=new Float32Array(16);this.shadowStyle=new Float32Array(8);
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
  impact(event){
    for(let i=0;i<10;i++){
      const a=this.random()*Math.PI*2,v=2+this.random()*Math.min(8,event.strength*.3);
      this.particles.push({x:event.x,z:event.z,y:event.y,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:2+this.random()*4,
        life:.5+this.random()*.4,max:.9,size:.15+this.random()*.2});
    }
    this.particles=this.particles.slice(-650);
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
        for(const side of [-1,1]){
          const band=Math.floor((race.worldTime*5+side*2+7)%7);
          this.particles.push({x:x+c*side*.55,z:z-s*side*.55,y:r.y,
            vx:-s*2+c*side*(1.5+this.random()),vz:-c*2-s*side*(1.5+this.random()),vy:1.3+this.random()*1.8+strength,
            life:1.2,max:1.2,size:.12+this.random()*.15,color:tint(band)});
        }
        // Sheets of droplets peel off approximate side/wave contacts.
        // Speed controls the spray fan.
        for(const side of [-1,1])for(const station of [-1.15,0,1.05]){
          const contact=hullSprayContact(r,side,station,race.worldTime);
          if(!contact)continue;
          const hit=clamp(r.speed/50,0,1);
          for(let i=0;i<(hit>.7?3:2);i++){
            const life=.35+this.random()*.3,outward=2+hit*3+this.random();
            this.particles.push({...contact,vx:s*r.speed*.65+c*side*outward,vz:c*r.speed*.65-s*side*outward,
              vy:1.5+hit*3+this.random(),life,max:life,size:.09+this.random()*.12,
              sideSpray:true,color:tint(Math.floor((race.worldTime*5+station+side+14)%7))});
          }
        }
        // Disconnected foam flecks, never a solid ribbon.
        for(let i=0;i<6;i++){
          const side=i%2?1:-1,across=side*(.3+this.random()*.65),aft=this.random()*2;
          const life=.65+this.random()*.65;
          this.particles.push({x:x+c*across-s*aft,z:z-s*across-c*aft,y:0,
            vx:c*side*(.65+strength),vz:-s*side*(.65+strength),vy:0,
            life,max:life,size:.16+this.random()*.2,foam:true,
            color:tint(Math.floor((race.worldTime*5+i)%7))});
        }
      }
    }
    this.particles=this.particles.filter(p=>p.life>0).slice(-650);
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;if(!p.foam){p.vy-=dt*6;p.y+=p.vy*dt;} }
  }
  syncCourse(race){
    if(this.course===race.course&&this.hideCourseMarkers===!!race.hideCourseMarkers)return;
    for(const mesh of [...this.gateMeshes,...this.activeGates,this.rainbow])if(mesh)this.gl.deleteBuffer(mesh.buffer);
    this.course=race.course;
    this.hideCourseMarkers=!!race.hideCourseMarkers;
    this.gateMeshes=race.buoys.map(b=>this.upload(createGateMesh(b.gate,false,b.side,race.course.gates)));
    this.activeGates=race.buoys.map(b=>this.upload(createGateMesh(b.gate,true,b.side,race.course.gates)));
    this.rainbow=race.freePlay||race.hideCourseMarkers?null:this.upload(createRainbowMesh(race.course.gates));
    this.particles=[];this.cameraReady=false;
  }
  draw(race,dt){
    this.syncCourse(race);
    const gl=this.gl,canvas=this.canvas,pixelRatio=Math.min(devicePixelRatio||1,1.7);
    const player=race.racers[0];
    const lighting=courseLighting(player.x,player.z,player,race.lightingCourse||race.course,race.worldTime);
    this.lighting=race.phase==='title'&&this.lightingReady?easeTitleLighting(this.lighting,lighting,dt):lighting;
    this.lightingReady=true;
    this.nightBlend=lerp(this.nightBlend,this.lighting.night,1-Math.exp(-dt*3));
    const width=Math.round(canvas.clientWidth*pixelRatio),height=Math.round(canvas.clientHeight*pixelRatio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const p=race.racers[0],title=race.phase==='title';
    let target;
    if(title){
      this.eye=TITLE_CAMERA.eye;target=TITLE_CAMERA.target;this.cameraReady=false;
    } else target=chaseCamera(this,p,dt);
    const camera=lookAt(this.eye,target);
    this.view=multiply(perspective(.99,width/height,.25,4000),camera);
    this.sunScreen=projectSkyDirection(this.view,this.lighting.sunDirection);
    gl.disable(gl.DEPTH_TEST);const skyAttr=this.fullscreen(this.skyProgram);
    gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uTwilight'),this.lighting.twilight);
    gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uNight'),this.nightBlend);gl.uniform1f(gl.getUniformLocation(this.skyProgram,'uTime'),race.worldTime);
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
    gl.uniform1f(this.loc.uNight,this.nightBlend);gl.uniform4f(this.loc.uBeacon,LIGHTHOUSE.x,lampY,LIGHTHOUSE.z,beaconAngle);
    race.racers.forEach((r,i)=>{
      const clearance=Math.max(0,r.y-.35-waveHeight(r.x,r.z,race.worldTime));
      this.shadowUniforms.set([r.x,r.z,Math.sin(r.yaw),Math.cos(r.yaw)],i*4);
      // Higher craft get a broader, softer shadow while retaining a clear landing cue.
      this.shadowStyle.set([1+Math.min(clearance,12)*.055,.64/(1+Math.min(clearance,12)*.065)],i*2);
    });
    gl.uniform4fv(this.loc['uShadows[0]'],this.shadowUniforms);
    gl.uniform2fv(this.loc['uShadowStyle[0]'],this.shadowStyle);
    this.drawMesh(this.seabed,modelMatrix(),2);this.drawMesh(this.seagrass,modelMatrix(),3);
    this.drawDynamic(createFishMesh(race.worldTime,p),2);
    this.drawMesh(this.island);
    this.drawMesh(this.lighthouse,modelMatrix(LIGHTHOUSE.x,LIGHTHOUSE.y,LIGHTHOUSE.z));
    this.drawMesh(this.lamp,modelMatrix(LIGHTHOUSE.x,lampY,LIGHTHOUSE.z),-1);
    this.drawDynamic(createSeagullMesh(race.worldTime));
    race.buoys.forEach((b,i)=>{
      const gate=race.course.gates[b.gate],n=gate.tangent;
      const pitch=b.leanX*n.x+b.leanZ*n.z,roll=-(b.leanX*n.z-b.leanZ*n.x);
      const active=b.gate===p.nextGate&&!title;
      this.drawMesh(active?this.activeGates[i]:this.gateMeshes[i],modelMatrix(b.x,b.y,b.z,Math.atan2(n.x,n.z),pitch,roll),active?-.25:-1);
    });
    const riders=new MeshBuilder();
    for(const r of race.racers){
      const hullMatrix=modelMatrix(r.x,r.y,r.z,r.yaw,r.pitch,r.roll);
      this.drawMesh(this.crafts[r.id],hullMatrix);
      riders.append(createRiderMesh(r),hullMatrix);
    }
    this.drawDynamic(riders);
    // Opaque submerged geometry first, then the wave surface with depth testing.
    // Hulls above water keep their depth; submerged parts receive the water tint.
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
      if(p.foam){
        const size=p.size*fade*fade,y=waveHeight(p.x,p.z,race.worldTime)+.09;
        // Flat flecks follow the water at their center and shrink away.
        effects.triangle([p.x-size,y,p.z-size],[p.x,y,p.z+size],[p.x+size,y,p.z-size],p.color);
      }
      else {
        const size=p.size*fade,y=Math.max(p.y,waveHeight(p.x,p.z,race.worldTime)+.08);
        const color=p.color?p.color.map(v=>v*(.7+.3*fade)):[.6+fade*.2,.9+fade*.08,.8+fade*.09];
        effects.triangle([p.x-size,y,p.z],[p.x+size,y,p.z],[p.x,y+size*1.7,p.z+.05],color);
      }
    }
    this.drawDynamic(effects,-1);
    if(this.rainbow){
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      this.drawMesh(this.rainbow,modelMatrix(),-3);
      gl.depthMask(true);gl.disable(gl.BLEND);
    }
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
    this.drawMesh(this.beacon,modelMatrix(LIGHTHOUSE.x,lampY,LIGHTHOUSE.z,beaconAngle),-2);
    gl.depthMask(true);gl.disable(gl.BLEND);
    this.drawLensFlare(width,height);
  }
  drawLensFlare(width,height){
    const gl=this.gl,light=this.lighting,screen=this.sunScreen;
    const strength=(1-this.nightBlend)*(1-clamp(-light.altitude*12,0,1))*(screen?flareAlignment(screen,width/height):0);
    if(strength<.001||width<10||height<10)return;
    const {x,y}=screen;
    // Sampling outside the framebuffer is invalid, and a light behind the
    // camera or outside the viewport must never leave a stuck lens flare.
    if(Math.abs(x)>1-10/width||Math.abs(y)>1-10/height)return;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sunTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,Math.round((x*.5+.5)*width)-4,Math.round((y*.5+.5)*height)-4,9,9);
    const attr=this.fullscreen(this.flareProgram);
    gl.uniform1i(gl.getUniformLocation(this.flareProgram,'uSource'),0);
    gl.uniform2f(gl.getUniformLocation(this.flareProgram,'uSun'),x,y);
    for(const [name,value] of [['uAspect',width/height],['uStrength',strength],['uTwilight',light.twilight]])gl.uniform1f(gl.getUniformLocation(this.flareProgram,name),value);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(attr);gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
  }

}
