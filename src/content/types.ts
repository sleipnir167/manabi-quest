// ===== 問題データの型定義 =====
// 外部から問題パック(JSON/CSV)を追加するときもこの形式に変換されます。

export type SubjectId = 'kokugo' | 'math' | 'science' | 'social' | 'english';

export type QType =
  | 'choice' // 選択式（choices の中から answer を選ぶ）
  | 'tf' // ○×（answer: 'o' | 'x'）
  | 'input' // 文字入力（answer / accept と正規化して照合）
  | 'numeric' // 数値・分数・比・文字式（専用キーパッド）
  | 'order' // 並べ替え（choices が正しい順番）
  | 'write'; // 手書き（漢字の書き取りなど。自己採点）

export type NumKind = 'num' | 'ratio' | 'expr';

export interface Question {
  id: string;
  subject: SubjectId;
  grade: number; // 6=小6, 7=中1, 8=中2, 9=中3
  unit: string; // 単元ID
  type: QType;
  /** 問題文の上に出す短い指示（例: 下線部の読みをひらがなで） */
  ask?: string;
  prompt: string; // ミニ記法: [[3/4]] 分数, [[1 3/4]] 帯分数, __下線__, **太字**
  choices?: string[];
  answer: string;
  accept?: string[];
  explanation?: string;
  hint?: string;
  difficulty: number; // 1(やさしい)〜5(むずかしい)
  /** 読み上げ用テキスト（英単語など） */
  speak?: string;
  speakLang?: 'en' | 'ja';
  /** 問題文の代わりに音声だけを聞かせる（リスニング） */
  listening?: boolean;
  numKind?: NumKind;
  unitSuffix?: string; // 答えの単位 (cm² など)
  requireSimplest?: boolean;
  figure?: string; // SVG 文字列（生成問題の図）
  /** 高速周回用：カードのおもて/うら */
  front?: string;
  back?: string;
  /** 生成問題のときの生成器 ID */
  gen?: string;
  level?: number;
  source?: string; // 'builtin' | 'pack:<id>' | 'ai'
  tags?: string[];
}

export interface Unit {
  id: string;
  subject: SubjectId;
  grade: number;
  name: string;
  /** 一覧で使う短い説明 */
  desc?: string;
  /** 分野（歴史・政治 など） */
  area?: string;
  order?: number;
}

export interface Subject {
  id: SubjectId;
  name: string;
  short: string;
  emoji: string;
}

export const SUBJECTS: Subject[] = [
  { id: 'kokugo', name: '国語', short: '国', emoji: '📖' },
  { id: 'math', name: '算数・数学', short: '数', emoji: '📐' },
  { id: 'science', name: '理科', short: '理', emoji: '🔬' },
  { id: 'social', name: '社会', short: '社', emoji: '🏯' },
  { id: 'english', name: '英語', short: '英', emoji: '🔤' },
];

export const subjectName = (id: SubjectId) => SUBJECTS.find((s) => s.id === id)?.name ?? id;

export const gradeLabel = (g: number) => (g <= 6 ? `小${g}` : `中${g - 6}`);

export interface PackFile {
  id: string;
  name: string;
  version?: number;
  author?: string;
  description?: string;
  units?: Unit[];
  questions: Partial<Question>[];
}
