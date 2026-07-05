import gsap from 'gsap';
import { BALL_COLORS, BallGroup } from '../utils/constants';
import type { SaveManager, GraphicsLevel, ShadowLevel } from '../utils/storage';
import type { Player } from '../game/Player';
import type { Ball } from '../game/Ball';

export interface UICallbacks {
  onPlay(): void;
  onQuitToMenu(): void;
  onRematch(): void;
  onPause(): void;
  onResume(): void;
  onSettingsChanged(): void;
  onSpinChanged(x: number, y: number): void;
  onSoundToggle(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class UIManager {
  private save: SaveManager;
  private cb: UICallbacks;
  private bannerQueue: Array<{ text: string; foul?: boolean }> = [];
  private bannerBusy = false;
  spinX = 0;
  spinY = 0;

  constructor(save: SaveManager, cb: UICallbacks) {
    this.save = save;
    this.cb = cb;
    this.wireMenu();
    this.wireSettings();
    this.wireHud();
    this.wireSpin();
    this.refreshSettingsUI();
    this.refreshMenuStats();
  }

  // ================= MENU =================

  private wireMenu(): void {
    $('btn-play').onclick = () => this.cb.onPlay();
    $('btn-settings').onclick = () => this.showSettings(true);
    $('btn-sound-toggle').onclick = () => {
      this.save.settings.sfx = !this.save.settings.sfx;
      this.save.settings.music = this.save.settings.sfx;
      this.save.saveSettings();
      this.refreshSettingsUI();
      this.cb.onSoundToggle();
    };
    $('btn-rematch').onclick = () => { this.hide('gameover'); this.cb.onRematch(); };
    $('btn-go-menu').onclick = () => { this.hide('gameover'); this.cb.onQuitToMenu(); };
    $('btn-pause').onclick = () => this.cb.onPause();
    $('btn-resume').onclick = () => { this.hide('pause-menu'); this.cb.onResume(); };
    $('btn-quit').onclick = () => { this.hide('pause-menu'); this.cb.onQuitToMenu(); };
    $('btn-pause-settings').onclick = () => this.showSettings(true);
  }

  showMainMenu(): void {
    this.hide('hud');
    this.hide('gameover');
    this.hide('pause-menu');
    const menu = $('main-menu');
    menu.classList.remove('hidden');
    gsap.fromTo(menu.querySelectorAll('.menu-center button, .menu-logo'),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'power3.out' });
    this.refreshMenuStats();
  }

  hideMainMenu(): void {
    const menu = $('main-menu');
    gsap.to(menu, {
      opacity: 0, duration: 0.35, onComplete: () => {
        menu.classList.add('hidden');
        menu.style.opacity = '1';
      },
    });
  }

  private refreshMenuStats(): void {
    const s = this.save.stats;
    $('menu-stats').innerHTML =
      `<span>GAMES ${s.gamesPlayed}</span><span>WINS ${s.wins}</span><span>BEST STREAK ${s.bestStreak}</span>`;
  }

  showHud(): void {
    $('hud').classList.remove('hidden');
    gsap.fromTo('#hud .hud-top, #hud .hud-bottom', { opacity: 0 }, { opacity: 1, duration: 0.5 });
  }

  showPause(): void { this.show('pause-menu'); }

  // ================= SETTINGS =================

  private wireSettings(): void {
    const s = this.save.settings;
    const toggle = (id: string, get: () => boolean, set: (v: boolean) => void) => {
      $(id).onclick = () => { set(!get()); this.persist(); };
    };
    toggle('set-music', () => s.music, v => { s.music = v; });
    toggle('set-sfx', () => s.sfx, v => { s.sfx = v; });
    toggle('set-vibration', () => s.vibration, v => { s.vibration = v; });

    $<HTMLInputElement>('set-aim-sens').oninput = (e) => {
      s.aimSensitivity = parseFloat((e.target as HTMLInputElement).value);
      this.persist(false);
    };
    $<HTMLInputElement>('set-cam-sens').oninput = (e) => {
      s.camSensitivity = parseFloat((e.target as HTMLInputElement).value);
      this.persist(false);
    };

    const seg = (id: string, set: (v: string) => void) => {
      $(id).querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { set(btn.dataset.v!); this.persist(); };
      });
    };
    seg('set-graphics', v => { s.graphics = v as GraphicsLevel; });
    seg('set-shadows', v => { s.shadows = v as ShadowLevel; });

