// ===== 回答の記録：学習ログ・復習スケジュール・実力推定・XP をまとめて更新 =====
import type { Question, SubjectId } from '../content/types';
import { db, type Attempt, type CardRow, type DailyRow, type SessionLog, type StudyMode } from './db';
import { autoRating, newSrs, schedule, type Rating } from './fsrs';
import { itemParams, updateAbility } from './irt';
import type { ErrorType } from './normalize';
import { profile, settings } from './store';
import { bumpMissions, levelInfo, newBadges, touchStreak, xpForAnswer, type MissionMetric } from './game';
import { emit } from './events';
import { dayKey } from './util';
import { sfx } from './sound';

/** その問題をとくのにかかる標準的な時間（ms） */
export function expectedMs(q: Question): number {
  const base: Record<string, number> = { choice: 9000, tf: 6000, input: 15000, numeric: 25000, order: 18000, write: 15000 };
  let t = (base[q.type] ?? 12000) * (1 + (q.difficulty - 2) * 0.2);
  if (q.listening) t += 3000;
  if (q.prompt.length > 60) t += (q.prompt.length - 60) * 80;
  return t;
}

export interface AnswerEvent {
  q: Question;
  correct: boolean;
  given: string;
  timeMs: number;
  mode: StudyMode;
  usedHint?: boolean;
  error?: ErrorType;
  rating?: Rating;
  combo?: number;
  /** false のとき復習スケジュールを更新しない（同じセッション内の再出題など） */
  updateSrs?: boolean;
}

export interface RecordResult {
  xp: number;
  card: CardRow;
  error?: ErrorType;
}

const abilityKeys = (q: Question) => [q.subject, `${q.subject}|${q.unit}`];

export async function recordAnswer(e: AnswerEvent): Promise<RecordResult> {
  const now = Date.now();
  const day = dayKey(now);
  const { q } = e;
  const rating = e.rating ?? autoRating(e.correct, e.timeMs, expectedMs(q), e.usedHint);
  let error = e.error;
  if (!e.correct && !error) error = e.timeMs < 2500 && q.type !== 'tf' ? 'careless' : 'knowledge';
  if (!e.correct && error === 'calc' && e.timeMs < 3000) error = 'careless';

  const attempt: Attempt = {
    qid: q.id,
    subject: q.subject,
    unit: q.unit,
    grade: q.grade,
    correct: e.correct,
    rating,
    timeMs: Math.round(e.timeMs),
    ts: now,
    day,
    hour: new Date(now).getHours(),
    mode: e.mode,
    given: e.given?.slice(0, 120),
    error: e.correct ? undefined : error,
    usedHint: e.usedHint,
    difficulty: q.difficulty,
  };

  const xp = xpForAnswer(e.correct, q.difficulty, e.combo ?? 0);
  let card!: CardRow;

  await db.transaction('rw', [db.attempts, db.cards, db.abilities, db.abilityHistory, db.daily], async () => {
    await db.attempts.add(attempt);

    // --- 復習カード ---
    const prev = await db.cards.get(q.id);
    const base: CardRow = prev ?? {
      ...newSrs(),
      qid: q.id,
      subject: q.subject,
      unit: q.unit,
      correctCount: 0,
      wrongCount: 0,
      lastCorrect: false,
      updatedAt: now,
    };
    const srs = e.updateSrs === false ? base : schedule(base, rating, now, settings.get().retention);
    card = {
      ...base,
      ...srs,
      correctCount: base.correctCount + (e.correct ? 1 : 0),
      wrongCount: base.wrongCount + (e.correct ? 0 : 1),
      lastCorrect: e.correct,
      lastGiven: e.given?.slice(0, 120),
      lastError: e.correct ? base.lastError : error,
      resolved: e.correct ? base.resolved : false,
      updatedAt: now,
    };
    await db.cards.put(card);

    // --- 実力（θ）のオンライン推定 ---
    const params = itemParams(q, 6);
    for (const key of abilityKeys(q)) {
      const a = (await db.abilities.get(key)) ?? { key, theta: 0, n: 0, updatedAt: now };
      const theta = updateAbility(a.theta, a.n, params, e.correct);
      await db.abilities.put({ key, theta, n: a.n + 1, updatedAt: now });
      await db.abilityHistory.put({ key, day, theta, n: a.n + 1 });
    }

    // --- 日別集計 ---
    const d: DailyRow = (await db.daily.get(day)) ?? { day, count: 0, correct: 0, timeMs: 0, xp: 0, subjects: {} };
    d.count++;
    if (e.correct) d.correct++;
    d.timeMs += Math.min(e.timeMs, 120000);
    d.xp += xp;
    const s = d.subjects[q.subject] ?? { count: 0, correct: 0 };
    d.subjects[q.subject] = { count: s.count + 1, correct: s.correct + (e.correct ? 1 : 0) };
    await db.daily.put(d);
  });

  // --- プロフィール・ゲーム要素 ---
  const before = profile.get();
  const streakRes = touchStreak(before);
  const beforeLevel = levelInfo(before.xp).level;
  profile.set((p) => ({
    ...p,
    ...streakRes.profile,
    xp: p.xp + xp,
    totals: { ...p.totals, answered: p.totals.answered + 1, correct: p.totals.correct + (e.correct ? 1 : 0) },
    records: { ...p.records, maxCombo: Math.max(p.records.maxCombo, e.combo ?? 0) },
  }));
  if (streakRes.extended) emit({ type: 'streak', streak: streakRes.profile.streak, usedFreeze: streakRes.usedFreeze });

  const delta: Partial<Record<MissionMetric, number>> = { answered: 1, [`subject:${q.subject}`]: 1 };
  if (e.correct) delta.correct = 1;
  if (e.mode === 'review') delta.review = 1;
  if (e.mode === 'weak') delta.weak = 1;
  const missions = bumpMissions(delta, { combo: e.combo ?? 0 });
  missions.forEach((m) => emit({ type: 'mission', mission: m }));

  await afterXpChange(beforeLevel);
  return { xp, card, error };
}

