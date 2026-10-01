import * as THREE from 'three';
import type { UnitKind, UnitTarget } from '../game/armies';
import type { Team } from '../game/battle';
import { TEAM_COLORS } from './bases';
import { groundHeight, mergeSimple } from './terrain';

const MAX_SOLDIERS = 5000;
const MAX_TANKS = 220;

function shade(geo: THREE.BufferGeometry, v: number) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3).fill(v);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function soldierGeometry() {
  return mergeSimple([
    shade(new THREE.BoxGeometry(0.3, 0.46, 0.2).translate(0, 0.23, 0), 0.55), // legs
    shade(new THREE.BoxGeometry(0.38, 0.44, 0.24).translate(0, 0.68, 0), 1.0), // torso
    shade(new THREE.BoxGeometry(0.22, 0.22, 0.22).translate(0, 1.02, 0), 1.25), // head
    shade(new THREE.BoxGeometry(0.28, 0.08, 0.28).translate(0, 1.16, 0), 0.6), // helmet
    shade(new THREE.BoxGeometry(0.62, 0.06, 0.06).translate(0.22, 0.72, 0.16), 0.35), // rifle (points +x)
  ]);
}

function tankGeometry() {
  return mergeSimple([
    shade(new THREE.BoxGeometry(2.3, 0.42, 0.42).translate(0, 0.21, 0.62), 0.35), // tracks
    shade(new THREE.BoxGeometry(2.3, 0.42, 0.42).translate(0, 0.21, -0.62), 0.35),
    shade(new THREE.BoxGeometry(2.1, 0.5, 1.3).translate(0, 0.62, 0), 1.0), // hull
    shade(new THREE.BoxGeometry(1.0, 0.42, 0.9).translate(-0.1, 1.08, 0), 1.15), // turret
    shade(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6).rotateZ(Math.PI / 2).translate(1.1, 1.1, 0), 0.5), // barrel +x
  ]);
}

type Phase = 'alive' | 'dying' | 'retreating' | 'knocked';

interface Unit {
  key: string;
  team: Team;
  kind: UnitKind;
  slot: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  frontRow?: number;
  phase: Phase;
  /** Seconds in current phase. */
  pt: number;
  spawn: number;
  yaw: number;
  seed: number;
  moving: number;
}

export interface FrontFn {
  (z: number): number;
}

/**
 * Instanced soldiers and tanks. Targets come from layoutArmies(); units march to
 * them, and units that disappear near the front are "killed" (topple) while the
 * rest retreat (shrink away).
 */
export class ArmyRenderer {
  readonly group = new THREE.Group();
  readonly soldiers: THREE.InstancedMesh;
  readonly tanks: THREE.InstancedMesh;
  private units = new Map<string, Unit>();
  private freeS: number[] = [];
  private freeT: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private seq = 0;
  private list: Unit[] | null = null;
  onKilled?: (x: number, y: number, z: number, team: Team) => void;

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
    this.soldiers = new THREE.InstancedMesh(soldierGeometry(), mat, MAX_SOLDIERS);
    this.tanks = new THREE.InstancedMesh(tankGeometry(), mat.clone(), MAX_TANKS);
    for (const im of [this.soldiers, this.tanks]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      for (let i = 0; i < im.count; i++) {
        im.setMatrixAt(i, this.zero);
        im.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      this.group.add(im);
    }
    for (let i = MAX_SOLDIERS - 1; i >= 0; i--) this.freeS.push(i);
    for (let i = MAX_TANKS - 1; i >= 0; i--) this.freeT.push(i);
  }

  get stats() {
    let soldiers = 0;
    let tanks = 0;
    for (const u of this.units.values()) if (u.phase === 'alive') u.kind === 'tank' ? tanks++ : soldiers++;
    return { soldiers, tanks, total: this.units.size };
  }

  setTargets(targets: UnitTarget[], front: FrontFn) {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.key);
      let u = this.units.get(t.key);
      if (u && u.phase !== 'alive' && u.phase !== 'knocked') {
        // was leaving; bring it back
        u.phase = 'alive';
        u.pt = 0;
      }
      if (!u) {
        const free = t.kind === 'tank' ? this.freeT : this.freeS;
        const slot = free.pop();
        if (slot === undefined) continue;
        const dir = t.team === 'bulls' ? 1 : -1;
        const tx = t.frontRow !== undefined ? front(t.z) - dir * (0.9 + t.frontRow * 0.62) : t.x;
        // Reinforcements arrive from behind their own lines.
        const back = t.frontRow !== undefined ? 7 + Math.random() * 6 : 0;
        u = {
          key: t.key,
          team: t.team,
          kind: t.kind,
          slot,
          x: tx - dir * back,
          z: t.z,
          tx,
          tz: t.z,
          frontRow: t.frontRow,
          phase: 'alive',
          pt: 0,
          spawn: back > 0 ? 1 : 0,
          yaw: dir > 0 ? 0 : Math.PI,
          seed: (this.seq = (this.seq * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
          moving: 0,
        };
        const col = new THREE.Color(TEAM_COLORS[t.team].main);
        (t.kind === 'tank' ? this.tanks : this.soldiers).setColorAt(slot, col);
        this.units.set(t.key, u);
      }
      u.frontRow = t.frontRow;
      if (t.frontRow === undefined) u.tx = t.x;
      u.tz = t.z;
    }
    for (const u of this.units.values()) {
      if (seen.has(u.key) || u.phase === 'dying' || u.phase === 'retreating') continue;
      const nearFront = Math.abs(u.x - front(u.z)) < 4 || u.frontRow !== undefined;
      u.phase = nearFront ? 'dying' : 'retreating';
      u.pt = 0;
      if (nearFront) this.onKilled?.(u.x, groundHeight(u.x, u.z), u.z, u.team);
    }
    this.soldiers.instanceColor!.needsUpdate = true;
    this.tanks.instanceColor!.needsUpdate = true;
    this.list = null;
  }

