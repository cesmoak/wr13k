import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {encodeEnums,inlineWebGLConstants,stripCourseDefaults} from '../scripts/transforms.mjs';
import {shaderNames,renameShaderTokens} from '../scripts/glsl.mjs';

test('shader names preserve interfaces, types, swizzles, and separate declarations',()=>{
  const source='uniform vec3 sun,moon;varying vec3 view;vec3 tint(vec3 color,float gain){vec3 result=color*gain,other=moon;return result+other.xyz;}void main(){gl_FragColor=vec4(tint(sun,1.),1.);}';
  const names=shaderNames(source),packed=renameShaderTokens(source,names);
  assert.ok(!names.sun&&!names.moon&&!names.view&&!names.vec3&&!names.float&&!names.main);
  for(const key of ['tint','color','gain','result','other'])assert.ok(names[key]);
  assert.equal(new Set(Object.values(names)).size,Object.keys(names).length);
  assert.ok(packed.includes('uniform vec3 sun,moon;varying vec3 view;'));
  assert.ok(packed.includes('.xyz')&&packed.includes('gl_FragColor')&&packed.includes('vec4('));
  assert.throws(()=>shaderNames('struct Light {vec3 position;};'),/explicit support/);
});

test('enum encoding preserves course IDs, DOM strings, lookup tables, and unrelated API types',()=>{
  const source=`const mode='sunrise',element='countdown';
    const course={id:mode,lighting:{sunrise:'sunrise'}[mode]},race={phase:'title'};
    race.phase='racing';const event={type:'gate'},osc={type:'sine'};
    globalThis.probe=()=>[mode,element,course.id,course.lighting==='sunrise',race.phase==='racing',
      ['paused','racing'].includes(race.phase),{gate:17,lap:9}[event.type],osc.type];`;
  const original={},packed={};runInNewContext(source,original);runInNewContext(encodeEnums(source),packed);
  assert.equal(JSON.stringify(original.probe()),JSON.stringify(packed.probe()));
});

test('constant replacement touches WebGL constants, not unrelated objects or strings',()=>{
  const packed=inlineWebGLConstants('gl.bindBuffer(gl.ARRAY_BUFFER,this.gl.STATIC_DRAW);other.ARRAY_BUFFER;"gl.TRIANGLES";');
  assert.equal(packed,'gl.bindBuffer(34962,35044);other.ARRAY_BUFFER;"gl.TRIANGLES";');
});

test('course fallback removal requires explicit production arguments',()=>{
  assert.equal(stripCourseDefaults('function createRacer(id,course=COURSES.rocky){return course;}createRacer(0,COURSES.main);'),
    'function createRacer(id,course){return course;}createRacer(0,COURSES.main);');
  assert.throws(()=>stripCourseDefaults('createRacer(0);'),/explicit course arguments/);
});

test('shader output parameter qualifiers are preserved',()=>{
  const shader='void colors(float elevation,out vec3 day,out vec3 night){day=vec3(elevation);night=day;}';
  const mapping=shaderNames(shader);
  assert.equal(mapping.out,undefined);
  assert.match(renameShaderTokens(shader,mapping),/out vec3/);
});

test('shader names reuse only across disjoint functions and preserve global references',()=>{
  const shader='uniform float light;float helper(float alpha){float beta=alpha+light;return beta;}float other(float gamma){float delta=gamma+light;return delta;}void main(){float result=helper(other(light));gl_FragColor=vec4(result);}';
  const names=shaderNames(shader,true,true);
  assert.deepEqual(new Set([names.alpha,names.beta]),new Set([names.gamma,names.delta]));
  assert.notEqual(names.alpha,names.beta);
  assert.notEqual(names.helper,names.alpha);
  assert.notEqual(names.other,names.gamma);
  assert.ok(!names.light&&!names.main);
});

test('shader number formatting preserves value, float type, and identifiers',async()=>{
  const {compactShaderNumbers}=await import('../scripts/glsl.mjs');
  assert.equal(compactShaderNumbers('vec2 q1=vec2(0.50000,1.000);float a=1.2500e-3,b=0.0;int i=12;'),
    'vec2 q1=vec2(.5,1.);float a=.00125,b=0.;int i=12;');
  assert.equal(compactShaderNumbers('float x=1e-8,y=43758.5453;'), 'float x=1e-8,y=43758.5453;');
  assert.equal(compactShaderNumbers('float x=1000.,y=.00001,z=1.0e+3;int i=1000;float q1e3=1.;'),
    'float x=1e3,y=1e-5,z=1e3;int i=1000;float q1e3=1.;');
  for(const token of ['0.','1.','1000.','4000.','.0009','.00001','1.25e-3','43758.5453','1e-8']){
    const compact=compactShaderNumbers(token);
    assert.equal(Number(compact),Number(token));
    assert.ok(/[.e]/.test(compact),'float literals must stay floats');
    assert.equal(compactShaderNumbers(compact),compact);
  }
});
