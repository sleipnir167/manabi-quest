// ===== 出題の組み立て =====
// 方針
//  - 期限が来た復習（忘れかけ）を最優先。思い出せる確率が低い順
//  - まちがえた問題・苦手な問題は多めに
//  - 新しい問題は「今の実力に合った難しさ」を優先
//  - 教科・単元を混ぜて出す（インターリーブ学習：記憶に残りやすい）
import type { Question, SubjectId } from '../content/types';
import { allQuestions, getQuestion, instantiate } from '../content/registry';
import { db, type CardRow } from './db';
import { retrievability } from './fsrs';
import { settings } from './store';
import { shuffle, weightedSample } from './util';

export type SessionKind = 'smart' | 'review' | 'weak' | 'new' | 'unit' | 'retry' | 'flagged' | 'mistakes';

export interface SessionSpec {
  kind: SessionKind;
  subject?: SubjectId;
  units?: string[];
  qids?: string[];
  size?: number;
  /** 生成問題（計算）を含めるか */
  includeGen?: boolean;
}

export interface Pool {
  q: Question;
  card?: CardRow;
  r: number;
}

export function scopeQuestions(spec: Pick<SessionSpec, 'subject' | 'units' | 'includeGen'>, opts: { maxGrade?: number } = {}) {
  const maxGrade = opts.maxGrade ?? settings.get().grade;
  return allQuestions().filter((q) => {
    if (spec.units?.length) return spec.units.includes(q.unit) && (spec.includeGen !== false || !q.gen);
    if (spec.subject && q.subject !== spec.subject) return false;
    if (spec.includeGen === false && q.gen) return false;
    return q.grade <= maxGrade;
  });
}

export async function withCards(qs: Question[]): Promise<Pool[]> {
  const cards = await db.cards.bulkGet(qs.map((q) => q.id));
  const now = Date.now();
  return qs.map((q, i) => ({ q, card: cards[i], r: cards[i] ? retrievability(cards[i]!, now) : 0 }));
}

const isSeen = (p: Pool) => !!p.card && p.card.reps > 0;
const isDue = (p: Pool, now: number) => isSeen(p) && p.card!.due <= now;
const wrongRate = (p: Pool) => (p.card ? p.card.wrongCount / Math.max(1, p.card.wrongCount + p.card.correctCount) : 0);
const isWeak = (p: Pool) => isSeen(p) && (!p.card!.lastCorrect || p.card!.lapses >= 2 || wrongRate(p) >= 0.4);

/** 教科ごとの実力から、新しい問題の「ちょうどよい難しさ」を決める */
async function targetDifficulty(): Promise<Record<string, number>> {
  const ab = await db.abilities.toArray();
  const out: Record<string, number> = {};
  for (const a of ab) if (!a.key.includes('|')) out[a.key] = Math.min(5, Math.max(1, 2.6 + a.theta / 0.75));
  return out;
}

