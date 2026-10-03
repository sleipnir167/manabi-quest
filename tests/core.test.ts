import { describe, expect, it } from 'vitest';
import { Frac, parseLinear, parseNumber, parseRatio, linearEquals } from '../src/lib/frac';
import { judge, normText } from '../src/lib/normalize';
import { newSrs, schedule, retrievability, intervalDays } from '../src/lib/fsrs';
import { eap, itemParams, prob, toDeviation } from '../src/lib/irt';
import { GENERATORS } from '../src/content/generators';
import type { Question } from '../src/content/types';
import { mulberry32 } from '../src/lib/util';
import { kanaVariants } from '../src/content/helpers';

const q = (p: Partial<Question>): Question => ({
  id: 't',
  subject: 'math',
  grade: 6,
  unit: 'u',
  type: 'numeric',
  prompt: '',
  answer: '',
  difficulty: 3,
  ...p,
});

describe('Frac / parse', () => {
  it('reduces and parses', () => {
    expect(new Frac(6, 8).toString()).toBe('3/4');
    expect(parseNumber('1 1/2')!.value.eq(new Frac(3, 2))).toBe(true);
    expect(parseNumber('−3')!.value.eq(-3)).toBe(true);
    expect(parseNumber('0.75')!.value.eq(new Frac(3, 4))).toBe(true);
    expect(parseNumber('6/8')!.reduced).toBe(false);
    expect(parseRatio('6:8')!.map((f) => f.n)).toEqual([6, 8]);
  });
  it('parses linear expressions', () => {
    expect(linearEquals(parseLinear('2x+7')!, parseLinear('7 + 2x')!)).toBe(true);
    expect(linearEquals(parseLinear('−x−3')!, parseLinear('-1x-3')!)).toBe(true);
    expect(parseLinear('2x+')).toBeNull();
  });
});

describe('judge', () => {
  it('numeric with reduce check', () => {
    const qq = q({ answer: '3/4' });
    expect(judge(qq, '3/4').correct).toBe(true);
    expect(judge(qq, '6/8')).toMatchObject({ correct: false, error: 'reduce' });
    expect(judge(qq, '0.75').correct).toBe(true);
    expect(judge(q({ answer: '-5' }), '5')).toMatchObject({ correct: false, error: 'sign' });
    expect(judge(q({ answer: '7/4', accept: ['1 3/4'] }), '1 3/4').correct).toBe(true);
  });
  it('ratio / expr', () => {
    expect(judge(q({ answer: '2:3', numKind: 'ratio' }), '2:3').correct).toBe(true);
    expect(judge(q({ answer: '2:3', numKind: 'ratio' }), '4:6')).toMatchObject({ correct: false, error: 'reduce' });
    expect(judge(q({ answer: '2x + 7', numKind: 'expr' }), '2x+7').correct).toBe(true);
    expect(judge(q({ answer: '2x + 7', numKind: 'expr' }), '2x-7')).toMatchObject({ error: 'sign' });
  });
  it('text normalization', () => {
    expect(normText('カクチョウ')).toBe('かくちょう');
    expect(normText(' Ｎｉｃｅ ')).toBe('nice');
    expect(judge(q({ type: 'input', answer: 'うちゅう' }), 'ウチュウ').correct).toBe(true);
  });
});

describe('FSRS', () => {
  it('schedules longer intervals after success', () => {
    const t0 = Date.UTC(2026, 0, 1, 10);
    let s = schedule(newSrs(), 3, t0);
    expect(s.state).toBe('review');
    const i1 = s.due - t0;
    const t1 = s.due;
    s = schedule(s, 3, t1);
    expect(s.due - t1).toBeGreaterThan(i1);
    expect(retrievability(s, t1)).toBeCloseTo(1, 5);
    expect(intervalDays(10, 0.9)).toBeCloseTo(10, 5);
  });
  it('again → due soon and lapses++', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const s1 = schedule(newSrs(), 3, t0);
    const s2 = schedule(s1, 1, t0 + 5 * 86400000);
    expect(s2.lapses).toBe(1);
    expect(s2.due - (t0 + 5 * 86400000)).toBeLessThanOrEqual(10 * 60000);
  });
});

describe('IRT', () => {
  it('ability rises with correct answers on hard items', () => {
    const hard = itemParams({ difficulty: 5, grade: 6, type: 'input' });
    const r = eap(Array.from({ length: 10 }, () => ({ p: hard, correct: true })));
    expect(r.theta).toBeGreaterThan(1);
    expect(toDeviation(r.theta)).toBeGreaterThan(60);
    expect(prob(0, itemParams({ difficulty: 3, grade: 6, type: 'input' }))).toBeCloseTo(0.5, 2);
  });
});

describe('generators produce self-consistent answers', () => {
  for (const g of GENERATORS) {
    for (let level = 1; level <= g.levels; level++) {
      it(`${g.id} L${level}`, () => {
        for (let seed = 1; seed <= 200; seed++) {
          const out = g.make(level, mulberry32(seed * 7919 + level));
          expect(out.prompt).toBeTruthy();
          expect(out.answer).toBeTruthy();
          expect(out.prompt).not.toMatch(/NaN|undefined|Infinity/);
          expect(out.explanation).not.toMatch(/NaN|undefined|Infinity/);
          const qq = q({ ...out, type: out.type ?? 'numeric' } as Partial<Question>);
          const j = judge(qq, out.answer);
          if (!j.correct) throw new Error(`${g.id} L${level} seed ${seed}: answer "${out.answer}" judged wrong (${j.error}) prompt=${out.prompt}`);
        }
      });
    }
  }
});

describe('verify arithmetic of key generators by brute force', () => {
  it('frac-mul answers equal a×b', () => {
    const g = GENERATORS.find((x) => x.id === 'frac-mul')!;
    for (let seed = 1; seed < 300; seed++) {
      const out = g.make(1, mulberry32(seed));
      const [a, b] = out.prompt.split(' × ').map((s) => parseNumber(s.replace(/\[\[|\]\]/g, ''))!.value);
      expect(a.mul(b).eq(parseNumber(out.answer)!.value)).toBe(true);
    }
  });
  it('linear-eq solution satisfies equation (L2)', () => {
    const g = GENERATORS.find((x) => x.id === 'linear-eq')!;
    for (let seed = 1; seed < 300; seed++) {
      const out = g.make(2, mulberry32(seed));
      const x = Number(out.answer);
      const [l, r] = out.prompt.replace(/−/g, '-').split('=');
      const ev = (side: string) => {
        const lin = parseLinear(side)!;
        return (lin.x ? lin.x.value() * x : 0) + (lin[''] ? lin[''].value() : 0);
      };
      expect(ev(l)).toBeCloseTo(ev(r), 9);
    }
  });
});

describe('kana distractors', () => {
  it('creates plausible different readings', () => {
    const v = kanaVariants('かくちょう', 3, 'x');
    expect(v.length).toBeGreaterThan(0);
    expect(v).not.toContain('かくちょう');
  });
});