/** レベルアップとバッジの判定 */
export async function afterXpChange(beforeLevel: number) {
  const p = profile.get();
  const li = levelInfo(p.xp);
  if (li.level > beforeLevel) {
    emit({ type: 'levelup', from: beforeLevel, to: li.level, title: li.title });
    sfx.levelUp();
  }
  const subjectsDone = new Set((await db.daily.toArray()).flatMap((d) => Object.keys(d.subjects))).size;
  const diags = await db.diagnostics.toArray();
  const maxDeviation = diags.reduce((m, d) => Math.max(m, d.deviation), 0);
  const earned = newBadges({ p, subjectsDone, maxDeviation, level: li.level });
  if (earned.length) {
    profile.set((pp) => ({ ...pp, badges: { ...pp.badges, ...Object.fromEntries(earned.map((b) => [b.id, Date.now()])) } }));
    earned.forEach((b) => emit({ type: 'badge', badge: b }));
  }
}

/** セッション（1セット）の終了を記録 */
export async function recordSession(log: Omit<SessionLog, 'id' | 'day' | 'xp'> & { xp?: number }) {
  const perfect = log.total >= 5 && log.correct === log.total && log.mode !== 'test';
  const bonus = log.total >= 5 ? 10 + (perfect ? 20 : 0) : 0;
  const beforeLevel = levelInfo(profile.get().xp).level;
  await db.sessions.add({ ...log, day: dayKey(log.startedAt), xp: (log.xp ?? 0) + bonus });
  profile.set((p) => ({
    ...p,
    xp: p.xp + bonus,
    totals: { ...p.totals, sessions: p.totals.sessions + 1, perfect: p.totals.perfect + (perfect ? 1 : 0) },
  }));
  const delta: Partial<Record<MissionMetric, number>> = { minutes: Math.round(log.durationMs / 60000) };
  if (perfect) delta.perfect = 1;
  if (log.mode === 'rapid' && log.correct >= log.total) delta.rapid = 1;
  bumpMissions(delta).forEach((m) => emit({ type: 'mission', mission: m }));
  await afterXpChange(beforeLevel);
  return { bonus, perfect };
}

export async function toggleFlag(q: Question): Promise<boolean> {
  const c = await db.cards.get(q.id);
  const flagged = !c?.flagged;
  if (c) await db.cards.update(q.id, { flagged });
  else
    await db.cards.put({
      ...newSrs(),
      qid: q.id,
      subject: q.subject as SubjectId,
      unit: q.unit,
      correctCount: 0,
      wrongCount: 0,
      lastCorrect: false,
      flagged,
      updatedAt: Date.now(),
    });
  return flagged;
}
