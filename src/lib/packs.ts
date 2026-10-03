// ===== 問題パックの読み込み（JSON / CSV / サーバー配信 / AI生成） =====
import type { PackFile, Question, SubjectId, Unit } from '../content/types';
import { normalizePack, reloadRegistry } from '../content/registry';
import { db, type PackRow } from './db';
import { settings } from './store';
import { hash } from './util';

const SUBJECT_ALIASES: Record<string, SubjectId> = {
  kokugo: 'kokugo', 国語: 'kokugo', japanese: 'kokugo',
  math: 'math', 算数: 'math', 数学: 'math', sansu: 'math', sugaku: 'math',
  science: 'science', 理科: 'science', rika: 'science',
  social: 'social', 社会: 'social', shakai: 'social',
  english: 'english', 英語: 'english', eigo: 'english',
};
export const subjectFrom = (s: string): SubjectId | undefined => SUBJECT_ALIASES[s.trim().toLowerCase()] ?? SUBJECT_ALIASES[s.trim()];

/** RFC4180 っぽい CSV パーサ（ダブルクォート・改行入りセルに対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const CSV_HEADER = ['subject', 'grade', 'unit_id', 'unit_name', 'type', 'prompt', 'answer', 'wrong1', 'wrong2', 'wrong3', 'explanation', 'difficulty', 'accept', 'hint'];

export function csvToPack(text: string, name: string): PackFile {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV が空です');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  if (idx('prompt') < 0 || idx('answer') < 0) throw new Error('1行目に subject, grade, unit_id, unit_name, type, prompt, answer … の見出しが必要です');
  const units = new Map<string, Unit>();
  const questions: Partial<Question>[] = [];
  for (const r of rows.slice(1)) {
    const get = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? '').trim() : '');
    const subject = subjectFrom(get('subject'));
    const grade = Number(get('grade')) || 6;
    const unitName = get('unit_name') || get('unit_id') || '追加問題';
    const unitId = get('unit_id') || `csv-${hash(unitName)}`;
    if (subject && !units.has(unitId)) units.set(unitId, { id: unitId, subject, grade, name: unitName, area: '追加' });
    const type = (get('type') || '').toLowerCase();
    const wrong = ['wrong1', 'wrong2', 'wrong3'].map(get).filter(Boolean);
    const answer = get('answer');
    const q: Partial<Question> = {
      subject,
      grade,
      unit: unitId,
      prompt: get('prompt').replace(/\\n/g, '\n'),
      explanation: get('explanation').replace(/\\n/g, '\n') || undefined,
      hint: get('hint') || undefined,
      difficulty: Number(get('difficulty')) || 3,
      accept: get('accept') ? get('accept').split('|').map((s) => s.trim()) : undefined,
    };
    if (type === 'order') {
      q.type = 'order';
      q.choices = answer.split('|').map((s) => s.trim());
    } else if (type === 'tf') {
      q.type = 'tf';
      q.answer = answer;
    } else if (wrong.length && type !== 'input' && type !== 'numeric') {
      q.type = 'choice';
      q.choices = [answer, ...wrong];
      q.answer = answer;
    } else {
      q.type = (type as Question['type']) || 'input';
      q.answer = answer;
    }
    questions.push(q);
  }
  return { id: `csv-${hash(name + text.length)}`, name, version: 1, units: [...units.values()], questions };
}

export interface ImportResult {
  pack: PackFile;
  count: number;
  errors: string[];
}

export async function importPackText(text: string, filename: string, origin: PackRow['origin'] = 'import'): Promise<ImportResult> {
  let pack: PackFile;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const j = JSON.parse(trimmed);
    pack = Array.isArray(j) ? { id: `json-${hash(filename)}`, name: filename.replace(/\.json$/i, ''), questions: j } : j;
    if (!pack.id) pack.id = `json-${hash(filename)}`;
    if (!pack.name) pack.name = filename;
  } else {
    pack = csvToPack(text, filename.replace(/\.csv$/i, ''));
  }
  const { questions, errors } = normalizePack(pack, `pack:${pack.id}`);
  if (!questions.length) throw new Error('読み込める問題がありませんでした\n' + errors.slice(0, 5).join('\n'));
  await savePack(pack, origin);
  return { pack, count: questions.length, errors };
}

export async function savePack(pack: PackFile, origin: PackRow['origin'], enabled = true) {
  const prev = await db.packs.get(pack.id);
  await db.packs.put({
    id: pack.id,
    name: pack.name,
    version: pack.version ?? 1,
    enabled: prev ? prev.enabled : enabled,
    origin,
    installedAt: Date.now(),
    data: pack,
  });
  await reloadRegistry();
}

export async function setPackEnabled(id: string, enabled: boolean) {
  await db.packs.update(id, { enabled });
  await reloadRegistry();
}

export async function deletePack(id: string) {
  await db.packs.delete(id);
  await reloadRegistry();
}

/** サーバーの packs/index.json に載っているパックを自動インストール・更新 */
export async function syncRemotePacks(): Promise<{ installed: string[]; error?: string }> {
  if (!settings.get().remotePacks) return { installed: [] };
  const installed: string[] = [];
  try {
    const base = new URL('packs/', location.href);
    const res = await fetch(new URL('index.json', base), { cache: 'no-cache' });
    if (!res.ok) return { installed };
    const index = (await res.json()) as { packs: { id: string; file: string; version?: number; name?: string }[] };
    for (const p of index.packs ?? []) {
      const cur = await db.packs.get(p.id);
      if (cur && cur.version >= (p.version ?? 1)) continue;
      const r = await fetch(new URL(p.file, base), { cache: 'no-cache' });
      if (!r.ok) continue;
      const data = (await r.json()) as PackFile;
      data.id = p.id;
      data.version = p.version ?? data.version ?? 1;
      await savePack(data, 'remote');
      installed.push(data.name ?? p.id);
    }
  } catch (e) {
    return { installed, error: (e as Error).message };
  }
  return { installed };
}

