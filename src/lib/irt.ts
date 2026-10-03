// ===== 項目反応理論(IRT)による実力推定・推定偏差値 =====
// 3パラメータロジスティックモデル P(θ) = c + (1-c) / (1 + exp(-1.7 a (θ - b)))
// θ は「小6（またはその学年）の標準的な生徒 = 0、標準偏差 = 1」の尺度。
// 推定偏差値 = 50 + 10θ

import type { Question } from '../content/types';

export interface ItemParams {
  a: number;
  b: number;
  c: number;
}

/** 難易度(1-5)と学年から b を決める。学年が上の問題はその分むずかしい */
export function itemParams(q: Pick<Question, 'difficulty' | 'grade' | 'type' | 'choices'>, baseGrade = 6): ItemParams {
  const b = (q.difficulty - 3) * 0.75 + (q.grade - baseGrade) * 0.8;
  let c = 0;
  if (q.type === 'choice') c = 1 / Math.max(2, q.choices?.length ?? 4);
  else if (q.type === 'tf') c = 0.5;
  else if (q.type === 'order') c = 0.05;
  // 当てずっぽうが混ざる形式は識別力を少し下げる
  const a = q.type === 'tf' ? 0.8 : q.type === 'choice' ? 1.0 : 1.2;
  return { a, b, c: c * 0.85 };
}

export function prob(theta: number, p: ItemParams): number {
  return p.c + (1 - p.c) / (1 + Math.exp(-1.7 * p.a * (theta - p.b)));
}

export function information(theta: number, p: ItemParams): number {
  const P = prob(theta, p);
  const Q = 1 - P;
  const k = 1.7 * p.a;
  return (k * k * Q * Math.pow(P - p.c, 2)) / (P * Math.pow(1 - p.c, 2));
}

export interface Response {
  p: ItemParams;
  correct: boolean;
}

const GRID: number[] = [];
for (let t = -4; t <= 4.0001; t += 0.05) GRID.push(+t.toFixed(2));

/** 事後分布の期待値推定 (EAP)。prior は正規分布 N(mu, sd) */
export function eap(responses: Response[], mu = 0, sd = 1): { theta: number; se: number } {
  let sumW = 0,
    sumT = 0,
    sumT2 = 0;
  for (const t of GRID) {
    let logL = -((t - mu) ** 2) / (2 * sd * sd);
    for (const r of responses) {
      const P = Math.min(0.9999, Math.max(0.0001, prob(t, r.p)));
      logL += Math.log(r.correct ? P : 1 - P);
    }
    const w = Math.exp(logL);
    sumW += w;
    sumT += w * t;
    sumT2 += w * t * t;
  }
  const theta = sumT / sumW;
  const se = Math.sqrt(Math.max(0, sumT2 / sumW - theta * theta));
  return { theta, se };
}

export const toDeviation = (theta: number) => Math.round(Math.min(80, Math.max(20, 50 + 10 * theta)) * 10) / 10;

/** 偏差値のめやすコメント */
export function deviationLabel(dev: number): string {
  if (dev >= 70) return 'トップクラス';
  if (dev >= 65) return 'とても優秀';
  if (dev >= 60) return '上位レベル';
  if (dev >= 55) return 'やや上位';
  if (dev >= 45) return '平均レベル';
  if (dev >= 40) return 'もう一歩';
  return '基礎からがんばろう';
}

/**
 * 日々の学習から実力を少しずつ更新する（オンライン推定：Elo 方式）
 * n が増えるほど 1 問あたりの変化を小さくする
 */
export function updateAbility(theta: number, n: number, p: ItemParams, correct: boolean): number {
  const P = prob(theta, p);
  const k = Math.max(0.06, 0.5 / Math.sqrt(1 + n / 4));
  const next = theta + k * ((correct ? 1 : 0) - P);
  return Math.max(-4, Math.min(4, next));
}

/**
 * 適応型テスト(CAT)で次の問題を選ぶ
 * - 現在の θ で情報量が最大の問題を候補にする
 * - 単元が偏らないように、出題数が少ない単元を優先する
 * - 上位数問からランダムに選び、毎回同じ問題にならないようにする
 */
export function selectNextItem<T extends { q: Question; p: ItemParams }>(
  pool: T[],
  theta: number,
  unitCounts: Record<string, number>,
  rng: () => number = Math.random,
): T | undefined {
  if (!pool.length) return undefined;
  const minCount = Math.min(...pool.map((x) => unitCounts[x.q.unit] ?? 0));
  const balanced = pool.filter((x) => (unitCounts[x.q.unit] ?? 0) <= minCount + 1);
  const scored = balanced
    .map((x) => ({ x, info: information(theta, x.p) }))
    .sort((a, b) => b.info - a.info)
    .slice(0, 4);
  return scored[Math.floor(rng() * scored.length)]?.x;
}
