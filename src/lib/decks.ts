// ===== 高速周回用のデッキ（カードの束） =====
import type { Question, SubjectId } from '../content/types';
import { allQuestions, getQuestion, questionsInUnit } from '../content/registry';
import { db } from './db';
import { distractorsFrom } from './util2';
import { settings } from './store';

export interface Face {
  front: string;
  back: string;
  sub?: string;
  frontLang: 'ja' | 'en';
  backLang: 'ja' | 'en';
}

const isEn = (s: string) => /^[\x20-\x7e’]+$/.test(s.trim()) && /[a-z]/i.test(s);

export function faceOf(q: Question, reverse = false): Face {
  let front = q.front ?? `${q.listening ? '🔊 ' + (q.speak ?? '') : q.prompt}`;
  let back = q.back ?? (q.type === 'tf' ? (q.answer === 'o' ? '○ 正しい' : '× まちがい') : q.type === 'order' ? (q.choices ?? []).join(' → ') : q.answer + (q.unitSuffix ?? ''));
  const sub = q.front ? undefined : q.type === 'tf' || q.type === 'choice' ? q.explanation : undefined;
  if (!q.front && q.ask && !q.listening && q.type !== 'tf') front = `${q.ask}\n${front}`;
  if (reverse) [front, back] = [back, front];
  return { front, back, sub, frontLang: isEn(front) ? 'en' : 'ja', backLang: isEn(back) ? 'en' : 'ja' };
}

export interface DeckPreset {
  id: string;
  label: string;
  icon: string;
  subject: SubjectId | 'mix';
  units?: string[];
  dynamic?: 'due' | 'weak' | 'mistakes';
}

export const PRESETS: DeckPreset[] = [
  { id: 'due', label: '期限が来た復習', icon: '⏰', subject: 'mix', dynamic: 'due' },
  { id: 'weak', label: '苦手な問題だけ', icon: '💪', subject: 'mix', dynamic: 'weak' },
  { id: 'eng', label: '英単語（小6）', icon: '🔤', subject: 'english', units: ['e6-animal', 'e6-food', 'e6-sports', 'e6-school', 'e6-time', 'e6-num', 'e6-feel', 'e6-verb', 'e6-place', 'e6-job'] },
  { id: 'phrase', label: '英会話フレーズ', icon: '💬', subject: 'english', units: ['e6-phrase'] },
  { id: 'yomi', label: '漢字の読み', icon: '📖', subject: 'kokugo', units: ['k6-yomi'] },
  { id: 'kaki', label: '漢字の書き', icon: '✍️', subject: 'kokugo', units: ['k6-kaki'] },
  { id: 'yoji', label: '四字熟語・ことわざ', icon: '🀄', subject: 'kokugo', units: ['k6-yoji', 'k6-kotowaza'] },
  { id: 'jinbutsu', label: '歴史人物', icon: '🏯', subject: 'social', units: ['h6-jinbutsu'] },
  { id: 'nendai', label: '年代・時代', icon: '📜', subject: 'social', units: ['h6-nendai'] },
  { id: 'pref', label: '都道府県・県庁所在地', icon: '🗾', subject: 'social', units: ['h6-todofuken'] },
  { id: 'seiji', label: '政治・国際', icon: '⚖️', subject: 'social', units: ['h6-seiji', 'h6-kokusai'] },
  { id: 'rika', label: '理科の用語（小6）', icon: '🔬', subject: 'science', units: ['s6-nensho', 's6-karada', 's6-shokubutsu', 's6-seibutsu', 's6-tsuki', 's6-daichi', 's6-teko', 's6-denki', 's6-suiyoeki'] },
];

/** 周回・タイムアタックに使える問題か */
export function usableFor(kind: 'flash' | 'attack' | 'listen', q: Question): boolean {
  if (q.gen) return false;
  if (kind === 'attack') return q.type === 'tf' || ((q.type === 'choice' || q.type === 'write' || q.type === 'input') && (q.choices?.length ?? 0) >= 2);
  if (kind === 'flash' && q.tags?.includes('日→英')) return false; // 英単語は「英→日」カードを裏返して使う
  return true;
}

export async function deckFor(preset: DeckPreset, kind: 'flash' | 'attack' | 'listen'): Promise<string[]> {
  let qs: Question[] = [];
  if (preset.dynamic) {
    const now = Date.now();
    const cards = await db.cards
      .filter((c) => {
        if (c.reps === 0) return false;
        if (preset.dynamic === 'due') return c.due <= now;
        if (preset.dynamic === 'weak') return !c.lastCorrect || c.lapses >= 2 || c.wrongCount / Math.max(1, c.wrongCount + c.correctCount) >= 0.4;
        return c.wrongCount > 0 && !c.resolved;
      })
      .toArray();
    qs = cards.map((c) => getQuestion(c.qid)).filter(Boolean) as Question[];
  } else {
    qs = (preset.units ?? []).flatMap((u) => questionsInUnit(u));
  }
  return qs.filter((q) => usableFor(kind, q)).map((q) => q.id);
}

export function deckFromUnits(units: string[], kind: 'flash' | 'attack' | 'listen'): string[] {
  return units
    .flatMap((u) => questionsInUnit(u))
    .filter((q) => usableFor(kind, q))
    .map((q) => q.id);
}

/** タイムアタック用：4択の選択肢を用意する */
export function attackChoices(q: Question, deck: Question[]): string[] {
  if (q.type === 'tf') return ['o', 'x'];
  if (q.choices && q.choices.length >= 2) return q.choices;
  return [q.answer, ...distractorsFrom(q.answer, deck.map((d) => d.answer), 3)];
}

export function unitsWithFlashContent(subject?: SubjectId) {
  const set = new Map<string, number>();
  for (const q of allQuestions()) {
    if (q.gen || (subject && q.subject !== subject) || q.grade > Math.max(settings.get().grade, 7)) continue;
    set.set(q.unit, (set.get(q.unit) ?? 0) + 1);
  }
  return set;
}
