// ===== 学習記録の集計（記録・分析画面／AIレポート用） =====
import { SUBJECTS, type SubjectId } from '../content/types';
import { getQuestion, unitName } from '../content/registry';
import { db, type Attempt, type DailyRow } from './db';
import { memoryStage, retrievability, type MemoryStage } from './fsrs';
import { toDeviation } from './irt';
import type { ErrorType } from './normalize';
import { settings } from './store';
import { addDays, dayKey } from './util';

/** 学年に合わせた推定偏差値（θ は小6基準で保存している） */
export const deviationFor = (theta: number, grade = settings.get().grade) => toDeviation(theta - 0.8 * (grade - 6));

export async function dailyRange(days: number): Promise<DailyRow[]> {
  const today = dayKey();
  const from = addDays(today, -(days - 1));
  const rows = await db.daily.where('day').between(from, today, true, true).toArray();
  const map = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    return map.get(d) ?? { day: d, count: 0, correct: 0, timeMs: 0, xp: 0, subjects: {} };
  });
}

export async function attemptsSince(days: number): Promise<Attempt[]> {
  const since = Date.now() - days * 86400000;
  return db.attempts.where('ts').aboveOrEqual(since).toArray();
}

export interface SubjectSummary {
  subject: SubjectId;
  answered: number;
  correct: number;
  theta: number | null;
  n: number;
  deviation: number | null;
}

export async function subjectSummaries(days = 3650): Promise<SubjectSummary[]> {
  const rows = await dailyRange(Math.min(days, 400));
  const ab = await db.abilities.bulkGet(SUBJECTS.map((s) => s.id));
  return SUBJECTS.map((s, i) => {
    let answered = 0,
      correct = 0;
    for (const r of rows) {
      const x = r.subjects[s.id];
      if (x) {
        answered += x.count;
        correct += x.correct;
      }
    }
    const a = ab[i];
    const reliable = a && a.n >= 8;
    return {
      subject: s.id,
      answered,
      correct,
      theta: a ? a.theta : null,
      n: a?.n ?? 0,
      deviation: reliable ? deviationFor(a!.theta) : null,
    };
  });
}

/** 推定偏差値の推移（日ごと） */
export async function abilityTrend(key: string, days = 60): Promise<{ day: string; deviation: number }[]> {
  const from = addDays(dayKey(), -days);
  const rows = await db.abilityHistory.where('key').equals(key).toArray();
  return rows
    .filter((r) => r.day >= from && r.n >= 5)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ day: r.day, deviation: deviationFor(r.theta) }));
}

export async function memoryStages(subject?: SubjectId): Promise<Record<MemoryStage, number>> {
  const cards = await db.cards.toArray();
  const out: Record<MemoryStage, number> = { new: 0, learning: 0, short: 0, mid: 0, long: 0, master: 0 };
  for (const c of cards) {
    if (subject && c.subject !== subject) continue;
    if (!getQuestion(c.qid) || c.reps === 0) continue;
    out[memoryStage(c)]++;
  }
  return out;
}

/** 今後7日間の復習予定 */
export async function dueForecast(days = 7): Promise<{ day: string; count: number }[]> {
  const today = dayKey();
  const cards = await db.cards.filter((c) => c.reps > 0).toArray();
  const out = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i), count: 0 }));
  for (const c of cards) {
    const d = dayKey(c.due);
    const idx = d <= today ? 0 : out.findIndex((o) => o.day === d);
    if (idx >= 0) out[idx].count++;
  }
  return out;
}

export async function errorBreakdown(days = 30): Promise<Partial<Record<ErrorType, number>>> {
  const at = await attemptsSince(days);
  const out: Partial<Record<ErrorType, number>> = {};
  for (const a of at) if (!a.correct && a.error) out[a.error] = (out[a.error] ?? 0) + 1;
  return out;
}

export async function hourlyAccuracy(days = 60): Promise<{ hour: number; count: number; acc: number }[]> {
  const at = await attemptsSince(days);
  const bins = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, correct: 0 }));
  for (const a of at) {
    bins[a.hour].count++;
    if (a.correct) bins[a.hour].correct++;
  }
  return bins.map((b) => ({ hour: b.hour, count: b.count, acc: b.count ? b.correct / b.count : 0 }));
}

export interface WeakUnit {
  unit: string;
  name: string;
  subject: SubjectId;
  attempts: number;
  acc: number;
  score: number;
}

