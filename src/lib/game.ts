// ===== ゲーミフィケーション：XP・レベル・称号・バッジ・デイリーミッション =====
import { SUBJECTS, type SubjectId } from '../content/types';
import { profile, settings, type Profile } from './store';
import { addDays, dayDiff, dayKey, hash, mulberry32, shuffle } from './util';

// ---------- レベル ----------
export const xpToNext = (level: number) => 80 + level * 40;

export function levelInfo(xp: number) {
  let level = 1;
  let rest = xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, need: xpToNext(level), title: titleFor(level) };
}

const TITLES: [number, string][] = [
  [1, '見習い学者'],
  [3, 'がんばり屋'],
  [5, '知識の探検家'],
  [8, 'ひらめきハンター'],
  [12, '学びの戦士'],
  [16, '物知り博士'],
  [20, '知恵の賢者'],
  [25, '天才軍師'],
  [30, '伝説の学者'],
  [40, '学びの神'],
];
export function titleFor(level: number) {
  let t = TITLES[0][1];
  for (const [lv, name] of TITLES) if (level >= lv) t = name;
  return t;
}

/** 1問あたりの XP */
export function xpForAnswer(correct: boolean, difficulty: number, combo: number) {
  if (!correct) return 2;
  return 10 + Math.max(0, difficulty - 2) * 2 + Math.min(5, Math.floor(combo / 2));
}

// ---------- ストリーク ----------
/** 今日はじめて学習したときに呼ぶ。ストリークを更新する */
export function touchStreak(p: Profile): { profile: Profile; usedFreeze: boolean; extended: boolean } {
  const today = dayKey();
  if (p.lastActiveDay === today) return { profile: p, usedFreeze: false, extended: false };
  const gap = p.lastActiveDay ? dayDiff(p.lastActiveDay, today) : 999;
  let streak = 1;
  let freezes = p.freezes;
  let usedFreeze = false;
  if (gap === 1) streak = p.streak + 1;
  else if (gap === 2 && freezes > 0) {
    streak = p.streak + 1;
    freezes--;
    usedFreeze = true;
  }
  // 7日ごとに「おやすみチケット」を1枚（最大2枚）
  if (streak > 0 && streak % 7 === 0) freezes = Math.min(2, freezes + 1);
  return {
    profile: { ...p, streak, bestStreak: Math.max(p.bestStreak, streak), lastActiveDay: today, freezes },
    usedFreeze,
    extended: true,
  };
}

/** 表示用：今日まだ学習していなくても、昨日までのストリークは生きている */
export function currentStreak(p: Profile): number {
  const today = dayKey();
  if (!p.lastActiveDay) return 0;
  const gap = dayDiff(p.lastActiveDay, today);
  if (gap <= 1) return p.streak;
  if (gap === 2 && p.freezes > 0) return p.streak;
  return 0;
}

// ---------- バッジ ----------
export interface BadgeCtx {
  p: Profile;
  subjectsDone: number;
  maxDeviation: number;
  level: number;
}
export interface Badge {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (c: BadgeCtx) => boolean;
}

export const BADGES: Badge[] = [
  { id: 'first', name: 'はじめの一歩', desc: 'はじめて問題をといた', icon: '🌱', check: (c) => c.p.totals.answered >= 1 },
  { id: 'q100', name: '100問チャレンジャー', desc: '合計100問とく', icon: '💯', check: (c) => c.p.totals.answered >= 100 },
  { id: 'q500', name: '500問マスター', desc: '合計500問とく', icon: '📚', check: (c) => c.p.totals.answered >= 500 },
  { id: 'q1000', name: '千問の達人', desc: '合計1000問とく', icon: '🏯', check: (c) => c.p.totals.answered >= 1000 },
  { id: 'q5000', name: '五千問の伝説', desc: '合計5000問とく', icon: '🐉', check: (c) => c.p.totals.answered >= 5000 },
  { id: 'streak3', name: '三日坊主卒業', desc: '3日連続で学習', icon: '🔥', check: (c) => c.p.bestStreak >= 3 },
  { id: 'streak7', name: '1週間つづいた', desc: '7日連続で学習', icon: '📅', check: (c) => c.p.bestStreak >= 7 },
  { id: 'streak30', name: '習慣の王', desc: '30日連続で学習', icon: '👑', check: (c) => c.p.bestStreak >= 30 },
  { id: 'streak100', name: '百日の継続', desc: '100日連続で学習', icon: '💎', check: (c) => c.p.bestStreak >= 100 },
  { id: 'perfect', name: 'パーフェクト！', desc: '1セットを全問正解', icon: '⭐', check: (c) => c.p.totals.perfect >= 1 },
  { id: 'perfect10', name: '完璧主義者', desc: '全問正解を10回', icon: '🌟', check: (c) => c.p.totals.perfect >= 10 },
  { id: 'combo10', name: 'コンボ10', desc: '10問連続正解', icon: '⚡', check: (c) => c.p.records.maxCombo >= 10 },
  { id: 'combo30', name: 'コンボ30', desc: '30問連続正解', icon: '🌈', check: (c) => c.p.records.maxCombo >= 30 },
  { id: 'all5', name: '5教科制覇', desc: '5教科すべてに挑戦', icon: '🎌', check: (c) => c.subjectsDone >= 5 },
  { id: 'diag1', name: '実力を知る者', desc: '実力診断テストを受けた', icon: '🧭', check: (c) => c.p.totals.diagnostics >= 1 },
  { id: 'diag5', name: '成長の記録者', desc: '実力診断を5回受けた', icon: '📈', check: (c) => c.p.totals.diagnostics >= 5 },
  { id: 'dev60', name: '偏差値60の壁', desc: '診断で偏差値60以上', icon: '🚀', check: (c) => c.maxDeviation >= 60 },
  { id: 'dev70', name: 'トップクラス', desc: '診断で偏差値70以上', icon: '🏆', check: (c) => c.maxDeviation >= 70 },
  { id: 'ai1', name: 'AI先生と話した', desc: 'AIに質問した', icon: '🦉', check: (c) => c.p.totals.aiAsked >= 1 },
  { id: 'lv10', name: 'レベル10', desc: 'レベル10に到達', icon: '🎖️', check: (c) => c.level >= 10 },
  { id: 'lv20', name: 'レベル20', desc: 'レベル20に到達', icon: '🏅', check: (c) => c.level >= 20 },
  { id: 'speed30', name: 'スピードスター', desc: 'タイムアタックで30点以上', icon: '⏱️', check: (c) => Object.values(c.p.records.attackBest).some((v) => v >= 30) },
  { id: 'lap', name: '周回の達人', desc: '高速周回をクリア', icon: '🌀', check: (c) => Object.keys(c.p.records.flashBestMs).length >= 1 },
];

