// ===== 解答の正規化と判定 =====
import type { Question } from '../content/types';
import { linearEquals, parseLinear, parseNumber, parseRatio, ratioEquals, ratioIsSimplest } from './frac';

export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 比較用に正規化：全角半角・カタカナ/ひらがな・空白・句読点・大文字小文字 */
export function normText(s: string): string {
  return kataToHira(
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s　]+/g, ' ')
      .trim()
      .replace(/[。、．，,.!?！？「」『』"'`’‘・〜~]/g, '')
      .replace(/\s+/g, ''),
  );
}

export type ErrorType =
  | 'reduce' // 約分忘れ
  | 'sign' // 符号ミス
  | 'unit' // 単位・形式
  | 'careless' // うっかり（速すぎる誤答）
  | 'knowledge' // 知識不足
  | 'calc' // 計算ミス
  | 'skip' // わからない
  | 'timeout';

export const ERROR_LABEL: Record<ErrorType, string> = {
  reduce: '約分わすれ',
  sign: '符号ミス',
  unit: '形式・単位',
  careless: 'うっかり',
  knowledge: '知識・理解不足',
  calc: '計算ミス',
  skip: 'わからない',
  timeout: '時間切れ',
};

export interface Judge {
  correct: boolean;
  /** 誤答の種類（判定できたとき） */
  error?: ErrorType;
  /** 判定の補足メッセージ */
  note?: string;
}

export function judge(q: Question, given: string): Judge {
  const raw = given ?? '';
  if (!raw.trim()) return { correct: false, error: 'skip' };
  switch (q.type) {
    case 'choice':
    case 'write':
      return { correct: normText(raw) === normText(q.answer) || (q.accept ?? []).some((a) => normText(a) === normText(raw)) };
    case 'tf':
      return { correct: raw === q.answer };
    case 'order':
      return { correct: raw === (q.choices ?? []).join('|') };
    case 'input': {
      const g = normText(raw);
      const ok = [q.answer, ...(q.accept ?? [])].some((a) => normText(a) === g);
      return { correct: ok };
    }
    case 'numeric':
      return judgeNumeric(q, raw);
  }
}

function judgeNumeric(q: Question, raw: string): Judge {
  const kind = q.numKind ?? 'num';
  if (kind === 'ratio') {
    const g = parseRatio(raw);
    const a = parseRatio(q.answer);
    if (!g || !a) return { correct: false, error: 'unit', note: '「3:4」のように比で答えよう' };
    if (!ratioEquals(g, a)) return { correct: false, error: 'calc' };
    if (q.requireSimplest !== false && !ratioIsSimplest(g))
      return { correct: false, error: 'reduce', note: 'できるだけ簡単な整数の比にしよう' };
    return { correct: true };
  }
  if (kind === 'expr') {
    const g = parseLinear(raw);
    const a = parseLinear(q.answer);
    if (!g || !a) return { correct: false, error: 'unit', note: '式の形で答えよう（例: 2x+3）' };
    if (linearEquals(g, a)) return { correct: true };
    // 一部の項だけ符号が違う → 符号ミス
    const keys = new Set([...Object.keys(a), ...Object.keys(g)]);
    let signOnly = true;
    for (const k of keys) {
      const x = g[k],
        y = a[k];
      if (!x || !y) {
        signOnly = false;
        break;
      }
      if (!x.eq(y) && !x.eq(y.neg())) signOnly = false;
    }
    return { correct: false, error: signOnly ? 'sign' : 'calc' };
  }
  const g = parseNumber(raw);
  const accepted = [q.answer, ...(q.accept ?? [])].map(parseNumber).filter(Boolean) as NonNullable<
    ReturnType<typeof parseNumber>
  >[];
  if (!g) return { correct: false, error: 'unit', note: '数で答えよう' };
  const hit = accepted.find((a) => a.value.eq(g.value));
  if (hit) {
    if (g.isFraction && !g.reduced && q.requireSimplest !== false && !g.value.isInt())
      return { correct: false, error: 'reduce', note: '約分できるよ！最後まで約分しよう' };
    if (g.isFraction && g.value.isInt() && q.requireSimplest !== false)
      return { correct: false, error: 'reduce', note: `整数になおせるよ（${g.value.n}）` };
    return { correct: true };
  }
  if (accepted.some((a) => a.value.eq(g.value.neg()) && a.value.n !== 0)) return { correct: false, error: 'sign' };
  return { correct: false, error: 'calc' };
}
