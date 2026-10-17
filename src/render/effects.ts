import * as THREE from 'three';
import { groundHeight } from './terrain';

/*
 * Particles are camera-facing quads (one instance each) instead of point sprites: GPUs clamp
 * point sprites to a maximum size (511 px on this Mac, less on many phones), which cut big smoke
 * clouds into squares. Instances are kept compact (the live ones first), so only the live range is
 * uploaded and drawn; dead particles cost nothing. The two includes at the end of each fragment
 * shader apply tone mapping + sRGB only when drawing straight to the canvas (post off).
 */
const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iColor;
attribute float iSize;
attribute float iAlpha;
attribute float iSeed;
uniform float uPxPerUnit;  // pixels per world unit at distance 1
uniform float uMinPx;      // never smaller than this on screen (flares far away)
uniform float uSizeScale;  // world size per unit of iSize
varying vec2 vUv;
varying vec2 vOff;         // screen-aligned offset from the centre, -0.5..0.5
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
varying float vPx;
void main() {
  vUv = uv;
  vAlpha = iAlpha;
  vColor = iColor;
  vSeed = iSeed;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float dist = max(0.1, -mv.z);
  float s = iSize * uSizeScale;
  float px = s * uPxPerUnit / dist;
  s *= max(1.0, uMinPx / max(px, 1e-4));
  vPx = max(px, uMinPx);
  float ang = iSeed * 6.2831;
  float c = cos(ang);
  float sn = sin(ang);
  vOff = vec2(c * position.x - sn * position.y, sn * position.x + c * position.y);
  mv.xy += vOff * s;
  gl_Position = projectionMatrix * mv;
}`;

const FIRE_FRAG = /* glsl */ `
varying vec2 vOff;
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
uniform float uIntensity;
void main() {
  float d = length(vOff);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, uSoft, d) * vAlpha;
  gl_FragColor = vec4(vColor * uIntensity, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Smoke: a tiling fbm texture shapes the puff; its screen-space gradient fakes sun lighting. */
const SMOKE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec2 vOff;
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
varying float vPx;
uniform sampler2D tNoise;
uniform float uIntensity;
uniform vec2 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform float uLift;
void main() {
  float d = length(vOff);
  vec2 np = (vUv - 0.5) * 0.4 + vSeed * 2.875;
  float n = texture2D(tNoise, np).r;
  vec2 g = vec2(dFdx(n), dFdy(n)) * vPx * 0.022;
  float edge = smoothstep(0.5, 0.12, d + (n - 0.5) * 0.5);
  float a = edge * vAlpha;
  if (d > 0.5 || a < 0.003) discard;
  float lit = clamp(0.5 + 7.0 * dot(g, uSunDir) + 0.9 * dot(vOff, uSunDir) + 0.25 * (0.5 - d), 0.0, 1.0);
  vec3 col = vColor * uLift * mix(uSkyCol, uSunCol, lit);
  gl_FragColor = vec4(col * uIntensity, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Tiling value-noise fbm (3 octaves), baked once; the smoke shader samples it with derivatives. */
function noiseTexture(size = 128) {
  const data = new Uint8Array(size * size);
  const lattice = (n: number, seed: number) => {
    const t = new Float32Array(n * n);
    let a = seed >>> 0;
    for (let i = 0; i < t.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), a | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      t[i] = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    return t;
  };
  const octaves = [8, 16, 32].map((n, i) => ({ n, t: lattice(n, 11 + i * 7) }));
  const amp = [0.55, 0.3, 0.15];
  const sample = (t: Float32Array, n: number, x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v = (ix: number, iy: number) => t[(((iy % n) + n) % n) * n + (((ix % n) + n) % n)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  const raw = new Float32Array(size * size);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      octaves.forEach((o, i) => (s += amp[i] * sample(o.t, o.n, (x / size) * o.n, (y / size) * o.n)));
      raw[y * size + x] = s;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  // stretch to the full range so the silhouette and the lighting gradient have contrast
  for (let i = 0; i < raw.length; i++) data[i] = Math.round(((raw[i] - lo) / (hi - lo)) * 255);
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

interface ParticleOpts {
  max: number;
  additive: boolean;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  minPx: number;
}

/** CPU-simulated billboard particles (fire, sparks, smoke, dust), compacted so dead ones cost nothing. */
class Particles {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Constant drift applied to every particle (wind). */
  readonly wind = new THREE.Vector3();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly seed: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grow: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;
  private live = 0;
  private victim = 0;

  constructor(private readonly o: ParticleOpts) {
    const n = o.max;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.baseAlpha = new Float32Array(n);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const attr = (name: string, arr: Float32Array, item: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, item).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, a);
      return a;
    };
    this.attrs = [attr('iPos', this.pos, 3), attr('iColor', this.col, 3), attr('iSize', this.size, 1), attr('iAlpha', this.alpha, 1), attr('iSeed', this.seed, 1)];
    this.geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: o.fragmentShader,
      uniforms: { uPxPerUnit: { value: 1000 }, uMinPx: { value: o.minPx }, uSizeScale: { value: 0.46 }, ...o.uniforms },
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
  }

  get count() {
    return this.live;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, alpha = 1, grow = 0, grav = 0, drag = 1.8) {
    let i: number;
    if (this.live < this.o.max) i = this.live++;
    else {
      // pool full: recycle round-robin among the live ones
      i = this.victim;
      this.victim = (this.victim + 1) % this.o.max;
    }
    const j = i * 3;
    this.pos[j] = p.x;
    this.pos[j + 1] = p.y;
    this.pos[j + 2] = p.z;
    this.vel[j] = v.x;
    this.vel[j + 1] = v.y;
    this.vel[j + 2] = v.z;
    this.col[j] = color.r;
    this.col[j + 1] = color.g;
    this.col[j + 2] = color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alpha[i] = 0;
    this.baseAlpha[i] = alpha;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.seed[i] = Math.random();
  }

  update(dt: number) {
    const wx = this.wind.x * dt;
    const wz = this.wind.z * dt;
    let i = 0;
    while (i < this.live) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // compact: move the last live particle into this slot and look at it again
        const last = --this.live;
        if (last !== i) this.copy(last, i);
        continue;
      }
      const k = this.life[i] / this.maxLife[i];
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-dt * this.drag[i]);
      this.vel[j] *= drag;
      this.vel[j + 1] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt + wx;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt + wz;
      this.size[i] += this.grow[i] * dt;
      // fade in quickly, fade out over the last 70% of life
      const age = 1 - k;
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, age * 12) * (k < 0.7 ? k / 0.7 : 1);
      i++;
    }
    this.geo.instanceCount = this.live;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.live * a.itemSize);
      a.needsUpdate = true;
    }
    if (this.victim >= this.live) this.victim = 0;
  }

  private copy(from: number, to: number) {
    const f = from * 3;
    const t = to * 3;
    for (let c = 0; c < 3; c++) {
      this.pos[t + c] = this.pos[f + c];
      this.vel[t + c] = this.vel[f + c];
      this.col[t + c] = this.col[f + c];
    }
    this.size[to] = this.size[from];
    this.alpha[to] = this.alpha[from];
    this.seed[to] = this.seed[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.grow[to] = this.grow[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.baseAlpha[to] = this.baseAlpha[from];
  }
}

interface Shell {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  prev: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  size: number;
  color: THREE.Color;
  trailT: number;
  onHit?: () => void;
  active: boolean;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  size: number;
  active: boolean;
}

interface Tracer {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  active: boolean;
}

interface Debris {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  size: number;
  active: boolean;
}

interface Scorch {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  active: boolean;
}

interface Firework {
  from: THREE.Vector3;
  to: THREE.Vector3;
  prev: THREE.Vector3;
  color: THREE.Color;
  t: number;
  dur: number;
  trailT: number;
  active: boolean;
}

const FIRE = [new THREE.Color('#fff2b0'), new THREE.Color('#ffb347'), new THREE.Color('#ff6a2a')];
const WHITE_HOT = new THREE.Color('#fff8e6');
const SMOKE_GREY = new THREE.Color(0.55, 0.53, 0.5);
const MUZZLE_SMOKE = new THREE.Color(0.5, 0.48, 0.45);
const DUST = new THREE.Color('#9b8467');
const TRAIL_STEP = 1 / 60;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const tmpColor = new THREE.Color();

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(12,8,6,0.95)');
  grad.addColorStop(0.45, 'rgba(25,16,10,0.7)');
  grad.addColorStop(1, 'rgba(30,20,12,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // irregular edge
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 28;
    g.fillStyle = `rgba(20,14,9,${0.15 + Math.random() * 0.25})`;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft shock ring: transparent inside, a bright rim, fading outwards. */
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.78, 'rgba(255,255,255,1)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  readonly group = new THREE.Group();
  private fire = new Particles({ max: 6000, additive: true, minPx: 2.5, fragmentShader: FIRE_FRAG, uniforms: { uSoft: { value: 0.05 }, uIntensity: { value: 2.6 } } });
  private smoke = new Particles({
    max: 3000,
    additive: false,
    minPx: 0,
    fragmentShader: SMOKE_FRAG,
    uniforms: {
      tNoise: { value: noiseTexture() },
      uIntensity: { value: 1 },
      uSunDir: { value: new THREE.Vector2(0.5, 0.5) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSkyCol: { value: new THREE.Color(0.4, 0.4, 0.4) },
      uLift: { value: 1.6 },
    },
  });
  private shells: Shell[] = [];
  private rings: Ring[] = [];
  private flashes: { light: THREE.PointLight; t: number; peak: number }[] = [];
  private tracers: Tracer[] = [];
  private tracerMesh: THREE.InstancedMesh;
  private debris: Debris[] = [];
  private debrisMesh: THREE.InstancedMesh;
  private scorches: Scorch[] = [];
  private scorchMat: THREE.MeshBasicMaterial;
  private fireworks: Firework[] = [];
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Smoke tint follows the lighting preset. */
  smokeTint = new THREE.Color('#8f857a');

  constructor() {
    this.group.add(this.smoke.mesh, this.fire.mesh);
    this.smoke.wind.set(0.6, 0, 0.25);

    const shellGeo = new THREE.SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
      mesh.visible = false;
      this.group.add(mesh);
      this.shells.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), prev: new THREE.Vector3(), t: 0, dur: 1, arc: 0, size: 1, color: new THREE.Color(), trailT: 0, active: false });
    }
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const ringTex = ringTexture();
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color('#e8c48a').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, size: 1, active: false });
    }
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight('#ffb36b', 0, 34, 1.5);
      light.visible = false;
      this.group.add(light);
      this.flashes.push({ light, t: 1, peak: 0 });
    }
    for (let i = 0; i < 24; i++) {
      this.fireworks.push({ from: new THREE.Vector3(), to: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), t: 0, dur: 1, trailT: 0, active: false });
    }

    // Tracers: glowing streaks, instanced.
    const tracerGeo = new THREE.BoxGeometry(1, 0.1, 0.1).translate(-0.5, 0, 0);
    this.tracerMesh = new THREE.InstancedMesh(
      tracerGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      240,
    );
    this.tracerMesh.frustumCulled = false;
    for (let i = 0; i < 240; i++) {
      this.tracerMesh.setMatrixAt(i, this.hidden);
      this.tracerMesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.tracers.push({ from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.1, active: false });
    }
    this.group.add(this.tracerMesh);

    // Debris chunks thrown by explosions.
    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1, flatShading: true }),
      400,
    );
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    for (let i = 0; i < 400; i++) {
      this.debrisMesh.setMatrixAt(i, this.hidden);
      this.debris.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, size: 0.2, active: false });
    }
    this.group.add(this.debrisMesh);

    // Scorch marks that conform to the terrain and fade out.
    this.scorchMat = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2), this.scorchMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.scorches.push({ mesh, age: 0, life: 30, active: false });
    }
  }

  /** Live particle counts (debug hook). */
  get stats() {
    return { fire: this.fire.count, smoke: this.smoke.count };
  }

  /** Drawing-buffer height in pixels and the camera's vertical field of view, for sprite sizing. */
  setViewport(heightPx: number, fovDeg: number) {
    const pxPerUnit = heightPx / 2 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    this.fire.material.uniforms.uPxPerUnit.value = pxPerUnit;
    this.smoke.material.uniforms.uPxPerUnit.value = pxPerUnit;
  }

  /** Per-frame lighting for the smoke: sun direction in view space, sun and sky radiance. */
  setLight(sunDirView: THREE.Vector3, sunColor: THREE.Color, sunIntensity: number, skyColor: THREE.Color, skyIntensity: number) {
    const u = this.smoke.material.uniforms;
    (u.uSunDir.value as THREE.Vector2).set(sunDirView.x, sunDirView.y);
    (u.uSunCol.value as THREE.Color).copy(sunColor).multiplyScalar(sunIntensity / Math.PI);
    (u.uSkyCol.value as THREE.Color).copy(skyColor).multiplyScalar(skyIntensity / Math.PI);
  }

  explosion(p: THREE.Vector3, size = 1, tint?: THREE.Color) {
    // white-hot core
    this.fire.emit(p, tmpV.set(0, 1, 0), WHITE_HOT, 5 * size + 2, 0.16, 1, 14 * size, 0);
    const n = Math.round(30 * size + 12);
    for (let i = 0; i < n; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.9 + 0.25, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 6) * size);
      tmpColor.copy(FIRE[Math.floor(Math.random() * FIRE.length)]);
      if (tint) tmpColor.lerp(tint, 0.12); // a hint of the team, not a green fireball
      this.fire.emit(p, tmpV, tmpColor, (0.8 + Math.random() * 1.6) * size, 0.35 + Math.random() * 0.55, 1, 2.6 * size, 2.5);
    }
    for (let i = 0; i < Math.round(10 * size + 5); i++) {
      tmpV.set((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.8, (Math.random() - 0.5) * 2).multiplyScalar(size);
      const g = 0.12 + Math.random() * 0.12;
      tmpV2.set(p.x + (Math.random() - 0.5) * size, p.y + 0.4, p.z + (Math.random() - 0.5) * size);
      this.smoke.emit(tmpV2, tmpV, tmpColor.setRGB(g, g * 0.95, g * 0.9), (2 + Math.random() * 2.2) * size, 2.8 + Math.random() * 2, 0.62, 2.4 * size, -0.35, 1.2);
    }
    // embers with long, falling arcs (these carry the team colour)
    for (let i = 0; i < Math.round(18 * size); i++) {
      tmpV.set(Math.random() - 0.5, Math.random() + 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 10 * size);
      tmpColor.copy(FIRE[i % 2]);
      if (tint) tmpColor.lerp(tint, 0.35);
      this.fire.emit(p, tmpV, tmpColor, 0.22 + Math.random() * 0.15, 0.8 + Math.random() * 0.9, 1, 0, 13, 0.6);
    }
    this.throwDebris(p, size);
    this.scorch(p, size);
    this.ring(p, 3 + size * 5, 0.55 + size * 0.15);
    this.flash(p, 14 * size + 5);
  }

  private throwDebris(p: THREE.Vector3, size: number) {
    let n = Math.round(5 + size * 6);
    for (const d of this.debris) {
      if (n <= 0) break;
      if (d.active) continue;
      n--;
      d.active = true;
      d.p.copy(p);
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 6) * Math.sqrt(size);
      d.v.set(Math.cos(a) * sp, 6 + Math.random() * 8 * Math.sqrt(size), Math.sin(a) * sp);
      d.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      d.life = 2.2 + Math.random() * 1.5;
      d.size = 0.12 + Math.random() * 0.22 * size;
    }
  }

  private scorch(p: THREE.Vector3, size: number) {
    const s = this.scorches.find((x) => !x.active) ?? this.scorches.reduce((a, b) => (a.age > b.age ? a : b));
    s.active = true;
    s.age = 0;
    s.life = 25 + size * 8;
    const r = 1.6 + size * 1.6;
    const geo = s.mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // rebuild a conforming patch around p
    const base = SCORCH_BASE;
    const rot = Math.random() * Math.PI * 2;
    for (let i = 0; i < pos.count; i++) {
      const lx = base.getX(i) * r * 2;
      const lz = base.getZ(i) * r * 2;
      const x = p.x + lx * Math.cos(rot) - lz * Math.sin(rot);
      const z = p.z + lx * Math.sin(rot) + lz * Math.cos(rot);
      pos.setXYZ(i, x, groundHeight(x, z) + 0.06, z);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    s.mesh.visible = true;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
  }

  dust(p: THREE.Vector3, size = 0.6) {
    for (let i = 0; i < 3; i++) {
      tmpV.set((Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5);
      this.smoke.emit(p, tmpV, DUST, size * (1 + Math.random()), 1.1 + Math.random() * 0.8, 0.4, size * 1.3, -0.15);
    }
  }

  /** Slow battlefield haze drifting along the front. */
  haze(p: THREE.Vector3) {
    tmpV.set((Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4);
    this.smoke.emit(p, tmpV, this.smokeTint, 3.5 + Math.random() * 3, 6 + Math.random() * 4, 0.075, 0.7, -0.03, 0.2);
  }

  muzzle(p: THREE.Vector3, dir: THREE.Vector3, big = false) {
    tmpV.copy(dir).multiplyScalar(big ? 6 : 3);
    this.fire.emit(p, tmpV, WHITE_HOT, big ? 1.8 : 1.1, big ? 0.14 : 0.1, 1, big ? 7 : 4);
    if (big) {
      for (let i = 0; i < 6; i++) {
        tmpV.copy(dir).multiplyScalar(2 + Math.random() * 3);
        tmpV.x += (Math.random() - 0.5) * 2;
        tmpV.y += Math.random();
        tmpV.z += (Math.random() - 0.5) * 2;
        this.smoke.emit(p, tmpV, MUZZLE_SMOKE, 1.2 + Math.random(), 1.4 + Math.random(), 0.4, 1.8, -0.2);
      }
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color) {
    const idx = this.tracers.findIndex((x) => !x.active);
    if (idx < 0) return;
    const tr = this.tracers[idx];
    tr.active = true;
    tr.from.copy(from);
    tr.to.copy(to);
    tr.t = 0;
    tr.dur = Math.max(0.12, from.distanceTo(to) / 35);
    this.tracerMesh.setColorAt(idx, tmpColor.copy(color).lerp(WHITE_HOT, 0.5).multiplyScalar(7));
    this.tracerMesh.instanceColor!.needsUpdate = true;
  }

  /** Signal flare for option prints: sparks, then a bright star hanging in the air with a smoke trail. */
  flare(p: THREE.Vector3, color: THREE.Color) {
    for (let i = 0; i < 22; i++) {
      tmpV.set((Math.random() - 0.5) * 0.6, 10 + Math.random() * 3, (Math.random() - 0.5) * 0.6);
      this.fire.emit(p, tmpV, color, 0.7, 1.0 + Math.random() * 0.4, 1, 0.5, 9, 0.8);
    }
    tmpV2.set(p.x, p.y + 9, p.z);
    this.fire.emit(tmpV2, tmpV.set(0, 1.2, 0), tmpColor.copy(color).lerp(WHITE_HOT, 0.35), 3.2, 3.5, 1, -0.3, 1.6, 0.9);
    for (let i = 0; i < 10; i++) {
      tmpV2.set(p.x, p.y + 1 + i * 0.8, p.z);
      tmpV.set((Math.random() - 0.5) * 0.4, 1.5, (Math.random() - 0.5) * 0.4);
      this.smoke.emit(tmpV2, tmpV, SMOKE_GREY, 0.9 + i * 0.12, 2.2 + Math.random(), 0.35, 1.2, -0.1);
    }
  }

  shell(from: THREE.Vector3, to: THREE.Vector3, size: number, color: THREE.Color, onHit?: () => void) {
    const s = this.shells.find((x) => !x.active);
    if (!s) {
      onHit?.();
      return;
    }
    s.active = true;
    s.from.copy(from);
    s.to.copy(to);
    s.prev.copy(from);
    s.t = 0;
    s.trailT = 0;
    const dist = from.distanceTo(to);
    s.dur = 0.5 + dist / 45;
    s.arc = Math.min(18, 2 + dist * 0.18);
    s.size = size;
    s.color.copy(color);
    s.onHit = onHit;
    s.mesh.visible = true;
    s.mesh.scale.setScalar(0.8 + size * 0.5);
    (s.mesh.material as THREE.MeshBasicMaterial).color.copy(color).lerp(WHITE_HOT, 0.6).multiplyScalar(5);
    this.muzzle(from, tmpV2.copy(to).sub(from).setY(0).normalize(), true);
    this.flash(from, 4);
  }

  ring(p: THREE.Vector3, size: number, dur: number) {
    const r = this.rings.find((x) => !x.active);
    if (!r) return;
    r.active = true;
    r.t = 0;
    r.dur = dur * 0.7;
    r.size = size * 0.9;
    r.mesh.visible = true;
    r.mesh.position.set(p.x, groundHeight(p.x, p.z) + 0.15, p.z);
  }

  flash(p: THREE.Vector3, peak: number) {
    const f = this.flashes.reduce((a, b) => (a.t > b.t ? a : b));
    f.t = 0;
    f.peak = peak;
    f.light.position.set(p.x, p.y + 2.5, p.z);
    f.light.visible = true;
  }

  /** Celebration firework: a rocket rises from `p`, then bursts in the team colour. */
  firework(p: THREE.Vector3, color: THREE.Color) {
    const f = this.fireworks.find((x) => !x.active);
    if (!f) return;
    f.active = true;
    f.from.copy(p);
    f.to.set(p.x + (Math.random() - 0.5) * 6, p.y + 13 + Math.random() * 7, p.z + (Math.random() - 0.5) * 6);
    f.prev.copy(p);
    f.color.copy(color);
    f.t = 0;
    f.trailT = 0;
    f.dur = 0.85 + Math.random() * 0.25;
  }

  private burst(p: THREE.Vector3, color: THREE.Color) {
    const n = 46 + Math.floor(Math.random() * 16);
    for (let i = 0; i < n; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 4);
      tmpColor.copy(color).lerp(WHITE_HOT, Math.random() * 0.25);
      this.fire.emit(p, tmpV, tmpColor, 0.3 + Math.random() * 0.18, 1.3 + Math.random() * 0.8, 1, -0.05, 4.5, 1.1);
    }
    this.fire.emit(p, tmpV.set(0, 0, 0), tmpColor.copy(color).lerp(WHITE_HOT, 0.6), 1.8, 0.18, 1, 8, 0);
    for (let i = 0; i < 5; i++) {
      tmpV.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      this.smoke.emit(p, tmpV, SMOKE_GREY, 1.5 + Math.random(), 2.5, 0.25, 1.4, -0.1);
    }
    this.flash(p, 5);
  }

  /** Emit a trail between two positions at a fixed rate, independent of the frame rate. */
  private trail(o: { prev: THREE.Vector3; trailT: number }, cur: THREE.Vector3, dt: number, emit: (at: THREE.Vector3) => void) {
    o.trailT += dt;
    const steps = Math.floor(o.trailT / TRAIL_STEP);
    if (steps > 0) {
      o.trailT -= steps * TRAIL_STEP;
      for (let j = 1; j <= steps; j++) emit(tmpV3.lerpVectors(o.prev, cur, j / steps));
    }
    o.prev.copy(cur);
  }

  update(dt: number) {
    for (const s of this.shells) {
      if (!s.active) continue;
      s.t += dt / s.dur;
      const k = Math.min(1, s.t);
      tmpV.lerpVectors(s.from, s.to, k);
      tmpV.y += Math.sin(k * Math.PI) * s.arc;
      s.mesh.position.copy(tmpV);
      this.trail(s, tmpV, dt, (at) => {
        this.fire.emit(at, tmpV2.set(0, 0.2, 0), s.color, 0.6 + s.size * 0.3, 0.3, 0.8, -0.5);
        if (Math.random() < 0.5) this.smoke.emit(at, tmpV2.set(0, 0.3, 0), SMOKE_GREY, 0.6 + s.size * 0.3, 1.2, 0.25, 1.2, -0.1);
      });
      if (k >= 1) {
        s.active = false;
        s.mesh.visible = false;
        this.explosion(s.to, s.size, s.color);
        s.onHit?.();
      }
    }
    for (const f of this.fireworks) {
      if (!f.active) continue;
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      const e = 1 - (1 - k) * (1 - k); // rocket slows as it climbs
      tmpV.lerpVectors(f.from, f.to, e);
      this.trail(f, tmpV, dt, (at) => {
        tmpV2.set((Math.random() - 0.5) * 0.6, -1 - Math.random(), (Math.random() - 0.5) * 0.6);
        this.fire.emit(at, tmpV2, tmpColor.copy(f.color).lerp(WHITE_HOT, 0.6), 0.28, 0.35 + Math.random() * 0.25, 0.9, -0.3, 2, 1);
      });
      if (k >= 1) {
        f.active = false;
        this.burst(f.to, f.color);
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt / r.dur;
      const k = Math.min(1, r.t);
      const e = 1 - (1 - k) ** 3; // ease-out
      r.mesh.scale.setScalar(0.3 + e * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) ** 1.5 * 0.55;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (!f.light.visible) continue;
      f.t += dt;
      const k = Math.max(0, 1 - f.t / 0.3);
      f.light.intensity = f.peak * k * k * 20;
      if (k <= 0) f.light.visible = false;
    }
    // tracers
    for (let i = 0; i < this.tracers.length; i++) {
      const tr = this.tracers[i];
      if (!tr.active) continue;
      tr.t += dt / tr.dur;
      if (tr.t >= 1) {
        tr.active = false;
        this.tracerMesh.setMatrixAt(i, this.hidden);
        this.fire.emit(tr.to, tmpV.set(0, 1.5, 0), FIRE[1], 0.35, 0.12, 1, 1);
        continue;
      }
      tmpV.lerpVectors(tr.from, tr.to, tr.t);
      tmpV2.copy(tr.to).sub(tr.from).normalize();
      tmpQ.setFromUnitVectors(X_AXIS, tmpV2);
      tmpS.set(Math.min(2.4, tr.from.distanceTo(tr.to) * tr.t), 1, 1);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.tracerMesh.setMatrixAt(i, tmpM);
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    // debris
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.active) continue;
      d.life -= dt;
      d.v.y -= 22 * dt;
      d.p.addScaledVector(d.v, dt);
      const gy = groundHeight(d.p.x, d.p.z) + d.size * 0.5;
      if (d.p.y < gy) {
        d.p.y = gy;
        d.v.y = Math.abs(d.v.y) * 0.3;
        d.v.x *= 0.55;
        d.v.z *= 0.55;
        d.spin.multiplyScalar(0.5);
      }
      d.rot.x += d.spin.x * dt;
      d.rot.y += d.spin.y * dt;
      d.rot.z += d.spin.z * dt;
      const sc = d.size * Math.min(1, d.life / 0.6);
      tmpQ.setFromEuler(d.rot);
      tmpS.setScalar(Math.max(0, sc));
      tmpM.compose(d.p, tmpQ, tmpS);
      this.debrisMesh.setMatrixAt(i, d.life > 0 ? tmpM : this.hidden);
      if (d.life <= 0) d.active = false;
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    // scorch marks fade
    for (const s of this.scorches) {
      if (!s.active) continue;
      s.age += dt;
      const k = s.age / s.life;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k * k);
      if (k >= 1) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
    this.fire.update(dt);
    this.smoke.update(dt);
  }
}

const SCORCH_BASE = new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2).attributes.position as THREE.BufferAttribute;
