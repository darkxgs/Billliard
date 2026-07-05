import * as THREE from 'three';
import { createFloorTexture } from '../assets/textures';

/**
 * Dark-blue pool hall: floor, walls, hanging lamp over the table,
 * slow-moving accent lights and floating dust particles.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly mainLight: THREE.SpotLight;
  private accents: THREE.PointLight[] = [];
  private dust: THREE.Points;
  private dustVel: Float32Array;
  private t = 0;

  constructor() {
    // ---- Room ----
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ map: createFloorTexture(), roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.93;
    floor.receiveShadow = true;
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a1226, roughness: 0.95, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 16), wallMat);
    room.position.y = 2.5;
    this.group.add(room);

    // ---- Ambient base ----
    this.group.add(new THREE.AmbientLight(0x2a3a5f, 0.2));
    const hemi = new THREE.HemisphereLight(0x33507f, 0x0b0e18, 0.15);
    this.group.add(hemi);

    // ---- Main table lamp ----
    this.mainLight = new THREE.SpotLight(0xfff1d8, 16, 9, Math.PI / 3.4, 0.55, 2);
    this.mainLight.position.set(0, 2.6, 0);
    this.mainLight.target.position.set(0, 0, 0);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.set(2048, 2048);
    this.mainLight.shadow.bias = -0.0004;
    this.mainLight.shadow.radius = 4;
    this.group.add(this.mainLight, this.mainLight.target);

    // Lamp shade fixture (visual)
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.85, 0.3, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x123322, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    );
    shade.position.set(0, 2.05, 0);
    this.group.add(shade);
    const bulbGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9c4 }),
    );
    bulbGlow.position.set(0, 1.98, 0);
    this.group.add(bulbGlow);
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a }),
    );
    cable.position.set(0, 3.1, 0);
    this.group.add(cable);

    // ---- Moving accent lights ----
    const accentColors = [0x3b7bff, 0xb05cff, 0x2fd4c0];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(accentColors[i], 2, 8, 2);
      l.position.set(Math.cos(i * 2.1) * 5, 1.6 + i * 0.5, Math.sin(i * 2.1) * 5);
      this.accents.push(l);
      this.group.add(l);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        new THREE.MeshBasicMaterial({ color: accentColors[i] }),
      );
      l.add(orb);
    }

    // ---- Ambient dust particles ----
    const N = 220;
    const pos = new Float32Array(N * 3);
    this.dustVel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 7;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.03;
      this.dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaac4ff,
      size: 0.012,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.group.add(this.dust);
  }

  update(dt: number): void {
    this.t += dt;
    for (let i = 0; i < this.accents.length; i++) {
      const l = this.accents[i];
      const a = this.t * 0.12 + i * 2.1;
      l.position.x = Math.cos(a) * 5;
      l.position.z = Math.sin(a * 0.8) * 4.5;
      l.position.y = 1.7 + Math.sin(this.t * 0.3 + i) * 0.5;
      l.intensity = 2 + Math.sin(this.t * 0.7 + i * 1.7) * 0.5;
    }
    // Drift dust
    const posAttr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += this.dustVel[i] * dt;
      arr[i + 1] += this.dustVel[i + 1] * dt;
      arr[i + 2] += this.dustVel[i + 2] * dt;
      if (arr[i + 1] > 3.2) arr[i + 1] = 0;
      if (arr[i + 1] < -0.2) arr[i + 1] = 3;
      if (Math.abs(arr[i]) > 4) arr[i] *= -0.98;
      if (Math.abs(arr[i + 2]) > 3) arr[i + 2] *= -0.98;
    }
    posAttr.needsUpdate = true;
  }

  setShadowQuality(level: 'off' | 'low' | 'high'): void {
    if (level === 'off') {
      this.mainLight.castShadow = false;
    } else {
      this.mainLight.castShadow = true;
      const size = level === 'high' ? 2048 : 1024;
      this.mainLight.shadow.mapSize.set(size, size);
      this.mainLight.shadow.map?.dispose();
      (this.mainLight.shadow as unknown as { map: null }).map = null;
    }
  }
}
