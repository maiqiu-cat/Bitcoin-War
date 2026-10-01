import * as THREE from 'three';
import { groundHeight } from './terrain';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, uSoft, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

interface ParticleOpts {
  max: number;
  additive: boolean;
  soft: number;
}

/** CPU-simulated point sprites (fire, sparks, smoke, dust). */
class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private grav: Float32Array;
  private baseAlpha: Float32Array;
  private next = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly o: ParticleOpts) {
    const n = o.max;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.baseAlpha = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: o.soft } },
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, alpha = 1, grow = 0, grav = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.o.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alpha[i] = alpha;
    this.baseAlpha[i] = alpha;
    this.grow[i] = grow;
    this.grav[i] = grav;
  }

  update(dt: number) {
    const n = this.o.max;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-dt * 1.8);
      this.vel[j] *= drag;
      this.vel[j + 1] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.baseAlpha[i] * (k < 0.7 ? k / 0.7 : 1);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}

interface Shell {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  size: number;
  color: THREE.Color;
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

const FIRE = [new THREE.Color('#fff2b0'), new THREE.Color('#ffb347'), new THREE.Color('#ff6a2a')];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class Effects {
  readonly group = new THREE.Group();
  private fire = new Particles({ max: 5000, additive: true, soft: 0.05 });
  private smoke = new Particles({ max: 2500, additive: false, soft: 0.1 });
  private shells: Shell[] = [];
  private rings: Ring[] = [];
  private flashes: { light: THREE.PointLight; t: number; peak: number }[] = [];

  constructor() {
    this.group.add(this.smoke.points, this.fire.points);
    const shellGeo = new THREE.SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
      mesh.visible = false;
      this.group.add(mesh);
      this.shells.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1, arc: 0, size: 1, color: new THREE.Color(), active: false });
    }
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, size: 1, active: false });
    }
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight('#ffb36b', 0, 30, 1.5);
      this.group.add(light);
      this.flashes.push({ light, t: 1, peak: 0 });
    }
  }

  setViewportHeight(px: number) {
    // keep sprite sizes consistent across resolutions
    this.fire.material.uniforms.uScale.value = px * 0.6;
    this.smoke.material.uniforms.uScale.value = px * 0.6;
  }

  explosion(p: THREE.Vector3, size = 1, tint?: THREE.Color) {
    const n = Math.round(26 * size + 10);
    for (let i = 0; i < n; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 6) * size);
      const c = FIRE[Math.floor(Math.random() * FIRE.length)].clone();
      if (tint) c.lerp(tint, 0.35);
      this.fire.emit(p, tmpV, c, (0.8 + Math.random() * 1.6) * size, 0.35 + Math.random() * 0.5, 1, 2.5 * size, 3);
    }
    for (let i = 0; i < Math.round(8 * size + 4); i++) {
      tmpV.set((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2).multiplyScalar(size);
      const g = 0.18 + Math.random() * 0.15;
      this.smoke.emit(tmpV2.copy(p).add(new THREE.Vector3(0, 0.4, 0)), tmpV, new THREE.Color(g, g * 0.95, g * 0.9), (2 + Math.random() * 2) * size, 2.2 + Math.random() * 1.5, 0.55, 2.2 * size, -0.4);
    }
    // sparks
    for (let i = 0; i < Math.round(14 * size); i++) {
      tmpV.set(Math.random() - 0.5, Math.random() + 0.4, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 10 * size);
      this.fire.emit(p, tmpV, FIRE[0], 0.25, 0.6 + Math.random() * 0.6, 1, 0, 14);
    }
    this.ring(p, 3 + size * 5, 0.6 + size * 0.15);
    this.flash(p, 25 * size + 10);
  }

  dust(p: THREE.Vector3, size = 0.6) {
    for (let i = 0; i < 4; i++) {
      tmpV.set((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5);
      this.smoke.emit(p, tmpV, new THREE.Color('#9b8467'), size * (1 + Math.random()), 0.9 + Math.random() * 0.6, 0.45, size * 1.2, -0.2);
    }
  }

  muzzle(p: THREE.Vector3, dir: number) {
    tmpV.set(dir * 4, 0.3, (Math.random() - 0.5) * 0.6);
    this.fire.emit(tmpV2.copy(p).add(new THREE.Vector3(dir * 0.5, 0, 0)), tmpV, FIRE[0], 0.55, 0.08, 1, 1);
  }

  /** Signal flare for option prints. */
  flare(p: THREE.Vector3, color: THREE.Color) {
    for (let i = 0; i < 18; i++) {
      tmpV.set((Math.random() - 0.5) * 0.6, 10 + Math.random() * 3, (Math.random() - 0.5) * 0.6);
      this.fire.emit(p, tmpV, color, 0.6, 0.9 + Math.random() * 0.4, 1, 0.4, 9);
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
    s.t = 0;
    const dist = from.distanceTo(to);
    s.dur = 0.5 + dist / 45;
    s.arc = Math.min(18, 2 + dist * 0.18);
    s.size = size;
    s.color.copy(color);
    s.onHit = onHit;
    s.mesh.visible = true;
    s.mesh.scale.setScalar(0.8 + size * 0.5);
    (s.mesh.material as THREE.MeshBasicMaterial).color.copy(color).lerp(new THREE.Color('#ffffff'), 0.5);
    this.muzzle(from, Math.sign(to.x - from.x) || 1);
    this.flash(from, 6);
  }

  ring(p: THREE.Vector3, size: number, dur: number) {
    const r = this.rings.find((x) => !x.active);
    if (!r) return;
    r.active = true;
    r.t = 0;
    r.dur = dur;
    r.size = size;
    r.mesh.visible = true;
    r.mesh.position.set(p.x, groundHeight(p.x, p.z) + 0.15, p.z);
  }

  flash(p: THREE.Vector3, peak: number) {
    const f = this.flashes.reduce((a, b) => (a.t > b.t ? a : b));
    f.t = 0;
    f.peak = peak;
    f.light.position.set(p.x, p.y + 2.5, p.z);
  }

  update(dt: number) {
    for (const s of this.shells) {
      if (!s.active) continue;
      s.t += dt / s.dur;
      const k = Math.min(1, s.t);
      tmpV.lerpVectors(s.from, s.to, k);
      tmpV.y += Math.sin(k * Math.PI) * s.arc;
      s.mesh.position.copy(tmpV);
      this.fire.emit(tmpV, tmpV2.set(0, 0.2, 0), s.color, 0.5 + s.size * 0.25, 0.25, 0.8, -0.5);
      if (k >= 1) {
        s.active = false;
        s.mesh.visible = false;
        this.explosion(s.to, s.size, s.color);
        s.onHit?.();
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt / r.dur;
      const k = Math.min(1, r.t);
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
    for (const f of this.flashes) {
      f.t += dt;
      f.light.intensity = f.peak * Math.max(0, 1 - f.t / 0.35) ** 2 * 20;
    }
    this.fire.update(dt);
    this.smoke.update(dt);
  }
}