    $('btn-reset-progress').onclick = () => {
      this.save.resetProgress();
      this.refreshMenuStats();
      this.toastBanner('PROGRESS RESET');
    };
    $('btn-settings-back').onclick = () => this.showSettings(false);
  }

  private persist(refresh = true): void {
    this.save.saveSettings();
    if (refresh) this.refreshSettingsUI();
    this.cb.onSettingsChanged();
  }

  refreshSettingsUI(): void {
    const s = this.save.settings;
    $('set-music').classList.toggle('on', s.music);
    $('set-sfx').classList.toggle('on', s.sfx);
    $('set-vibration').classList.toggle('on', s.vibration);
    $<HTMLInputElement>('set-aim-sens').value = String(s.aimSensitivity);
    $<HTMLInputElement>('set-cam-sens').value = String(s.camSensitivity);
    for (const [id, val] of [['set-graphics', s.graphics], ['set-shadows', s.shadows]] as const) {
      $(id).querySelectorAll('button').forEach(btn =>
        btn.classList.toggle('on', btn.dataset.v === val));
    }
    const soundOn = s.sfx || s.music;
    ($('btn-sound-toggle').querySelector('.icon-sound-on') as HTMLElement).style.display = soundOn ? '' : 'none';
    ($('btn-sound-toggle').querySelector('.icon-sound-off') as HTMLElement).style.display = soundOn ? 'none' : '';
  }

  showSettings(show: boolean): void {
    const el = $('settings-menu');
    if (show) {
      el.classList.remove('hidden');
      gsap.fromTo(el.querySelector('.panel'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
    } else {
      el.classList.add('hidden');
    }
  }

  get settingsOpen(): boolean {
    return !$('settings-menu').classList.contains('hidden');
  }

  // ================= HUD =================

  private wireHud(): void {
    // power fill + spin handled by GameManager through setters below
  }

  setPower(p: number): void {
    $('power-fill').style.width = `${Math.round(p * 100)}%`;
  }

  setTurn(current: Player, players: [Player, Player], balls: Ball[], label?: string): void {
    $('p1-card').classList.toggle('active', current.index === 0);
    $('p2-card').classList.toggle('active', current.index === 1);
    $('p1-group').textContent = players[0].groupLabel;
    $('p2-group').textContent = players[1].groupLabel;
    $('ti-label').textContent = label ?? `${current.name.toUpperCase()}'S TURN`;

    for (const p of players) {
      const el = $(p.index === 0 ? 'p1-balls' : 'p2-balls');
      if (!p.group) { el.innerHTML = ''; continue; }
      const ids = p.group === BallGroup.SOLID ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      el.innerHTML = ids.map(id => {
        const ball = balls.find(b => b.id === id);
        const off = ball && !ball.active && !ball.sinking;
        return `<span class="bdot ${id > 8 ? 'striped' : ''} ${off ? 'pocketed' : ''}" style="background-color:${BALL_COLORS[id]}"></span>`;
      }).join('');
    }
  }

  setHint(text: string): void {
    $('hint-text').textContent = text;
  }

  // ================= SPIN =================

  private wireSpin(): void {
    $('btn-spin').onclick = () => this.show('spin-overlay');
    $('btn-spin-done').onclick = () => this.hide('spin-overlay');
    $('btn-spin-reset').onclick = () => this.applySpin(0, 0);

    const ball = $('spin-ball');
    let dragging = false;
    const setFromEvent = (e: PointerEvent) => {
      const r = ball.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1;
      let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const len = Math.hypot(x, y);
      if (len > 0.75) { x = x / len * 0.75; y = y / len * 0.75; }
      this.applySpin(x / 0.75, y / 0.75);
    };
    ball.addEventListener('pointerdown', e => { dragging = true; setFromEvent(e); });
    window.addEventListener('pointermove', e => { if (dragging) setFromEvent(e); });
    window.addEventListener('pointerup', () => { dragging = false; });
  }

  private applySpin(x: number, y: number): void {
    this.spinX = x;
    this.spinY = y;
    const dot = $('spin-dot');
    dot.style.left = `${50 + x * 37.5}%`;
    dot.style.top = `${50 - y * 37.5}%`;
    const mini = $('spin-dot-mini');
    mini.style.left = `${50 + x * 35}%`;
    mini.style.top = `${50 - y * 35}%`;
    mini.style.transform = 'translate(-50%,-50%)';
    this.cb.onSpinChanged(x, y);
  }

  resetSpin(): void { this.applySpin(0, 0); }

  // ================= BANNERS =================

  announce(banners: Array<{ text: string; foul?: boolean }>): void {
    this.bannerQueue.push(...banners);
    this.pumpBanners();
  }

  toastBanner(text: string, foul = false): void {
    this.announce([{ text, foul }]);
  }

  private pumpBanners(): void {
    if (this.bannerBusy) return;
    const next = this.bannerQueue.shift();
    if (!next) return;
    this.bannerBusy = true;

    const banner = $('banner');
    const inner = $('banner-text');
    inner.textContent = next.text;
    inner.classList.toggle('foul', !!next.foul);
    banner.classList.remove('hidden');

    gsap.fromTo(inner,
      { scaleX: 0.4, opacity: 0, letterSpacing: '20px' },
      { scaleX: 1, opacity: 1, letterSpacing: '8px', duration: 0.45, ease: 'back.out(1.6)' });
    gsap.to(inner, {
      opacity: 0, y: -16, delay: 1.5, duration: 0.35, ease: 'power2.in',
      onComplete: () => {
        banner.classList.add('hidden');
        gsap.set(inner, { y: 0 });
        this.bannerBusy = false;
        this.pumpBanners();
      },
    });
  }

  /** Big assignment banner: "YOU ARE SOLIDS". */
  announceAssignment(player: Player, group: BallGroup.SOLID | BallGroup.STRIPE): void {
    const label = group === BallGroup.SOLID ? 'SOLIDS' : 'STRIPES';
    this.announce([{ text: `${player.name.toUpperCase()} — YOU ARE ${label}` }]);
  }

  // ================= GAME OVER =================

  showGameOver(winnerName: string, youWon: boolean, sub: string): void {
    const s = this.save.stats;
    $('go-title').textContent = youWon ? 'VICTORY' : `${winnerName.toUpperCase()} WINS`;
    $('go-sub').textContent = sub;
    $('go-stats').innerHTML =
      `<div><b>${s.gamesPlayed}</b>GAMES</div><div><b>${s.wins}</b>WINS</div><div><b>${s.streak}</b>STREAK</div><div><b>${s.bestStreak}</b>BEST</div>`;
    this.show('gameover');
    gsap.fromTo('#gameover .panel', { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' });
  }

  // ================= util =================

  show(id: string): void { $(id).classList.remove('hidden'); }
  hide(id: string): void { $(id).classList.add('hidden'); }
}
