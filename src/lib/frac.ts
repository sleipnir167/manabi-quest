// ===== 有理数（分数）・比・一次式 =====
import { gcd } from './util';

export class Frac {
  readonly n: number;
  readonly d: number;
  constructor(n: number, d = 1) {
    if (d === 0) throw new Error('division by zero');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }
  static of(x: number | Frac): Frac {
    return x instanceof Frac ? x : Frac.fromDecimal(x);
  }
  static fromDecimal(x: number): Frac {
    if (Number.isInteger(x)) return new Frac(x, 1);
    const s = x.toString();
    const dec = s.includes('.') ? s.split('.')[1].length : 0;
    const p = Math.pow(10, Math.min(dec, 9));
    return new Frac(Math.round(x * p), p);
  }
  add(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d - b.n * this.d, this.d * b.d);
  }
  mul(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.n, this.d * b.d);
  }
  div(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d, this.d * b.n);
  }
  neg() {
    return new Frac(-this.n, this.d);
  }
  eq(o: Frac | number) {
    const b = Frac.of(o);
    return this.n === b.n && this.d === b.d;
  }
  isInt() {
    return this.d === 1;
  }
  value() {
    return this.n / this.d;
  }
  /** 表示用 "3/4" / "-5" / 帯分数 "1 1/4"(mixed=true) */
  toString(mixed = false): string {
    if (this.d === 1) return String(this.n);
    if (mixed && Math.abs(this.n) > this.d) {
      const sign = this.n < 0 ? '-' : '';
      const a = Math.abs(this.n);
      return `${sign}${Math.floor(a / this.d)} ${a % this.d}/${this.d}`;
    }
    return `${this.n}/${this.d}`;
  }
  /** 問題文ミニ記法 [[3/4]] 形式 */
  toMarkup(mixed = false): string {
    if (this.d === 1) return this.n < 0 ? `(−${-this.n})` : String(this.n);
    return `[[${this.toString(mixed)}]]`;
  }
}

export interface ParsedNum {
  value: Frac;
  /** 入力が約分済みか（分数入力のときのみ意味がある） */
  reduced: boolean;
  isFraction: boolean;
  isDecimal: boolean;
}

/** "3/4", "1 3/4", "-2", "0.75", "−1/2" をパース */
export function parseNumber(raw: string): ParsedNum | null {
  let s = raw
    .normalize('NFKC')
    .replace(/[−ー―‐]/g, '-')
    .replace(/[÷]/g, '/')
    .trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  // 帯分数 "1 3/4" or "1と3/4"
  let m = s.match(/^(\d+)\s*(?:と|\s)\s*(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const w = +m[1],
      n = +m[2],
      d = +m[3];
    if (d === 0) return null;
    const f = new Frac(w * d + n, d);
    return { value: neg ? f.neg() : f, reduced: gcd(n, d) === 1 && n < d, isFraction: true, isDecimal: false };
  }
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const n = +m[1],
      d = +m[2];
    if (d === 0) return null;
    const f = new Frac(n, d);
    return { value: neg ? f.neg() : f, reduced: gcd(n, d) === 1 && d !== 1, isFraction: true, isDecimal: false };
  }
  m = s.match(/^(\d+)(?:\.(\d+))?$/) || s.match(/^\.(\d+)$/);
  if (m) {
    const f = Frac.fromDecimal(parseFloat(s.startsWith('.') ? '0' + s : s));
    return { value: neg ? f.neg() : f, reduced: true, isFraction: false, isDecimal: s.includes('.') };
  }
  return null;
}

/** 比 "3:4" をパース（小数・分数を含んでもよい） */
export function parseRatio(raw: string): Frac[] | null {
  const parts = raw
    .normalize('NFKC')
    .replace(/[：]/g, ':')
    .split(':')
    .map((p) => p.trim());
  if (parts.length < 2) return null;
  const nums = parts.map((p) => parseNumber(p));
  if (nums.some((n) => !n)) return null;
  return nums.map((n) => n!.value);
}

export function ratioIsSimplest(parts: Frac[]): boolean {
  if (!parts.every((p) => p.isInt() && p.n > 0)) return false;
  return parts.reduce((g, p) => gcd(g, p.n), 0) === 1;
}

export function ratioEquals(a: Frac[], b: Frac[]): boolean {
  if (a.length !== b.length || a.length < 2) return false;
  // a0/a1 == b0/b1 (全項の比)
  for (let i = 1; i < a.length; i++) {
    if (!a[0].mul(b[i]).eq(a[i].mul(b[0]))) return false;
  }
  return true;
}

/** 一次式 ax + b（変数1〜2個）をパース。係数は Frac。 */
export type Linear = Record<string, Frac>; // key '' = 定数項

export function parseLinear(raw: string): Linear | null {
  let s = raw
    .normalize('NFKC')
    .replace(/[−ー―‐]/g, '-')
    .replace(/[×*・]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!s) return null;
  if (!/^[-+0-9a-z./]+$/.test(s)) return null;
  if (!/^[-+]/.test(s)) s = '+' + s;
  const terms = s.match(/[-+][^-+]+/g);
  if (!terms || terms.join('') !== s) return null;
  const out: Linear = {};
  for (const t of terms) {
    const sign = t[0] === '-' ? -1 : 1;
    const body = t.slice(1);
    const m = body.match(/^([0-9./]*)([a-z]?)$/);
    if (!m) return null;
    let coef: Frac;
    if (m[1] === '') {
      if (!m[2]) return null;
      coef = new Frac(1);
    } else {
      const p = parseNumber(m[1]);
      if (!p) return null;
      coef = p.value;
    }
    const v = m[2] || '';
    out[v] = (out[v] ?? new Frac(0)).add(coef.mul(sign));
  }
  for (const k of Object.keys(out)) if (out[k].n === 0) delete out[k];
  return out;
}

export function linearEquals(a: Linear, b: Linear): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k] ?? new Frac(0);
    const y = b[k] ?? new Frac(0);
    if (!x.eq(y)) return false;
  }
  return true;
}

/** 一次式の表示 "2x + 7" / "-x - 3" */
export function linearToString(l: Linear, vars = ['x', 'y', 'a', 'b']): string {
  const keys = [...vars.filter((v) => l[v]), ...Object.keys(l).filter((k) => k && !vars.includes(k)), ''].filter(
    (k) => l[k] && l[k].n !== 0,
  );
  if (!keys.length) return '0';
  let s = '';
  keys.forEach((k, i) => {
    const c = l[k];
    const neg = c.n < 0;
    const abs = neg ? c.neg() : c;
    let body = k ? (abs.eq(1) ? k : `${abs.toString()}${k}`) : abs.toString();
    if (i === 0) s += (neg ? '-' : '') + body;
    else s += (neg ? ' - ' : ' + ') + body;
  });
  return s;
}