export const CSV_TEMPLATE =
  CSV_HEADER.join(',') +
  '\n' +
  [
    'math,7,m7-hoteishiki-plus,一次方程式の文章題,input,"1個120円のりんごを何個かと、200円のかごを買ったら代金は920円でした。りんごは何個？",6,,,,"120x+200=920 より x=6",3,,',
    'science,7,s7-extra,中1理科 追加,choice,光が鏡で反射するとき入射角と反射角は？,等しい,入射角が大きい,反射角が大きい,関係ない,反射の法則,2,,',
    'social,7,h7-chiri,中1地理,tf,赤道は0度の緯線である。,o,,,,赤道は緯度0度,1,,',
    'english,7,e7-extra,中1英語 追加,input,「本」を英語で,book,,,,book の複数形は books,1,books,',
    'social,6,h6-extra,歴史 並べ替え,order,古い順に並べよう,平城京|平安京|鎌倉幕府,,,,,3,,',
  ].join('\n');

export const JSON_TEMPLATE = JSON.stringify(
  {
    id: 'chu1-math-extra',
    name: '中1数学 追加問題',
    version: 1,
    author: 'おうちの人',
    units: [{ id: 'm7-kansu-plus', subject: 'math', grade: 7, name: '比例・反比例の応用', area: '関数' }],
    questions: [
      {
        unit: 'm7-kansu-plus',
        type: 'choice',
        prompt: 'y = -3x のグラフはどうなる？',
        choices: ['右下がりの直線', '右上がりの直線', '双曲線', '放物線'],
        explanation: '比例定数が負なので右下がり。',
        difficulty: 2,
      },
      { unit: 'm7-kansu-plus', type: 'numeric', prompt: 'y = 2x で x = -4 のときの y は？', answer: '-8', difficulty: 1 },
      { unit: 'm7-hoteishiki', type: 'input', prompt: '移項するとき、項の何が変わる？', answer: '符号', accept: ['ふごう'], difficulty: 1 },
    ],
  },
  null,
  2,
);
