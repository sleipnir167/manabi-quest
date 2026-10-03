import { shuffle } from './util';

/** 正解とちがう候補をランダムに n 個 */
export function distractorsFrom(answer: string, pool: string[], n: number): string[] {
  return shuffle(Array.from(new Set(pool.filter((p) => p && p !== answer)))).slice(0, n);
}
