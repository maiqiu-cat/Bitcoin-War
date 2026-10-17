import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const DIR_X = new THREE.Vector2(1, 0);
const DIR_Y = new THREE.Vector2(0, 1);

/**
 * The stock UnrealBloomPass minus its last step. The stock pass blends the bloom additively back
 * into the (MSAA) scene target, which costs a full-resolution pass and a second MSAA resolve;
 * here the composited bloom stays in its small target and the Finish pass adds it while grading.
 * The chain starts at half the CSS size, i.e. a quarter of the drawing buffer at pixel ratio 2
 * (indistinguishable from half the buffer: bloom is a blur).
 */
class BloomTexture extends UnrealBloomPass {
  private quad = new FullScreenQuad();

  /** Composited bloom (already multiplied by `strength`). */
  get texture() {
    return this.renderTargetsHorizontal[0].texture;
  }

  /** Fill `texture` from an HDR scene texture. */
  update(renderer: THREE.WebGLRenderer, input: THREE.Texture) {
    const hp = this.highPassUniforms as Record<string, THREE.IUniform>;
    hp.tDiffuse.value = input;
    hp.luminosityThreshold.value = this.threshold;
    this.quad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    this.quad.render(renderer);
    let src = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i];
      this.quad.material = m;
      m.uniforms.colorTexture.value = src.texture;
      m.uniforms.direction.value = DIR_X;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      this.quad.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = DIR_Y;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      this.quad.render(renderer);
      src = this.renderTargetsVertical[i];
    }
    const c = this.compositeMaterial;
    c.uniforms.bloomStrength.value = this.strength;
    c.uniforms.bloomRadius.value = this.radius;
    this.quad.material = c;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    this.quad.render(renderer);
  }

  dispose() {
    super.dispose();
    this.quad.dispose();
  }
}

/**
 * Bloom composite + tilt-shift (diorama look) + vignette + light grading, in linear HDR, then
 * tone mapping and sRGB output straight to the screen (the chunks below are defined by three for
 * any non-raw ShaderMaterial that renders to the canvas).
 */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tBloom: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBlur: { value: 3 },
    uFocus: { value: 0.5 },
    uBand: { value: 0.16 },
    uVignette: { value: 0.32 },
    uSat: { value: 1.1 },
    uWarm: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform vec2 uRes;
    uniform float uBlur, uFocus, uBand, uVignette, uSat;
    uniform vec3 uWarm;
    varying vec2 vUv;
    const vec2 P[12] = vec2[12](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
      vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
      vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float d = abs(vUv.y - uFocus);
      float b = smoothstep(uBand, uBand + 0.4, d) * uBlur;
      if (b > 0.25) {
        vec3 acc = col.rgb;
        for (int i = 0; i < 12; i++) acc += texture2D(tDiffuse, vUv + P[i] * b / uRes).rgb;
        col.rgb = acc / 13.0;
      }
      #ifdef BLOOM
      col.rgb += texture2D(tBloom, vUv).rgb;
      #endif
      float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
      col.rgb = mix(vec3(l), col.rgb, uSat) * uWarm;
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      col.rgb *= mix(1.0 - uVignette, 1.0, smoothstep(1.05, 0.3, length(q)));
      gl_FragColor = vec4(col.rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/**
 * HDR pipeline: scene → HalfFloat target (MSAA) → bloom chain (small targets) → one
 * full-screen Finish pass that composites the bloom, applies the diorama blur, grade,
 * vignette, tone mapping and sRGB, directly to the canvas.
 *
 * Two full-resolution passes and one MSAA resolve per frame; the stock composer chain
 * (RenderPass → UnrealBloomPass → ShaderPass → OutputPass) needed four passes, three
 * resolves and a second MSAA target that only ever received a full-screen quad.
 */
export class PostFX {
  readonly bloom: BloomTexture;
  private sceneRT: THREE.WebGLRenderTarget;
  private readonly finish: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private tilt = { cur: 3, target: 3 };
  private size = new THREE.Vector2(1, 1);
  private bloomOn = true;
  /** Tilt-shift blur on; off makes the Finish pass a single texture fetch per pixel. */
  tiltEnabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    samples: 0 | 2 | 4 = 4,
  ) {
    renderer.getDrawingBufferSize(this.size);
    this.sceneRT = PostFX.makeTarget(this.size.x, this.size.y, samples);
    const css = new THREE.Vector2(this.size.x, this.size.y).divideScalar(renderer.getPixelRatio());
    this.bloom = new BloomTexture(css, 0.65, 0.3, 1.15);
    this.finish = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FinishShader.uniforms),
      vertexShader: FinishShader.vertexShader,
      fragmentShader: FinishShader.fragmentShader,
      defines: { BLOOM: '' },
      depthTest: false,
      depthWrite: false,
    });
    this.finish.uniforms.uRes.value.copy(this.size);
    this.quad = new FullScreenQuad(this.finish);
  }

  private static makeTarget(w: number, h: number, samples: number) {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false });
  }

  get samples() {
    return this.sceneRT.samples;
  }

  /** MSAA of the scene target (0, 2 or 4); recreates the target. */
  setSamples(n: 0 | 2 | 4) {
    if (n === this.sceneRT.samples) return;
    this.sceneRT.dispose();
    this.sceneRT = PostFX.makeTarget(this.size.x, this.size.y, n);
  }

  setBloom(on: boolean) {
    if (on === this.bloomOn) return;
    this.bloomOn = on;
    if (on) this.finish.defines.BLOOM = '';
    else delete this.finish.defines.BLOOM;
    this.finish.needsUpdate = true;
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.size.set(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
    this.sceneRT.setSize(this.size.x, this.size.y);
    this.bloom.setSize(w, h);
    this.finish.uniforms.uRes.value.copy(this.size);
  }

  /** Stronger miniature blur in cinematic mode, subtle when the user drives the camera. */
  setCinematic(on: boolean) {
    this.tilt.target = on ? 3.2 : 1.4;
  }

  setGrade(opts: { bloom: number; threshold: number; warm: [number, number, number]; vignette: number }) {
    this.bloom.strength = opts.bloom;
    this.bloom.threshold = opts.threshold;
    this.finish.uniforms.uWarm.value.set(...opts.warm);
    this.finish.uniforms.uVignette.value = opts.vignette;
  }

  render(dt: number) {
    this.tilt.cur += (this.tilt.target - this.tilt.cur) * (1 - Math.exp(-dt * 2));
    this.finish.uniforms.uBlur.value = this.tiltEnabled ? (this.tilt.cur * this.size.y) / 1000 : 0;
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    if (this.bloomOn) this.bloom.update(r, this.sceneRT.texture);
    this.finish.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.finish.uniforms.tBloom.value = this.bloom.texture;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
