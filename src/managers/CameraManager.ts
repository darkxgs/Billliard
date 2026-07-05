import * as THREE from 'three';

export type CameraMode = 'menu' | 'aim' | 'shot' | 'place';

/**
 * Smooth damped orbit camera. In `aim` mode it sits behind the cue ball
 * following the aim angle; after the shot it pulls out to an overview;
 * in the menu it drifts slowly around the table.
 */
export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'menu';

  /** Horizontal aim angle (shared with the game's aim direction). */
  angle = Math.PI;
  pitch = 0.32; // radians above horizontal while aiming
  aimDistance = 0.85;
  zoom = 1;

  private focus = new THREE.Vector3();
  private curPos = new THREE.Vector3(3.5, 2.2, 3.5);
  private curLook = new THREE.Vector3(0, 0, 0);
  private targetPos = new THREE.Vector3();
  private targetLook = new THREE.Vector3();
  private menuT = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.05, 60);
    this.camera.position.copy(this.curPos);
  }

  setFocus(p: THREE.Vector3): void {
    this.focus.copy(p);
  }

  orbit(dx: number, dy: number, sensitivity: number): void {
    this.angle -= dx * 0.005 * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004 * sensitivity, 0.12, 1.25);
  }

  pinch(scale: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom / scale, 0.6, 1.8);
  }

  get aimDirection(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle));
  }

  update(dt: number, shakeOffset: THREE.Vector3): void {
    switch (this.mode) {
      case 'menu': {
        this.menuT += dt;
        const a = this.menuT * 0.07;
        this.targetPos.set(Math.cos(a) * 3.4, 1.5 + Math.sin(this.menuT * 0.15) * 0.3, Math.sin(a) * 3.4);
        this.targetLook.set(0, 0.05, 0);
        break;
      }
      case 'aim': {
        const dist = this.aimDistance * this.zoom;
        const d = this.aimDirection;
        this.targetPos.set(
          this.focus.x - d.x * dist * Math.cos(this.pitch),
          this.focus.y + dist * Math.sin(this.pitch) + 0.08,
          this.focus.z - d.z * dist * Math.cos(this.pitch),
        );
        this.targetLook.copy(this.focus).addScaledVector(d, 0.45);
        this.targetLook.y = 0.02;
        break;
      }
      case 'shot': {
        // Elevated overview that keeps the whole table visible
        const d = this.aimDirection;
        this.targetPos.set(-d.x * 1.7, 2.3, -d.z * 1.7 + 0.001);
        this.targetLook.set(0, 0, 0);
        break;
      }
      case 'place': {
        this.targetPos.set(this.focus.x - 0.4, 1.6, this.focus.z + 0.001);
        this.targetLook.set(this.focus.x, 0, this.focus.z);
        break;
      }
    }

    // Critically-damped style smoothing (frame-rate independent)
    const k = 1 - Math.pow(0.0025, dt);
    this.curPos.lerp(this.targetPos, k);
    this.curLook.lerp(this.targetLook, k);

    this.camera.position.copy(this.curPos).add(shakeOffset);
    this.camera.lookAt(this.curLook);
  }

  /** Instantly snap (used when entering menu the first time). */
  snap(): void {
    this.curPos.copy(this.targetPos);
    this.curLook.copy(this.targetLook);
  }
}
