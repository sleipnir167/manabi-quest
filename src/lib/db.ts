// ===== IndexedDB（Dexie）: 学習記録・カード状態・問題パック・AIキャッシュ =====
import Dexie, { type Table } from 'dexie';
import type { PackFile, SubjectId } from '../content/types';
import type { SrsState } from './fsrs';
import type { ErrorType } from './normalize';

export type StudyMode = 'study' | 'review' | 'weak' | 'rapid' | 'attack' | 'test' | 'listen' | 'retry';

export interface Attempt {
  id?: number;
  qid: string;
  subject: SubjectId;
  unit: string;
  grade: number;
  correct: boolean;
  rating: number;
  timeMs: number;
  ts: number;
  day: string;
  hour: number;
  mode: StudyMode;
  given?: string;
  error?: ErrorType;
  usedHint?: boolean;
  difficulty: number;
}

export interface CardRow extends SrsState {
  qid: string;
  subject: SubjectId;
  unit: string;
  correctCount: number;
  wrongCount: number;
  lastCorrect: boolean;
  lastGiven?: string;
  lastError?: ErrorType;
  flagged?: boolean;
  /** 間違いノートで「もう大丈夫」にした */
  resolved?: boolean;
  updatedAt: number;
}

export interface SessionLog {
  id?: number;
  startedAt: number;
  endedAt: number;
  day: string;
  mode: StudyMode;
  subject?: SubjectId | 'mix';
  title: string;
  total: number;
  correct: number;
  xp: number;
  durationMs: number;
  maxCombo?: number;
  score?: number;
}

export interface PackRow {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  origin: 'import' | 'remote' | 'ai';
  installedAt: number;
  data: PackFile;
}

export interface AICacheEntry {
  key: string;
  text: string;
  model: string;
  ts: number;
}

export interface DiagUnitResult {
  unit: string;
  total: number;
  correct: number;
}

export interface DiagnosticResult {
  id?: number;
  ts: number;
  day: string;
  subject: SubjectId;
  grade: number;
  theta: number;
  se: number;
  deviation: number;
  total: number;
  correct: number;
  durationMs: number;
  units: DiagUnitResult[];
  items: { qid: string; correct: boolean; difficulty: number; unit: string; timeMs: number }[];
  /** 5教科まとめて受けたときのグループID */
  group?: string;
}

export interface AbilityRow {
  key: string; // subject or subject|unit
  theta: number;
  n: number;
  updatedAt: number;
}

export interface AbilitySnap {
  key: string;
  day: string;
  theta: number;
  n: number;
}

export interface DailyRow {
  day: string;
  count: number;
  correct: number;
  timeMs: number;
  xp: number;
  subjects: Partial<Record<SubjectId, { count: number; correct: number }>>;
}

export interface KV {
  k: string;
  v: unknown;
}

class MQDB extends Dexie {
  attempts!: Table<Attempt, number>;
  cards!: Table<CardRow, string>;
  sessions!: Table<SessionLog, number>;
  packs!: Table<PackRow, string>;
  aiCache!: Table<AICacheEntry, string>;
  diagnostics!: Table<DiagnosticResult, number>;
  abilities!: Table<AbilityRow, string>;
  abilityHistory!: Table<AbilitySnap, [string, string]>;
  daily!: Table<DailyRow, string>;
  kv!: Table<KV, string>;

  constructor() {
    super('manabi-quest');
    this.version(1).stores({
      attempts: '++id, qid, subject, unit, ts, day, mode',
      cards: 'qid, subject, unit, due, state, updatedAt',
      sessions: '++id, startedAt, day, mode',
      packs: 'id',
      aiCache: 'key, ts',
      diagnostics: '++id, ts, subject, group',
      abilities: 'key',
      abilityHistory: '[key+day], key, day',
      daily: 'day',
      kv: 'k',
    });
  }
}

export const db = new MQDB();

export async function kvGet<T>(k: string, fallback: T): Promise<T> {
  const r = await db.kv.get(k);
  return (r?.v as T) ?? fallback;
}
export async function kvSet(k: string, v: unknown) {
  await db.kv.put({ k, v });
}

/** ストレージを永続化（Safari が勝手に消さないようにお願いする） */
export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* noop */
  }
  return false;
}
