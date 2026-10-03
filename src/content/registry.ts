// ===== 問題の登録所：内蔵問題 + 生成問題 + 追加パック =====
import { useSyncExternalStore } from 'react';
import type { PackFile, Question, QType, SubjectId, Unit } from './types';
import { BUILTIN_UNITS } from './units';
import { KOKUGO } from './banks/kokugo';
import { MATH } from './banks/math';
import { SCIENCE } from './banks/science';
import { SOCIAL } from './banks/social';
import { ENGLISH } from './banks/english';
import { GENERATORS, GEN_BY_ID } from './generators';
import { db } from '../lib/db';
import { clamp, hash, mulberry32 } from '../lib/util';

const GEN_CARDS: Question[] = GENERATORS.flatMap((g) =>
  Array.from({ length: g.levels }, (_, i) => {
    const level = i + 1;
    return {
      id: `gen:${g.id}:${level}`,
      subject: g.subject,
      grade: g.grade,
      unit: g.unit,
      type: 'numeric' as QType,
      prompt: `${g.name}${g.levelNames ? `（${g.levelNames[i]}）` : g.levels > 1 ? `（レベル${level}）` : ''}`,
      answer: '',
      difficulty: clamp(g.base + i, 1, 5),
      gen: g.id,
      level,
      source: 'builtin',
    };
  }),
);

export const BUILTIN_QUESTIONS: Question[] = [...KOKUGO, ...MATH, ...SCIENCE, ...SOCIAL, ...ENGLISH];

let questions: Question[] = [];
let byId = new Map<string, Question>();
let units: Unit[] = [];
let unitById = new Map<string, Unit>();
let byUnit = new Map<string, Question[]>();
let version = 0;
const listeners = new Set<() => void>();

function rebuild(packQs: Question[], packUnits: Unit[]) {
  questions = [...BUILTIN_QUESTIONS, ...GEN_CARDS, ...packQs];
  byId = new Map(questions.map((q) => [q.id, q]));
  const um = new Map<string, Unit>();
  for (const u of [...BUILTIN_UNITS, ...packUnits]) if (!um.has(u.id)) um.set(u.id, u);
  units = [...um.values()].sort((a, b) => a.grade - b.grade || (a.order ?? 999) - (b.order ?? 999));
  unitById = um;
  byUnit = new Map();
  for (const q of questions) {
    const list = byUnit.get(q.unit) ?? [];
    list.push(q);
    byUnit.set(q.unit, list);
  }
  version++;
  listeners.forEach((l) => l());
}
rebuild([], []);

/** 問題パックを IndexedDB から読み込み、登録し直す */
export async function reloadRegistry() {
  const packs = await db.packs.toArray();
  const qs: Question[] = [];
  const us: Unit[] = [];
  for (const p of packs) {
    if (!p.enabled) continue;
    const { questions: pq, units: pu } = normalizePack(p.data, p.origin === 'ai' ? 'ai' : `pack:${p.id}`);
    qs.push(...pq);
    us.push(...pu);
  }
  rebuild(qs, us);
}

export function useRegistryVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export const allQuestions = () => questions;
export const getQuestion = (id: string) => byId.get(id);
export const allUnits = () => units;
export const getUnit = (id: string) => unitById.get(id);
export const unitsOf = (subject: SubjectId) => units.filter((u) => u.subject === subject);
export const questionsInUnit = (unitId: string) => byUnit.get(unitId) ?? [];
export const unitName = (id: string) => unitById.get(id)?.name ?? id;

/** 生成問題なら新しい問題を作る。通常問題はそのまま */
export function instantiate(q: Question, seed?: number): Question {
  if (!q.gen) return q;
  const g = GEN_BY_ID[q.gen];
  if (!g) return q;
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
  const out = g.make(q.level ?? 1, rng);
  return {
    ...q,
    type: out.type ?? 'numeric',
    ask: out.ask,
    prompt: out.prompt,
    answer: out.answer,
    accept: out.accept,
    explanation: out.explanation,
    hint: out.hint,
    numKind: out.numKind,
    unitSuffix: out.unitSuffix,
    requireSimplest: out.requireSimplest,
    figure: out.figure,
    choices: out.choices,
  };
}

// ---------- パックの正規化 ----------
const TRUE_WORDS = ['o', '○', '〇', 'true', '正', 'はい', '1', 'yes'];

export function normalizePack(pack: PackFile, source: string): { questions: Question[]; units: Unit[]; errors: string[] } {
  const errors: string[] = [];
  const unitsOut: Unit[] = (pack.units ?? [])
    .filter((u) => u && u.id && u.subject && u.name)
    .map((u, i) => ({ ...u, grade: Number(u.grade) || 6, order: u.order ?? 1000 + i }));
  const localUnits = new Map(unitsOut.map((u) => [u.id, u]));
  const out: Question[] = [];
  (pack.questions ?? []).forEach((raw, i) => {
    try {
      if (!raw || !raw.prompt || !raw.unit) throw new Error('prompt と unit は必須です');
      const unit = localUnits.get(raw.unit) ?? unitById.get(raw.unit) ?? BUILTIN_UNITS.find((u) => u.id === raw.unit);
      const subject = (raw.subject ?? unit?.subject) as SubjectId | undefined;
      if (!subject) throw new Error(`単元 ${raw.unit} の教科がわかりません（units に追加するか subject を指定）`);
      const choices = raw.choices?.map(String).filter((c) => c.trim() !== '');
      let type: QType = (raw.type as QType) ?? (choices && choices.length >= 2 ? 'choice' : 'input');
      let answer = raw.answer != null ? String(raw.answer) : '';
      if (type === 'choice') {
        if (!choices || choices.length < 2) throw new Error('choice には choices が2つ以上必要です');
        if (!answer) answer = choices[0];
        if (!choices.includes(answer)) choices.unshift(answer);
      } else if (type === 'tf') {
        answer = TRUE_WORDS.includes(answer.toLowerCase()) ? 'o' : 'x';
      } else if (type === 'order') {
        if (!choices || choices.length < 2) throw new Error('order には choices（正しい順）が必要です');
        answer = choices.join('|');
      } else if (!answer) throw new Error('answer がありません');
      if (!['choice', 'tf', 'input', 'numeric', 'order', 'write'].includes(type)) type = 'input';
      const prompt = String(raw.prompt);
      out.push({
        ...(raw as Question),
        id: raw.id ? String(raw.id) : `${pack.id}:${hash(raw.unit + '|' + prompt + '|' + answer)}`,
        subject,
        grade: Number(raw.grade ?? unit?.grade ?? 6),
        unit: raw.unit,
        type,
        prompt,
        choices,
        answer,
        accept: raw.accept?.map(String),
        difficulty: clamp(Number(raw.difficulty) || 3, 1, 5),
        source,
      });
    } catch (e) {
      errors.push(`${i + 1}問目: ${(e as Error).message}`);
    }
  });
  return { questions: out, units: unitsOut, errors };
}
