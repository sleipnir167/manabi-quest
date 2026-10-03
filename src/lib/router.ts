// ===== 画面遷移（ハッシュ＋履歴。Android の戻るジェスチャーにも対応） =====
import { useSyncExternalStore } from 'react';
import type { Question, SubjectId } from '../content/types';
import type { SessionSpec } from './selection';
import type { StudyMode } from './db';

export type TabName = 'home' | 'learn' | 'rapid' | 'test' | 'notebook' | 'stats' | 'settings';

export interface PlayConfig {
  title: string;
  mode: StudyMode;
  spec?: SessionSpec;
  questions?: Question[];
  subject?: SubjectId | 'mix';
}

export interface RapidConfig {
  kind: 'flash' | 'attack' | 'listen';
  title: string;
  subject?: SubjectId | 'mix';
  qids: string[];
  reverse?: boolean;
  seconds?: number;
  /** ベスト記録を比べるためのデッキ名 */
  deckId?: string;
}

export interface TestConfig {
  subjects: SubjectId[];
  perSubject: number;
  grade: number;
}

export type Route =
  | { name: TabName; subject?: SubjectId; tab?: string }
  | { name: 'play'; config: PlayConfig }
  | { name: 'rapid-run'; config: RapidConfig }
  | { name: 'test-run'; config: TestConfig }
  | { name: 'test-result'; ids: number[] };

const TABS: TabName[] = ['home', 'learn', 'rapid', 'test', 'notebook', 'stats', 'settings'];
export const isFullscreen = (r: Route) => r.name === 'play' || r.name === 'rapid-run' || r.name === 'test-run';

function fromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, q] = h.split('?');
  if (TABS.includes(name as TabName)) {
    const params = new URLSearchParams(q ?? '');
    return { name: name as TabName, subject: (params.get('s') as SubjectId) || undefined, tab: params.get('t') || undefined };
  }
  return { name: 'home' };
}

let current: Route = fromHash();
const stack: Route[] = [current];
const listeners = new Set<() => void>();
let exitGuard: (() => void) | null = null;

function emitChange() {
  listeners.forEach((l) => l());
}

function hashOf(r: Route): string {
  if (TABS.includes(r.name as TabName)) {
    const t = r as { name: TabName; subject?: string; tab?: string };
    const p = new URLSearchParams();
    if (t.subject) p.set('s', t.subject);
    if (t.tab) p.set('t', t.tab);
    const qs = p.toString();
    return `#/${t.name}${qs ? '?' + qs : ''}`;
  }
  return location.hash || '#/home';
}

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  current = r;
  if (opts.replace) stack[stack.length - 1] = r;
  else stack.push(r);
  const url = hashOf(r);
  if (opts.replace) history.replaceState({ depth: stack.length }, '', url);
  else history.pushState({ depth: stack.length }, '', url);
  window.scrollTo({ top: 0 });
  emitChange();
}

export function goBack() {
  if (stack.length > 1) history.back();
  else navigate({ name: 'home' }, { replace: true });
}

/** 問題をといている最中は「戻る」で確認ダイアログを出す */
export function setExitGuard(fn: (() => void) | null) {
  exitGuard = fn;
}

window.addEventListener('popstate', () => {
  if (exitGuard && isFullscreen(current)) {
    // 画面にとどまって確認を出す
    history.pushState({ depth: stack.length }, '', hashOf(current));
    exitGuard();
    return;
  }
  if (stack.length > 1) stack.pop();
  let next = stack[stack.length - 1] ?? fromHash();
  // URL（ハッシュ）が直接変えられたときは、URL のほうを優先する
  if (isFullscreen(next) || hashOf(next) !== (location.hash || '#/home')) next = fromHash();
  stack[stack.length - 1] = next;
  current = next;
  emitChange();
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** 全画面（問題）から抜けてタブに戻る */
export function exitTo(r: Route = { name: 'home' }) {
  exitGuard = null;
  // 履歴をタブまで戻す代わりに置きかえる
  navigate(r, { replace: true });
}
