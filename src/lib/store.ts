// ===== 設定・プロフィール（localStorage に保存する小さな状態） =====
import { useSyncExternalStore } from 'react';

type Listener = () => void;

function deepMerge<T>(base: T, over: unknown): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  if (over && typeof over === 'object') {
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      const b = (base as Record<string, unknown>)[k];
      out[k] = b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, v) : v;
    }
  }
  return out as T;
}

export function createStore<T extends object>(key: string, initial: T) {
  let state: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = deepMerge(initial, JSON.parse(raw));
  } catch {
    /* noop */
  }
  const listeners = new Set<Listener>();
  const get = () => state;
  const subscribe = (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const set = (patch: Partial<T> | ((s: T) => T)) => {
    state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* noop */
    }
    listeners.forEach((l) => l());
  };
  const replace = (next: unknown) => set(() => deepMerge(initial, next));
  const use = () => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use, replace, key };
}

// ---------- 設定 ----------
export interface AIProvider {
  id: string;
  name: string;
  kind: 'openrouter' | 'openai';
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  /** 応答待ちの上限（秒）。自前サーバーは長めに */
  timeoutSec: number;
  note?: string;
}

export interface Settings {
  name: string;
  grade: number; // 6=小6, 7=中1...
  dailyGoal: number; // 1日の目標問題数
  retention: number; // 目標記憶率 0.85〜0.95
  sessionSize: number;
  theme: 'auto' | 'light' | 'dark';
  sound: boolean;
  volume: number;
  haptics: boolean;
  tts: { autoRead: boolean; rate: number; jaVoice: string; enVoice: string; readAnswer: boolean };
  handwriteKanji: boolean;
  choiceForInput: boolean; // 入力問題を選択式にする（かんたんモード）
  showTimer: boolean;
  ai: {
    enabled: boolean;
    providers: AIProvider[];
    dailyLimit: number;
    maxTokens: number;
    autoExplainOnWrong: boolean;
  };
  parentPin: string; // 空なら保護者ロックなし
  remotePacks: boolean;
}

export const DEFAULT_PROVIDERS: AIProvider[] = [
  {
    id: 'openrouter-free',
    name: 'OpenRouter（無料モデル）',
    kind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'google/gemma-4-31b-it:free, qwen/qwen3.8-27b:free, openrouter/free',
    enabled: true,
    timeoutSec: 40,
    note: '末尾が :free のモデルはクレジットを消費しません（1日の回数制限あり）。カンマ区切りで複数書くと順番に試します',
  },
  {
    id: 'free-llm',
    name: '無料LLM API（Modelix / FreeLLMAPI など）',
    kind: 'openai',
    baseUrl: '',
    apiKey: '',
    model: '',
    enabled: false,
    timeoutSec: 40,
    note: 'OpenAI互換の /v1 エンドポイントのURLを入れてください',
  },
  {
    id: 'openrouter-paid',
    name: 'OpenRouter（低価格モデル）',
    kind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'deepseek/deepseek-v4-flash, google/gemini-3.1-flash-lite',
    enabled: false,
    timeoutSec: 40,
    note: '無料枠が混んでいるときの予備。解説1回あたり約0.01円〜0.1円',
  },
  {
    id: 'self-gemma',
    name: '自前サーバー（Gemma / Ollama 等）',
    kind: 'openai',
    baseUrl: '',
    apiKey: '',
    model: 'gemma3:4b',
    enabled: false,
    timeoutSec: 120,
    note: 'HTTPS と CORS 許可が必要です（README 参照）',
  },
];

export const settings = createStore<Settings>('mq.settings', {
  name: '',
  grade: 6,
  dailyGoal: 30,
  retention: 0.9,
  sessionSize: 10,
  theme: 'auto',
  sound: true,
  volume: 0.7,
  haptics: true,
  tts: { autoRead: false, rate: 1, jaVoice: '', enVoice: '', readAnswer: true },
  handwriteKanji: true,
  choiceForInput: false,
  showTimer: true,
  ai: {
    enabled: true,
    providers: DEFAULT_PROVIDERS,
    dailyLimit: 40,
    maxTokens: 700,
    autoExplainOnWrong: false,
  },
  parentPin: '',
  remotePacks: true,
});

// ---------- プロフィール（ゲーミフィケーション） ----------
export interface Profile {
  xp: number;
  streak: number;
  bestStreak: number;
  lastActiveDay: string;
  badges: Record<string, number>; // id -> 獲得日時
  missions: { day: string; progress: Record<string, number>; claimed: string[] };
  records: { attackBest: Record<string, number>; maxCombo: number; flashBestMs: Record<string, number> };
  totals: { answered: number; correct: number; sessions: number; perfect: number; aiAsked: number; diagnostics: number };
  freezes: number; // ストリークを守る「おやすみチケット」
  onboarded: boolean;
  createdAt: number;
}

export const profile = createStore<Profile>('mq.profile', {
  xp: 0,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: '',
  badges: {},
  missions: { day: '', progress: {}, claimed: [] },
  records: { attackBest: {}, maxCombo: 0, flashBestMs: {} },
  totals: { answered: 0, correct: 0, sessions: 0, perfect: 0, aiAsked: 0, diagnostics: 0 },
  freezes: 1,
  onboarded: false,
  createdAt: Date.now(),
});

// ---------- AI 利用状況 ----------
export interface AIUsage {
  day: string;
  calls: number;
  tokens: number;
  costUsd: number;
  month: string;
  monthCalls: number;
  monthTokens: number;
  monthCostUsd: number;
  lastModel: string;
}

export const aiUsage = createStore<AIUsage>('mq.aiUsage', {
  day: '',
  calls: 0,
  tokens: 0,
  costUsd: 0,
  month: '',
  monthCalls: 0,
  monthTokens: 0,
  monthCostUsd: 0,
  lastModel: '',
});
