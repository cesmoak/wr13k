import { clamp, blend, modelMatrix, DEVELOPMENT } from './math.js';
import { waveHeight, sampleWater } from './course.js';

// Inspired by fnport's primary hull contacts + secondary rider solver, not
// its ROM constants or assets. Units and assists are tuned for this arcade game.
export const HULL_CONTACTS = [-1.6, 0, 1.8].flatMap(z => [-.72, .72].map(x => [x, -.48, z]));
export const MAX_SPEED_LEVEL = 5;
export const OPPONENT_PACE = 1.15;
export const RIDER_LEAN = .24;
// Every rider earns the same 8% per clean checkpoint, up to level five.
export function speedMultiplier(racer) {
  const earned=1 + .08 * ((DEVELOPMENT?clamp(racer.speedLevel||1,1,MAX_SPEED_LEVEL):racer.speedLevel) - 1);
  return earned*(racer.id===0?1:OPPONENT_PACE);
}
export function limitSpeed(r, limit) {
  const speed = Math.hypot(r.vx, r.vz);
  if (speed > limit) { r.vx *= limit / speed; r.vz *= limit / speed; }
  r.speed = Math.hypot(r.vx, r.vz);
}
// Stronger downward acceleration shortens wave launches without an airtime cap.
const GRAVITY = 22;
const HULL_SPRING = 110;
const HULL_DAMPING = 16;

export function newBoatState() {
  return { yawRate: 0, pitchRate: 0, rollRate: 0,
    waterImpact: 0, splashCooldown: 0,
    ...(DEVELOPMENT ? {contactFraction:1,waterForce: 0, landingImpact: 0, contactPoints: []} : {}),
    rider: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, pitch: 0, pitchRate: 0, ...(DEVELOPMENT?{roll:0,rollRate:0}:{}),
      handlePitch:0 } };
}

export function resetBoat(racer, time) {
  Object.assign(racer, newBoatState(), { pitch: 0, roll: 0, vy: 0, airborne: false, steer: 0 });
  racer.y = waveHeight(racer.x, racer.z, time) + .48 - GRAVITY / HULL_SPRING;
}

// Assisted pivoting at rest, strongest response once moving, wider high-speed arcs.
// The idle term is an intentional maneuvering assist, matching fnport's idea
// of a low-speed contact torque even when the throttle is released.
export function steeringAuthority(speed, brake = false, racerId = 0) {
  const v = Math.abs(speed);
  const blend=clamp(v/8,0,1),idleAssist=racerId===0?.84*(1-blend*blend*(3-2*blend)):0;
  return .5 * (.42 + idleAssist + 3.25 * (1 - Math.exp(-v / 10))) / (1 + (v / 90) ** 2) * (brake ? 1.25 : 1);
}

// Independent balance in the heading frame: hull tilt is removed when posing,
// so the torso seeks gravity-up instead of inheriting every wave rotation.
export function springRider(r, ax, ay, az, dt) {
  const rider = r.rider, s = Math.sin(r.yaw), c = Math.cos(r.yaw);
  const sideAccel = ax * c - az * s, forwardAccel = ax * s + az * c;
  const goals = [r.steer * .30 * clamp(r.speed / 20, 0, 1) + r.roll * .65, r.airborne ? .24 : 0, -r.pitch * .55];
  // Unloading lets the legs extend; upward hull acceleration compresses them.
  // Free-flight gravity is shared by rider and hull, so it adds no relative load.
  const inertia = [-sideAccel * .11, r.airborne ? 0 : -clamp(ay,-65,100) * .65, -forwardAccel * .16];
  const limits = [[-.48, .48], [-.38, .28], [-.27, .25]];
  ['x', 'y', 'z'].forEach((axis, i) => {
    const velocity = `v${axis}`;
    // Softer suspension lets the pelvis lag, crouch on landing, and rebound.
    rider[velocity] += ((goals[i] - rider[axis]) * (i === 1 ? 55 : 75) - rider[velocity] * (i === 1 ? 9 : 13) + inertia[i]) * dt;
    rider[axis] += rider[velocity] * dt;
    const constrained = clamp(rider[axis], ...limits[i]);
    if (constrained !== rider[axis]) { rider[axis] = constrained; rider[velocity] = 0; }
  });
  // Turns and side impacts shift the body laterally without tipping it.
  // Keep the roll fields for reset compatibility.
  if(DEVELOPMENT)rider.roll = rider.rollRate = 0;
  const target = clamp(forwardAccel * .0025, -.12, .12);
  rider.pitchRate += ((target - rider.pitch) * 55 - rider.pitchRate * 12 + r.pitchRate * 1.8) * dt;
  rider.pitch += rider.pitchRate * dt;
  if (Math.abs(rider.pitch) > .24) {
    rider.pitch = clamp(rider.pitch, -.24, .24); rider.pitchRate = 0;
  }
  // The steering pole follows the already-smoothed suspension directly.
  rider.handlePitch=clamp(rider.y*(rider.y>0?1.7:.3),-.12,.24);
}

