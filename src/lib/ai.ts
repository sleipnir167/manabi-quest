// ===== AI（OpenAI互換API）: OpenRouter / 無料LLM API / 自前 Gemma =====
// クレジット節約のしくみ
//  1. 問題には最初から解説が入っているので、AIは「もっと詳しく」のときだけ呼ぶ
//  2. 一度生成した解説は IndexedDB にキャッシュ → 同じ質問は二度と課金しない
//  3. 無料モデル(:free) → 無料API → 低価格モデル の順に自動フォールバック
//  4. 1日の利用回数の上限・最大トークン数を設定できる
import type { Question } from '../content/types';
import { subjectName, gradeLabel } from '../content/types';
import { db } from './db';
import { aiUsage, settings, type AIProvider } from './store';
import { dayKey, hash } from './util';

export type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatContent;
}

export interface ChatOptions {
  cacheKey?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  onToken?: (textSoFar: string) => void;
  signal?: AbortSignal;
  /** キャッシュを無視して作り直す */
  refresh?: boolean;
}

export interface ChatResult {
  text: string;
  model: string;
  cached: boolean;
  provider?: string;
}

export class AIError extends Error {
  constructor(
    message: string,
    public code: 'disabled' | 'limit' | 'config' | 'network' | 'auth' | 'all-failed' = 'network',
  ) {
    super(message);
  }
}

function resolveKey(p: AIProvider): string {
  if (p.apiKey) return p.apiKey;
  if (p.kind === 'openrouter') {
    // OpenRouter のキーは無料・有料プロバイダで共有できる
    const other = settings.get().ai.providers.find((x) => x.kind === 'openrouter' && x.apiKey);
    return other?.apiKey ?? '';
  }
  return '';
}

export function usableProviders(): AIProvider[] {
  return settings
    .get()
    .ai.providers.filter((p) => p.enabled && p.baseUrl && p.model && (p.kind !== 'openrouter' || resolveKey(p)));
}

export function aiReady(): boolean {
  return settings.get().ai.enabled && usableProviders().length > 0;
}

function rollUsage() {
  const today = dayKey();
  const month = today.slice(0, 7);
  const u = aiUsage.get();
  if (u.day !== today) aiUsage.set({ day: today, calls: 0, tokens: 0, costUsd: 0 });
  if (u.month !== month) aiUsage.set({ month, monthCalls: 0, monthTokens: 0, monthCostUsd: 0 });
}

/** 今日すでに使った回数（表示用・状態は変更しない） */
export function usedToday(): number {
  const u = aiUsage.get();
  return u.day === dayKey() ? u.calls : 0;
}

export function remainingToday(): number {
  return Math.max(0, settings.get().ai.dailyLimit - usedToday());
}

function recordUsage(model: string, tokens: number, cost: number) {
  rollUsage();
  aiUsage.set((u) => ({
    ...u,
    calls: u.calls + 1,
    tokens: u.tokens + tokens,
    costUsd: u.costUsd + cost,
    monthCalls: u.monthCalls + 1,
    monthTokens: u.monthTokens + tokens,
    monthCostUsd: u.monthCostUsd + cost,
    lastModel: model,
  }));
}

const splitModels = (m: string) =>
  m
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

