import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { FeedItem } from '../data/market';
import type { LayoutResult } from '../game/armies';
import type { Round, Team } from '../game/battle';
import { FIELD_DEPTH, frontWave, type FieldMap } from '../game/field';
import { BASE_CENTER, Bases, TEAM_COLORS } from './bases';
import { CameraRig } from './camera';
import { Effects } from './effects';
import { Lighting, PRESETS, type LightingName } from './lighting';
import { groundHeight, ROAD_Z, Terrain } from './terrain';
import { ArmyRenderer } from './units';
import { fmtUsd, fmtPrice } from '../ui/format';

export interface WorldOptions {
  shadows: boolean;
  pixelRatio: number;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly labels: CSS2DRenderer;
  readonly terrain = new Terrain();
  readonly bases = new Bases();
  readonly army = new ArmyRenderer();
  readonly effects = new Effects();
  readonly lighting: Lighting;
  readonly rig: CameraRig;
  field: FieldMap | null = null;
  round: Round | null = null;
  frontPrice = 0;
  targetPrice = 0;
  momentum = 0;
  private amp = 2;
  private time = 0;
  private frontLabel: CSS2DObject;
  private reserveLabels: Record<Team, CSS2DObject>;
  private activity = { buyPerSec: 0, sellPerSec: 0 };
  private celebrations: { at: number; team: Team }[] = [];
  readonly frontFn = (z: number) => this.frontX(z);

