export type GraphicsLevel = 'low' | 'medium' | 'high';
export type ShadowLevel = 'off' | 'low' | 'high';

export interface Settings {
  music: boolean;
  sfx: boolean;
  aimSensitivity: number;
  camSensitivity: number;
  graphics: GraphicsLevel;
  shadows: ShadowLevel;
  vibration: boolean;
}

export interface Stats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
}

const SETTINGS_KEY = 'royal8.settings.v1';
const STATS_KEY = 'royal8.stats.v1';

const DEFAULT_SETTINGS: Settings = {
  music: true,
  sfx: true,
  aimSensitivity: 1,
  camSensitivity: 1,
  graphics: 'high',
  shadows: 'high',
  vibration: true,
};

const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
};

function detectDefaultGraphics(): GraphicsLevel {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (isMobile && cores <= 4) return 'medium';
  return 'high';
}

export class SaveManager {
  settings: Settings;
  stats: Stats;

  constructor() {
    this.settings = this.load(SETTINGS_KEY, { ...DEFAULT_SETTINGS, graphics: detectDefaultGraphics() });
    this.stats = this.load(STATS_KEY, DEFAULT_STATS);
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...fallback };
      return { ...fallback, ...JSON.parse(raw) };
    } catch {
      return { ...fallback };
    }
  }

  saveSettings(): void {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* storage unavailable */ }
  }

  saveStats(): void {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(this.stats)); } catch { /* storage unavailable */ }
  }

  recordResult(win: boolean): void {
    this.stats.gamesPlayed++;
    if (win) {
      this.stats.wins++;
      this.stats.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    } else {
      this.stats.losses++;
      this.stats.streak = 0;
    }
    this.saveStats();
  }

  resetProgress(): void {
    this.stats = { ...DEFAULT_STATS };
    this.saveStats();
  }
}
