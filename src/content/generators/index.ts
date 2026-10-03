// ===== 自動生成問題（算数・数学・理科の計算） =====
// 何回でも新しい問題が出るので、計算練習を無限にできる。
// 復習スケジュールは「生成器×レベル」を1枚のカードとして管理する。
import type { NumKind, QType, SubjectId } from '../types';
import { Frac, linearToString, type Linear } from '../../lib/frac';
import { gcd, lcm, pick, randInt, type Rng } from '../../lib/util';
import {
  boxFig,
  circleFig,
  cylinderFig,
  leverFig,
  quarterFig,
  semiCircleFig,
  squareMinusQuarterFig,
  trapPrismFig,
  triPrismFig,
} from './figures';

export interface GenOutput {
  prompt: string;
  answer: string;
  accept?: string[];
  explanation: string;
  ask?: string;
  numKind?: NumKind;
  unitSuffix?: string;
  requireSimplest?: boolean;
  figure?: string;
  hint?: string;
  type?: QType;
  choices?: string[];
}

export interface Generator {
  id: string;
  subject: SubjectId;
  unit: string;
  grade: number;
  name: string;
  levels: number;
  base: number; // レベル1の難易度
  levelNames?: string[];
  make: (level: number, rng: Rng) => GenOutput;
}

// ---------- 小さな道具 ----------
const F = (n: number, d = 1) => new Frac(n, d);
const fm = (f: Frac, mixed = false) => f.toMarkup(mixed);
/** 負の数をかっこ付き・マイナス記号で表示 */
const sn = (n: number) => (n < 0 ? `(−${-n})` : `(+${n})`);
const sv = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
const dec = (x: number) => String(parseFloat(x.toFixed(6)));

function properFrac(rng: Rng, dmin = 2, dmax = 9): Frac {
  for (;;) {
    const d = randInt(rng, dmin, dmax);
    const n = randInt(rng, 1, d - 1);
    if (gcd(n, d) === 1) return F(n, d);
  }
}

function mixedFrac(rng: Rng): { f: Frac; text: string } {
  const w = randInt(rng, 1, 3);
  const p = properFrac(rng, 2, 6);
  return { f: F(w * p.d + p.n, p.d), text: `[[${w} ${p.n}/${p.d}]]` };
}

/** 分数のかけ算の途中式（約分の手順つき） */
function mulSteps(a: Frac, b: Frac): string {
  const numer = `${a.n}×${b.n}`;
  const denom = `${a.d}×${b.d}`;
  const prod = new Frac(a.n * b.n, a.d * b.d);
  const unreduced = `[[${a.n * b.n}/${a.d * b.d}]]`;
  const g = gcd(a.n * b.n, a.d * b.d);
  let s = `${fm(a)} × ${fm(b)} = [[${numer}/${denom}]]`;
  if (g > 1) s += ` = ${unreduced} → ${g} で約分して ${fm(prod)}`;
  else s += ` = ${fm(prod)}`;
  if (!prod.isInt() && prod.n > prod.d) s += `（帯分数なら ${fm(prod, true)}）`;
  return s;
}

const fracAnswer = (f: Frac) => ({ answer: f.toString(), accept: f.n > f.d && f.d > 1 ? [f.toString(true)] : [] });

