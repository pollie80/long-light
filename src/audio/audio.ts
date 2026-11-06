// All sound is synthesised live: sea, wind, birds, crickets, footsteps, oars, and a soft generative
// score of felt piano and pads that leaves plenty of silence.
import type { Phase } from '../core/time';

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Mood {
  chords: number[][]; // pad voicings
  scale: number[]; // piano note pool
  gapMin: number;
  gapMax: number;
}

const MOODS: Record<Phase, Mood> = {
  dawn: {
    chords: [[50, 57, 62, 66, 69], [47, 54, 62, 66, 71], [43, 50, 59, 66, 69], [45, 52, 57, 64, 69]],
    scale: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83],
    gapMin: 14, gapMax: 28,
  },
  morning: {
    chords: [[43, 50, 59, 62, 67], [48, 55, 60, 64, 67], [40, 47, 55, 62, 67], [45, 52, 60, 64, 69]],
    scale: [67, 69, 71, 74, 76, 79, 81, 83, 86],
    gapMin: 16, gapMax: 32,
  },
  day: {
    chords: [[48, 55, 60, 64, 67], [53, 60, 64, 67, 72], [45, 52, 60, 64, 69], [50, 57, 60, 65, 69]],
    scale: [60, 62, 64, 67, 69, 72, 74, 76, 79],
    gapMin: 22, gapMax: 44,
  },
  golden: {
    chords: [[41, 48, 57, 60, 64], [46, 53, 57, 62, 65], [38, 45, 53, 60, 65], [43, 50, 58, 62, 69]],
    scale: [60, 62, 65, 67, 69, 72, 74, 77, 79],
    gapMin: 12, gapMax: 26,
  },
  sunset: {
    chords: [[39, 46, 55, 58, 62], [44, 51, 58, 63, 67], [36, 43, 51, 58, 63], [41, 48, 56, 60, 65]],
    scale: [58, 60, 63, 65, 67, 70, 72, 75, 79, 82],
    gapMin: 9, gapMax: 20,
  },
  dusk: {
    chords: [[36, 43, 51, 55, 62], [44, 51, 55, 60, 67], [41, 48, 55, 60, 63], [43, 50, 53, 62, 65]],
    scale: [60, 62, 63, 67, 70, 72, 74, 75, 79],
    gapMin: 14, gapMax: 30,
  },
  night: {
    chords: [[33, 40, 48, 55, 59], [29, 36, 45, 52, 60], [36, 43, 52, 59, 62], [31, 38, 47, 54, 57]],
    scale: [57, 59, 60, 64, 67, 69, 71, 72, 76],
    gapMin: 20, gapMax: 44,
  },
};

export type Surface = 'grass' | 'wood' | 'sand' | 'stone';

export interface AudioState {
  hour: number;
  phase: Phase;
  shore: number; // 0 far out at sea, 1 at the waterline
  overLand: number; // 0 on the water, 1 well inland
  altitude: number;
  night: number;
  inBoat: boolean;
  boatSpeed: number;
}

