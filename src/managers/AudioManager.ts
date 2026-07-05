/**
 * All audio is synthesized at runtime with WebAudio — no external files.
 * Cue hits, ball clicks, rail thuds, pocket drops, win/lose stings,
 * an ambient room tone and a slow synth-pad music loop.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private ambientGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicStep = 0;

  musicOn = true;
  sfxOn = true;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    this.ambientGain.connect(this.master);

    // Shared noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.995;
      data[i] = Math.random() * 2 - 1 + brown * 6;
    }

    this.startAmbient();
    if (this.musicOn) this.startMusic();
    this.applyToggles();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    this.applyToggles();
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    this.sfxGain.gain.value = this.sfxOn ? 1 : 0;
    this.ambientGain.gain.value = this.sfxOn ? 0.05 : 0;
  }

  // ---------- SFX ----------

  private noiseBurst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private ping(freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  cueHit(power: number): void {
    const v = 0.15 + power * 0.5;
    this.noiseBurst(0.05, 1800 + power * 900, 1.2, v, 'highpass');
    this.ping(320 + power * 120, 0.06, v * 0.5);
  }

  ballHit(impact: number): void {
    const p = Math.min(impact / 5, 1);
    if (p < 0.02) return;
    this.noiseBurst(0.035, 3200, 2.5, 0.1 + p * 0.55, 'bandpass');
    this.ping(2400 + p * 1400, 0.035, 0.08 + p * 0.3);
  }

  railHit(impact: number): void {
    const p = Math.min(impact / 4, 1);
    if (p < 0.04) return;
    this.noiseBurst(0.08, 420, 1, 0.06 + p * 0.35, 'lowpass');
  }

  pocket(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    // Thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.25);
    // Rattle
    this.noiseBurst(0.25, 900, 0.8, 0.18, 'bandpass');
  }

  private sting(notes: number[], step: number, vol: number): void {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      const t = t0 + i * step;
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t); osc.stop(t + 0.6);
    });
  }

  win(): void { this.sting([523.25, 659.25, 783.99, 1046.5], 0.14, 0.25); }
  lose(): void { this.sting([392, 329.63, 261.63, 196], 0.2, 0.22); }

  // ---------- Ambient & music ----------

  private startAmbient(): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    src.connect(filter).connect(this.ambientGain);
    src.start();
  }

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    // Slow, moody minor progression: Am — F — C — G (low register pads)
    const chords = [
      [110, 164.81, 220, 261.63],
      [87.31, 130.81, 174.61, 220],
      [65.41, 130.81, 164.81, 196],
      [98, 146.83, 196, 246.94],
    ];
    const playChord = () => {
      if (!this.ctx || !this.musicOn) return;
      const notes = chords[this.musicStep % chords.length];
      this.musicStep++;
      const t = this.ctx.currentTime;
      const dur = 6.5;
      for (const f of notes) {
        for (const detune of [-4, 3]) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          osc.detune.value = detune;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, t);
          filter.frequency.linearRampToValueAtTime(700, t + dur / 2);
          filter.frequency.linearRampToValueAtTime(280, t + dur);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.055, t + 1.6);
          g.gain.linearRampToValueAtTime(0.04, t + dur - 1.5);
          g.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(filter).connect(g).connect(this.musicGain);
          osc.start(t);
          osc.stop(t + dur + 0.1);
        }
      }
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 6000);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