export function stepBoat(r, input, dt, time, water = sampleWater, moored = false) {
  // Production advances only at 60 Hz; fixtures can supply other time steps.
  const steps = DEVELOPMENT ? Math.max(1, Math.ceil(dt / (1 / 240))) : 4, h = dt / steps;
  if(DEVELOPMENT)r.landingImpact = Math.max(0, r.landingImpact - dt * 12);
  r.waterImpact = 0;
  const power = speedMultiplier(r);
  for (let step = 0; step < steps; step++) {
    const now = time - dt + (step + 1) * h, matrix = modelMatrix(0, 0, 0, r.yaw, r.pitch, r.roll);
    const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
    let fx = 0, fy = -GRAVITY, fz = 0, pitchTorque = 0, rollTorque = 0, wet = 0;
    const contacts = DEVELOPMENT ? [] : null;
    for (const [x, y, z] of HULL_CONTACTS) {
      const rx = matrix[0] * x + matrix[4] * y + matrix[8] * z;
      const ry = matrix[1] * x + matrix[5] * y + matrix[9] * z;
      const rz = matrix[2] * x + matrix[6] * y + matrix[10] * z;
      const surface = water(r.x + rx, r.z + rz, now);
      const depth = surface.height - (r.y + ry);
      let force = 0;
      if (depth > 0) {
        wet++;
        // Point velocity includes angular motion, so a dipping bow or rail
        // experiences its own impact damping instead of snapping to the water.
        const omegaX = c * r.pitchRate + matrix[8] * r.rollRate;
        const omegaY = r.yawRate + matrix[9] * r.rollRate;
        const omegaZ = -s * r.pitchRate + matrix[10] * r.rollRate;
        const pvx = r.vx + omegaY * rz - omegaZ * ry;
        const pvy = r.vy + omegaZ * rx - omegaX * rz - surface.velocity;
        const pvz = r.vz + omegaX * ry - omegaY * rx;
        const closing = pvx * surface.nx + pvy * surface.ny + pvz * surface.nz;
        force = clamp((HULL_SPRING * depth * surface.ny - HULL_DAMPING * closing) / HULL_CONTACTS.length, 0, 38);
        if (r.airborne) {
          if(DEVELOPMENT)r.landingImpact = Math.max(r.landingImpact, -closing);
          // Preserve fresh contact across substeps separately from rider recoil.
          r.waterImpact = Math.max(r.waterImpact, -closing);
        }
        const px = surface.nx * force, py = surface.ny * force, pz = surface.nz * force;
        fx += px; fy += py; fz += pz;
        const tx = ry * pz - rz * py, ty = rz * px - rx * pz, tz = rx * py - ry * px;
        pitchTorque += tx * c - tz * s;
        rollTorque += tx * matrix[8] + ty * matrix[9] + tz * matrix[10];
      }
      if(DEVELOPMENT)contacts.push({ x: r.x + rx, y: r.y + ry, z: r.z + rz, depth, force });
    }
    const contact = wet / HULL_CONTACTS.length;
    if(DEVELOPMENT)r.contactFraction=contact;
    if(DEVELOPMENT)r.waterForce = fy + GRAVITY;
    if(DEVELOPMENT)r.contactPoints = contacts;
    r.airborne = wet === 0;
    // Bleed off fast upward rebound while the hull is still in the water.
    // Gentle bobbing and free-flight gravity remain unaffected.
    fy -= contact * Math.max(0, r.vy - 3) * 12;
    // Keyboard and AI controls are already bounded; coasting uses empty input.
    const throttle = input.throttle || 0;
    const steer = input.steer || 0;
    r.steer += (steer - r.steer) * blend(h, 12);
    // Submerged hull drag acts in heading/lateral directions. In flight,
    // steering cannot redirect horizontal momentum or produce jet thrust.
    const forward = r.vx * s + r.vz * c, lateral = r.vx * c - r.vz * s;
    const traction = contact > 0 ? .35 + .65 * contact : 0;
    const thrust = throttle * 34 * power * traction;
    const forwardForce = thrust - forward * (.06 + .56 * contact)
      - (input.brake ? Math.min(Math.abs(forward) / h, 38 * traction) * Math.sign(forward) : 0);
    const sideForce = -lateral * (input.brake ? 16 : 13) * contact;
    fx += s * forwardForce + c * sideForce;
    fz += c * forwardForce - s * sideForce;
    if (!moored) {
      const yawTarget = r.steer * steeringAuthority(r.speed, input.brake, r.id);
      r.yawRate += ((yawTarget - r.yawRate) * 10 * traction - r.yawRate * .4 * (1 - traction)) * h;
      r.yaw += r.yawRate * h;
    }
    // Rider weight feeds back into the hull. Small active banking/trim torques
    // are arcade assists; the final angles still come from spring forces.
    // Build a deeper bank with steering, then taper before the hull tips onto
    // its side. Water contact becomes nonlinear as the inside rail lifts.
    const bankGain = (10 + 20 * Math.abs(r.steer)) * clamp((.54 + r.roll * Math.sign(r.steer)) / .12, 0, 1);
    rollTorque -= r.rider.x * 4 + r.steer * clamp(r.speed / 30, 0, 1) * bankGain * contact;
    pitchTorque += r.rider.z * 4 - thrust * .025;
    r.pitchRate += (pitchTorque / 1.8 - r.pitchRate * 3.5) * h;
    r.rollRate += (rollTorque / .65 - r.rollRate * 4) * h;
    r.pitch += r.pitchRate * h; r.roll += r.rollRate * h;
    // Soft assisted recovery limits prevent capsizing in this first arcade pass.
    for (const [axis,rate] of [['pitch','pitchRate'],['roll','rollRate']]) {
      const bound = axis === 'pitch' ? .75 : .85;
      if (Math.abs(r[axis]) > bound) { r[axis] = clamp(r[axis], -bound, bound); r[rate] *= .3; }
    }
    r.vy += fy * h; r.y += r.vy * h;
    if (!moored) {
      r.vx += fx * h; r.vz += fz * h;
      limitSpeed(r, Math.max(50 * power, r.speed - h * 14));
      r.x += r.vx * h; r.z += r.vz * h;
    }
    springRider(r, moored ? 0 : fx, fy, moored ? 0 : fz, h);
  }
}