async function callProvider(
  p: AIProvider,
  model: string | string[],
  messages: ChatMessage[],
  opt: ChatOptions,
): Promise<{ text: string; model: string; tokens: number; cost: number }> {
  const url = p.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const key = resolveKey(p);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const body: Record<string, unknown> = {
    messages,
    max_tokens: opt.maxTokens ?? settings.get().ai.maxTokens,
    temperature: opt.temperature ?? 0.5,
    stream: !!opt.onToken,
  };
  if (Array.isArray(model)) {
    body.model = model[0];
    if (model.length > 1) body.models = model; // OpenRouter のサーバー側フォールバック
  } else body.model = model;
  if (p.kind === 'openrouter') {
    headers['X-Title'] = 'Manabi Quest';
    headers['HTTP-Referer'] = location.origin;
    body.usage = { include: true };
    // 考える過程(reasoning)のトークンを節約
    body.reasoning = { effort: 'low', exclude: true };
  }
  if (opt.json) body.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (p.timeoutSec || 40) * 1000);
  opt.signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw new AIError(`APIキーが正しくありません (${res.status})`, 'auth');
      if (opt.json && res.status === 400 && body.response_format) {
        // JSON モード未対応のモデル → 通常モードで再試行
        return callProvider(p, model, messages, { ...opt, json: false });
      }
      throw new AIError(`${res.status}: ${t.slice(0, 160)}`, 'network');
    }
    if (opt.onToken && res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      let usedModel = Array.isArray(model) ? model[0] : model;
      let tokens = 0;
      let cost = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith('data:')) continue;
          const data = l.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            if (j.error) throw new AIError(j.error.message ?? 'stream error', 'network');
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) {
              text += delta;
              opt.onToken(text);
            }
            if (j.model) usedModel = j.model;
            if (j.usage) {
              tokens = j.usage.total_tokens ?? tokens;
              cost = j.usage.cost ?? cost;
            }
          } catch (e) {
            if (e instanceof AIError) throw e;
          }
        }
      }
      if (!text.trim()) throw new AIError('空の応答でした', 'network');
      return { text, model: usedModel, tokens, cost };
    }
    const j = await res.json();
    const text: string = j.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new AIError('空の応答でした', 'network');
    return { text, model: j.model ?? String(model), tokens: j.usage?.total_tokens ?? 0, cost: j.usage?.cost ?? 0 };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error).name === 'AbortError') throw new AIError('応答がタイムアウトしました', 'network');
    throw new AIError(`通信エラー: ${(e as Error).message}`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(messages: ChatMessage[], opt: ChatOptions = {}): Promise<ChatResult> {
  if (opt.cacheKey && !opt.refresh) {
    const c = await db.aiCache.get(opt.cacheKey);
    if (c) {
      opt.onToken?.(c.text);
      return { text: c.text, model: c.model, cached: true };
    }
  }
  if (!settings.get().ai.enabled) throw new AIError('AI機能はオフになっています（設定で変更できます）', 'disabled');
  const providers = usableProviders();
  if (!providers.length) throw new AIError('AIの接続先が設定されていません。設定 → AI で設定してください', 'config');
  rollUsage();
  if (remainingToday() <= 0) throw new AIError('今日のAI利用回数の上限に達しました（設定で変更できます）', 'limit');

  const errors: string[] = [];
  for (const p of providers) {
    const models = splitModels(p.model);
    const attempts: (string | string[])[] = p.kind === 'openrouter' ? [models] : models;
    for (const m of attempts) {
      try {
        const r = await callProvider(p, m, messages, opt);
        recordUsage(r.model, r.tokens, r.cost);
        if (opt.cacheKey) await db.aiCache.put({ key: opt.cacheKey, text: r.text, model: r.model, ts: Date.now() });
        return { text: r.text, model: r.model, cached: false, provider: p.name };
      } catch (e) {
        errors.push(`${p.name}: ${(e as Error).message}`);
        if ((e as AIError).code === 'auth') break;
        if (opt.signal?.aborted) throw e;
      }
    }
  }
  throw new AIError('AIに接続できませんでした\n' + errors.join('\n'), 'all-failed');
}

/** 接続テスト */
export async function testProvider(p: AIProvider): Promise<string> {
  const models = splitModels(p.model);
  const r = await callProvider(
    p,
    p.kind === 'openrouter' ? models : models[0],
    [{ role: 'user', content: '「接続OK」とだけ返してください。' }],
    { maxTokens: 30, temperature: 0 },
  );
  recordUsage(r.model, r.tokens, r.cost);
  return `${r.model}: ${r.text.trim().slice(0, 40)}`;
}

/** OpenRouter の無料モデル一覧を取得（キー不要） */
export async function fetchOpenRouterModels(onlyFree = true): Promise<{ id: string; name: string; ctx: number; price: number }[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const j = await res.json();
  return (j.data as { id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }[])
    .filter((m) => !onlyFree || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0))
    .map((m) => ({
      id: m.id,
      name: m.name,
      ctx: m.context_length,
      price: (Number(m.pricing?.prompt) + Number(m.pricing?.completion)) * 1e6,
    }))
    .sort((a, b) => a.price - b.price);
}

