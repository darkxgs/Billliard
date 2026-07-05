import gsap from 'gsap';
import { BALL_COLORS, BallGroup } from '../utils/constants';
import { t, setLang, getLang, type Lang } from '../utils/i18n';
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
  /** Both players pressed READY in the lobby. */
  onMatchStart(bet: number): void;
  /** The timed-out player tapped "I'M HERE" during the forfeit countdown. */
  onAfkStay(): void;
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
    this.applyLanguage();
    this.wireMenu();
    this.wireSettings();
    this.wireHud();
    this.wireSpin();
    this.wireLobby();
    this.refreshSettingsUI();
    this.refreshMenuStats();
  }

  /** Apply the saved language: direction + every tagged static element. */
  applyLanguage(): void {
    setLang(this.save.settings.language);
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n!);
    });
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
      `<span style="color:#ffd76e">🪙 ${s.coins}</span><span>${t('stat.games')} ${s.gamesPlayed}</span><span>${t('stat.wins')} ${s.wins}</span><span>${t('stat.best')} ${s.bestStreak}</span>`;
  }

  // ================= LOBBY =================

  private lobbyBet = 0;
  private lobbyReady = [false, false];
  private lobbyStarting = false;

  private wireLobby(): void {
    $('bet-seg').querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        if (this.lobbyStarting) return;
        this.lobbyBet = parseInt(btn.dataset.v!, 10);
        // Changing the bet un-readies both players
        this.lobbyReady = [false, false];
        this.refreshLobby();
      };
    });
    for (const i of [0, 1] as const) {
      $(`ready-p${i + 1}`).onclick = () => {
        if (this.lobbyStarting) return;
        this.lobbyReady[i] = !this.lobbyReady[i];
        this.refreshLobby();
        if (this.lobbyReady[0] && this.lobbyReady[1]) this.beginCountdown();
      };
    }
    $('btn-lobby-back').onclick = () => this.hide('lobby');
  }

  openLobby(): void {
    this.lobbyReady = [false, false];
    this.lobbyStarting = false;
    if (this.lobbyBet > this.save.stats.coins) this.lobbyBet = 0;
    this.refreshLobby();
    this.show('lobby');
    gsap.fromTo('#lobby .panel', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
  }

  private refreshLobby(): void {
    $('lobby-coins').textContent = String(this.save.stats.coins);
    $('bet-seg').querySelectorAll('button').forEach(btn => {
      const v = parseInt(btn.dataset.v!, 10);
      (btn as HTMLButtonElement).disabled = v > this.save.stats.coins;
      btn.classList.toggle('on', v === this.lobbyBet);
    });
    for (const i of [0, 1] as const) {
      const el = $(`ready-p${i + 1}`);
      el.classList.toggle('ready', this.lobbyReady[i]);
      el.querySelector('.rb-state')!.textContent = this.lobbyReady[i] ? t('lobby.ready') : t('lobby.tapReady');
    }
    $('lobby-status').textContent = t('lobby.bothReady');
    $('lobby-status').classList.remove('starting');
  }

  private beginCountdown(): void {
    this.lobbyStarting = true;
    const status = $('lobby-status');
    status.classList.add('starting');
    let n = 3;
    status.textContent = t('lobby.starting', { n });
    const timer = window.setInterval(() => {
      n--;
      if (!$('lobby').classList.contains('hidden') && n > 0) {
        status.textContent = t('lobby.starting', { n });
      } else {
        clearInterval(timer);
        if (!$('lobby').classList.contains('hidden')) {
          this.hide('lobby');
          this.cb.onMatchStart(this.lobbyBet);
        }
      }
    }, 700);
  }

  // ================= SHOT TIMER / AFK =================

  setTimer(seconds: number | null): void {
    const el = $('ti-timer');
    if (seconds === null) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    el.textContent = String(Math.max(0, Math.ceil(seconds)));
    el.classList.toggle('urgent', seconds <= 10);
  }

  setPot(bet: number): void {
    const el = $('ti-pot');
    if (bet > 0) {
      el.classList.remove('hidden');
      el.textContent = `${t('hud.pot')} 🪙 ${bet * 2}`;
    } else {
      el.classList.add('hidden');
    }
  }

  showAfk(playerName: string, seconds: number): void {
    $('afk-sub').textContent = t('afk.sub', { name: playerName });
    $('afk-count').textContent = String(Math.ceil(seconds));
    $('btn-afk-here').onclick = () => this.cb.onAfkStay();
    this.show('afk-overlay');
    gsap.fromTo('#afk-overlay .panel', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.5)' });
  }

  updateAfk(seconds: number): void {
    $('afk-count').textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  hideAfk(): void {
    this.hide('afk-overlay');
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
    seg('set-language', v => {
      s.language = v as Lang;
      this.applyLanguage();
      this.refreshMenuStats();
      this.refreshLobby();
    });

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
    for (const [id, val] of [['set-graphics', s.graphics], ['set-shadows', s.shadows], ['set-language', s.language]] as const) {
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
    $('ti-label').textContent = label ?? t('hud.turn', { name: current.name.toUpperCase() });

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
    inner.textContent = t(next.text);
    inner.classList.toggle('foul', !!next.foul);
    banner.classList.remove('hidden');

    // Letter-spacing animation looks wrong on connected Arabic script
    const spacing = getLang() === 'ar' ? { from: '0px', to: '0px' } : { from: '20px', to: '8px' };
    gsap.fromTo(inner,
      { scaleX: 0.4, opacity: 0, letterSpacing: spacing.from },
      { scaleX: 1, opacity: 1, letterSpacing: spacing.to, duration: 0.45, ease: 'back.out(1.6)' });
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
    const key = group === BallGroup.SOLID ? 'banner.assign.solid' : 'banner.assign.stripe';
    this.announce([{ text: t(key, { name: player.name.toUpperCase() }) }]);
  }

  // ================= GAME OVER =================

  showGameOver(winnerName: string, youWon: boolean, sub: string, coinDelta = 0): void {
    const s = this.save.stats;
    $('go-title').textContent = youWon ? t('go.victory') : t('go.wins', { name: winnerName.toUpperCase() });
    $('go-sub').textContent = sub;
    const coins = $('go-coins');
    if (coinDelta !== 0) {
      coins.classList.remove('hidden');
      coins.classList.toggle('gain', coinDelta > 0);
      coins.classList.toggle('loss', coinDelta < 0);
      coins.textContent = `${coinDelta > 0 ? '+' : '−'}🪙 ${Math.abs(coinDelta)}`;
    } else {
      coins.classList.add('hidden');
    }
    $('go-stats').innerHTML =
      `<div><b>${s.coins}</b>${t('stat.coins')}</div><div><b>${s.gamesPlayed}</b>${t('stat.games')}</div><div><b>${s.wins}</b>${t('stat.wins')}</div><div><b>${s.streak}</b>${t('stat.streak')}</div>`;
    this.show('gameover');
    this.refreshMenuStats();
    gsap.fromTo('#gameover .panel', { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' });
  }

  // ================= util =================

  show(id: string): void { $(id).classList.remove('hidden'); }
  hide(id: string): void { $(id).classList.add('hidden'); }
}