export function newBadges(ctx: BadgeCtx): Badge[] {
  return BADGES.filter((b) => !ctx.p.badges[b.id] && b.check(ctx));
}

// ---------- デイリーミッション ----------
export type MissionMetric = 'answered' | 'correct' | 'review' | 'combo' | 'rapid' | 'weak' | 'minutes' | 'perfect' | `subject:${SubjectId}`;
export interface Mission {
  id: string;
  text: string;
  metric: MissionMetric;
  target: number;
  xp: number;
  icon: string;
}

export function todaysMissions(day = dayKey()): Mission[] {
  const goal = settings.get().dailyGoal;
  const rng = mulberry32(parseInt(hash('missions' + day), 36));
  const subj = SUBJECTS[Math.floor(rng() * SUBJECTS.length)];
  const pool: Mission[] = [
    { id: 'correct', text: '15問正解する', metric: 'correct', target: 15, xp: 30, icon: '🎯' },
    { id: 'review', text: '復習問題を10問とく', metric: 'review', target: 10, xp: 35, icon: '🔁' },
    { id: 'combo', text: '7コンボを達成する', metric: 'combo', target: 7, xp: 30, icon: '⚡' },
    { id: 'rapid', text: '高速周回を1回クリア', metric: 'rapid', target: 1, xp: 30, icon: '🌀' },
    { id: 'weak', text: '苦手問題を5問とく', metric: 'weak', target: 5, xp: 35, icon: '💪' },
    { id: 'minutes', text: '15分間 学習する', metric: 'minutes', target: 15, xp: 30, icon: '⏳' },
    { id: 'perfect', text: '1セットを全問正解', metric: 'perfect', target: 1, xp: 40, icon: '⭐' },
    { id: 'subject', text: `${subj.name}を10問とく`, metric: `subject:${subj.id}`, target: 10, xp: 30, icon: subj.emoji },
  ];
  const picked = shuffle(pool, rng).slice(0, 2);
  return [{ id: 'answered', text: `${goal}問とく（今日の目標）`, metric: 'answered', target: goal, xp: 40, icon: '📝' }, ...picked];
}

/** ミッションの進み具合を更新し、達成したものを返す */
export function bumpMissions(delta: Partial<Record<MissionMetric, number>>, max: Partial<Record<MissionMetric, number>> = {}): Mission[] {
  const today = dayKey();
  const missions = todaysMissions(today);
  const p = profile.get();
  const m = p.missions.day === today ? { ...p.missions, progress: { ...p.missions.progress } } : { day: today, progress: {}, claimed: [] as string[] };
  for (const [k, v] of Object.entries(delta)) m.progress[k] = (m.progress[k] ?? 0) + (v ?? 0);
  for (const [k, v] of Object.entries(max)) m.progress[k] = Math.max(m.progress[k] ?? 0, v ?? 0);
  const done: Mission[] = [];
  for (const mi of missions) {
    if (!m.claimed.includes(mi.id) && (m.progress[mi.metric] ?? 0) >= mi.target) {
      m.claimed = [...m.claimed, mi.id];
      done.push(mi);
    }
  }
  const xp = done.reduce((a, b) => a + b.xp, 0);
  profile.set((pp) => ({ ...pp, missions: m, xp: pp.xp + xp }));
  return done;
}

export function missionProgress(): { mission: Mission; value: number; done: boolean }[] {
  const today = dayKey();
  const p = profile.get();
  const prog = p.missions.day === today ? p.missions.progress : {};
  const claimed = p.missions.day === today ? p.missions.claimed : [];
  return todaysMissions(today).map((mission) => ({
    mission,
    value: Math.min(mission.target, prog[mission.metric] ?? 0),
    done: claimed.includes(mission.id),
  }));
}

export const yesterday = () => addDays(dayKey(), -1);