export class AudioWorld {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private gate!: GainNode;
  private away = false;
  private music!: GainNode;
  private amb!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private wavesLow!: GainNode;
  private wavesHigh!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private leaves!: GainNode;
  private cricketGain!: GainNode;
  private hullGain!: GainNode;
  private noiseWhite!: AudioBuffer;
  private noisePink!: AudioBuffer;
  private noiseBrown!: AudioBuffer;
  private nextPhrase = 4;
  private nextChord = 0;
  private chordI = 0;
  private birdT = 2;
  private gullT = 6;
  private owlT = 30;
  private lapT = 3;
  private padVoices: { gain: GainNode; stop: number; oscs: OscillatorNode[] }[] = [];
  private lastState: AudioState | null = null;
  musicVol = 0.8;
  sfxVol = 0.9;

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    this.gate = ctx.createGain();
    this.gate.gain.value = this.away ? 0 : 1;
    this.master.connect(comp).connect(this.gate).connect(ctx.destination);
    this.music = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.music.connect(this.master);
    this.amb.connect(this.master);
    this.sfxBus.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);

    this.noiseWhite = this.makeNoise('white');
    this.noisePink = this.makeNoise('pink');
    this.noiseBrown = this.makeNoise('brown');

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbSend.connect(this.reverb).connect(wet).connect(this.master);

    this.buildAmbience();
    this.nextPhrase = ctx.currentTime + 5;
    this.nextChord = ctx.currentTime + 1;
  }

  /** Fades everything out while the game is not the window in front. */
  setAway(away: boolean) {
    if (away === this.away) return;
    this.away = away;
    if (this.ctx) this.gate.gain.setTargetAtTime(away ? 0 : 1, this.ctx.currentTime, away ? 0.08 : 0.35);
  }

  get gateLevel(): number {
    return this.gate ? this.gate.gain.value : 1;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music * 0.85, t, 0.2);
    this.amb.gain.setTargetAtTime(sfx * 0.95, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(sfx * 0.95, t, 0.2);
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 7;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.24;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      // Crossfade the ends so the loop has no click.
      const fade = 4000;
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[len - fade + i] * (1 - k);
      }
    }
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const k = 0.5 - 0.42 * t; // darker as it decays
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  private loop(buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * 5);
    return s;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    // Low wash of the sea.
    const low = this.loop(this.noiseBrown, 0.9);
    const lowF = ctx.createBiquadFilter();
    lowF.type = 'lowpass';
    lowF.frequency.value = 340;
    this.wavesLow = ctx.createGain();
    this.wavesLow.gain.value = 0;
    low.connect(lowF).connect(this.wavesLow).connect(this.amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 130;
    lfo.connect(lfoG).connect(lowF.frequency);
    lfo.start();

    // Fizz on the sand.
    const high = this.loop(this.noisePink, 1.05);
    const highF = ctx.createBiquadFilter();
    highF.type = 'bandpass';
    highF.frequency.value = 1300;
    highF.Q.value = 0.5;
    this.wavesHigh = ctx.createGain();
    this.wavesHigh.gain.value = 0;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const swellL = ctx.createOscillator();
    swellL.frequency.value = 0.13;
    const swellG = ctx.createGain();
    swellG.gain.value = 0.42;
    swellL.connect(swellG).connect(swell.gain);
    swellL.start();
    high.connect(highF).connect(swell).connect(this.wavesHigh).connect(this.amb);

    // Wind.
    const wind = this.loop(this.noisePink, 0.8);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.amb);

    // Leaves.
    const lf = this.loop(this.noiseWhite, 1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;
    this.leaves = ctx.createGain();
    this.leaves.gain.value = 0;
    const leafL = ctx.createOscillator();
    leafL.frequency.value = 0.21;
    const leafG = ctx.createGain();
    leafG.gain.value = 0.012;
    leafL.connect(leafG).connect(this.leaves.gain);
    leafL.start();
    lf.connect(hp).connect(this.leaves).connect(this.amb);

    // Water on the hull.
    const hull = this.loop(this.noiseBrown, 1.7);
    const hullF = ctx.createBiquadFilter();
    hullF.type = 'bandpass';
    hullF.frequency.value = 520;
    hullF.Q.value = 1.1;
    this.hullGain = ctx.createGain();
    this.hullGain.gain.value = 0;
    hull.connect(hullF).connect(this.hullGain).connect(this.amb);

    // Crickets: a high tone gated by a fast pulse.
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    this.cricketGain.connect(this.amb);
    for (const [f, rate, pan] of [[4300, 3.1, -0.6], [4720, 2.6, 0.5], [3950, 3.7, 0.1]] as [number, number, number][]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const trem = ctx.createGain();
      trem.gain.value = 0;
      const fast = ctx.createOscillator();
      fast.frequency.value = 46;
      const fastG = ctx.createGain();
      fastG.gain.value = 0.5;
      const slow = ctx.createOscillator();
      slow.type = 'square';
      slow.frequency.value = rate;
      const slowG = ctx.createGain();
      slowG.gain.value = 0;
      fast.connect(fastG).connect(trem.gain);
      slow.connect(slowG.gain);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const lvl = ctx.createGain();
      lvl.gain.value = 0.012;
      o.connect(trem).connect(slowG).connect(p).connect(lvl).connect(this.cricketGain);
      o.start();
      fast.start();
      slow.start();
    }
  }

  // ---- Music --------------------------------------------------------------------------------------

  private piano(m: number, when: number, vel: number, pan = 0) {
    const ctx = this.ctx!;
    const f = midi(m);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + 2400 * vel;
    const dur = 2.6 + (84 - m) * 0.05;
    out.gain.setValueAtTime(0.0001, when);
    out.gain.exponentialRampToValueAtTime(0.18 * vel, when + 0.012);
    out.gain.exponentialRampToValueAtTime(0.07 * vel, when + 0.42);
    out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const parts: [number, number, number][] = [[1, 1, 1.0], [2.001, 0.32, 0.66], [3.004, 0.09, 0.45], [4.01, 0.035, 0.3]];
    for (const [ratio, amp, life] of parts) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio * (1 + (Math.random() - 0.5) * 0.0012);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * life);
      o.connect(g).connect(lp);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    lp.connect(out).connect(p);
    p.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.62;
    p.connect(send).connect(this.reverbSend);
  }

  private pad(chord: number[], when: number, length: number) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.062, when + length * 0.42);
    gain.gain.linearRampToValueAtTime(0.0001, when + length);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.Q.value = 0.3;
    const oscs: OscillatorNode[] = [];
    for (const m of chord) {
      for (const det of [-3.5, 3.5]) {
        const o = ctx.createOscillator();
        o.type = m < 48 ? 'sine' : 'triangle';
        o.frequency.value = midi(m);
        o.detune.value = det + (Math.random() - 0.5) * 2;
        const g = ctx.createGain();
        g.gain.value = m < 48 ? 0.32 : 0.11;
        o.connect(g).connect(lp);
        o.start(when);
        o.stop(when + length + 0.2);
        oscs.push(o);
      }
    }
    lp.connect(gain);
    gain.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.72;
    gain.connect(send).connect(this.reverbSend);
    this.padVoices.push({ gain, stop: when + length, oscs });
  }

  private playPhrase(mood: Mood) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.1;
    const n = 3 + Math.floor(Math.random() * 5);
    let idx = Math.floor(Math.random() * mood.scale.length);
    let t = t0;
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(mood.scale.length - 1, idx + (Math.floor(Math.random() * 5) - 2)));
      const m = mood.scale[idx];
      const v = 0.32 + Math.random() * 0.34;
      this.piano(m, t, v * (i === 0 ? 1 : 0.85), (Math.random() - 0.5) * 0.5);
      if (Math.random() < 0.25) this.piano(m - 12, t, v * 0.5, 0);
      t += [0.55, 0.8, 1.1, 1.65, 2.2][Math.floor(Math.random() * 5)];
    }
  }

  // ---- Birds and night sounds ---------------------------------------------------------------------

  private chirp(base: number, count: number, gap: number, pan: number, vol: number) {
    const ctx = this.ctx!;
    let t = ctx.currentTime + 0.02;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const out = ctx.createGain();
    out.gain.value = vol;
    p.connect(out);
    out.connect(this.amb);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send).connect(this.reverbSend);
    for (let i = 0; i < count; i++) {
      const dur = 0.05 + Math.random() * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f0 = base * (0.9 + Math.random() * 0.25);
      const f1 = f0 * (0.8 + Math.random() * 0.55);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + gap * (0.6 + Math.random() * 0.8);
    }
  }

  private gull() {
    const ctx = this.ctx!;
    let t = ctx.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 3);
    const pan = (Math.random() - 0.5) * 1.4;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const out = ctx.createGain();
    out.gain.value = 0.035;
    p.connect(out).connect(this.amb);
    const send = ctx.createGain();
    send.gain.value = 1.2;
    out.connect(send).connect(this.reverbSend);
    const base = 1250 + Math.random() * 500;
    for (let i = 0; i < n; i++) {
      const dur = 0.2 + Math.random() * 0.16;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.75, t + dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp).connect(g).connect(p);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.1 + Math.random() * 0.1;
    }
  }

  private owl() {
    const ctx = this.ctx!;
    let t = ctx.currentTime + 0.05;
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() - 0.5) * 1.2;
    const out = ctx.createGain();
    out.gain.value = 0.05;
    p.connect(out);
    out.connect(this.amb);
    const send = ctx.createGain();
    send.gain.value = 1.4;
    out.connect(send).connect(this.reverbSend);
    for (const dur of [0.28, 0.62]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(370, t);
      o.frequency.linearRampToValueAtTime(340, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.7, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.3;
    }
  }

  // ---- Effects ------------------------------------------------------------------------------------

  private burst(buf: AudioBuffer, dur: number, vol: number, filt: { type: BiquadFilterType; f0: number; f1?: number; q?: number }, opts: { pan?: number; delay?: number; wet?: number; rate?: number } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = filt.type;
    f.frequency.setValueAtTime(filt.f0, t);
    if (filt.f1) f.frequency.exponentialRampToValueAtTime(filt.f1, t + dur);
    f.Q.value = filt.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    s.connect(f).connect(g).connect(p).connect(this.sfxBus);
    if (opts.wet) {
      const w = ctx.createGain();
      w.gain.value = opts.wet;
      p.connect(w).connect(this.reverbSend);
    }
    s.start(t, Math.random() * 5, dur + 0.05);
  }

  step(surface: Surface, foot: number) {
    if (!this.ctx) return;
    const pan = foot === 0 ? -0.08 : 0.08;
    const v = 0.9 + Math.random() * 0.2;
    if (surface === 'wood') {
      this.burst(this.noiseBrown, 0.14, 0.34 * v, { type: 'lowpass', f0: 520, f1: 180 }, { pan });
      this.burst(this.noisePink, 0.05, 0.07 * v, { type: 'bandpass', f0: 1500, q: 1 }, { pan });
      if (Math.random() < 0.18) this.creak(0.1);
    } else if (surface === 'sand') {
      this.burst(this.noisePink, 0.22, 0.1 * v, { type: 'bandpass', f0: 2300, f1: 1200, q: 0.6 }, { pan });
    } else if (surface === 'stone') {
      this.burst(this.noisePink, 0.07, 0.12 * v, { type: 'bandpass', f0: 1500, q: 1.1 }, { pan });
      this.burst(this.noiseBrown, 0.08, 0.14 * v, { type: 'lowpass', f0: 400 }, { pan });
    } else {
      this.burst(this.noisePink, 0.19, 0.075 * v, { type: 'highpass', f0: 1500, f1: 2600 }, { pan });
      this.burst(this.noiseBrown, 0.1, 0.09 * v, { type: 'lowpass', f0: 300 }, { pan });
    }
  }

  creak(vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.1;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 90 + Math.random() * 120;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (1.15 + Math.random() * 0.4), t + 0.28);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 780;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(bp).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  oarCatch(power: number) {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.55, 0.16 * (0.5 + power * 0.5), { type: 'bandpass', f0: 1000, f1: 340, q: 0.8 }, { wet: 0.2 });
    this.burst(this.noiseBrown, 0.3, 0.2, { type: 'lowpass', f0: 500, f1: 180 });
    this.creak(0.16);
  }

  oarDrip() {
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) {
      this.burst(this.noiseWhite, 0.035, 0.03, { type: 'bandpass', f0: 2200 + Math.random() * 2600, q: 6 }, { delay: 0.05 + Math.random() * 0.8, pan: (Math.random() - 0.5) * 0.8, wet: 0.45 });
    }
  }

  castWhoosh(k: number) {
    this.burst(this.noisePink ?? null!, 0.55, 0.12 + k * 0.15, { type: 'bandpass', f0: 2600, f1: 700, q: 1.1 });
  }

  splash(size: number, pan = 0) {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.32 + size * 0.4, 0.14 + size * 0.28, { type: 'bandpass', f0: 1700, f1: 480, q: 0.6 }, { pan, wet: 0.35 });
    this.burst(this.noiseBrown, 0.2 + size * 0.2, 0.2 + size * 0.2, { type: 'lowpass', f0: 420, f1: 150 }, { pan });
    for (let i = 0; i < 4; i++) {
      this.burst(this.noiseWhite, 0.03, 0.025, { type: 'bandpass', f0: 2500 + Math.random() * 2500, q: 7 }, { delay: 0.25 + Math.random() * 0.6, pan, wet: 0.45 });
    }
  }

  farSplash(pan: number) {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.3, 0.038, { type: 'bandpass', f0: 1400, f1: 500, q: 0.7 }, { pan, wet: 0.9 });
  }

  bite() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.splash(0.22);
    const t = ctx.currentTime + 0.05;
    for (const [m, d] of [[79, 0], [84, 0.12]] as [number, number][]) this.piano(m, t + d, 0.5, 0);
  }

  reelClick() {
    if (!this.ctx) return;
    this.burst(this.noiseWhite, 0.012, 0.024, { type: 'bandpass', f0: 4300, q: 5 });
  }

  /** A shotgun across open water: a hard crack, a low thump, and the hills answering. `near` is 1 for your own. */
  shot(near = 1) {
    if (!this.ctx) return;
    const v = near;
    this.burst(this.noisePink, 0.09, 0.95 * v, { type: 'highpass', f0: 900 }, {});
    this.burst(this.noiseBrown, 0.42, 1.25 * v, { type: 'lowpass', f0: 420, f1: 70 }, {});
    this.burst(this.noiseBrown, 0.8, 0.22 * v, { type: 'lowpass', f0: 300, f1: 90 }, { delay: 0.34, pan: -0.4 });
    this.burst(this.noiseBrown, 1.1, 0.11 * v, { type: 'lowpass', f0: 220, f1: 80 }, { delay: 0.8, pan: 0.45 });
  }

  /** The breech closing on two fresh shells. */
  reload() {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.03, 0.2, { type: 'bandpass', f0: 2400, q: 2 }, {});
    this.burst(this.noisePink, 0.04, 0.26, { type: 'bandpass', f0: 1500, q: 2 }, { delay: 0.75 });
  }

  landed() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.1;
    const seq = [67, 72, 76, 79, 84];
    seq.forEach((m, i) => this.piano(m, t + i * 0.13, 0.5 - i * 0.04, -0.3 + i * 0.15));
  }

  firstOfKind() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.82;
    [84, 88, 91].forEach((m, i) => this.piano(m, t + i * 0.18, 0.42, 0.2));
  }

  beerOpen() {
    if (!this.ctx) return;
    this.burst(this.noiseWhite, 0.045, 0.2, { type: 'highpass', f0: 2400 });
    this.burst(this.noiseBrown, 0.07, 0.2, { type: 'lowpass', f0: 700 });
    this.burst(this.noisePink, 0.7, 0.07, { type: 'bandpass', f0: 5600, f1: 3600, q: 0.7 }, { delay: 0.04 });
    // The cap tinkles off somewhere.
    for (let i = 0; i < 3; i++) {
      this.burst(this.noiseWhite, 0.018, 0.035 / (i + 1), { type: 'bandpass', f0: 5200, q: 12 }, { delay: 0.14 + i * 0.09, pan: 0.25, wet: 0.3 });
    }
  }

  beerSip() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + 0.08 + i * 0.46;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(105, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.22);
      this.burst(this.noiseBrown, 0.17, 0.09, { type: 'lowpass', f0: 520, f1: 240 }, { delay: 0.08 + i * 0.46 });
    }
  }

  beerAh() {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.8, 0.055, { type: 'bandpass', f0: 950, f1: 480, q: 1.3 }, { delay: 0.05 });
  }

  beerStow() {
    if (!this.ctx) return;
    this.burst(this.noiseWhite, 0.025, 0.03, { type: 'bandpass', f0: 3300, q: 8 });
    this.burst(this.noiseBrown, 0.06, 0.05, { type: 'lowpass', f0: 500 });
  }

  uiTick() {
    if (!this.ctx) return;
    this.burst(this.noiseWhite, 0.03, 0.05, { type: 'bandpass', f0: 3000, q: 4 });
  }

  pageTurn() {
    if (!this.ctx) return;
    this.burst(this.noisePink, 0.32, 0.1, { type: 'bandpass', f0: 2400, f1: 900, q: 0.6 });
  }

  // ---- Per-frame ----------------------------------------------------------------------------------

  update(s: AudioState) {
    if (!this.ctx) return;
    this.lastState = s;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const set = (n: GainNode, v: number, tc = 1.2) => n.gain.setTargetAtTime(v, t, tc);

    set(this.wavesLow, 0.15 + (1 - s.overLand) * 0.1 + s.shore * 0.22);
    set(this.wavesHigh, 0.015 + s.shore * 0.09 + (1 - s.overLand) * 0.02);
    const windLevel = 0.038 + s.altitude * 0.0016 + (1 - s.overLand) * 0.015 + Math.sin(t * 0.13) * 0.012;
    set(this.windGain, windLevel, 2);
    this.windFilter.frequency.setTargetAtTime(420 + Math.sin(t * 0.09) * 150 + Math.sin(t * 0.31) * 60, t, 1);
    set(this.leaves, s.overLand * 0.016, 2);
    set(this.cricketGain, s.overLand * 0.85 * Math.min(1, s.night * 1.4 + (s.hour > 18.6 && s.hour < 20 ? 0.3 : 0)), 3);
    set(this.hullGain, s.inBoat ? 0.045 + Math.min(0.09, s.boatSpeed * 0.05) : 0, 0.8);

    // Lapping on hull or jetty, a soft random pat.
    this.lapT -= 1 / 60;
    if (this.lapT <= 0) {
      this.lapT = 1.5 + Math.random() * 3;
      if (s.inBoat || s.shore > 0.5) {
        this.burst(this.noiseBrown, 0.3, s.inBoat ? 0.09 : 0.05, { type: 'bandpass', f0: 500 + Math.random() * 300, q: 1.8 }, { pan: (Math.random() - 0.5) * 0.9 });
      }
    }

    // Birds by time of day.
    this.birdT -= 1 / 60;
    if (this.birdT <= 0) {
      const landBias = 0.25 + s.overLand * 0.75;
      if (s.phase === 'dawn') {
        this.birdT = 0.8 + Math.random() * 2.2;
        this.chirp(2600 + Math.random() * 2200, 3 + Math.floor(Math.random() * 6), 0.07, (Math.random() - 0.5) * 1.6, 0.12 * landBias);
      } else if (s.phase === 'morning' || s.phase === 'day') {
        this.birdT = 3.5 + Math.random() * 9;
        this.chirp(2400 + Math.random() * 2000, 2 + Math.floor(Math.random() * 4), 0.1, (Math.random() - 0.5) * 1.6, 0.07 * landBias);
      } else if (s.phase === 'golden' || s.phase === 'sunset') {
        this.birdT = 2.5 + Math.random() * 6;
        // Swallows twittering overhead.
        this.chirp(3600 + Math.random() * 1600, 4 + Math.floor(Math.random() * 7), 0.035, (Math.random() - 0.5) * 1.6, 0.06);
      } else {
        this.birdT = 6;
      }
    }
    this.gullT -= 1 / 60;
    if (this.gullT <= 0) {
      this.gullT = 10 + Math.random() * 28;
      if (s.phase === 'morning' || s.phase === 'day' || s.phase === 'golden') this.gull();
    }
    this.owlT -= 1 / 60;
    if (this.owlT <= 0) {
      this.owlT = 28 + Math.random() * 50;
      if (s.phase === 'night' && s.overLand > 0.1) this.owl();
    }

    // Music.
    const mood = MOODS[s.phase];
    if (t >= this.nextChord) {
      const len = 16 + Math.random() * 8;
      this.pad(mood.chords[this.chordI % mood.chords.length], t + 0.1, len);
      this.chordI += 1;
      this.nextChord = t + len * 0.62;
      this.padVoices = this.padVoices.filter((p) => p.stop > t);
    }
    if (t >= this.nextPhrase) {
      this.playPhrase(mood);
      this.nextPhrase = t + mood.gapMin + Math.random() * (mood.gapMax - mood.gapMin);
    }
  }
}