// ---------- 生成器 ----------
export const GENERATORS: Generator[] = [
  {
    id: 'frac-mul',
    subject: 'math',
    unit: 'm6-frac',
    grade: 6,
    name: '分数のかけ算',
    levels: 3,
    base: 2,
    levelNames: ['基本', '約分あり', '帯分数'],
    make(level, rng) {
      let a: Frac, b: Frac, aText: string, bText: string;
      if (level === 1) {
        a = properFrac(rng);
        b = properFrac(rng);
        if (rng() < 0.3) b = F(randInt(rng, 2, 9));
        aText = fm(a);
        bText = fm(b);
      } else if (level === 2) {
        for (;;) {
          a = properFrac(rng, 2, 15);
          b = properFrac(rng, 2, 15);
          if (gcd(a.n, b.d) > 1 || gcd(b.n, a.d) > 1) break;
        }
        aText = fm(a);
        bText = fm(b);
      } else {
        const m1 = mixedFrac(rng);
        const m2 = rng() < 0.5 ? mixedFrac(rng) : { f: properFrac(rng), text: '' };
        a = m1.f;
        b = m2.f;
        aText = m1.text;
        bText = m2.text || fm(b);
      }
      const ans = a.mul(b);
      const pre = level === 3 ? `帯分数は仮分数になおしてから計算します。${aText} = ${fm(a)}${bText.includes(' ') ? `、${bText} = ${fm(b)}` : ''}\n` : '';
      return {
        ask: '計算しよう（約分できるときは約分）',
        prompt: `${aText} × ${bText}`,
        ...fracAnswer(ans),
        explanation: pre + '分母どうし・分子どうしをかけます。とちゅうで約分すると計算が楽になります。\n' + mulSteps(a, b),
        hint: '分子×分子、分母×分母。先に約分すると楽！',
      };
    },
  },
  {
    id: 'frac-div',
    subject: 'math',
    unit: 'm6-frac',
    grade: 6,
    name: '分数のわり算',
    levels: 3,
    base: 2,
    levelNames: ['基本', '整数をふくむ', '帯分数'],
    make(level, rng) {
      let a: Frac, b: Frac, aText: string, bText: string;
      if (level === 1) {
        a = properFrac(rng);
        b = properFrac(rng);
        aText = fm(a);
        bText = fm(b);
      } else if (level === 2) {
        if (rng() < 0.5) {
          a = F(randInt(rng, 2, 9));
          b = properFrac(rng, 2, 9);
        } else {
          a = properFrac(rng, 2, 12);
          b = F(randInt(rng, 2, 9));
        }
        aText = fm(a);
        bText = fm(b);
      } else {
        const m1 = mixedFrac(rng);
        const m2 = mixedFrac(rng);
        a = m1.f;
        b = m2.f;
        aText = m1.text;
        bText = m2.text;
      }
      const inv = F(b.d, b.n);
      const ans = a.div(b);
      const pre = level === 3 ? `帯分数を仮分数になおす：${aText} = ${fm(a)}、${bText} = ${fm(b)}\n` : '';
      return {
        ask: '計算しよう（約分できるときは約分）',
        prompt: `${aText} ÷ ${bText}`,
        ...fracAnswer(ans),
        explanation:
          pre +
          `わる数の分母と分子を入れかえて（逆数にして）かけ算にします。\n${fm(a)} ÷ ${fm(b)} = ${fm(a)} × ${fm(inv)}\n` +
          mulSteps(a, inv),
        hint: 'わる数をひっくり返してかけ算に！',
      };
    },
  },
  {
    id: 'frac-mix',
    subject: 'math',
    unit: 'm6-frac',
    grade: 6,
    name: '分数・小数の混じった計算',
    levels: 3,
    base: 3,
    levelNames: ['小数×分数', '3つの数', 'たし算をふくむ'],
    make(level, rng) {
      if (level === 1) {
        const decs = [0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 1.2, 1.5];
        const d = pick(rng, decs);
        const df = Frac.fromDecimal(d);
        const b = properFrac(rng, 2, 9);
        const ans = df.mul(b);
        return {
          ask: '分数で答えよう',
          prompt: `${d} × ${fm(b)}`,
          ...fracAnswer(ans),
          explanation: `小数を分数になおします。${d} = ${fm(df)}\n` + mulSteps(df, b),
        };
      }
      if (level === 2) {
        const a = properFrac(rng, 2, 9);
        const b = properFrac(rng, 2, 9);
        const c = properFrac(rng, 2, 9);
        const ans = a.mul(b).div(c);
        return {
          ask: '計算しよう',
          prompt: `${fm(a)} × ${fm(b)} ÷ ${fm(c)}`,
          ...fracAnswer(ans),
          explanation: `わり算をかけ算になおして、まとめて計算します。\n${fm(a)} × ${fm(b)} × ${fm(F(c.d, c.n))} = [[${a.n}×${b.n}×${c.d}/${a.d}×${b.d}×${c.n}]] = ${fm(ans)}`,
        };
      }
      const a = properFrac(rng, 2, 6);
      const b = properFrac(rng, 2, 6);
      const k = randInt(rng, 2, 12);
      const sum = a.add(b);
      const ans = sum.mul(k);
      const L = lcm(a.d, b.d);
      return {
        ask: '計算しよう',
        prompt: `(${fm(a)} + ${fm(b)}) × ${k}`,
        ...fracAnswer(ans),
        explanation: `かっこの中を先に計算します。通分して ${fm(a)} + ${fm(b)} = [[${a.n * (L / a.d)}/${L}]] + [[${b.n * (L / b.d)}/${L}]] = ${fm(sum)}\n${fm(sum)} × ${k} = ${fm(ans)}${ans.n > ans.d && !ans.isInt() ? `（${fm(ans, true)}）` : ''}\n（分配法則で ${fm(a)}×${k} + ${fm(b)}×${k} としても同じ答え）`,
      };
    },
  },
  {
    id: 'letter-expr',
    subject: 'math',
    unit: 'm6-moji',
    grade: 6,
    name: 'x にあてはまる数',
    levels: 3,
    base: 2,
    levelNames: ['かけ算・たし算', 'わり算・2段階', 'かっこ・小数'],
    make(level, rng) {
      const x = randInt(rng, 2, 15);
      if (level === 1) {
        if (rng() < 0.5) {
          const a = randInt(rng, 2, 9);
          return {
            ask: 'x にあてはまる数を求めよう',
            prompt: `x × ${a} = ${x * a}`,
            answer: String(x),
            explanation: `x = ${x * a} ÷ ${a} = ${x}\nかけ算の答えから、かけた数でわればもとの数がわかります。`,
          };
        }
        const a = randInt(rng, 3, 40);
        return {
          ask: 'x にあてはまる数を求めよう',
          prompt: `x + ${a} = ${x + a}`,
          answer: String(x),
          explanation: `x = ${x + a} − ${a} = ${x}`,
        };
      }
      if (level === 2) {
        if (rng() < 0.5) {
          const a = randInt(rng, 2, 8);
          return {
            ask: 'x にあてはまる数を求めよう',
            prompt: `x ÷ ${a} = ${x}`,
            answer: String(x * a),
            explanation: `x = ${x} × ${a} = ${x * a}\nわり算の逆はかけ算です。`,
          };
        }
        const a = randInt(rng, 2, 9);
        const b = randInt(rng, 1, 30);
        return {
          ask: 'x にあてはまる数を求めよう',
          prompt: `x × ${a} + ${b} = ${x * a + b}`,
          answer: String(x),
          explanation: `まず x × ${a} = ${x * a + b} − ${b} = ${x * a}\nx = ${x * a} ÷ ${a} = ${x}`,
        };
      }
      if (rng() < 0.5) {
        const a = randInt(rng, 2, 9);
        const b = randInt(rng, 2, 6);
        return {
          ask: 'x にあてはまる数を求めよう',
          prompt: `(x + ${a}) × ${b} = ${(x + a) * b}`,
          answer: String(x),
          explanation: `x + ${a} = ${(x + a) * b} ÷ ${b} = ${x + a}\nx = ${x + a} − ${a} = ${x}`,
        };
      }
      const d = pick(rng, [0.2, 0.4, 0.5, 0.8, 1.5, 2.5]);
      const val = dec(x * d);
      return {
        ask: 'x にあてはまる数を求めよう',
        prompt: `x × ${d} = ${val}`,
        answer: String(x),
        explanation: `x = ${val} ÷ ${d} = ${x}`,
      };
    },
  },
  {
    id: 'circle-area',
    subject: 'math',
    unit: 'm6-en',
    grade: 6,
    name: '円の面積',
    levels: 3,
    base: 2,
    levelNames: ['半径', '直径・半円', 'おうぎ形・組み合わせ'],
    make(level, rng) {
      const pi = '（円周率は 3.14）';
      if (level === 1) {
        const r = randInt(rng, 2, 10);
        return {
          ask: `面積を求めよう${pi}`,
          prompt: `半径 ${r} cm の円の面積`,
          answer: dec(r * r * 3.14),
          unitSuffix: 'cm²',
          figure: circleFig(`${r}cm`, 'r'),
          explanation: `円の面積 = 半径 × 半径 × 3.14\n${r} × ${r} × 3.14 = ${dec(r * r * 3.14)}（cm²）`,
          hint: '半径 × 半径 × 3.14',
        };
      }
      if (level === 2) {
        if (rng() < 0.5) {
          const d = randInt(rng, 2, 10) * 2;
          const r = d / 2;
          return {
            ask: `面積を求めよう${pi}`,
            prompt: `直径 ${d} cm の円の面積`,
            answer: dec(r * r * 3.14),
            unitSuffix: 'cm²',
            figure: circleFig(`${d}cm`, 'd'),
            explanation: `直径 ${d} cm なので、半径は ${d} ÷ 2 = ${r} cm\n${r} × ${r} × 3.14 = ${dec(r * r * 3.14)}（cm²）\n※直径のままかけないように注意！`,
          };
        }
        const r = randInt(rng, 2, 10);
        return {
          ask: `面積を求めよう${pi}`,
          prompt: `半径 ${r} cm の半円の面積`,
          answer: dec((r * r * 3.14) / 2),
          unitSuffix: 'cm²',
          figure: semiCircleFig(`${r}cm`),
          explanation: `円の面積の半分です。\n${r} × ${r} × 3.14 ÷ 2 = ${dec((r * r * 3.14) / 2)}（cm²）`,
        };
      }
      const r = pick(rng, [2, 4, 6, 8, 10, 12]);
      if (rng() < 0.5) {
        return {
          ask: `面積を求めよう${pi}`,
          prompt: `半径 ${r} cm、中心角 90° のおうぎ形の面積`,
          answer: dec((r * r * 3.14) / 4),
          unitSuffix: 'cm²',
          figure: quarterFig(`${r}cm`),
          explanation: `中心角 90° は円の 1/4。\n${r} × ${r} × 3.14 ÷ 4 = ${dec((r * r * 3.14) / 4)}（cm²）`,
        };
      }
      const sq = r * r;
      const q = (r * r * 3.14) / 4;
      return {
        ask: `色のついた部分の面積を求めよう${pi}`,
        prompt: `1辺 ${r} cm の正方形から、半径 ${r} cm のおうぎ形（中心角90°）を取りのぞいた部分`,
        answer: dec(sq - q),
        unitSuffix: 'cm²',
        figure: squareMinusQuarterFig(`${r}cm`),
        explanation: `正方形 ${r}×${r} = ${sq}（cm²）\nおうぎ形 ${r}×${r}×3.14÷4 = ${dec(q)}（cm²）\n${sq} − ${dec(q)} = ${dec(sq - q)}（cm²）`,
      };
    },
  },
  {
    id: 'prism-volume',
    subject: 'math',
    unit: 'm6-taiseki',
    grade: 6,
    name: '角柱・円柱の体積',
    levels: 3,
    base: 2,
    levelNames: ['四角柱・三角柱', '円柱', 'いろいろな柱'],
    make(level, rng) {
      if (level === 1) {
        if (rng() < 0.5) {
          const a = randInt(rng, 2, 10),
            b = randInt(rng, 2, 10),
            c = randInt(rng, 2, 12);
          return {
            ask: '体積を求めよう',
            prompt: `たて ${b} cm、横 ${a} cm、高さ ${c} cm の四角柱（直方体）`,
            answer: String(a * b * c),
            unitSuffix: 'cm³',
            figure: boxFig(`${a}cm`, `${c}cm`, `${b}cm`),
            explanation: `角柱の体積 = 底面積 × 高さ\n底面積 ${b}×${a} = ${a * b}（cm²）\n${a * b} × ${c} = ${a * b * c}（cm³）`,
          };
        }
        const base = randInt(rng, 2, 8) * 2,
          h = randInt(rng, 2, 9),
          len = randInt(rng, 3, 12);
        return {
          ask: '体積を求めよう',
          prompt: `底面が、底辺 ${base} cm・高さ ${h} cm の直角三角形で、高さが ${len} cm の三角柱`,
          answer: String((base * h * len) / 2),
          unitSuffix: 'cm³',
          figure: triPrismFig(`${base}cm`, `${h}cm`, `${len}cm`),
          explanation: `底面積 = ${base} × ${h} ÷ 2 = ${(base * h) / 2}（cm²）\n体積 = ${(base * h) / 2} × ${len} = ${(base * h * len) / 2}（cm³）`,
        };
      }
      if (level === 2) {
        const r = randInt(rng, 1, 6),
          h = randInt(rng, 2, 10);
        const v = r * r * 3.14 * h;
        return {
          ask: '体積を求めよう（円周率は 3.14）',
          prompt: `底面の半径 ${r} cm、高さ ${h} cm の円柱`,
          answer: dec(v),
          unitSuffix: 'cm³',
          figure: cylinderFig(`${r}cm`, `${h}cm`),
          explanation: `底面積 = ${r}×${r}×3.14 = ${dec(r * r * 3.14)}（cm²）\n体積 = ${dec(r * r * 3.14)} × ${h} = ${dec(v)}（cm³）`,
        };
      }
      if (rng() < 0.5) {
        const top = randInt(rng, 2, 6),
          bottom = top + randInt(rng, 2, 6),
          h = randInt(rng, 2, 6) * 2,
          len = randInt(rng, 3, 10);
        const baseArea = ((top + bottom) * h) / 2;
        return {
          ask: '体積を求めよう',
          prompt: `底面が上底 ${top} cm・下底 ${bottom} cm・高さ ${h} cm の台形で、高さ ${len} cm の四角柱`,
          answer: dec(baseArea * len),
          unitSuffix: 'cm³',
          figure: trapPrismFig(`${top}cm`, `${bottom}cm`, `${h}cm`, `${len}cm`),
          explanation: `底面積 = (${top} + ${bottom}) × ${h} ÷ 2 = ${baseArea}（cm²）\n体積 = ${baseArea} × ${len} = ${dec(baseArea * len)}（cm³）`,
        };
      }
      const d = randInt(rng, 1, 5) * 2,
        h = randInt(rng, 3, 10);
      const r = d / 2;
      return {
        ask: '体積を求めよう（円周率は 3.14）',
        prompt: `底面の直径 ${d} cm、高さ ${h} cm の円柱`,
        answer: dec(r * r * 3.14 * h),
        unitSuffix: 'cm³',
        figure: cylinderFig(`半径?`, `${h}cm`),
        explanation: `半径 = ${d} ÷ 2 = ${r} cm\n${r}×${r}×3.14×${h} = ${dec(r * r * 3.14 * h)}（cm³）`,
      };
    },
  },
  {
    id: 'ratio-simplify',
    subject: 'math',
    unit: 'm6-hi',
    grade: 6,
    name: '比を簡単にする',
    levels: 3,
    base: 2,
    levelNames: ['整数', '小数', '分数'],
    make(level, rng) {
      let p: number, q: number;
      do {
        p = randInt(rng, 1, 9);
        q = randInt(rng, 1, 9);
      } while (gcd(p, q) !== 1 || p === q);
      const ask = 'いちばん簡単な整数の比にしよう';
      if (level === 1) {
        const k = randInt(rng, 2, 9);
        return {
          ask,
          prompt: `${p * k} : ${q * k}`,
          answer: `${p}:${q}`,
          numKind: 'ratio',
          explanation: `両方を最大公約数の ${k} でわります。\n${p * k} : ${q * k} = ${p} : ${q}`,
        };
      }
      if (level === 2) {
        const k = pick(rng, [1, 2, 3, 4, 5, 6]);
        const a = dec((p * k) / 10),
          b = dec((q * k) / 10);
        return {
          ask,
          prompt: `${a} : ${b}`,
          answer: `${p}:${q}`,
          numKind: 'ratio',
          explanation: `まず両方を10倍して整数にします。${a} : ${b} = ${p * k} : ${q * k}\n${k > 1 ? `両方を ${k} でわって ` : ''}${p} : ${q}`,
        };
      }
      const a = properFrac(rng, 2, 9),
        b = properFrac(rng, 2, 9);
      const L = lcm(a.d, b.d);
      const x = a.n * (L / a.d),
        y = b.n * (L / b.d);
      const g = gcd(x, y);
      return {
        ask,
        prompt: `${fm(a)} : ${fm(b)}`,
        answer: `${x / g}:${y / g}`,
        numKind: 'ratio',
        explanation: `分母の最小公倍数 ${L} を両方にかけます。\n${fm(a)}×${L} : ${fm(b)}×${L} = ${x} : ${y}${g > 1 ? `\n${g} でわって ${x / g} : ${y / g}` : ''}`,
      };
    },
  },
  {
    id: 'ratio-value',
    subject: 'math',
    unit: 'm6-hi',
    grade: 6,
    name: '比の値',
    levels: 2,
    base: 2,
    make(level, rng) {
      const a = randInt(rng, 1, level === 1 ? 9 : 24),
        b = randInt(rng, 2, level === 1 ? 9 : 24);
      const v = F(a, b);
      return {
        ask: '比の値を求めよう',
        prompt: `${a} : ${b}`,
        ...fracAnswer(v),
        explanation: `比の値は「前の数 ÷ 後ろの数」。\n${a} ÷ ${b} = ${fm(v)}`,
      };
    },
  },
  {
    id: 'ratio-solve',
    subject: 'math',
    unit: 'm6-hi',
    grade: 6,
    name: '比の x を求める',
    levels: 3,
    base: 2,
    levelNames: ['かける', 'わる', '文章題'],
    make(level, rng) {
      let p: number, q: number;
      do {
        p = randInt(rng, 1, 9);
        q = randInt(rng, 2, 9);
      } while (gcd(p, q) !== 1);
      const k = randInt(rng, 2, 9);
      if (level === 1) {
        return {
          ask: 'x にあてはまる数を求めよう',
          prompt: `${p} : ${q} = x : ${q * k}`,
          answer: String(p * k),
          explanation: `${q} → ${q * k} は ${k} 倍。だから x = ${p} × ${k} = ${p * k}`,
        };
      }
      if (level === 2) {
        return {
          ask: 'x にあてはまる数を求めよう',
          prompt: `${p * k} : x = ${p} : ${q}`,
          answer: String(q * k),
          explanation: `${p * k} → ${p} は ${k} でわっている。だから x = ${q} × ${k} = ${q * k}`,
        };
      }
      const t = pick(rng, [
        () => ({
          prompt: `砂糖と小麦粉を ${p} : ${q} の割合で混ぜます。小麦粉を ${q * k * 10} g 使うとき、砂糖は何 g？`,
          ans: p * k * 10,
          unit: 'g',
          ex: `${q} : ${q * k * 10} より、${k * 10} 倍。砂糖 = ${p} × ${k * 10} = ${p * k * 10}（g）`,
        }),
        () => ({
          prompt: `たてと横の長さの比が ${p} : ${q} の長方形があります。横が ${q * k} cm のとき、たては何 cm？`,
          ans: p * k,
          unit: 'cm',
          ex: `${q} → ${q * k} は ${k} 倍。たて = ${p} × ${k} = ${p * k}（cm）`,
        }),
      ])();
      return { ask: '', prompt: t.prompt, answer: String(t.ans), unitSuffix: t.unit, explanation: t.ex };
    },
  },
  {
    id: 'ratio-split',
    subject: 'math',
    unit: 'm6-hi',
    grade: 6,
    name: '比で分ける',
    levels: 3,
    base: 3,
    levelNames: ['全体を分ける', '差から求める', '3つに分ける'],
    make(level, rng) {
      let p: number, q: number;
      do {
        p = randInt(rng, 2, 9);
        q = randInt(rng, 1, 8);
      } while (gcd(p, q) !== 1 || p <= q);
      const unit = pick(rng, [50, 100, 200, 300]);
      if (level === 1) {
        const total = (p + q) * unit;
        return {
          prompt: `${total} 円を、兄と弟で ${p} : ${q} になるように分けます。兄は何円？`,
          answer: String(p * unit),
          unitSuffix: '円',
          explanation: `全体を ${p} + ${q} = ${p + q} とみる。\n1 あたり ${total} ÷ ${p + q} = ${unit} 円\n兄 = ${unit} × ${p} = ${p * unit}（円）\n（兄は全体の [[${p}/${p + q}]] と考えてもよい）`,
        };
      }
      if (level === 2) {
        const diff = (p - q) * unit;
        return {
          prompt: `姉と妹の持っているお金の比は ${p} : ${q} で、姉は妹より ${diff} 円多く持っています。姉は何円持っている？`,
          answer: String(p * unit),
          unitSuffix: '円',
          explanation: `差の ${p} − ${q} = ${p - q} が ${diff} 円にあたる。\n1 あたり ${diff} ÷ ${p - q} = ${unit} 円\n姉 = ${unit} × ${p} = ${p * unit}（円）`,
        };
      }
      const r = randInt(rng, 1, 5);
      const total = (p + q + r) * unit;
      return {
        prompt: `${total} 円を A、B、C の3人で ${p} : ${q} : ${r} に分けます。C は何円？`,
        answer: String(r * unit),
        unitSuffix: '円',
        explanation: `全体を ${p}+${q}+${r} = ${p + q + r} とみる。\n1 あたり ${total} ÷ ${p + q + r} = ${unit} 円\nC = ${unit} × ${r} = ${r * unit}（円）`,
      };
    },
  },
  {
    id: 'scale-map',
    subject: 'math',
    unit: 'm6-kakudai',
    grade: 6,
    name: '縮尺の計算',
    levels: 3,
    base: 2,
    levelNames: ['m で答える', 'km で答える', '地図上の長さ'],
    make(level, rng) {
      if (level === 1) {
        const s = pick(rng, [1000, 2000, 5000, 10000]);
        const cm = randInt(rng, 2, 9);
        const m = (cm * s) / 100;
        return {
          ask: '実際の長さを求めよう',
          prompt: `縮尺 1 : ${s} の地図で ${cm} cm の長さは、実際には何 m？`,
          answer: dec(m),
          unitSuffix: 'm',
          explanation: `実際の長さ = 地図上の長さ × ${s}\n${cm} × ${s} = ${cm * s} cm = ${dec(m)} m\n（100 cm = 1 m）`,
        };
      }
      if (level === 2) {
        const s = pick(rng, [20000, 25000, 50000, 100000]);
        const cm = pick(rng, [2, 4, 6, 8, 10, 12]);
        const km = (cm * s) / 100000;
        return {
          ask: '実際の長さを求めよう',
          prompt: `縮尺 1 : ${s} の地図で ${cm} cm の長さは、実際には何 km？`,
          answer: dec(km),
          unitSuffix: 'km',
          explanation: `${cm} × ${s} = ${cm * s} cm\n1 km = 100000 cm なので ${cm * s} ÷ 100000 = ${dec(km)} km`,
        };
      }
      const s = pick(rng, [10000, 25000, 50000]);
      const km = pick(rng, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
      const cm = (km * 100000) / s;
      return {
        ask: '地図上の長さを求めよう',
        prompt: `実際の距離 ${km} km は、縮尺 1 : ${s} の地図では何 cm？`,
        answer: dec(cm),
        unitSuffix: 'cm',
        explanation: `${km} km = ${dec(km * 100000)} cm\n地図上 = ${dec(km * 100000)} ÷ ${s} = ${dec(cm)} cm`,
      };
    },
  },
  {
    id: 'proportion',
    subject: 'math',
    unit: 'm6-hirei',
    grade: 6,
    name: '比例・反比例の計算',
    levels: 3,
    base: 2,
    levelNames: ['比例', '反比例', '式を求める'],
    make(level, rng) {
      if (level === 1) {
        const a = randInt(rng, 2, 9),
          x1 = randInt(rng, 2, 6);
        let x2 = randInt(rng, 2, 12);
        if (x2 === x1) x2++;
        return {
          ask: 'y の値を求めよう',
          prompt: `y は x に比例し、x = ${x1} のとき y = ${a * x1} です。x = ${x2} のとき y は？`,
          answer: String(a * x2),
          explanation: `比例の式 y = きまった数 × x\nきまった数 = ${a * x1} ÷ ${x1} = ${a}\ny = ${a} × ${x2} = ${a * x2}`,
        };
      }
      if (level === 2) {
        const k = pick(rng, [12, 18, 24, 30, 36, 48, 60, 72]);
        const divs = Array.from({ length: k }, (_, i) => i + 1).filter((d) => k % d === 0 && d > 1 && d < k);
        const x1 = pick(rng, divs);
        let x2 = pick(rng, divs);
        if (x2 === x1) x2 = divs[(divs.indexOf(x1) + 1) % divs.length];
        return {
          ask: 'y の値を求めよう',
          prompt: `y は x に反比例し、x = ${x1} のとき y = ${k / x1} です。x = ${x2} のとき y は？`,
          answer: String(k / x2),
          explanation: `反比例では x × y がいつも同じ（きまった数）。\n${x1} × ${k / x1} = ${k}\ny = ${k} ÷ ${x2} = ${k / x2}`,
        };
      }
      if (rng() < 0.5) {
        const x = randInt(rng, 2, 8),
          y = randInt(rng, 3, 30);
        const a = F(y, x);
        return {
          ask: 'きまった数を求めよう',
          prompt: `y は x に比例し、x = ${x} のとき y = ${y} です。y = □ × x の □ は？`,
          answer: a.toString(),
          accept: Number.isInteger((y / x) * 10) ? [dec(y / x)] : [],
          explanation: `□ = y ÷ x = ${y} ÷ ${x} = ${fm(a)}${!a.isInt() && Number.isInteger((y / x) * 10) ? `（= ${dec(y / x)}）` : ''}`,
        };
      }
      const x = randInt(rng, 2, 9),
        y = randInt(rng, 2, 9);
      return {
        ask: 'きまった数を求めよう',
        prompt: `y は x に反比例し、x = ${x} のとき y = ${y} です。y = □ ÷ x の □ は？`,
        answer: String(x * y),
        explanation: `反比例の式 y = きまった数 ÷ x\nきまった数 = x × y = ${x} × ${y} = ${x * y}`,
      };
    },
  },
  {
    id: 'speed',
    subject: 'math',
    unit: 'm6-hayasa',
    grade: 6,
    name: '速さ・時間・道のり',
    levels: 3,
    base: 2,
    levelNames: ['基本', '単位の変換', '分を使う'],
    make(level, rng) {
      if (level === 1) {
        const v = pick(rng, [4, 5, 15, 20, 30, 40, 45, 50, 60, 80]);
        const t = randInt(rng, 2, 6);
        const kind = randInt(rng, 0, 2);
        if (kind === 0)
          return {
            prompt: `時速 ${v} km で ${t} 時間進むと、何 km 進む？`,
            answer: String(v * t),
            unitSuffix: 'km',
            explanation: `道のり = 速さ × 時間\n${v} × ${t} = ${v * t}（km）`,
            hint: '「み・は・じ」：道のり＝速さ×時間',
          };
        if (kind === 1)
          return {
            prompt: `${v * t} km を ${t} 時間で進みました。時速何 km？`,
            answer: String(v),
            unitSuffix: 'km',
            explanation: `速さ = 道のり ÷ 時間\n${v * t} ÷ ${t} = ${v}（時速 ${v} km）`,
          };
        return {
          prompt: `時速 ${v} km で ${v * t} km 進むのに、何時間かかる？`,
          answer: String(t),
          unitSuffix: '時間',
          explanation: `時間 = 道のり ÷ 速さ\n${v * t} ÷ ${v} = ${t}（時間）`,
        };
      }
      if (level === 2) {
        const kind = randInt(rng, 0, 2);
        if (kind === 0) {
          const m = pick(rng, [50, 100, 150, 200, 250, 300, 500, 600, 750, 800]);
          return {
            prompt: `分速 ${m} m は、時速何 km？`,
            answer: dec((m * 60) / 1000),
            unitSuffix: 'km',
            explanation: `1時間 = 60分なので、1時間に ${m} × 60 = ${m * 60} m 進む。\n${m * 60} m = ${dec((m * 60) / 1000)} km → 時速 ${dec((m * 60) / 1000)} km`,
          };
        }
        if (kind === 1) {
          const s = pick(rng, [5, 10, 15, 20, 25, 30]);
          return {
            prompt: `秒速 ${s} m は、時速何 km？`,
            answer: dec((s * 3600) / 1000),
            unitSuffix: 'km',
            explanation: `1時間 = 3600秒。${s} × 3600 = ${s * 3600} m = ${dec((s * 3600) / 1000)} km`,
          };
        }
        const k = pick(rng, [6, 12, 18, 24, 30, 36, 48, 60]);
        return {
          prompt: `時速 ${k} km は、分速何 m？`,
          answer: String((k * 1000) / 60),
          unitSuffix: 'm',
          explanation: `${k} km = ${k * 1000} m を 60 分で進む。\n${k * 1000} ÷ 60 = ${(k * 1000) / 60} → 分速 ${(k * 1000) / 60} m`,
        };
      }
      if (rng() < 0.5) {
        const v = pick(rng, [24, 36, 40, 48, 60, 72]);
        const mins = pick(rng, [15, 20, 30, 40, 45, 50]);
        const d = (v * mins) / 60;
        if (!Number.isInteger(d * 10)) return this.make(3, rng);
        return {
          prompt: `時速 ${v} km で ${mins} 分進むと、何 km 進む？`,
          answer: dec(d),
          unitSuffix: 'km',
          explanation: `${mins} 分 = [[${mins}/60]] 時間 = ${dec(mins / 60)} 時間\n${v} × ${dec(mins / 60)} = ${dec(d)}（km）`,
        };
      }
      const v = pick(rng, [50, 60, 75, 80, 90, 120]);
      const t = randInt(rng, 5, 30);
      return {
        prompt: `${dec((v * t) / 1000)} km の道を、分速 ${v} m で歩くと何分かかる？`,
        answer: String(t),
        unitSuffix: '分',
        explanation: `単位をそろえる：${dec((v * t) / 1000)} km = ${v * t} m\n${v * t} ÷ ${v} = ${t}（分）`,
      };
    },
  },
  {
    id: 'percent',
    subject: 'math',
    unit: 'm6-wariai',
    grade: 6,
    name: '割合・百分率',
    levels: 3,
    base: 2,
    levelNames: ['比べる量', '割合・もとにする量', '割引・利益'],
    make(level, rng) {
      if (level === 1) {
        const base = pick(rng, [200, 300, 400, 500, 600, 800, 1200, 1500, 2000]);
        const p = pick(rng, [5, 10, 15, 20, 25, 30, 40, 60, 75]);
        return {
          prompt: `${base} 円の ${p}% は何円？`,
          answer: dec((base * p) / 100),
          unitSuffix: '円',
          explanation: `比べる量 = もとにする量 × 割合\n${p}% = ${dec(p / 100)}\n${base} × ${dec(p / 100)} = ${dec((base * p) / 100)}（円）`,
          hint: '％は100でわって小数にしよう',
        };
      }
      if (level === 2) {
        if (rng() < 0.5) {
          const base = pick(rng, [20, 40, 50, 80, 120, 150, 200, 250]);
          const p = pick(rng, [10, 20, 30, 40, 60, 80]);
          const part = (base * p) / 100;
          return {
            prompt: `${part} 人は ${base} 人の何 % ？`,
            answer: String(p),
            unitSuffix: '%',
            explanation: `割合 = 比べる量 ÷ もとにする量\n${part} ÷ ${base} = ${dec(p / 100)} → ${p}%`,
          };
        }
        const base = pick(rng, [200, 400, 500, 800, 1000, 1200]);
        const p = pick(rng, [20, 25, 40, 60, 75]);
        const part = (base * p) / 100;
        return {
          prompt: `ある金額の ${p}% が ${part} 円です。もとの金額は何円？`,
          answer: String(base),
          unitSuffix: '円',
          explanation: `もとにする量 = 比べる量 ÷ 割合\n${part} ÷ ${dec(p / 100)} = ${base}（円）`,
        };
      }
      const kind = randInt(rng, 0, 2);
      if (kind === 0) {
        const price = pick(rng, [1000, 1200, 1500, 2000, 2400, 3000, 4500]);
        const wari = randInt(rng, 1, 4);
        return {
          prompt: `定価 ${price} 円の品物を ${wari} 割引きで買うと何円？`,
          answer: String((price * (10 - wari)) / 10),
          unitSuffix: '円',
          explanation: `${wari} 割引き → 定価の ${10 - wari} 割（${dec((10 - wari) / 10)}）を払う。\n${price} × ${dec((10 - wari) / 10)} = ${(price * (10 - wari)) / 10}（円）`,
        };
      }
      if (kind === 1) {
        const price = pick(rng, [800, 1200, 1600, 2000, 2400]);
        const p = pick(rng, [15, 20, 25, 35]);
        return {
          prompt: `${price} 円の品物が ${p}% 引きで売られています。代金は何円？`,
          answer: dec((price * (100 - p)) / 100),
          unitSuffix: '円',
          explanation: `${p}% 引き → ${100 - p}% を払う。\n${price} × ${dec((100 - p) / 100)} = ${dec((price * (100 - p)) / 100)}（円）`,
        };
      }
      const cost = pick(rng, [400, 600, 800, 1000, 1200]);
      const p = pick(rng, [20, 25, 30, 50]);
      return {
        prompt: `原価 ${cost} 円の品物に、原価の ${p}% の利益を見こんで定価をつけます。定価は何円？`,
        answer: String((cost * (100 + p)) / 100),
        unitSuffix: '円',
        explanation: `定価 = 原価 × (1 + ${dec(p / 100)}) = ${cost} × ${dec(1 + p / 100)} = ${(cost * (100 + p)) / 100}（円）`,
      };
    },
  },
  {
    id: 'cases',
    subject: 'math',
    unit: 'm6-baai',
    grade: 6,
    name: '場合の数',
    levels: 3,
    base: 2,
    levelNames: ['並べ方', 'カードで整数', '組み合わせ'],
    make(level, rng) {
      if (level === 1) {
        if (rng() < 0.5) {
          const n = pick(rng, [3, 4]);
          const fact = n === 3 ? 6 : 24;
          return {
            prompt: `${n} 人が一列に並ぶ並び方は、全部で何通り？`,
            answer: String(fact),
            unitSuffix: '通り',
            explanation: `1番目は ${n} 通り、2番目は残りの ${n - 1} 通り…\n${Array.from({ length: n }, (_, i) => n - i).join(' × ')} = ${fact}（通り）\n樹形図をかくと落ちや重なりなく数えられます。`,
          };
        }
        const n = pick(rng, [4, 5]);
        return {
          prompt: `${n} 人の中から、リレーの第1走者と第2走者を選びます。選び方は何通り？`,
          answer: String(n * (n - 1)),
          unitSuffix: '通り',
          explanation: `第1走者は ${n} 通り、第2走者は残りの ${n - 1} 通り。\n${n} × ${n - 1} = ${n * (n - 1)}（通り）`,
        };
      }
      if (level === 2) {
        if (rng() < 0.6) {
          const n = pick(rng, [3, 4, 5]);
          const k = n === 3 ? 2 : pick(rng, [2, 3]);
          let v = 1;
          for (let i = 0; i < k; i++) v *= n - i;
          return {
            prompt: `${Array.from({ length: n }, (_, i) => i + 1).join('、')} の ${n} 枚のカードから ${k} 枚を並べて、${k} けたの整数をつくります。全部で何通り？`,
            answer: String(v),
            unitSuffix: '通り',
            explanation: `${Array.from({ length: k }, (_, i) => n - i).join(' × ')} = ${v}（通り）`,
          };
        }
        return {
          prompt: '0、1、2、3 の4枚のカードから3枚を並べて、3けたの整数をつくります。全部で何通り？',
          answer: '18',
          unitSuffix: '通り',
          explanation: '百の位に 0 は使えないので 3 通り。十の位は残り 3 通り、一の位は残り 2 通り。\n3 × 3 × 2 = 18（通り）',
        };
      }
      const kind = randInt(rng, 0, 2);
      if (kind === 0) {
        const n = randInt(rng, 4, 8);
        return {
          prompt: `${n} チームが、どのチームとも1回ずつ試合をします（総当たり戦）。試合は全部で何試合？`,
          answer: String((n * (n - 1)) / 2),
          unitSuffix: '試合',
          explanation: `1チームは ${n - 1} 試合。${n} × ${n - 1} = ${n * (n - 1)} だが、A対B と B対A は同じ試合なので 2 でわる。\n${n * (n - 1)} ÷ 2 = ${(n * (n - 1)) / 2}（試合）`,
        };
      }
      if (kind === 1) {
        const n = randInt(rng, 4, 6);
        return {
          prompt: `${n} 種類のアイスから 2 種類を選びます。選び方は何通り？`,
          answer: String((n * (n - 1)) / 2),
          unitSuffix: '通り',
          explanation: `並べ方なら ${n} × ${n - 1} = ${n * (n - 1)} 通りだが、選ぶだけなので順番は関係ない。\n${n * (n - 1)} ÷ 2 = ${(n * (n - 1)) / 2}（通り）`,
        };
      }
      const n = pick(rng, [3, 4]);
      return {
        prompt: `1枚のコインを ${n} 回投げます。表・裏の出方は全部で何通り？`,
        answer: String(2 ** n),
        unitSuffix: '通り',
        explanation: `1回ごとに表・裏の 2 通り。${Array(n).fill(2).join(' × ')} = ${2 ** n}（通り）`,
      };
    },
  },
  {
    id: 'data-stats',
    subject: 'math',
    unit: 'm6-data',
    grade: 6,
    name: '平均値・中央値・最頻値',
    levels: 3,
    base: 2,
    levelNames: ['平均値', '中央値', '最頻値・範囲'],
    make(level, rng) {
      if (level === 1) {
        for (;;) {
          const n = randInt(rng, 4, 7);
          const vals = Array.from({ length: n }, () => randInt(rng, 3, 10));
          const sum = vals.reduce((a, b) => a + b, 0);
          if (sum % n !== 0) continue;
          return {
            prompt: `${n} 人の小テストの点数：${vals.join('、')}（点）\n平均値は何点？`,
            answer: String(sum / n),
            unitSuffix: '点',
            explanation: `平均値 = 合計 ÷ 個数\n合計 ${vals.join('+')} = ${sum}\n${sum} ÷ ${n} = ${sum / n}（点）`,
          };
        }
      }
      if (level === 2) {
        const n = randInt(rng, 5, 8);
        const vals = Array.from({ length: n }, () => randInt(rng, 10, 40));
        const s = vals.slice().sort((a, b) => a - b);
        const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
        return {
          prompt: `ソフトボール投げの記録：${vals.join('、')}（m）\n中央値は何 m？`,
          answer: dec(med),
          unitSuffix: 'm',
          explanation: `小さい順に並べる：${s.join('、')}\n${n % 2 ? `${n} 個なので、真ん中の ${(n + 1) / 2} 番目 → ${med}` : `${n} 個（偶数）なので、真ん中の2つ ${s[n / 2 - 1]} と ${s[n / 2]} の平均 → ${dec(med)}`}`,
        };
      }
      if (rng() < 0.5) {
        for (;;) {
          const n = randInt(rng, 7, 10);
          const vals = Array.from({ length: n }, () => randInt(rng, 18, 26));
          const cnt: Record<number, number> = {};
          vals.forEach((v) => (cnt[v] = (cnt[v] ?? 0) + 1));
          const max = Math.max(...Object.values(cnt));
          const modes = Object.keys(cnt).filter((k) => cnt[+k] === max);
          if (modes.length !== 1 || max < 2) continue;
          return {
            prompt: `くつのサイズ調べ：${vals.join('、')}（cm）\n最頻値は何 cm？`,
            answer: modes[0],
            unitSuffix: 'cm',
            explanation: `最頻値は、いちばん多く出てくる値。\n${modes[0]} が ${max} 回で最も多い。`,
          };
        }
      }
      const n = randInt(rng, 6, 9);
      const vals = Array.from({ length: n }, () => randInt(rng, 120, 160));
      const mx = Math.max(...vals),
        mn = Math.min(...vals);
      return {
        prompt: `身長の記録：${vals.join('、')}（cm）\n最大値と最小値の差（範囲）は何 cm？`,
        answer: String(mx - mn),
        unitSuffix: 'cm',
        explanation: `範囲 = 最大値 − 最小値 = ${mx} − ${mn} = ${mx - mn}（cm）`,
      };
    },
  },
  // ---------- 中1 ----------
  {
    id: 'signed-add',
    subject: 'math',
    unit: 'm7-seifu',
    grade: 7,
    name: '正負の数の加法・減法',
    levels: 3,
    base: 2,
    levelNames: ['2つの数', '3つの数', 'かっこなし'],
    make(level, rng) {
      const nz = (a: number, b: number) => {
        let v = 0;
        while (v === 0) v = randInt(rng, a, b);
        return v;
      };
      if (level === 1) {
        const a = nz(-15, 15),
          b = nz(-15, 15);
        const op = rng() < 0.5 ? '+' : '−';
        const ans = op === '+' ? a + b : a - b;
        return {
          ask: '計算しよう',
          prompt: `${sn(a)} ${op} ${sn(b)}`,
          answer: String(ans),
          explanation:
            op === '−'
              ? `ひく数の符号を変えてたし算に：${sn(a)} + ${sn(-b)} = ${sv(ans)}`
              : `${Math.sign(a) === Math.sign(b) ? '同じ符号 → 絶対値の和に共通の符号' : '異なる符号 → 絶対値の差に、絶対値の大きいほうの符号'}\n答え ${sv(ans)}`,
          hint: 'ひき算は「符号を変えてたす」',
        };
      }
      if (level === 2) {
        const a = nz(-12, 12),
          b = nz(-12, 12),
          c = nz(-12, 12);
        const o1 = rng() < 0.5 ? '+' : '−',
          o2 = rng() < 0.5 ? '+' : '−';
        const b2 = o1 === '+' ? b : -b,
          c2 = o2 === '+' ? c : -c;
        const ans = a + b2 + c2;
        return {
          ask: '計算しよう',
          prompt: `${sn(a)} ${o1} ${sn(b)} ${o2} ${sn(c)}`,
          answer: String(ans),
          explanation: `ひき算をたし算になおす：${sn(a)} + ${sn(b2)} + ${sn(c2)}\n正の数どうし・負の数どうしをまとめると計算しやすい。\n= ${sv(ans)}`,
        };
      }
      const terms = Array.from({ length: 4 }, () => nz(-20, 20));
      const s = terms.map((t, i) => (i === 0 ? sv(t) : t < 0 ? ` − ${-t}` : ` + ${t}`)).join('');
      const pos = terms.filter((t) => t > 0).reduce((a, b) => a + b, 0);
      const neg = terms.filter((t) => t < 0).reduce((a, b) => a + b, 0);
      return {
        ask: '計算しよう',
        prompt: s,
        answer: String(pos + neg),
        explanation: `正の項の和 ${pos}、負の項の和 ${sv(neg)}\n${pos} ${neg < 0 ? `− ${-neg}` : `+ ${neg}`} = ${sv(pos + neg)}`,
      };
    },
  },
  {
    id: 'signed-muldiv',
    subject: 'math',
    unit: 'm7-seifu',
    grade: 7,
    name: '正負の数の乗法・除法・累乗',
    levels: 3,
    base: 2,
    levelNames: ['2つの数', '3つの数', '累乗・四則'],
    make(level, rng) {
      const nz = (a: number, b: number) => {
        let v = 0;
        while (v === 0) v = randInt(rng, a, b);
        return v;
      };
      if (level === 1) {
        const a = nz(-9, 9),
          b = nz(-9, 9);
        if (rng() < 0.5)
          return {
            ask: '計算しよう',
            prompt: `${sn(a)} × ${sn(b)}`,
            answer: String(a * b),
            explanation: `${(a < 0) === (b < 0) ? '同じ符号どうし → 答えは＋' : '異なる符号 → 答えは−'}\n${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(a * b)} → ${sv(a * b)}`,
          };
        return {
          ask: '計算しよう',
          prompt: `${sn(a * b)} ÷ ${sn(b)}`,
          answer: String(a),
          explanation: `${(a * b < 0) === (b < 0) ? '同じ符号 → ＋' : '異なる符号 → −'}\n${Math.abs(a * b)} ÷ ${Math.abs(b)} = ${Math.abs(a)} → ${sv(a)}`,
        };
      }
      if (level === 2) {
        const a = nz(-6, 6),
          b = nz(-6, 6),
          c = nz(-5, 5);
        const prod = a * b * c;
        if (rng() < 0.5) {
          const negs = [a, b, c].filter((x) => x < 0).length;
          return {
            ask: '計算しよう',
            prompt: `${sn(a)} × ${sn(b)} × ${sn(c)}`,
            answer: String(prod),
            explanation: `負の数が ${negs} 個 → ${negs % 2 ? '奇数個なので −' : '偶数個なので ＋'}\n${Math.abs(a)}×${Math.abs(b)}×${Math.abs(c)} = ${Math.abs(prod)} → ${sv(prod)}`,
          };
        }
        return {
          ask: '計算しよう',
          prompt: `${sn(a * b)} ÷ ${sn(b)} × ${sn(c)}`,
          answer: String(a * c),
          explanation: `左から順に計算します。\n${sn(a * b)} ÷ ${sn(b)} = ${sv(a)}\n${sn(a)} × ${sn(c)} = ${sv(a * c)}`,
        };
      }
      const kind = randInt(rng, 0, 3);
      const a = randInt(rng, 2, 6);
      if (kind === 0)
        return {
          ask: '計算しよう',
          prompt: `(−${a})²`,
          answer: String(a * a),
          explanation: `(−${a}) × (−${a}) = ${a * a}`,
        };
      if (kind === 1)
        return {
          ask: '計算しよう',
          prompt: `−${a}²`,
          answer: String(-a * a),
          explanation: `−(${a} × ${a}) = −${a * a}\n「−${a}²」は ${a} を2回かけてから − をつける。(−${a})² とのちがいに注意！`,
        };
      if (kind === 2) {
        const b = pick(rng, [2, 3]);
        return {
          ask: '計算しよう',
          prompt: `(−${b})³`,
          answer: String((-b) ** 3),
          explanation: `(−${b}) × (−${b}) × (−${b}) = ${sv((-b) ** 3)}（負の数を奇数回かけると −）`,
        };
      }
      const b = randInt(rng, 2, 9),
        c = randInt(rng, 2, 4);
      const ans = b - a * (-c) ** 2;
      return {
        ask: '計算しよう',
        prompt: `${b} − ${a} × (−${c})²`,
        answer: String(ans),
        explanation: `累乗 → かけ算 → ひき算 の順。\n(−${c})² = ${c * c}\n${a} × ${c * c} = ${a * c * c}\n${b} − ${a * c * c} = ${sv(ans)}`,
      };
    },
  },
  {
    id: 'expr-simplify',
    subject: 'math',
    unit: 'm7-moji',
    grade: 7,
    name: '文字式の計算',
    levels: 3,
    base: 2,
    levelNames: ['同類項', '定数項もまとめる', 'かっこをはずす'],
    make(level, rng) {
      const nz = (a: number, b: number) => {
        let v = 0;
        while (v === 0) v = randInt(rng, a, b);
        return v;
      };
      const term = (c: number, v: string, first: boolean) => {
        const abs = Math.abs(c);
        const body = v ? (abs === 1 ? v : `${abs}${v}`) : `${abs}`;
        if (first) return (c < 0 ? '−' : '') + body;
        return (c < 0 ? ' − ' : ' + ') + body;
      };
      const out = (l: Linear) => linearToString(l).replace(/-/g, '−');
      if (level === 1) {
        const a = nz(-9, 9),
          b = nz(-9, 9);
        const ans: Linear = { x: F(a + b) };
        return {
          ask: '計算しよう',
          prompt: term(a, 'x', true) + term(b, 'x', false),
          answer: linearToString(ans),
          numKind: 'expr',
          explanation: `同類項（x の項）の係数をたす：(${sv(a)}) + (${sv(b)}) = ${sv(a + b)}\n答え ${out(ans)}`,
        };
      }
      if (level === 2) {
        const a = nz(-9, 9),
          b = nz(-9, 9),
          c = nz(-9, 9),
          d = nz(-9, 9);
        const ans: Linear = { x: F(a + c), '': F(b + d) };
        return {
          ask: '計算しよう',
          prompt: term(a, 'x', true) + term(b, '', false) + term(c, 'x', false) + term(d, '', false),
          answer: linearToString(ans),
          numKind: 'expr',
          explanation: `x の項：${sv(a)}x と ${sv(c)}x → ${sv(a + c)}x\n数の項：${sv(b)} と ${sv(d)} → ${sv(b + d)}\n答え ${out(ans)}`,
        };
      }
      const k = nz(-4, 5),
        a = nz(-5, 5),
        b = nz(-6, 6),
        m = randInt(rng, 1, 4),
        c = nz(-5, 5),
        d = nz(-6, 6);
      const ans: Linear = { x: F(k * a - m * c), '': F(k * b - m * d) };
      const kTxt = k === 1 ? '' : k === -1 ? '−' : sv(k);
      const mTxt = m === 1 ? '' : String(m);
      const inner = (p: number, q: number) => term(p, 'x', true) + term(q, '', false);
      return {
        ask: '計算しよう',
        prompt: `${kTxt}(${inner(a, b)}) − ${mTxt}(${inner(c, d)})`,
        answer: linearToString(ans),
        numKind: 'expr',
        explanation: `分配法則でかっこをはずす（− のあとのかっこは符号が全部変わる）\n${out({ x: F(k * a), '': F(k * b) })} と ${out({ x: F(-m * c), '': F(-m * d) })}\nまとめて ${out(ans)}`,
      };
    },
  },
  {
    id: 'substitute',
    subject: 'math',
    unit: 'm7-moji',
    grade: 7,
    name: '式の値',
    levels: 3,
    base: 2,
    levelNames: ['1次式', '2乗をふくむ', '2つの文字'],
    make(level, rng) {
      const x = pick(rng, [-5, -4, -3, -2, -1, 2, 3, 4]);
      if (level === 1) {
        const a = randInt(rng, 2, 6) * (rng() < 0.3 ? -1 : 1),
          b = randInt(rng, -9, 9);
        const ans = a * x + b;
        return {
          ask: '式の値を求めよう',
          prompt: `x = ${sv(x)} のとき、${a < 0 ? '−' : ''}${Math.abs(a)}x ${b < 0 ? `− ${-b}` : `+ ${b}`} の値`,
          answer: String(ans),
          explanation: `x に (${sv(x)}) を代入：${sv(a)} × (${sv(x)}) ${b < 0 ? `− ${-b}` : `+ ${b}`} = ${sv(a * x)} ${b < 0 ? `− ${-b}` : `+ ${b}`} = ${sv(ans)}\n負の数を代入するときはかっこをつけよう。`,
        };
      }
      if (level === 2) {
        const b = randInt(rng, 1, 5);
        const ans = x * x - b * x;
        return {
          ask: '式の値を求めよう',
          prompt: `x = ${sv(x)} のとき、x² − ${b}x の値`,
          answer: String(ans),
          explanation: `(${sv(x)})² − ${b} × (${sv(x)}) = ${x * x} ${-b * x < 0 ? `− ${b * x}` : `+ ${-b * x}`} = ${sv(ans)}`,
        };
      }
      const y = pick(rng, [-4, -3, -2, 2, 3, 5]);
      const a = randInt(rng, 2, 5),
        b = randInt(rng, 2, 5);
      const ans = a * x - b * y;
      return {
        ask: '式の値を求めよう',
        prompt: `x = ${sv(x)}、y = ${sv(y)} のとき、${a}x − ${b}y の値`,
        answer: String(ans),
        explanation: `${a} × (${sv(x)}) − ${b} × (${sv(y)}) = ${sv(a * x)} ${-b * y < 0 ? `− ${b * y}` : `+ ${-b * y}`} = ${sv(ans)}`,
      };
    },
  },
  {
    id: 'linear-eq',
    subject: 'math',
    unit: 'm7-hoteishiki',
    grade: 7,
    name: '一次方程式',
    levels: 3,
    base: 2,
    levelNames: ['1ステップ', '移項する', 'かっこ・分数'],
    make(level, rng) {
      const x = randInt(rng, -9, 12) || 3;
      const nz = (a: number, b: number) => {
        let v = 0;
        while (v === 0 || v === 1 || v === -1) v = randInt(rng, a, b);
        return v;
      };
      const ask = 'x の値を求めよう（x = の右側を答える）';
      const pm = (n: number) => (n < 0 ? ` − ${-n}` : ` + ${n}`);
      if (level === 1) {
        if (rng() < 0.5) {
          const a = nz(-9, 9);
          return {
            ask,
            prompt: `${sv(a)}x = ${sv(a * x)}`,
            answer: String(x),
            explanation: `両辺を ${sv(a)} でわる：x = ${sv(a * x)} ÷ (${sv(a)}) = ${sv(x)}`,
          };
        }
        const b = randInt(rng, -15, 15) || 4;
        return {
          ask,
          prompt: `x${pm(b)} = ${sv(x + b)}`,
          answer: String(x),
          explanation: `${sv(b)} を右辺に移項（符号が変わる）：x = ${sv(x + b)}${pm(-b)} = ${sv(x)}`,
        };
      }
      if (level === 2) {
        if (rng() < 0.5) {
          const a = nz(-6, 9),
            b = randInt(rng, -15, 15) || 5;
          return {
            ask,
            prompt: `${sv(a)}x${pm(b)} = ${sv(a * x + b)}`,
            answer: String(x),
            explanation: `${sv(b)} を移項：${sv(a)}x = ${sv(a * x + b)}${pm(-b)} = ${sv(a * x)}\n両辺を ${sv(a)} でわる：x = ${sv(x)}`,
          };
        }
        let a = nz(-6, 9),
          c = nz(-6, 9);
        if (a === c) c = a > 0 ? a + 2 : a - 2;
        const b = randInt(rng, -12, 12),
          d = (a - c) * x + b;
        return {
          ask,
          prompt: `${sv(a)}x${pm(b)} = ${sv(c)}x${pm(d)}`,
          answer: String(x),
          explanation: `x の項を左辺、数を右辺に移項：${sv(a)}x − (${sv(c)}x) = ${sv(d)} − (${sv(b)})\n${sv(a - c)}x = ${sv(d - b)}\nx = ${sv(x)}`,
        };
      }
      if (rng() < 0.5) {
        const a = randInt(rng, 2, 5),
          b = randInt(rng, -6, 6) || 2,
          c = nz(-4, 6);
        // a(x + b) = c x + d
        const cc = c === a ? c + 1 : c;
        const d = a * (x + b) - cc * x;
        return {
          ask,
          prompt: `${a}(x${pm(b)}) = ${sv(cc)}x${pm(d)}`,
          answer: String(x),
          explanation: `かっこをはずす：${a}x${pm(a * b)} = ${sv(cc)}x${pm(d)}\n移項：${a}x − (${sv(cc)}x) = ${sv(d)} − (${sv(a * b)})\n${sv(a - cc)}x = ${sv(d - a * b)} → x = ${sv(x)}`,
        };
      }
      const p = pick(rng, [2, 3, 4]),
        q = pick(rng, [2, 3, 4, 6].filter((v) => v !== p));
      const L = lcm(p, q);
      const xx = L * randInt(rng, -3, 4) || L;
      const b = randInt(rng, -5, 5);
      const right = xx / p + b - xx / q; // x/p + b = x/q + right
      return {
        ask,
        prompt: `[[x/${p}]]${pm(b)} = [[x/${q}]]${pm(right)}`,
        answer: String(xx),
        explanation: `両辺に分母の最小公倍数 ${L} をかけて分数をなくす：\n${L / p}x${pm(L * b)} = ${L / q}x${pm(L * right)}\n${sv(L / p - L / q)}x = ${sv(L * right - L * b)}\nx = ${sv(xx)}`,
      };
    },
  },
  {
    id: 'proportion-7',
    subject: 'math',
    unit: 'm7-hirei',
    grade: 7,
    name: '比例・反比例（負の数）',
    levels: 3,
    base: 3,
    levelNames: ['比例定数', '反比例の比例定数', 'y の値'],
    make(level, rng) {
      const a = pick(rng, [-6, -5, -4, -3, -2, 2, 3, 4, 5]);
      const x = pick(rng, [-4, -3, -2, 2, 3, 4]);
      if (level === 1)
        return {
          ask: '比例定数を求めよう',
          prompt: `y は x に比例し、x = ${sv(x)} のとき y = ${sv(a * x)} です。y = ax の a は？`,
          answer: String(a),
          explanation: `a = y ÷ x = ${sv(a * x)} ÷ (${sv(x)}) = ${sv(a)}`,
        };
      const k = a * x * (level === 2 ? 1 : 2);
      if (level === 2)
        return {
          ask: '比例定数を求めよう',
          prompt: `y は x に反比例し、x = ${sv(x)} のとき y = ${sv(k / x)} です。y = [[a/x]] の a は？`,
          answer: String(k),
          explanation: `a = x × y = (${sv(x)}) × (${sv(k / x)}) = ${sv(k)}`,
        };
      const divs = [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6].filter((d) => k % d === 0 && d !== x);
      const x2 = pick(rng, divs);
      return {
        ask: 'y の値を求めよう',
        prompt: `y は x に反比例し、x = ${sv(x)} のとき y = ${sv(k / x)} です。x = ${sv(x2)} のときの y は？`,
        answer: String(k / x2),
        explanation: `比例定数 a = ${sv(x)} × (${sv(k / x)}) = ${sv(k)}\ny = ${sv(k)} ÷ (${sv(x2)}) = ${sv(k / x2)}`,
      };
    },
  },
  // ---------- 理科 ----------
  {
    id: 'lever',
    subject: 'science',
    unit: 's6-teko',
    grade: 6,
    name: 'てこのつり合い',
    levels: 3,
    base: 2,
    levelNames: ['重さを求める', '位置を求める', 'おもりが2つ'],
    make(level, rng) {
      const rule = 'てこは「おもりの重さ × 支点からの距離」が左右で等しいとき、水平につり合います。';
      if (level === 1) {
        for (;;) {
          const p1 = randInt(rng, 1, 6),
            p2 = randInt(rng, 1, 6),
            w1 = randInt(rng, 1, 6) * 10;
          if (p1 === p2 || (w1 * p1) % p2) continue;
          const w2 = (w1 * p1) / p2;
          if (w2 > 120) continue;
          return {
            ask: 'つり合うときの重さを求めよう',
            prompt: `左のうでの目盛り ${p1} に ${w1} g のおもりをつるしました。右のうでの目盛り ${p2} に何 g のおもりをつるすと水平につり合う？`,
            answer: String(w2),
            unitSuffix: 'g',
            figure: leverFig([{ pos: p1, label: `${w1}g` }], [{ pos: p2, label: '?', unknown: true }]),
            explanation: `${rule}\n左：${w1} × ${p1} = ${w1 * p1}\n右：□ × ${p2} = ${w1 * p1} → □ = ${w2}（g）`,
          };
        }
      }
      if (level === 2) {
        for (;;) {
          const p1 = randInt(rng, 1, 6),
            w1 = randInt(rng, 1, 6) * 10,
            w2 = randInt(rng, 1, 6) * 10;
          if (w1 === w2 || (w1 * p1) % w2) continue;
          const p2 = (w1 * p1) / w2;
          if (p2 < 1 || p2 > 6) continue;
          return {
            ask: 'つり合う位置を求めよう',
            prompt: `左のうでの目盛り ${p1} に ${w1} g のおもりをつるしました。右のうでに ${w2} g のおもりを1個つるして水平につり合わせるには、目盛りいくつのところにつるせばよい？`,
            answer: String(p2),
            figure: leverFig([{ pos: p1, label: `${w1}g` }], [], { side: 'R' }),
            explanation: `${rule}\n左：${w1} × ${p1} = ${w1 * p1}\n右：${w2} × □ = ${w1 * p1} → □ = ${p2}`,
          };
        }
      }
      for (;;) {
        const p1 = randInt(rng, 1, 6),
          p2 = randInt(rng, 1, 6),
          p3 = randInt(rng, 1, 6);
        const w1 = randInt(rng, 1, 4) * 10,
          w2 = randInt(rng, 1, 4) * 10;
        if (p1 === p2) continue;
        const m = w1 * p1 + w2 * p2;
        if (m % p3) continue;
        const w3 = m / p3;
        if (w3 > 150) continue;
        return {
          ask: 'つり合うときの重さを求めよう',
          prompt: `左のうでの目盛り ${p1} に ${w1} g、目盛り ${p2} に ${w2} g のおもりをつるしました。右のうでの目盛り ${p3} に何 g のおもりをつるすと水平につり合う？`,
          answer: String(w3),
          unitSuffix: 'g',
          figure: leverFig(
            [
              { pos: p1, label: `${w1}g` },
              { pos: p2, label: `${w2}g` },
            ],
            [{ pos: p3, label: '?', unknown: true }],
          ),
          explanation: `${rule}\n左：${w1}×${p1} + ${w2}×${p2} = ${m}\n右：□ × ${p3} = ${m} → □ = ${w3}（g）`,
        };
      }
    },
  },
  {
    id: 'density',
    subject: 'science',
    unit: 's7-busshitsu',
    grade: 7,
    name: '密度・質量パーセント濃度',
    levels: 2,
    base: 3,
    levelNames: ['密度', '濃度'],
    make(level, rng) {
      if (level === 1) {
        const mats: [string, number][] = [
          ['アルミニウム', 2.7],
          ['鉄', 7.87],
          ['銅', 8.96],
          ['氷', 0.92],
        ];
        const [name, d] = pick(rng, mats);
        const v = pick(rng, [10, 20, 25, 50, 100]);
        const m = dec(d * v);
        return {
          ask: '密度を求めよう',
          prompt: `質量 ${m} g、体積 ${v} cm³ の物体の密度は何 g/cm³？`,
          answer: dec(d),
          unitSuffix: 'g/cm³',
          explanation: `密度 = 質量 ÷ 体積 = ${m} ÷ ${v} = ${dec(d)}（g/cm³）\nこの値から、物質は${name}だと考えられます。`,
        };
      }
      const solute = pick(rng, [5, 10, 15, 20, 25, 30, 40]);
      const water = pick(rng, [45, 60, 75, 80, 85, 90, 95, 100, 120, 160, 170, 185].filter((w) => ((solute * 100) / (solute + w)) % 1 === 0));
      if (water === undefined) return this.make(1, rng);
      const pct = (solute * 100) / (solute + water);
      return {
        ask: '質量パーセント濃度を求めよう',
        prompt: `水 ${water} g に食塩 ${solute} g をとかした食塩水の質量パーセント濃度は何 % ？`,
        answer: dec(pct),
        unitSuffix: '%',
        explanation: `質量パーセント濃度 = 溶質の質量 ÷ 溶液の質量 × 100\n溶液 = ${water} + ${solute} = ${solute + water} g\n${solute} ÷ ${solute + water} × 100 = ${dec(pct)}（%）\n※水の質量でわらないように注意！`,
      };
    },
  },
];

export const GEN_BY_ID: Record<string, Generator> = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));