  /** Knock down alive units of `team` around a point (artillery hit); they get back up. */
  hit(team: Team, x: number, z: number, radius: number, max = 12) {
    let n = 0;
    for (const u of this.units.values()) {
      if (n >= max || u.team !== team || u.phase !== 'alive' || u.kind === 'tank') continue;
      if ((u.x - x) ** 2 + (u.z - z) ** 2 < radius * radius) {
        u.phase = 'knocked';
        u.pt = 0;
        n++;
      }
    }
    return n;
  }

  /** A random alive unit of a team, preferring tanks; used as a shooter. */
  pickShooter(team: Team, front: FrontFn, preferTank = true) {
    let best: Unit | undefined;
    let bestScore = Infinity;
    for (const u of this.units.values()) {
      if (u.team !== team || u.phase !== 'alive') continue;
      const d = Math.abs(u.x - front(u.z));
      const score = d + Math.random() * 25 - (preferTank && u.kind === 'tank' ? 20 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best ? new THREE.Vector3(best.x, groundHeight(best.x, best.z) + (best.kind === 'tank' ? 1.1 : 0.8), best.z) : null;
  }

  /** Random front-line soldier position (for muzzle flashes). */
  randomFrontSoldier(team: Team) {
    const arr = (this.list ??= [...this.units.values()]);
    const n = arr.length;
    if (!n) return null;
    for (let i = 0; i < 8; i++) {
      const u = arr[Math.floor(Math.random() * n)];
      if (u.team === team && u.phase === 'alive' && u.frontRow === 0) return u;
    }
    return null;
  }

  update(dt: number, t: number, front: FrontFn) {
    const toFree: Unit[] = [];
    for (const u of this.units.values()) {
      u.pt += dt;
      const dir = u.team === 'bulls' ? 1 : -1;
      const tank = u.kind === 'tank';
      if (u.frontRow !== undefined && u.phase === 'alive') u.tx = front(u.tz) - dir * (0.9 + u.frontRow * 0.62 + (u.seed - 0.5) * 0.25);
      let scale = 1;
      let tilt = 0;
      let sink = 0;
      let bob = 0;

      if (u.phase === 'alive' || u.phase === 'knocked') {
        const dx = u.tx - u.x;
        const dz = u.tz - u.z;
        const dist = Math.hypot(dx, dz);
        const speed = (tank ? 5 : 7) * (u.spawn > 0 ? 1.4 : 1);
        if (dist > 0.02 && u.phase === 'alive') {
          const step = Math.min(dist, speed * dt);
          u.x += (dx / dist) * step;
          u.z += (dz / dist) * step;
          u.moving = Math.min(1, u.moving + dt * 4);
          if (dist > 1.5) {
            const want = Math.atan2(-dz, dx);
            u.yaw = lerpAngle(u.yaw, want, Math.min(1, dt * 6));
          }
        } else {
          u.moving = Math.max(0, u.moving - dt * 3);
          u.yaw = lerpAngle(u.yaw, dir > 0 ? 0 : Math.PI, Math.min(1, dt * 3));
        }
        if (dist < 0.5) u.spawn = 0;
        if (!tank) bob = Math.abs(Math.sin((t + u.seed * 10) * 11)) * 0.12 * u.moving;
        else bob = Math.sin(t * 30 + u.seed * 10) * 0.02 * u.moving;
        // idle sway at the front
        if (!tank && u.moving < 0.1 && u.frontRow !== undefined) bob += Math.max(0, Math.sin(t * 3 + u.seed * 40)) * 0.04;
        if (u.phase === 'knocked') {
          const k = u.pt;
          if (k < 0.35) tilt = (k / 0.35) * 1.45;
          else if (k < 1.6) tilt = 1.45;
          else if (k < 2.1) tilt = 1.45 * (1 - (k - 1.6) / 0.5);
          else u.phase = 'alive';
        }
      } else if (u.phase === 'dying') {
        const k = u.pt;
        tilt = Math.min(1, k / 0.35) * 1.5;
        sink = Math.max(0, k - 1.0) * 0.8;
        if (k > 1.8) toFree.push(u);
      } else if (u.phase === 'retreating') {
        scale = Math.max(0, 1 - u.pt / 0.7);
        if (u.pt > 0.7) toFree.push(u);
      }

      const y = groundHeight(u.x, u.z) + bob - sink;
      this.e.set(0, u.yaw, tilt * (tank ? 0.15 : 1), 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(u.x, y, u.z);
      this.s.setScalar(scale);
      this.m.compose(this.v, this.q, this.s);
      (tank ? this.tanks : this.soldiers).setMatrixAt(u.slot, this.m);
    }
    for (const u of toFree) {
      (u.kind === 'tank' ? this.tanks : this.soldiers).setMatrixAt(u.slot, this.zero);
      (u.kind === 'tank' ? this.freeT : this.freeS).push(u.slot);
      this.units.delete(u.key);
      this.list = null;
    }
    this.soldiers.instanceMatrix.needsUpdate = true;
    this.tanks.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const u of this.units.values()) {
      (u.kind === 'tank' ? this.tanks : this.soldiers).setMatrixAt(u.slot, this.zero);
      (u.kind === 'tank' ? this.freeT : this.freeS).push(u.slot);
    }
    this.units.clear();
    this.list = null;
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