/** 苦手単元（直近の正答率が低く、ある程度といている単元） */
export async function weakUnits(days = 45, limit = 5): Promise<WeakUnit[]> {
  const at = await attemptsSince(days);
  const map = new Map<string, { subject: SubjectId; n: number; c: number }>();
  for (const a of at) {
    const m = map.get(a.unit) ?? { subject: a.subject, n: 0, c: 0 };
    m.n++;
    if (a.correct) m.c++;
    map.set(a.unit, m);
  }
  return [...map.entries()]
    .filter(([, v]) => v.n >= 4)
    .map(([unit, v]) => {
      const acc = v.c / v.n;
      return { unit, name: unitName(unit), subject: v.subject, attempts: v.n, acc, score: (1 - acc) * Math.log(1 + v.n) };
    })
    .filter((w) => w.acc < 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function strongUnits(days = 45, limit = 3): Promise<WeakUnit[]> {
  const at = await attemptsSince(days);
  const map = new Map<string, { subject: SubjectId; n: number; c: number }>();
  for (const a of at) {
    const m = map.get(a.unit) ?? { subject: a.subject, n: 0, c: 0 };
    m.n++;
    if (a.correct) m.c++;
    map.set(a.unit, m);
  }
  return [...map.entries()]
    .filter(([, v]) => v.n >= 6)
    .map(([unit, v]) => ({ unit, name: unitName(unit), subject: v.subject, attempts: v.n, acc: v.c / v.n, score: (v.c / v.n) * Math.log(1 + v.n) }))
    .filter((w) => w.acc >= 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function avgRetention(): Promise<number | null> {
  const cards = await db.cards.filter((c) => c.reps > 0).toArray();
  if (!cards.length) return null;
  const now = Date.now();
  return cards.reduce((s, c) => s + retrievability(c, now), 0) / cards.length;
}

/** AIレポートに渡すための、小さくまとめた学習データ（トークン節約） */
export async function compactSummary(days = 7) {
  const daily = await dailyRange(days);
  const prev = (await dailyRange(days * 2)).slice(0, days);
  const sum = (rows: DailyRow[]) => rows.reduce((a, r) => ({ n: a.n + r.count, c: a.c + r.correct, t: a.t + r.timeMs }), { n: 0, c: 0, t: 0 });
  const cur = sum(daily),
    pre = sum(prev);
  const subjects = await subjectSummaries(days);
  const weak = await weakUnits(30, 4);
  const strong = await strongUnits(30, 3);
  const errors = await errorBreakdown(days * 2);
  const hours = await hourlyAccuracy(30);
  const best = hours.filter((h) => h.count >= 10).sort((a, b) => b.acc - a.acc)[0];
  const diag = await db.diagnostics.orderBy('ts').reverse().limit(5).toArray();
  const trend: Record<string, number | null> = {};
  for (const s of SUBJECTS) {
    const t = await abilityTrend(s.id, 30);
    trend[s.id] = t.length >= 2 ? Math.round((t[t.length - 1].deviation - t[0].deviation) * 10) / 10 : null;
  }
  return {
    期間: `${days}日間`,
    学習日数: daily.filter((d) => d.count > 0).length,
    解いた問題: cur.n,
    正答率: cur.n ? Math.round((cur.c / cur.n) * 100) : null,
    学習時間_分: Math.round(cur.t / 60000),
    前の期間の問題数: pre.n,
    前の期間の正答率: pre.n ? Math.round((pre.c / pre.n) * 100) : null,
    教科別: subjects.map((s) => ({
      教科: SUBJECTS.find((x) => x.id === s.subject)!.name,
      問題数: s.answered,
      正答率: s.answered ? Math.round((s.correct / s.answered) * 100) : null,
      推定偏差値: s.deviation,
      偏差値の変化_30日: trend[s.subject],
    })),
    苦手単元: weak.map((w) => `${w.name}（正答率${Math.round(w.acc * 100)}%）`),
    得意単元: strong.map((w) => `${w.name}（正答率${Math.round(w.acc * 100)}%）`),
    ミスの種類: errors,
    最も正答率が高い時間帯: best ? `${best.hour}時台（${Math.round(best.acc * 100)}%）` : null,
    最近の実力診断: diag.map((d) => ({ 日付: d.day, 教科: SUBJECTS.find((x) => x.id === d.subject)?.name, 偏差値: d.deviation })),
  };
}