// ---------- プロンプト ----------
export function tutorSystem(): string {
  const g = gradeLabel(settings.get().grade);
  const name = settings.get().name;
  return [
    'あなたは「フクロン先生」。小学6年生〜中学生に勉強を教える、やさしくて頼れる家庭教師のフクロウです。',
    `相手は${g}の生徒${name ? `「${name}」さん` : ''}です。`,
    'ルール:',
    '- むずかしい言葉は使わず、短い文で、ていねいすぎない親しみやすい口調で話す。',
    '- 答えだけでなく「なぜそうなるか」を順を追って説明する。',
    '- 覚え方のコツ（語呂合わせ・イメージ・図のイメージ）があれば1つ紹介する。',
    '- 事実関係があいまいなときは断定しない。教科書の内容に沿って説明する。',
    '- マークダウンの **太字** と箇条書きを使ってよい。見出し(#)や表は使わない。',
    '- 分数は 3/4 のように書く。',
  ].join('\n');
}

function describeQuestion(q: Question): string {
  const lines = [`教科: ${subjectName(q.subject)}（${gradeLabel(q.grade)}）`, `問題: ${plain(q.prompt)}`];
  if (q.type === 'choice' && q.choices) lines.push(`選択肢: ${q.choices.map(plain).join(' / ')}`);
  if (q.type === 'order' && q.choices) lines.push(`正しい順番: ${q.choices.join(' → ')}`);
  lines.push(`正解: ${q.type === 'tf' ? (q.answer === 'o' ? '○（正しい）' : '×（まちがい）') : plain(q.answer)}${q.unitSuffix ?? ''}`);
  if (q.explanation) lines.push(`教科書の解説: ${plain(q.explanation)}`);
  return lines.join('\n');
}

export const plain = (s: string) =>
  s
    .replace(/\[\[(-?\d+)\s+([^/\]]+)\/([^\]]+)\]\]/g, '$1と$2/$3')
    .replace(/\[\[([^/\]]+)\/([^\]]+)\]\]/g, '$1/$2')
    .replace(/__([^_]+)__/g, '「$1」')
    .replace(/\*\*/g, '')
    .replace(/<[^>]+>/g, '');

export function explainMessages(q: Question, given: string, correct: boolean): ChatMessage[] {
  const givenText = q.type === 'tf' ? (given === 'o' ? '○' : '×') : given || '（わからない）';
  return [
    { role: 'system', content: tutorSystem() },
    {
      role: 'user',
      content: [
        describeQuestion(q),
        `生徒の答え: ${givenText}（${correct ? '正解' : '不正解'}）`,
        '',
        correct
          ? 'この問題のポイントと、関連して覚えておくとよいことを説明してください。'
          : '次の順で説明してください:\n1. 正しい答えになる理由（考え方の手順）\n2. 生徒の答えのどこがおしいか・どんな勘違いをしやすいか\n3. 次に間違えないための覚え方のコツ',
        '全体で350字以内。',
      ].join('\n'),
    },
  ];
}

export function explainCacheKey(q: Question, given: string) {
  return `explain:${q.gen ? hash(q.prompt) : q.id}:${hash(given || '-')}`;
}

export function followupMessages(q: Question, history: ChatMessage[], ask: ChatContent): ChatMessage[] {
  return [
    { role: 'system', content: tutorSystem() + '\n\n今話している問題:\n' + describeQuestion(q) },
    ...history.filter((m) => m.role !== 'system'),
    { role: 'user', content: ask },
  ];
}

export function parseJsonLoose<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === '[' ? ']' : '}';
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
