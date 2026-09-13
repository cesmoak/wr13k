export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function randomSeed(seed = 13) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

// Column-major matrices, shared by the tiny renderer and mesh transforms.
export function multiply(a, b) {
  const result = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    result[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return result;
}
export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function lookAt(eye, target) {
  let z = eye.map((v, i) => v - target[i]);
  let length = Math.hypot(...z); z = z.map(v => v / length);
  let x = [z[2], 0, -z[0]]; length = Math.hypot(...x); x = x.map(v => v / length);
  const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -x.reduce((s, v, i) => s + v * eye[i], 0), -y.reduce((s, v, i) => s + v * eye[i], 0), -z.reduce((s, v, i) => s + v * eye[i], 0), 1]);
}
export function modelMatrix(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, scale = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  return new Float32Array([
    (c * cr + s * sp * sr) * scale, cp * sr * scale, (-s * cr + c * sp * sr) * scale, 0,
    (-c * sr + s * sp * cr) * scale, cp * cr * scale, (s * sr + c * sp * cr) * scale, 0,
    s * cp * scale, -sp * scale, c * cp * scale, 0, x, y, z, 1,
  ]);
}
