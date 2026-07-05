import * as THREE from 'three';
import { BALL, BallGroup } from '../utils/constants';
import { createBallTexture } from '../assets/textures';

let sharedGeometry: THREE.SphereGeometry | null = null;

export class Ball {
  readonly id: number; // 0 = cue, 1-7 solids, 8, 9-15 stripes
  readonly group: BallGroup;
  readonly mesh: THREE.Mesh;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  angularVelocity = new THREE.Vector3();

  active = true; // on the table
  sinking = false; // pocket drop animation in progress
  private sinkTarget = new THREE.Vector3();
  private sinkT = 0;

  constructor(id: number) {
    this.id = id;
    this.group =
      id === 0 ? BallGroup.CUE :
      id === 8 ? BallGroup.EIGHT :
      id <= 7 ? BallGroup.SOLID : BallGroup.STRIPE;

    if (!sharedGeometry) sharedGeometry = new THREE.SphereGeometry(BALL.R, 28, 20);
    const material = new THREE.MeshPhysicalMaterial({
      map: createBallTexture(id),
      roughness: 0.12,
      clearcoat: 0.9,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.8,
    });
    this.mesh = new THREE.Mesh(sharedGeometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    // Randomize initial orientation so numbers aren't all aligned
    this.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  }

  get isMoving(): boolean {
    return this.active && !this.sinking &&
      (this.velocity.lengthSq() > 1e-6 || this.angularVelocity.lengthSq() > 1e-3);
  }

  place(x: number, z: number): void {
    this.position.set(x, BALL.R, z);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.active = true;
    this.sinking = false;
    this.mesh.visible = true;
    this.syncMesh(0);
  }

  /** Begin the natural pocket-drop animation. */
  startSink(pocketCenter: THREE.Vector3): void {
    this.sinking = true;
    this.sinkT = 0;
    this.sinkTarget.copy(pocketCenter);
    this.sinkTarget.y = -BALL.R * 3.2;
  }

  /** Returns true when the sink animation completes. */
  updateSink(dt: number): boolean {
    this.sinkT += dt * 3.2;
    const t = Math.min(this.sinkT, 1);
    // Curve into the pocket while dropping with acceleration
    this.position.lerp(this.sinkTarget, 1 - Math.pow(1 - 0.12, dt * 60));
    this.position.y = THREE.MathUtils.lerp(this.position.y, this.sinkTarget.y, t * t);
    this.mesh.rotation.x += dt * 9;
    this.syncMesh(dt);
    if (t >= 1) {
      this.active = false;
      this.sinking = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  syncMesh(dt: number): void {
    this.mesh.position.copy(this.position);
    if (dt > 0 && this.angularVelocity.lengthSq() > 1e-6) {
      const w = this.angularVelocity;
      const angle = w.length() * dt;
      const axis = w.clone().normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      this.mesh.quaternion.premultiply(q);
    }
  }
}
