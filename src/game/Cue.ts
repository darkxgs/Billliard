import * as THREE from 'three';
import gsap from 'gsap';
import { BALL } from '../utils/constants';
import type { AimHit } from '../physics/PhysicsManager';

/**
 * Visual cue stick plus the aiming aids: guideline to the first contact,
 * ghost-ball indicator, predicted object-ball line and cue deflection line.
 */
export class Cue {
  readonly group = new THREE.Group();
  private stick: THREE.Group;
  private guide: THREE.Line;
  private targetLine: THREE.Line;
  private cueLine: THREE.Line;
  private ghost: THREE.Mesh;
  private pullback = 0;

  constructor() {
    // ---- Stick: tapered shaft + darker butt + tip ----
    this.stick = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd9b57c, roughness: 0.45 });
    const buttMat = new THREE.MeshStandardMaterial({ color: 0x3d2417, roughness: 0.4, metalness: 0.1 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x3f6fd1, roughness: 0.8 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.8, 12), shaftMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = -0.42;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.6, 12), buttMat);
    butt.rotation.z = Math.PI / 2;
    butt.position.x = -1.12;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10), tipMat);
    tip.rotation.z = Math.PI / 2;
    tip.position.x = -0.017;
    shaft.castShadow = butt.castShadow = true;
    this.stick.add(shaft, butt, tip);
    this.group.add(this.stick);

    // ---- Aim guideline ----
    const guideMat = new THREE.LineDashedMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85, dashSize: 0.035, gapSize: 0.025,
    });
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), guideMat);
    this.group.add(this.guide);

    const tMat = new THREE.LineBasicMaterial({ color: 0xf5d78a, transparent: true, opacity: 0.85 });
    this.targetLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), tMat);
    this.group.add(this.targetLine);

    const cMat = new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.4 });
    this.cueLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), cMat);
    this.group.add(this.cueLine);

    // ---- Ghost ball ----
    this.ghost = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.R, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.group.add(this.ghost);
  }

  setPullback(power: number): void {
    this.pullback = power * 0.24;
  }

  /** Update all aiming visuals for the current cue-ball position and direction. */
  updateAim(cuePos: THREE.Vector3, dir: THREE.Vector3, hit: AimHit | null): void {
    this.group.visible = true;

    // Stick sits behind the ball, pointing along dir
    const angle = Math.atan2(dir.z, dir.x);
    this.stick.rotation.y = -angle;
    const back = 0.045 + this.pullback;
    this.stick.position.set(
      cuePos.x - dir.x * back,
      cuePos.y + 0.012,
      cuePos.z - dir.z * back,
    );

    // Guideline from ball to first contact
    const start = cuePos.clone();
    const end = hit ? hit.point.clone() : cuePos.clone().addScaledVector(dir, 3);
    this.guide.geometry.setFromPoints([start, end]);
    this.guide.computeLineDistances();

    if (hit?.type === 'ball' && hit.targetDir) {
      this.ghost.visible = true;
      this.ghost.position.copy(hit.point);

      // Predicted object-ball path
      const tEnd = hit.ball!.position.clone().addScaledVector(hit.targetDir, 0.28);
      this.targetLine.visible = true;
      this.targetLine.geometry.setFromPoints([hit.ball!.position.clone(), tEnd]);

      // Cue-ball deflection (tangent line, perpendicular to impact)
      const tangent = new THREE.Vector3(-hit.targetDir.z, 0, hit.targetDir.x);
      if (tangent.dot(dir) < 0) tangent.negate();
      const cEnd = hit.point.clone().addScaledVector(tangent, 0.18);
      this.cueLine.visible = true;
      this.cueLine.geometry.setFromPoints([hit.point.clone(), cEnd]);
    } else {
      this.ghost.visible = false;
      this.targetLine.visible = false;
      this.cueLine.visible = false;
    }
  }

  /** Strike animation: lunge forward, fire the impact, then hide. */
  animateStrike(onImpact: () => void): void {
    const s = this.stick.position;
    const angle = -this.stick.rotation.y;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    gsap.to(s, {
      x: s.x + dx * (this.pullback + 0.03),
      z: s.z + dz * (this.pullback + 0.03),
      duration: 0.09,
      ease: 'power3.in',
      onComplete: () => {
        onImpact();
        this.hide();
      },
    });
  }

  hide(): void {
    this.group.visible = false;
  }
}
