// ===== 問題データを短く書くためのヘルパー =====
import type { Question, SubjectId } from './types';
import { hash, mulberry32, shuffle, type Rng } from '../lib/util';

export type Draft = Omit<Question, 'id' | 'subject' | 'grade' | 'unit' | 'difficulty'> & { difficulty?: number };
type Extra = Partial<Question>;

/** 選択式：choices の先頭が正解 */
export const C = (prompt: string, choices: string[], explanation?: string, difficulty = 2, extra: Extra = {}): Draft => ({
  type: 'choice',
  prompt,
  choices,
  answer: choices[0],
  explanation,
  difficulty,
  ...extra,
});

/** ○×問題 */
export const TF = (prompt: string, truth: boolean, explanation?: string, difficulty = 2, extra: Extra = {}): Draft => ({
  type: 'tf',
  prompt,
  answer: truth ? 'o' : 'x',
  explanation,
  difficulty,
  ...extra,
});

/** 入力問題：answer が配列なら先頭が正解・残りは別解 */
export const I = (
  prompt: string,
  answer: string | string[],
  explanation?: string,
  difficulty = 2,
  extra: Extra = {},
): Draft => {
  const a = Array.isArray(answer) ? answer : [answer];
  return { type: 'input', prompt, answer: a[0], accept: a.slice(1), explanation, difficulty, ...extra };
};

/** 数値入力 */
export const N = (prompt: string, answer: string, explanation?: string, difficulty = 2, extra: Extra = {}): Draft => ({
  type: 'numeric',
  prompt,
  answer,
  explanation,
  difficulty,
  ...extra,
});

/** 並べ替え：items は正しい順番 */
export const O = (prompt: string, items: string[], explanation?: string, difficulty = 3, extra: Extra = {}): Draft => ({
  type: 'order',
  prompt,
  choices: items,
  answer: items.join('|'),
  explanation,
  difficulty,
  ...extra,
});

export function bank(subject: SubjectId, grade: number, unit: string, drafts: Draft[]): Question[] {
  return drafts.map((d) => ({
    ...d,
    difficulty: d.difficulty ?? 2,
    subject,
    grade,
    unit,
    id: `${unit}-${hash(d.prompt + '|' + d.answer)}`,
    source: 'builtin',
  }));
}

/** 同じグループの中から誤答の選択肢を選ぶ（安定した乱数で毎回同じ） */
export function distractors(answer: string, pool: string[], n: number, seedText: string): string[] {
  const rng = mulberry32(parseInt(hash(seedText), 36));
  const uniq = Array.from(new Set(pool.filter((p) => p !== answer)));
  return shuffle(uniq, rng).slice(0, n);
}

export const seeded = (s: string): Rng => mulberry32(parseInt(hash(s), 36));

// ---- ひらがな読みの「それっぽい」誤答を作る（漢字の読み問題用） ----
const DAKU: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const UNDAKU: Record<string, string> = Object.fromEntries(Object.entries(DAKU).map(([a, b]) => [b, a]));
const O_ROW = 'おこごそぞとどのほぼぽもよょろを';
const U_ROW = 'うくぐすずつづぬふぶぷむゆゅる';

export function kanaVariants(reading: string, n: number, seedText: string): string[] {
  const rng = seeded(seedText);
  const out = new Set<string>();
  const chars = [...reading];
  const tries = 60;
  for (let t = 0; t < tries && out.size < n; t++) {
    const c = chars.slice();
    const i = Math.floor(rng() * c.length);
    const r = rng();
    if (r < 0.3 && (DAKU[c[i]] || UNDAKU[c[i]])) c[i] = DAKU[c[i]] ?? UNDAKU[c[i]];
    else if (r < 0.5 && c[i + 1] === 'う' && (O_ROW.includes(c[i]) || U_ROW.includes(c[i]) || 'ょゅ'.includes(c[i])))
      c.splice(i + 1, 1);
    else if (r < 0.65 && (O_ROW.includes(c[i]) || 'ょゅ'.includes(c[i])) && c[i + 1] !== 'う') c.splice(i + 1, 0, 'う');
    else if (r < 0.78 && c[i] === 'っ') c.splice(i, 1);
    else if (r < 0.88 && i < c.length - 1 && 'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(c[i + 1]) && c[i] !== 'っ')
      c.splice(i + 1, 0, 'っ');
    else if (c[i] === 'ゅ') c[i] = 'ょ';
    else if (c[i] === 'ょ') c[i] = 'ゅ';
    else if (c[i] === 'ん' && i > 0) c.splice(i, 1);
    else continue;
    const s = c.join('');
    if (s !== reading && s.length >= 1) out.add(s);
  }
  return [...out].slice(0, n);
}