  constructor(private readonly container: HTMLElement, opts: WorldOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(opts.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4000);
    this.rig = new CameraRig(this.camera, this.labels.domElement);
    this.lighting = new Lighting(this.scene, this.renderer, opts.shadows);
    this.scene.add(this.terrain.group, this.bases.group, this.army.group, this.effects.group);

    this.frontLabel = this.makeLabel('front-label', '');
    this.reserveLabels = {
      bulls: this.makeLabel('reserve-label bulls', ''),
      bears: this.makeLabel('reserve-label bears', ''),
    };

    this.army.onKilled = (x, y, z) => {
      if (Math.random() < 0.35) this.effects.dust(new THREE.Vector3(x, y + 0.2, z), 0.5);
    };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeLabel(cls: string, text: string) {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    const obj = new CSS2DObject(div);
    this.scene.add(obj);
    return obj;
  }

  setLighting(name: LightingName) {
    const p = this.lighting.apply(name);
    this.terrain.uniforms.uLineGlow.value = p.lineGlow;
    this.bases.setNight(name === 'night');
    document.documentElement.dataset.lighting = name;
    return PRESETS[name];
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects.setViewportHeight(h * this.renderer.getPixelRatio());
  }

  setRound(field: FieldMap, round: Round, price: number) {
    this.field = field;
    this.round = round;
    this.frontPrice = this.targetPrice = price;
    this.terrain.setField(field);
  }

  setPrice(price: number) {
    this.targetPrice = price;
  }

  setActivity(buyPerSec: number, sellPerSec: number) {
    this.activity = { buyPerSec, sellPerSec };
    const total = buyPerSec + sellPerSec;
    const imb = total > 0 ? Math.abs(buyPerSec - sellPerSec) / total : 0;
    this.amp = 1.4 + imb * 2.6;
  }

  setLayout(layout: LayoutResult) {
    if (!this.field) return;
    this.army.setTargets(layout.units, this.frontFn);
    for (const team of ['bulls', 'bears'] as const) {
      const s = layout[team];
      const dir = team === 'bulls' ? 1 : -1;
      const baseX = team === 'bulls' ? this.field.bullBaseX : this.field.bearBaseX;
      const el = this.reserveLabels[team].element;
      el.innerHTML = `<b>${team === 'bulls' ? 'BID' : 'ASK'} RESERVES</b><span>≈${fmtUsd(s.reserveUsd)}</span><small>${s.reserveSoldiers.toLocaleString()} troops · ${s.reserveTanks} tanks</small>`;
      this.reserveLabels[team].position.set(baseX - dir * 7, groundHeight(baseX, -20) + 6, -20);
    }
  }

  /** Front price clamped to the board (after a win the price can run past the base). */
  get visualPrice() {
    if (!this.field) return this.frontPrice;
    return Math.min(this.field.maxPrice, Math.max(this.field.minPrice, this.frontPrice));
  }

  frontX(z: number) {
    if (!this.field) return 0;
    return this.field.x(this.visualPrice) + frontWave(z, this.time, this.amp);
  }

  /** Visualise a market event on the battlefield. Returns the impact point. */
  onMarketEvent(e: FeedItem) {
    if (!this.field) return;
    const attacker: Team = e.bull ? 'bulls' : 'bears';
    const defender: Team = e.bull ? 'bears' : 'bulls';
    const dir = attacker === 'bulls' ? 1 : -1;
    const color = new THREE.Color(TEAM_COLORS[attacker].glow);

    if (e.kind === 'option') {
      const z = (Math.random() - 0.5) * FIELD_DEPTH * 0.8;
      const x = this.frontX(z) - dir * (8 + Math.random() * 20);
      this.effects.flare(new THREE.Vector3(x, groundHeight(x, z) + 0.5, z), color);
      return;
    }

    const big = e.kind === 'liq' ? (Math.log10(e.usd) - 3.8) * 1.0 : (Math.log10(e.usd) - 4.4) * 1.1;
    const size = THREE.MathUtils.clamp(big, 0.5, 3.6);
    let from: THREE.Vector3 | null;
    let z: number;
    if (e.kind === 'liq') {
      // Liquidations: heavy artillery from far behind the attacking lines.
      z = (Math.random() - 0.5) * FIELD_DEPTH * 0.75;
      const fx = this.frontX(z) - dir * (30 + Math.random() * 15);
      from = new THREE.Vector3(fx, groundHeight(fx, z) + 2, z + (Math.random() - 0.5) * 10);
    } else {
      from = this.army.pickShooter(attacker, this.frontFn, e.usd >= 200_000);
      z = from ? from.z + (Math.random() - 0.5) * 14 : (Math.random() - 0.5) * FIELD_DEPTH * 0.7;
      if (!from) {
        const fx = this.frontX(z) - dir * 10;
        from = new THREE.Vector3(fx, groundHeight(fx, z) + 1, z);
      }
    }
    z = THREE.MathUtils.clamp(z, -FIELD_DEPTH / 2 + 3, FIELD_DEPTH / 2 - 3);
    const tx = this.frontX(z) + dir * (1.5 + Math.random() * (e.kind === 'liq' ? 10 : 5) + size);
    const to = new THREE.Vector3(tx, groundHeight(tx, z) + 0.3, z);
    this.effects.shell(from, to, size, color, () => {
      this.army.hit(defender, to.x, to.z, 2 + size * 1.6, Math.round(4 + size * 5));
      this.floatLabel(to, e);
    });
    if ((e.kind === 'liq' && e.usd >= 250_000) || e.usd >= 600_000) this.rig.focusEvent(to, e.usd >= 2_000_000 ? 2 : 1);
  }

  private floatLabel(p: THREE.Vector3, e: FeedItem) {
    const div = document.createElement('div');
    div.className = `event-label ${e.bull ? 'bull' : 'bear'} ${e.kind}`;
    div.innerHTML = `<span>${e.kind === 'liq' ? e.label : e.bull ? 'Buy' : 'Sell'}</span><b>${fmtUsd(e.usd)}</b>`;
    const obj = new CSS2DObject(div);
    obj.position.set(p.x, p.y + 3, p.z);
    this.scene.add(obj);
    setTimeout(() => {
      this.scene.remove(obj);
      div.remove();
    }, 2600);
  }

  celebrate(winner: Team) {
    for (let i = 0; i < 9; i++) this.celebrations.push({ at: this.time + i * 0.45, team: winner });
  }

  frame(dt: number) {
    this.time += dt;
    // Smooth the front so it glides between ticks.
    const prev = this.frontPrice;
    this.frontPrice += (this.targetPrice - this.frontPrice) * (1 - Math.exp(-dt * 4));
    this.momentum = this.momentum * 0.98 + (this.frontPrice - prev) * 2;
    const u = this.terrain.uniforms;
    u.uTime.value = this.time;
    u.uAmp.value += (this.amp - u.uAmp.value) * (1 - Math.exp(-dt));
    u.uFront.value = this.field ? this.field.x(this.visualPrice) : 0;

    // Rifle fire along the front, scaled by taker flow.
    for (const team of ['bulls', 'bears'] as const) {
      const rate = Math.min(30, 2 + Math.log10(1 + (team === 'bulls' ? this.activity.buyPerSec : this.activity.sellPerSec)) * 4);
      if (Math.random() < rate * dt) {
        const s = this.army.randomFrontSoldier(team);
        if (s) this.effects.muzzle(new THREE.Vector3(s.x, groundHeight(s.x, s.z) + 0.75, s.z), team === 'bulls' ? 1 : -1);
      }
    }

    while (this.celebrations.length && this.celebrations[0].at <= this.time) {
      const c = this.celebrations.shift()!;
      const loser = c.team === 'bulls' ? 'bears' : 'bulls';
      const b = BASE_CENTER[loser];
      const p = new THREE.Vector3(b.x + (Math.random() - 0.5) * 20, groundHeight(b.x, b.z) + 1 + Math.random() * 6, b.z + (Math.random() - 0.5) * 20);
      this.effects.explosion(p, 1.5 + Math.random() * 1.5, new THREE.Color(TEAM_COLORS[c.team].glow));
    }

    this.army.update(dt, this.time, this.frontFn);
    this.effects.update(dt);
    this.bases.update(this.time);

    const fx = this.frontX(ROAD_Z);
    this.frontLabel.position.set(fx, groundHeight(fx, ROAD_Z) + 3.2, ROAD_Z);
    this.frontLabel.element.textContent = this.targetPrice ? fmtPrice(this.targetPrice) : '';

    this.rig.update(dt, {
      frontX: this.field ? this.field.x(this.visualPrice) : 0,
      momentum: this.momentum,
      progress: this.round ? (this.frontPrice - this.round.bearsWinAt) / (this.round.bullsWinAt - this.round.bearsWinAt) : 0.5,
    });

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
