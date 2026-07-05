import * as THREE from 'three';
import { Ball } from '../game/Ball';
import { BALL, PHYS, TABLE } from '../utils/constants';

const UP = new THREE.Vector3(0, 1, 0);
const R = BALL.R;

export interface Pocket {
  center: THREE.Vector3; // at cloth level
  captureR: number;
}

export interface PhysicsEvents {
  onBallBall(a: Ball, b: Ball, impactSpeed: number, point: THREE.Vector3): void;
  onCushion(ball: Ball, impactSpeed: number): void;
  onPocket(ball: Ball, pocket: Pocket): void;
}

export interface AimHit {
  type: 'ball' | 'cushion';
  /** Ghost-ball center (ball hit) or contact point (cushion). */
  point: THREE.Vector3;
  ball?: Ball;
  /** Direction the object ball will travel (ball hits only). */
  targetDir?: THREE.Vector3;
  distance: number;
}

export class PhysicsManager {
  balls: Ball[] = [];
  pockets: Pocket[] = [];
  private events: PhysicsEvents;

  // Reused temporaries — zero allocation in the hot loop
  private tmp1 = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  private tmp4 = new THREE.Vector3();

  constructor(events: PhysicsEvents) {
    this.events = events;
    this.buildPockets();
  }

  private buildPockets(): void {
    const hw = TABLE.PLAY_W / 2, hh = TABLE.PLAY_H / 2;
    const cOff = 0.015; // corner pockets sit slightly outside the play field, on the diagonal
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.pockets.push({
          center: new THREE.Vector3(sx * (hw + cOff), 0, sz * (hh + cOff)),
          captureR: TABLE.POCKET_R_CORNER,
        });
      }
      this.pockets.push({
        center: new THREE.Vector3(0, 0, sx * (hh + 0.022)),
        captureR: TABLE.POCKET_R_SIDE,
      });
    }
  }

  get anyMoving(): boolean {
    return this.balls.some(b => b.isMoving);
  }

  step(dt: number): void {
    const h = dt / PHYS.SUBSTEPS;
    for (let s = 0; s < PHYS.SUBSTEPS; s++) {
      for (const ball of this.balls) {
        if (!ball.active || ball.sinking) continue;
        this.integrateBall(ball, h);
      }
      this.resolveBallCollisions();
      for (const ball of this.balls) {
        if (!ball.active || ball.sinking) continue;
        if (this.checkPockets(ball)) continue;
        this.resolveCushions(ball);
      }
    }
    for (const ball of this.balls) {
      if (ball.active && !ball.sinking) ball.syncMesh(dt);
    }
  }

  /** Cloth friction: sliding → rolling → rest, with english decay. */
  private integrateBall(ball: Ball, h: number): void {
    const v = ball.velocity;
    const w = ball.angularVelocity;
    const g = PHYS.GRAVITY;

    // Contact-point velocity: u = v + w × r, r = (0, -R, 0)
    const u = this.tmp1.set(
      v.x + w.z * R,
      0,
      v.z - w.x * R,
    );
    const slip = u.length();

    if (slip > 0.02) {
      // ---- Sliding regime ----
      // Friction acts against slip at the contact point. With u = (vx + wz·R, vz − wx·R),
      // the combined linear+angular response shrinks |u| at rate 3.5·μ·g, so clamp the
      // substep to avoid oscillating through zero slip.
      const dx = u.x / slip, dz = u.z / slip;
      const a = PHYS.MU_SLIDE * g;
      const da = Math.min(a * h, slip / 3.5);
      v.x -= dx * da;
      v.z -= dz * da;
      w.z -= dx * (2.5 * da) / R;
      w.x += dz * (2.5 * da) / R;
    } else {
      // ---- Rolling regime ----
      // Lock rotation to velocity: w_h = (ŷ × v)/R
      w.x = v.z / R;
      w.z = -v.x / R;
      const speed = v.length();
      if (speed > 0) {
        const dec = Math.min(PHYS.MU_ROLL * g * h, speed);
        v.addScaledVector(this.tmp2.copy(v).normalize(), -dec);
      }
    }

    // English (vertical-axis spin) decays independently
    const spinDec = (PHYS.MU_SPIN * g / R) * h * 2.5;
    if (Math.abs(w.y) <= spinDec) w.y = 0;
    else w.y -= Math.sign(w.y) * spinDec;

    // Full stop snap
    if (v.lengthSq() < PHYS.STOP_SPEED * PHYS.STOP_SPEED && slip < 0.02 && Math.abs(w.y) < PHYS.STOP_SPIN) {
      v.set(0, 0, 0);
      w.set(0, 0, 0);
    }

    ball.position.x += v.x * h;
    ball.position.z += v.z * h;
    ball.position.y = R;
  }

  private resolveBallCollisions(): void {
    const n = this.balls.length;
    for (let i = 0; i < n; i++) {
      const a = this.balls[i];
      if (!a.active || a.sinking) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.balls[j];
        if (!b.active || b.sinking) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        const minD = 2 * R;
        if (d2 >= minD * minD || d2 === 0) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;

        // Positional correction (split the overlap)
        const overlap = minD - d;
        a.position.x -= nx * overlap * 0.5;
        a.position.z -= nz * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.z += nz * overlap * 0.5;

        // Relative normal velocity
        const rvx = a.velocity.x - b.velocity.x;
        const rvz = a.velocity.z - b.velocity.z;
        const vn = rvx * nx + rvz * nz;
        if (vn <= 0) continue; // separating

        // Equal-mass impulse with restitution
        const jn = ((1 + PHYS.BALL_RESTITUTION) / 2) * vn;
        a.velocity.x -= jn * nx;
        a.velocity.z -= jn * nz;
        b.velocity.x += jn * nx;
        b.velocity.z += jn * nz;

        // Slight "throw": friction between ball surfaces drags the object ball
        const tx = -nz, tz = nx;
        const vt = rvx * tx + rvz * tz;
        const jt = THREE.MathUtils.clamp(vt * 0.05, -jn * 0.06, jn * 0.06);
        b.velocity.x += jt * tx;
        b.velocity.z += jt * tz;

        const point = this.tmp3.set(a.position.x + nx * R, R, a.position.z + nz * R);
        this.events.onBallBall(a, b, vn, point);
      }
    }
  }

  private nearPocketMouth(x: number, z: number): Pocket | null {
    for (const p of this.pockets) {
      const dx = x - p.center.x, dz = z - p.center.z;
      if (dx * dx + dz * dz < (p.captureR + R * 1.15) ** 2) return p;
    }
    return null;
  }

  private checkPockets(ball: Ball): boolean {
    for (const p of this.pockets) {
      const dx = ball.position.x - p.center.x;
      const dz = ball.position.z - p.center.z;
      if (dx * dx + dz * dz < p.captureR * p.captureR) {
        ball.startSink(p.center);
        this.events.onPocket(ball, p);
        return true;
      }
    }
    return false;
  }

  private resolveCushions(ball: Ball): void {
    const hw = TABLE.PLAY_W / 2 - R;
    const hh = TABLE.PLAY_H / 2 - R;
    const p = ball.position;

    // Skip rail reflection near pocket mouths so balls can enter
    if (this.nearPocketMouth(p.x, p.z)) return;

    if (p.x < -hw) { p.x = -hw; this.cushionImpulse(ball, 1, 0); }
    else if (p.x > hw) { p.x = hw; this.cushionImpulse(ball, -1, 0); }
    if (p.z < -hh) { p.z = -hh; this.cushionImpulse(ball, 0, 1); }
    else if (p.z > hh) { p.z = hh; this.cushionImpulse(ball, 0, -1); }
  }

  /** n = inward cushion normal. Restitution + english-driven tangential response. */
  private cushionImpulse(ball: Ball, nx: number, nz: number): void {
    const v = ball.velocity;
    const w = ball.angularVelocity;
    const vn = v.x * nx + v.z * nz;
    if (vn >= 0) return;

    const impact = -vn;
    // Normal restitution
    v.x -= (1 + PHYS.CUSHION_RESTITUTION) * vn * nx;
    v.z -= (1 + PHYS.CUSHION_RESTITUTION) * vn * nz;

    // Tangential: slip at contact includes english (w.y): slip = v·t − R·w.y, t = ŷ×n
    const tx = nz, tz = -nx;
    const vt = v.x * tx + v.z * tz;
    const slip = vt - R * w.y;
    const jn = (1 + PHYS.CUSHION_RESTITUTION) * impact;
    const jt = THREE.MathUtils.clamp(slip * 0.35, -PHYS.CUSHION_FRICTION * jn, PHYS.CUSHION_FRICTION * jn);
    v.x -= jt * tx;
    v.z -= jt * tz;
    w.y += jt * 2.5 / R * 0.5; // spin bleeds off into the rail

    // Vertical spin gets scrubbed a little
    w.x *= 0.85;
    w.z *= 0.85;

    this.events.onCushion(ball, impact);
  }

  /** Cue strike: converts power + tip offset into velocity and spin. */
  strike(ball: Ball, dir: THREE.Vector3, power: number, spinX: number, spinY: number): void {
    const speed = PHYS.MIN_SHOT_SPEED + power * (PHYS.MAX_SHOT_SPEED - PHYS.MIN_SHOT_SPEED);
    const d = this.tmp1.copy(dir).setY(0).normalize();
    ball.velocity.set(d.x * speed, 0, d.z * speed);

    // Tip offset → angular velocity (ω = 2.5·v·offset/R², offset capped at 0.45R)
    const wMag = 1.15 * speed / R;
    // Follow/draw: rotation axis = ŷ × dir
    const axis = this.tmp2.crossVectors(UP, d);
    ball.angularVelocity.set(
      axis.x * wMag * spinY,
      -spinX * wMag * 0.9, // english
      axis.z * wMag * spinY,
    );
  }

  /** First object the cue ball will hit along `dir` — for the aim guideline. */
  raycastAim(origin: THREE.Vector3, dir: THREE.Vector3, ignore: Ball): AimHit | null {
    const d = this.tmp1.copy(dir).setY(0).normalize();
    let best: AimHit | null = null;

    // Balls: sphere sweep, |o + t·d − c| = 2R
    for (const b of this.balls) {
      if (b === ignore || !b.active || b.sinking) continue;
      const ox = origin.x - b.position.x;
      const oz = origin.z - b.position.z;
      const pB = ox * d.x + oz * d.z;
      const c = ox * ox + oz * oz - (2 * R) * (2 * R);
      const disc = pB * pB - c;
      if (disc < 0) continue;
      const t = -pB - Math.sqrt(disc);
      if (t < 0.001) continue;
      if (!best || t < best.distance) {
        const ghost = new THREE.Vector3(origin.x + d.x * t, R, origin.z + d.z * t);
        const targetDir = new THREE.Vector3(b.position.x - ghost.x, 0, b.position.z - ghost.z).normalize();
        best = { type: 'ball', point: ghost, ball: b, targetDir, distance: t };
      }
    }

    // Cushions
    const hw = TABLE.PLAY_W / 2 - R;
    const hh = TABLE.PLAY_H / 2 - R;
    const walls: number[] = [];
    if (d.x > 1e-6) walls.push((hw - origin.x) / d.x);
    if (d.x < -1e-6) walls.push((-hw - origin.x) / d.x);
    if (d.z > 1e-6) walls.push((hh - origin.z) / d.z);
    if (d.z < -1e-6) walls.push((-hh - origin.z) / d.z);
    for (const t of walls) {
      if (t <= 0.001) continue;
      if (!best || t < best.distance) {
        best = {
          type: 'cushion',
          point: new THREE.Vector3(origin.x + d.x * t, R, origin.z + d.z * t),
          distance: t,
        };
      }
    }
    return best;
  }

  /** Is this spot free of other balls (for ball-in-hand placement)? */
  isSpotFree(x: number, z: number, ignore?: Ball): boolean {
    const hw = TABLE.PLAY_W / 2 - R;
    const hh = TABLE.PLAY_H / 2 - R;
    if (Math.abs(x) > hw || Math.abs(z) > hh) return false;
    for (const b of this.balls) {
      if (b === ignore || !b.active) continue;
      const dx = b.position.x - x, dz = b.position.z - z;
      if (dx * dx + dz * dz < (2 * R) * (2 * R)) return false;
    }
    return true;
  }
}
