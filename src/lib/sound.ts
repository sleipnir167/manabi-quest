// ===== 効果音（Web Audio でその場で合成：音声ファイル不要・オフラインOK） =====
import { settings } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (!settings.get().sound) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    master!.gain.value = settings.get().volume * 0.6;
    return ctx;
  } catch {
    return null;
  }
}

/** iOS は最初のタップで AudioContext を解錠する必要がある */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(master!);
  s.start(0);
}

interface ToneOpt {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.3, delay = 0, attack = 0.005 }: ToneOpt) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.15, delay = 0, freq = 2000) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 3, t0 + dur);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

function vibrate(pattern: number | number[]) {
  if (!settings.get().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari は未対応 */
  }
}

export const sfx = {
  tap() {
    tone({ freq: 1200, to: 900, dur: 0.05, type: 'triangle', gain: 0.12 });
  },
  select() {
    tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.15 });
  },
  /** 正解音。コンボが続くほど音程が上がる */
  correct(combo = 0) {
    const base = 76 + Math.min(combo, 12);
    tone({ freq: NOTE(base), dur: 0.12, type: 'triangle', gain: 0.28 });
    tone({ freq: NOTE(base + 4), dur: 0.12, type: 'triangle', gain: 0.28, delay: 0.08 });
    tone({ freq: NOTE(base + 7), dur: 0.28, type: 'sine', gain: 0.25, delay: 0.16 });
    if (combo >= 3) tone({ freq: NOTE(base + 12), dur: 0.3, type: 'sine', gain: 0.12, delay: 0.24 });
    vibrate(15);
  },
  wrong() {
    tone({ freq: 220, to: 150, dur: 0.25, type: 'sawtooth', gain: 0.09 });
    tone({ freq: 196, to: 130, dur: 0.3, type: 'square', gain: 0.05, delay: 0.06 });
    vibrate([30, 40, 30]);
  },
  flip() {
    noise(0.12, 0.08, 0, 1500);
  },
  whoosh() {
    noise(0.2, 0.06, 0, 800);
  },
  tick() {
    tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.05 });
  },
  start() {
    [72, 76, 79].forEach((n, i) => tone({ freq: NOTE(n), dur: 0.12, type: 'triangle', gain: 0.2, delay: i * 0.07 }));
  },
  complete() {
    [72, 76, 79, 84].forEach((n, i) => tone({ freq: NOTE(n), dur: 0.22, type: 'triangle', gain: 0.22, delay: i * 0.11 }));
    tone({ freq: NOTE(88), dur: 0.6, type: 'sine', gain: 0.18, delay: 0.46 });
  },
  levelUp() {
    const seq = [67, 72, 76, 79, 84, 88, 91];
    seq.forEach((n, i) => tone({ freq: NOTE(n), dur: 0.16, type: 'square', gain: 0.1, delay: i * 0.07 }));
    tone({ freq: NOTE(96), dur: 0.8, type: 'triangle', gain: 0.2, delay: seq.length * 0.07 });
    vibrate([20, 30, 20, 30, 60]);
  },
  badge() {
    [84, 88, 91, 96].forEach((n, i) => tone({ freq: NOTE(n), dur: 0.25, type: 'sine', gain: 0.15, delay: i * 0.06 }));
    noise(0.4, 0.04, 0.1, 5000);
  },
  combo(n: number) {
    tone({ freq: NOTE(84 + Math.min(n, 15)), dur: 0.08, type: 'square', gain: 0.07 });
  },
  timeUp() {
    tone({ freq: NOTE(72), dur: 0.2, type: 'square', gain: 0.12 });
    tone({ freq: NOTE(67), dur: 0.2, type: 'square', gain: 0.12, delay: 0.2 });
    tone({ freq: NOTE(60), dur: 0.5, type: 'square', gain: 0.12, delay: 0.4 });
  },
};
