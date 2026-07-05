import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GraphicsLevel } from '../utils/storage';

const MAX_SPARKS = 120;

/** Post-processing (bloom), screen shake, and impact spark particles. */
export class Effects {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  useComposer = true;

  // Screen shake
  private shakeAmp = 0;
  private shakeT = 0;
  readonly shakeOffset = new THREE.Vector3();

  // Sparks
  private sparks: THREE.Points;
  private sparkPos: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkCursor = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkPos.fill(-100);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe8b0,
      size: 0.012,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  applyGraphics(level: GraphicsLevel): void {
    this.useComposer = level !== 'low';
    this.bloom.strength = level === 'high' ? 0.45 : 0.3;
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  shake(strength: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, strength);
    this.shakeT = 0;
  }

  burst(point: THREE.Vector3, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const idx = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      this.sparkPos[idx * 3] = point.x;
      this.sparkPos[idx * 3 + 1] = point.y;
      this.sparkPos[idx * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.6 + 0.2;
      this.sparkVel[idx * 3] = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      this.sparkVel[idx * 3 + 1] = up * speed;
      this.sparkVel[idx * 3 + 2] = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      this.sparkLife[idx] = 0.5 + Math.random() * 0.3;
    }
  }

  update(dt: number): void {
    // Shake decay
    if (this.shakeAmp > 0.0005) {
      this.shakeT += dt;
      const decay = Math.exp(-this.shakeT * 7);
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeAmp * decay,
        (Math.random() - 0.5) * this.shakeAmp * decay,
        (Math.random() - 0.5) * this.shakeAmp * decay,
      );
      if (decay < 0.02) this.shakeAmp = 0;
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // Sparks
    let alive = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      alive = true;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 3.5 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -100;
    }
    if (alive) {
      (this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  render(): void {
    if (this.useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