// Two-link constraints keep hands on the handlebar and feet on the deck.
export function solveJoint(a, b, bend) {
  const delta = b.map((v, i) => v - a[i]), distance = Math.hypot(...delta);
  const axis = distance ? delta.map(v => v / distance) : [0,0,1], along = clamp(distance,.001,1.099)/2;
  const projection = bend.reduce((sum, v, i) => sum + v * axis[i], 0);
  let normal = bend.map((v, i) => v - projection * axis[i]);
  let n = Math.hypot(...normal);
  if (n < .001) { normal = Math.abs(axis[0]) < .9 ? [0, axis[2], -axis[1]] : [-axis[2], 0, axis[0]]; n = Math.hypot(...normal); }
  const offset = Math.sqrt(Math.max(0, .55 * .55 - along * along));
  return a.map((v, i) => v + axis[i] * along + normal[i] / n * offset);
}

export function handlebarPose(r){
  const pitch=DEVELOPMENT?(r.rider.handlePitch||0):r.rider.handlePitch;
  const pivot=[0,.85,1.55],center=[0,.85+.5*Math.cos(pitch)+1.05*Math.sin(pitch),1.55+.5*Math.sin(pitch)-1.05*Math.cos(pitch)];
  const point=side=>[side,center[1],center[2]];
  return {pivot,center,grips:[point(-.7),point(.7)],ends:[point(-.85),point(.85)]};
}

