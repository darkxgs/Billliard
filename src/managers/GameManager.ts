import * as THREE from 'three';
import { Ball } from '../game/Ball';
import { Table } from '../game/Table';
import { Cue } from '../game/Cue';
import { RuleEngine } from '../game/RuleEngine';
import { PhysicsManager } from '../physics/PhysicsManager';
import { Environment } from '../components/Environment';
import { Effects } from '../components/Effects';
import { AudioManager } from './AudioManager';
import { CameraManager } from './CameraManager';
import { InputManager } from './InputManager';
import { UIManager } from './UIManager';
import { SaveManager } from '../utils/storage';
import { BALL, GameState, ShotPhase, TABLE, BallGroup } from '../utils/constants';

export class GameManager {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private clock = new THREE.Clock();

  private save = new SaveManager();
  private audio = new AudioManager();
  private cameraMgr: CameraManager;
  private effects: Effects;
  private environment: Environment;
  private table: Table;
  private cue: Cue;
  private balls: Ball[] = [];
  private physics: PhysicsManager;
  private rules = new RuleEngine();
  private ui: UIManager;
  private input: InputManager;

  private state: GameState = GameState.MENU;
  private phase: ShotPhase = ShotPhase.AIM;
  private power = 0;
  private raycaster = new THREE.Raycaster();
  private tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL.R);
  private placingValid = false;
  private cueStriking = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.cameraMgr = new CameraManager(innerWidth / innerHeight);
    this.effects = new Effects(this.renderer, this.scene, this.cameraMgr.camera);
    this.environment = new Environment();
    this.table = new Table();
    this.cue = new Cue();
    this.scene.add(this.environment.group, this.table.group, this.cue.group);
    this.scene.fog = new THREE.Fog(0x060b1a, 6, 15);

    this.physics = new PhysicsManager({
      onBallBall: (a, b, impact, point) => {
        this.rules.noteBallContact(a, b);
        this.audio.ballHit(impact);
        if (impact > 2.4) this.effects.burst(point, Math.min(14, Math.round(impact * 3)), impact * 0.12);
        if (impact > 3.5) this.vibrate(15);
      },
      onCushion: (_ball, impact) => {
        this.rules.noteCushion();
        this.audio.railHit(impact);
      },
      onPocket: (ball) => {
        this.rules.notePocket(ball);
        this.audio.pocket();
        this.vibrate(30);
      },
    });

    for (let i = 0; i <= 15; i++) {
      const ball = new Ball(i);
      this.balls.push(ball);
      this.scene.add(ball.mesh);
    }
    this.physics.balls = this.balls;

    this.ui = new UIManager(this.save, {
      onPlay: () => this.startGame(),
      onQuitToMenu: () => this.toMenu(),
      onRematch: () => this.startGame(),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onSettingsChanged: () => this.applySettings(),
      onSpinChanged: () => { /* read from ui.spinX/Y at strike time */ },
      onSoundToggle: () => this.applySettings(),
    });

    this.input = new InputManager(canvas, document.getElementById('power-wrap')!, {
      onDrag: (dx, dy) => this.handleDrag(dx, dy),
      onPinch: (scale) => this.cameraMgr.pinch(1 / scale),
      onPointAt: (x, y, phase) => this.handlePointAt(x, y, phase),
      onPowerChange: (p) => this.handlePowerChange(p),
      onPowerRelease: (p) => this.handlePowerRelease(p),
    });

    // Audio can only start on a user gesture
    const initAudio = () => { this.audio.init(); this.applySettings(); };
    window.addEventListener('pointerdown', initAudio, { once: true });

    window.addEventListener('resize', () => this.onResize());
    this.applySettings();
    this.onResize();
    this.ui.showMainMenu();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ================= SETTINGS =================

  private applySettings(): void {
    const s = this.save.settings;
    const dprCap = s.graphics === 'high' ? 2 : s.graphics === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
    this.renderer.shadowMap.enabled = s.shadows !== 'off';
    this.environment.setShadowQuality(s.shadows);
    this.effects.applyGraphics(s.graphics);
    this.audio.setMusic(s.music);
    this.audio.setSfx(s.sfx);
    this.ui.refreshSettingsUI();
  }

  private vibrate(ms: number): void {
    if (this.save.settings.vibration && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch { /* unsupported */ }
    }
  }

  // ================= GAME FLOW =================

  private startGame(): void {
    this.ui.hideMainMenu();
    this.ui.hide('gameover');
    this.rules.reset();
    this.rackBalls();
    this.ui.resetSpin();
    this.state = GameState.PLAYING;
    this.phase = ShotPhase.AIM;
    this.cameraMgr.mode = 'aim';
    this.cameraMgr.angle = 0;
    this.cameraMgr.zoom = 1;
    this.ui.showHud();
    this.ui.setHint('Drag to aim — pull the power bar to shoot');
    this.refreshHud('BREAK');
    this.cue.setPullback(0);
  }

  private toMenu(): void {
    this.state = GameState.MENU;
    this.cameraMgr.mode = 'menu';
    this.cue.hide();
    this.ui.showMainMenu();
  }

  private pause(): void {
    if (this.state !== GameState.PLAYING) return;
    this.state = GameState.PAUSED;
    this.ui.showPause();
  }

  private resume(): void {
    if (this.state !== GameState.PAUSED) return;
    this.state = GameState.PLAYING;
  }

  private rackBalls(): void {
    const cueBall = this.balls[0];
    cueBall.place(-TABLE.PLAY_W / 4, 0);

    // Standard triangle: 8 in the center, mixed back corners
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 13, 5, 14, 6, 15, 7];
    const apexX = TABLE.PLAY_W / 4;
    const gap = BALL.R * 2 * 1.002;
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= row; i++) {
        const id = order[idx++];
        const ball = this.balls.find(b => b.id === id)!;
        ball.place(
          apexX + row * gap * Math.sin(Math.PI / 3),
          (i - row / 2) * gap,
        );
      }
    }
  }

  private refreshHud(label?: string): void {
    this.ui.setTurn(this.rules.current, this.rules.players, this.balls, label);
  }

  // ================= INPUT =================

  private handleDrag(dx: number, dy: number): void {
    if (this.state !== GameState.PLAYING) return;
    if (this.phase === ShotPhase.AIM || this.phase === ShotPhase.CHARGING) {
      const s = this.save.settings;
      this.cameraMgr.orbit(dx * s.aimSensitivity, dy * s.camSensitivity, 1);
    } else if (this.phase === ShotPhase.SIMULATING) {
      this.cameraMgr.orbit(dx, dy, this.save.settings.camSensitivity * 0.6);
    }
  }

  private handlePointAt(ndcX: number, ndcY: number, phase: 'start' | 'move' | 'end'): void {
    if (this.state !== GameState.PLAYING || this.phase !== ShotPhase.BALL_IN_HAND) return;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraMgr.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.tablePlane, hit)) return;

    const hw = TABLE.PLAY_W / 2 - BALL.R * 1.5;
    const hh = TABLE.PLAY_H / 2 - BALL.R * 1.5;
    const x = THREE.MathUtils.clamp(hit.x, -hw, hw);
    const z = THREE.MathUtils.clamp(hit.z, -hh, hh);
    const cueBall = this.balls[0];

    if (phase === 'start' || phase === 'move') {
      this.placingValid = this.physics.isSpotFree(x, z, cueBall);
      if (this.placingValid) {
        cueBall.place(x, z);
        cueBall.mesh.visible = true;
      }
    } else if (phase === 'end' && this.placingValid) {
      this.phase = ShotPhase.AIM;
      this.cameraMgr.mode = 'aim';
      this.ui.setHint('Drag to aim — pull the power bar to shoot');
    }
  }

  private handlePowerChange(p: number): void {
    if (this.state !== GameState.PLAYING || this.ui.settingsOpen) return;
    if (this.phase !== ShotPhase.AIM && this.phase !== ShotPhase.CHARGING) return;
    this.phase = ShotPhase.CHARGING;
    this.power = p;
    this.ui.setPower(p);
    this.cue.setPullback(p);
  }

  private handlePowerRelease(p: number): void {
    if (this.state !== GameState.PLAYING || this.phase !== ShotPhase.CHARGING) return;
    this.ui.setPower(0);
    if (p < 0.04) {
      this.phase = ShotPhase.AIM;
      this.cue.setPullback(0);
      return;
    }
    this.shoot(p);
  }

  private shoot(power: number): void {
    this.phase = ShotPhase.SIMULATING;
    this.cueStriking = true;
    this.rules.beginShot();
    const cueBall = this.balls[0];
    const dir = this.cameraMgr.aimDirection;

    this.cue.animateStrike(() => {
      this.cueStriking = false;
      this.physics.strike(cueBall, dir, power, this.ui.spinX, this.ui.spinY);
      this.audio.cueHit(power);
      this.vibrate(power > 0.7 ? 40 : 20);
      if (power > 0.75) this.effects.shake(0.02 + power * 0.025);
      this.cameraMgr.mode = 'shot';
      this.ui.setHint('');
    });
  }

  private endShot(): void {
    const outcome = this.rules.evaluate(this.balls);

    if (outcome.respotEight) {
      this.respotEightBall();
    }

    if (outcome.assignedGroup) {
      this.ui.announceAssignment(this.rules.current, outcome.assignedGroup);
    }
    if (outcome.banners.length) this.ui.announce(outcome.banners);

    if (outcome.gameOver) {
      this.finishGame(outcome.winner!);
      return;
    }

    if (outcome.switchTurn) this.rules.passTurn();

    const cueBall = this.balls[0];
    if (outcome.ballInHand || !cueBall.active) {
      cueBall.active = true;
      cueBall.sinking = false;
      cueBall.velocity.set(0, 0, 0);
      cueBall.angularVelocity.set(0, 0, 0);
      if (outcome.ballInHand) {
        this.phase = ShotPhase.BALL_IN_HAND;
        this.cameraMgr.mode = 'place';
        // Park it somewhere sensible until the player drags
        this.findFreeSpot(cueBall, -TABLE.PLAY_W / 4, 0);
        this.ui.setHint(`${this.rules.current.name}: drag on the table to place the cue ball`);
      }
    }

    if (this.phase !== ShotPhase.BALL_IN_HAND) {
      this.phase = ShotPhase.AIM;
      this.cameraMgr.mode = 'aim';
      this.autoAim();
      this.ui.setHint('Drag to aim — pull the power bar to shoot');
    }

    this.ui.resetSpin();
    this.cue.setPullback(0);
    this.refreshHud();
  }

  /** Point the initial aim at the nearest legal ball so turns start naturally. */
  private autoAim(): void {
    const cueBall = this.balls[0];
    const me = this.rules.current;
    let candidates = this.balls.filter(b => b.active && b.id !== 0);
    if (!this.rules.openTable && me.group) {
      const own = candidates.filter(b => b.group === me.group);
      const mustEight = own.length === 0;
      candidates = mustEight ? candidates.filter(b => b.id === 8) : own;
    }
    let best: Ball | null = null;
    let bestD = Infinity;
    for (const b of candidates) {
      const d = b.position.distanceToSquared(cueBall.position);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) {
      this.cameraMgr.angle = Math.atan2(
        best.position.z - cueBall.position.z,
        best.position.x - cueBall.position.x,
      );
    }
  }

  private respotEightBall(): void {
    const eight = this.balls.find(b => b.id === 8)!;
    this.findFreeSpot(eight, TABLE.PLAY_W / 4, 0);
  }

  private findFreeSpot(ball: Ball, x: number, z: number): void {
    let px = x;
    while (!this.physics.isSpotFree(px, z, ball) && px < TABLE.PLAY_W / 2 - BALL.R * 2) {
      px += BALL.R;
    }
    ball.place(px, z);
  }

  private finishGame(winner: 0 | 1): void {
    this.state = GameState.GAME_OVER;
    const youWon = winner === 0; // player 1 is the local "you" for stats
    this.save.recordResult(youWon);
    if (youWon) this.audio.win(); else this.audio.lose();
    this.vibrate(youWon ? 80 : 120);
    setTimeout(() => {
      this.ui.showGameOver(
        this.rules.players[winner].name,
        youWon,
        youWon ? 'The 8-ball is down. Clean game!' : 'Better luck next rack.',
      );
    }, 900);
  }

  // ================= MAIN LOOP =================

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state !== GameState.PAUSED) {
      this.environment.update(dt);
      this.effects.update(dt);

      if (this.state === GameState.PLAYING) {
        this.updateGame(dt);
      }
    }

    this.cameraMgr.update(dt, this.effects.shakeOffset);
    this.effects.render();
  }

  private updateGame(dt: number): void {
    const cueBall = this.balls[0];

    // Sinking animations run outside the rigid step
    let anySinking = false;
    for (const b of this.balls) {
      if (b.sinking) {
        b.updateSink(dt);
        if (b.sinking) anySinking = true;
      }
    }

    if (this.phase === ShotPhase.SIMULATING) {
      this.physics.step(dt);
      // Keep loosely following the action
      this.cameraMgr.setFocus(cueBall.active ? cueBall.position : new THREE.Vector3());
      if (!this.cueStriking && !this.physics.anyMoving && !anySinking) {
        this.endShot();
      }
    } else if (this.phase === ShotPhase.AIM || this.phase === ShotPhase.CHARGING) {
      this.cameraMgr.setFocus(cueBall.position);
      const dir = this.cameraMgr.aimDirection;
      const hit = this.physics.raycastAim(cueBall.position, dir, cueBall);
      this.cue.updateAim(cueBall.position, dir, hit);
    } else if (this.phase === ShotPhase.BALL_IN_HAND) {
      this.cameraMgr.setFocus(cueBall.position);
      this.cue.hide();
    }
  }

  private onResize(): void {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.cameraMgr.camera.aspect = w / h;
    this.cameraMgr.camera.updateProjectionMatrix();
    this.effects.resize(w, h);
  }
}