function interleave(list: Question[]): Question[] {
  // 同じ問題・同じ単元が連続しにくいように並べる
  const out: Question[] = [];
  const rest = shuffle(list);
  while (rest.length) {
    const last = out[out.length - 1];
    let idx = rest.findIndex((q) => !last || (q.id !== last.id && q.unit !== last.unit));
    if (idx < 0) idx = rest.findIndex((q) => !last || q.id !== last.id);
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

export async function buildSession(spec: SessionSpec): Promise<Question[]> {
  const size = spec.size ?? settings.get().sessionSize;
  const now = Date.now();

  if (spec.kind === 'retry' && spec.qids) {
    return spec.qids.map((id) => getQuestion(id)).filter(Boolean).map((q) => instantiate(q!));
  }
  if (spec.kind === 'flagged') {
    const cards = await db.cards.filter((c) => !!c.flagged).toArray();
    return shuffle(cards.map((c) => getQuestion(c.qid)).filter(Boolean) as Question[])
      .slice(0, size)
      .map((q) => instantiate(q));
  }
  if (spec.kind === 'mistakes') {
    const cards = await db.cards.filter((c) => c.wrongCount > 0 && !c.resolved && (!spec.subject || c.subject === spec.subject)).toArray();
    const qs = cards
      .sort((a, b) => Number(a.lastCorrect) - Number(b.lastCorrect) || b.wrongCount - a.wrongCount)
      .map((c) => getQuestion(c.qid))
      .filter(Boolean) as Question[];
    return interleave(qs.slice(0, size)).map((q) => instantiate(q));
  }

  const scope = scopeQuestions(spec, { maxGrade: spec.units?.length ? 9 : settings.get().grade });
  const pool = await withCards(scope);
  const targets = await targetDifficulty();

  const due = pool.filter((p) => isDue(p, now)).sort((a, b) => a.r - b.r);
  const weak = pool.filter((p) => isWeak(p) && !isDue(p, now));
  const fresh = pool.filter((p) => !isSeen(p));
  const seen = pool.filter((p) => isSeen(p) && !isDue(p, now));

  const chosen: Question[] = [];
  const used = new Set<string>();
  const take = (list: Pool[], n: number) => {
    for (const p of list) {
      if (chosen.length >= size || n <= 0) break;
      if (used.has(p.q.id)) continue;
      used.add(p.q.id);
      chosen.push(p.q);
      n--;
    }
  };
  const newWeight = (p: Pool) => {
    const t = targets[p.q.subject] ?? 2.5;
    return Math.exp(-Math.abs(p.q.difficulty - t) * 0.9) * (p.q.gen ? 0.8 : 1);
  };
  const weakWeight = (p: Pool) => 1 + wrongRate(p) * 3 + (1 - p.r) * 2 + (p.card?.lapses ?? 0) * 0.5;

  switch (spec.kind) {
    case 'review':
      take(due, size);
      take(
        seen.slice().sort((a, b) => a.r - b.r),
        size,
      );
      break;
    case 'weak':
      take(weightedSample(weak, weakWeight, size), size);
      take(due, size);
      take(weightedSample(seen, weakWeight, size), size);
      break;
    case 'new':
      take(weightedSample(fresh, newWeight, size), size);
      break;
    default: {
      // smart / unit：復習 50%、苦手 20%、新規 30% を目安に
      take(due, Math.ceil(size * 0.5));
      take(weightedSample(weak, weakWeight, Math.ceil(size * 0.2)), Math.ceil(size * 0.2));
      if (spec.kind === 'smart' && !spec.subject && !spec.units?.length) {
        // 全教科おまかせ：問題数の多い教科にかたよらないよう、教科を順番に回して新しい問題を選ぶ
        const bySubject = new Map<string, Pool[]>();
        for (const p of fresh) bySubject.set(p.q.subject, [...(bySubject.get(p.q.subject) ?? []), p]);
        const order = shuffle([...bySubject.keys()]);
        const picks = new Map(order.map((s) => [s, weightedSample(bySubject.get(s)!, newWeight, size)]));
        for (let round = 0; chosen.length < size && round < size; round++) {
          for (const s of order) {
            if (chosen.length >= size) break;
            const next = picks.get(s)!.find((p) => !used.has(p.q.id));
            if (next) take([next], 1);
          }
        }
      }
      take(weightedSample(fresh, newWeight, size), size - chosen.length);
      take(weightedSample(seen, weakWeight, size), size - chosen.length);
    }
  }

  // 生成問題しかない単元などで足りないときは、生成カードを繰り返し使う
  if (chosen.length < size) {
    const gens = pool.filter((p) => p.q.gen);
    if (gens.length) {
      const extra = weightedSample(gens, (p) => 1 + (1 - p.r) + newWeight(p), gens.length);
      let i = 0;
      while (chosen.length < size && extra.length) chosen.push(extra[i++ % extra.length].q);
    }
  }

  // おまかせ（全教科）のときは教科のかたよりをおさえる
  let final = chosen;
  if (spec.kind === 'smart' && !spec.subject && !spec.units) {
    const per: Record<string, number> = {};
    final = chosen.filter((q) => (per[q.subject] = (per[q.subject] ?? 0) + 1) <= Math.ceil(size * 0.4));
    if (final.length < size) final = [...final, ...chosen.filter((q) => !final.includes(q))].slice(0, size);
  }
  return interleave(final).map((q) => instantiate(q));
}

/** 単元の統計（学習画面のリスト用） */
export interface UnitStat {
  unit: string;
  total: number;
  seen: number;
  mastered: number;
  due: number;
  accuracy: number | null;
  avgR: number;
  /** 習熟度スコアの合計（正解して記憶が長持ちしている問題ほど 1 に近い） */
  score: number;
  hasGen: boolean;
}

export async function unitStats(subject?: SubjectId): Promise<Record<string, UnitStat>> {
  const qs = allQuestions().filter((q) => !subject || q.subject === subject);
  const pool = await withCards(qs);
  const now = Date.now();
  const out: Record<string, UnitStat> = {};
  for (const p of pool) {
    const s = (out[p.q.unit] ??= { unit: p.q.unit, total: 0, seen: 0, mastered: 0, due: 0, accuracy: null, avgR: 0, score: 0, hasGen: false });
    s.total++;
    if (p.q.gen) s.hasGen = true;
    if (isSeen(p)) {
      s.seen++;
      s.avgR += p.r;
      if (p.card!.lastCorrect) s.score += p.r * (0.45 + 0.55 * Math.min(1, p.card!.stability / 21));
      if (p.card!.stability >= 21 || (p.card!.reps >= 3 && p.r >= 0.9 && p.card!.lastCorrect)) s.mastered++;
      if (isDue(p, now)) s.due++;
      const c = p.card!.correctCount,
        w = p.card!.wrongCount;
      s.accuracy = (s.accuracy ?? 0) + c / Math.max(1, c + w);
    }
  }
  for (const s of Object.values(out)) {
    if (s.seen) {
      s.avgR /= s.seen;
      s.accuracy = (s.accuracy ?? 0) / s.seen;
    }
  }
  return out;
}

/** 習熟度 0〜1：正解できて、しかも長く覚えていられる問題の割合 */
export const masteryOf = (s?: UnitStat) => (s && s.total ? Math.min(1, s.score / s.total) : 0);

export async function dueCount(subject?: SubjectId): Promise<number> {
  const now = Date.now();
  return db.cards
    .where('due')
    .belowOrEqual(now)
    .filter((c) => c.reps > 0 && (!subject || c.subject === subject) && !!getQuestion(c.qid))
    .count();
}