export function riderPose(r) {
  const p = r.rider;
  const extension=Math.max(0,p.y);
  // Heading cancels. Transpose the inverse relative rotation to keep the
  // torso balanced without constructing and multiplying two world matrices.
  const inverse=modelMatrix(0,0,0,0,r.pitch-p.pitch-RIDER_LEAN-extension*.35,r.roll);
  const torsoMatrix=inverse.map((v,i)=>inverse[i%4*4+(i>>2)]);
  const right = Array.from(torsoMatrix.slice(0, 3)), up = Array.from(torsoMatrix.slice(4, 7));
  const forward = Array.from(torsoMatrix.slice(8, 11));
  // Follow an upward/forward standing arc so the fixed grips do not pin the
  // pelvis down when the knees straighten. Crouching still moves down freely.
  const hips = [p.x, 1.48 + p.y, -.48 + p.z * .65 + extension*1.5];
  const chestOffset = up.map((v, i) => v * .55 + forward[i] * .04);
  const handlebar=handlebarPose(r);
  const limbs = [-1, 1].map((side,i) => ({
    hipOffset: [side * .23, 0, 0],
    shoulderOffset: chestOffset.map((v, i) => v + right[i] * side * .32 - up[i] * .03),
    foot: [side * .43, .64, -.35], hand: handlebar.grips[i],
  }));
  // Move the supported pelvis within all four reach envelopes, reserving
  // bend at elbows/knees. The spine may shift, but limbs never stretch and
  // deck/handlebar contacts remain planted even at the hull's tilt limits.
  const supports = limbs.flatMap(limb => [[limb.hipOffset, limb.foot, 1.05], [limb.shoulderOffset, limb.hand, 1.02]]);
  for (let iteration = 0; iteration < 24; iteration++) {
    let correction = 0;
    for (const [offset, anchor, reach] of supports) {
      const delta = hips.map((v, i) => v + offset[i] - anchor[i]), length = Math.hypot(...delta);
      if (length > reach) {
        correction = Math.max(correction, length - reach);
        for (let i = 0; i < 3; i++) hips[i] += delta[i] * (reach / length - 1);
      }
    }
    if (correction < .00001) break;
  }
  const chest = hips.map((v, i) => v + chestOffset[i]);
  for (const limb of limbs) {
    limb.hip = hips.map((v, i) => v + limb.hipOffset[i]);
    limb.shoulder = hips.map((v, i) => v + limb.shoulderOffset[i]);
    limb.knee = solveJoint(limb.hip, limb.foot, [0, -.15, 1]);
    limb.elbow = solveJoint(limb.shoulder, limb.hand, [Math.sign(limb.hand[0]), -.15, -.6]);
  }
  for (let i = 0; i < 3; i++) torsoMatrix[12 + i] = chest[i] - up[i] * .12;
  return { hips, chest, limbs, torsoMatrix, handlebar };
}
