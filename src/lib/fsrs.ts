// ===== 忘却曲線にもとづく復習スケジューラ (FSRS-4.5) =====
// 参考: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// Stability(S): 記憶の安定度（日）＝ 正答率90%を保てる日数
// Difficulty(D): 覚えにくさ 1〜10
// Retrievability(R): 今思い出せる確率

export type Rating = 1 | 2 | 3 | 4; // 1:Again(まちがい) 2:Hard 3:Good 4:Easy
export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';

export interface SrsState {
  state: CardStateName;
  stability: number;
  difficulty: number;
  due: number; // ms
  lastReview: number; // ms (0 = 未学習)
  reps: number;
  lapses: number;
}

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587,
  0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86400000;
const MIN = 60000;

export function newSrs(): SrsState {
  return { state: 'new', stability: 0, difficulty: 0, due: 0, lastReview: 0, reps: 0, lapses: 0 };
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const initS = (g: Rating) => Math.max(0.1, W[g - 1]);
const initD = (g: Rating) => clampD(W[4] - (g - 3) * W[5]);

export function retrievability(s: SrsState, now = Date.now()): number {
  if (s.state === 'new' || !s.lastReview || s.stability <= 0) return 0;
  const t = Math.max(0, (now - s.lastReview) / DAY);
  return Math.pow(1 + (FACTOR * t) / s.stability, DECAY);
}

/** 目標保持率 r を保つための間隔（日） */
export function intervalDays(stability: number, r = 0.9): number {
  return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

function nextD(d: number, g: Rating) {
  const dp = d - W[6] * (g - 3);
  return clampD(W[7] * initD(3) + (1 - W[7]) * dp);
}

function recallS(d: number, s: number, r: number, g: Rating) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetS(d: number, s: number, r: number) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}

/**
 * 回答結果から次の状態を計算する
 * @param retention 目標保持率（0.85〜0.95）
 */
export function schedule(prev: SrsState, g: Rating, now = Date.now(), retention = 0.9): SrsState {
  const s = { ...prev };
  if (prev.state === 'new' || !prev.lastReview) {
    s.stability = initS(g);
    s.difficulty = initD(g);
    s.state = g === 1 ? 'learning' : 'review';
  } else {
    const elapsedDays = (now - prev.lastReview) / DAY;
    const r = retrievability(prev, now);
    s.difficulty = nextD(prev.difficulty, g);
    if (g === 1) {
      s.stability = forgetS(prev.difficulty, prev.stability, r);
      s.lapses++;
      s.state = 'relearning';
    } else if (elapsedDays < 0.5) {
      // 同じ日の再回答は安定度をあまり伸ばさない（短期記憶の過大評価を防ぐ）
      s.stability = Math.max(prev.stability, prev.stability * (g === 2 ? 1.05 : g === 3 ? 1.15 : 1.3));
      if (prev.state === 'learning' || prev.state === 'relearning') s.state = g >= 3 ? 'review' : prev.state;
    } else {
      s.stability = recallS(prev.difficulty, prev.stability, r, g);
      s.state = 'review';
    }
  }
  s.reps++;
  s.lastReview = now;
  if (g === 1) {
    s.due = now + 10 * MIN; // まちがえたらすぐ（10分後）にもう一度
  } else if (s.state === 'learning' || s.state === 'relearning') {
    s.due = now + 60 * MIN;
  } else {
    const days = Math.min(365, Math.max(1, Math.round(intervalDays(s.stability, retention))));
    // 少しだけばらつかせて同じ日に集中しないようにする
    const fuzz = days > 3 ? Math.round((Math.random() - 0.5) * days * 0.1) : 0;
    s.due = startOfDay(now + (days + fuzz) * DAY) + 4 * 3600000; // その日の朝4時以降に期限
  }
  return s;
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 回答時間・ヒント使用から評価を自動で決める */
export function autoRating(correct: boolean, timeMs: number, expectedMs: number, usedHint = false): Rating {
  if (!correct) return 1;
  if (usedHint || timeMs > expectedMs * 2.2) return 2;
  if (timeMs < expectedMs * 0.45) return 4;
  return 3;
}

/** 記憶の段階（グラフ表示用） */
export type MemoryStage = 'new' | 'learning' | 'short' | 'mid' | 'long' | 'master';
export function memoryStage(s: SrsState): MemoryStage {
  if (s.state === 'new' || !s.lastReview) return 'new';
  if (s.state === 'learning' || s.state === 'relearning') return 'learning';
  if (s.stability < 4) return 'short';
  if (s.stability < 21) return 'mid';
  if (s.stability < 90) return 'long';
  return 'master';
}
export const STAGE_LABEL: Record<MemoryStage, string> = {
  new: '未学習',
  learning: '覚えかけ',
  short: '短期記憶',
  mid: '定着中',
  long: '長期記憶',
  master: 'マスター',
};
