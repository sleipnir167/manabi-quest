// ===== 音声読み上げ (TTS) と音声認識 (STT) =====
// ブラウザ標準の Web Speech API を使うので無料。
// iPad: Safari の読み上げ（Kyoko/Samantha など）、Pixel: Chrome の Google 音声。
import { settings } from './store';

type Lang = 'ja' | 'en';

const PREFERRED: Record<Lang, string[]> = {
  ja: ['Kyoko', 'O-Ren', 'Otoya', 'Hattori', 'Google 日本語', 'Microsoft Nanami', 'Microsoft Ayumi'],
  en: ['Samantha', 'Google US English', 'Ava', 'Allison', 'Alex', 'Microsoft Aria', 'Karen', 'Daniel'],
};

let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices() {
  try {
    voicesCache = window.speechSynthesis?.getVoices() ?? [];
  } catch {
    voicesCache = [];
  }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!voicesCache.length) loadVoices();
  const prefix = lang === 'ja' ? 'ja' : 'en';
  return voicesCache.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const list = voicesFor(lang);
  const chosen = lang === 'ja' ? settings.get().tts.jaVoice : settings.get().tts.enVoice;
  if (chosen) {
    const v = list.find((v) => v.name === chosen);
    if (v) return v;
  }
  for (const name of PREFERRED[lang]) {
    const v = list.find((v) => v.name.includes(name));
    if (v) return v;
  }
  if (lang === 'en') return list.find((v) => v.lang === 'en-US') ?? list[0];
  return list[0];
}

/** 問題文の記法を読み上げ用の日本語に変換 */
export function toSpeechText(s: string): string {
  return s
    .replace(/\[\[(-?\d+)\s+([^/\]]+)\/([^\]]+)\]\]/g, '$1と$3ぶんの$2')
    .replace(/\[\[([^/\]]+)\/([^\]]+)\]\]/g, '$2ぶんの$1')
    .replace(/__|\*\*/g, '')
    .replace(/×/g, 'かける')
    .replace(/÷/g, 'わる')
    .replace(/□/g, 'しかく')
    .replace(/（　*）|\(\s*\)/g, 'かっこ')
    .replace(/cm²/g, '平方センチメートル')
    .replace(/m²/g, '平方メートル')
    .replace(/cm³/g, '立方センチメートル')
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, '。');
}

export function speak(text: string, lang: Lang = 'ja', rateMul = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text) return resolve();
    try {
      const u = new SpeechSynthesisUtterance(lang === 'ja' ? toSpeechText(text) : text.replace(/__|\*\*/g, ''));
      u.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.rate = Math.min(2, Math.max(0.5, settings.get().tts.rate * rateMul * (lang === 'en' ? 0.95 : 1.05)));
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      // iOS で onend が来ないことがある保険
      setTimeout(resolve, 2500 + text.length * 250);
    } catch {
      resolve();
    }
  });
}

/** iOS は最初の読み上げをタップの中で行う必要があるので、最初のタップで空の発声をしておく */
let primed = false;
export function primeSpeech() {
  if (primed || !ttsSupported()) return;
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

export function stopSpeak() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}

// ---------- 音声認識 ----------
interface SRLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSR(): (new () => SRLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const sttSupported = () => typeof window !== 'undefined' && !!getSR();

export interface ListenHandle {
  result: Promise<string[]>;
  stop: () => void;
}

/** 音声認識。候補（複数）を返す */
export function listen(lang: Lang, onInterim?: (t: string) => void): ListenHandle {
  const SR = getSR();
  if (!SR) return { result: Promise.reject(new Error('この端末は音声入力に対応していません')), stop: () => {} };
  const rec = new SR();
  rec.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  let finals: string[] = [];
  let last = '';
  const result = new Promise<string[]>((resolve, reject) => {
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const alts: string[] = [];
      for (let i = 0; i < res.length; i++) alts.push(res[i].transcript.trim());
      last = alts[0] ?? '';
      onInterim?.(last);
      if (res.isFinal) finals = alts;
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') resolve(finals.length ? finals : last ? [last] : []);
      else reject(new Error(e.error === 'not-allowed' ? 'マイクの使用が許可されていません' : `音声認識エラー: ${e.error}`));
    };
    rec.onend = () => resolve(finals.length ? finals : last ? [last] : []);
  });
  try {
    rec.start();
  } catch (e) {
    return { result: Promise.reject(e), stop: () => {} };
  }
  return { result, stop: () => rec.stop() };
}

/** 英語の発音チェック：認識候補のどれかが目標と一致するか */
export function pronunciationMatch(target: string, candidates: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const t = norm(target);
  return candidates.some((c) => {
    const n = norm(c);
    return n === t || n.split(' ').includes(t) || (t.includes(' ') && n.includes(t));
  });
}
