import { describe, expect, it } from 'vitest';
import { BUILTIN_QUESTIONS, allQuestions, instantiate, normalizePack } from '../src/content/registry';
import { BUILTIN_UNITS } from '../src/content/units';
import { csvToPack, CSV_TEMPLATE, JSON_TEMPLATE } from '../src/lib/packs';
import { judge } from '../src/lib/normalize';

describe('built-in question bank', () => {
  it('has unique ids', () => {
    const ids = allQuestions().map((q) => q.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup).toEqual([]);
  });
  it('every question belongs to a known unit and is well-formed', () => {
    const unitIds = new Set(BUILTIN_UNITS.map((u) => u.id));
    const problems: string[] = [];
    for (const q of BUILTIN_QUESTIONS) {
      if (!unitIds.has(q.unit)) problems.push(`${q.id}: unknown unit ${q.unit}`);
      if (!q.prompt) problems.push(`${q.id}: empty prompt`);
      if (q.difficulty < 1 || q.difficulty > 5) problems.push(`${q.id}: difficulty`);
      if (q.type === 'choice' || q.type === 'write') {
        const ch = q.choices ?? [];
        if (q.type === 'choice' && ch.length < 2) problems.push(`${q.id}: choices < 2`);
        if (ch.length && !ch.includes(q.answer)) problems.push(`${q.id}: answer not in choices`);
        if (new Set(ch).size !== ch.length) problems.push(`${q.id}: duplicate choices ${ch.join('/')}`);
        if (q.type === 'choice' && ch.length < 4) problems.push(`${q.id}: only ${ch.length} choices (${q.prompt})`);
      }
      if (q.type === 'order' && (q.choices?.length ?? 0) < 2) problems.push(`${q.id}: order needs items`);
      if (q.type !== 'tf' && q.type !== 'order' && !q.answer) problems.push(`${q.id}: no answer`);
      // 自分の正解で判定が通ること
      const given = q.type === 'order' ? q.choices!.join('|') : q.answer;
      if (!judge(q, given).correct) problems.push(`${q.id}: own answer judged wrong`);
    }
    expect(problems).toEqual([]);
  });
  it('every unit has at least 3 questions', () => {
    const count: Record<string, number> = {};
    for (const q of allQuestions()) count[q.unit] = (count[q.unit] ?? 0) + 1;
    const thin = BUILTIN_UNITS.filter((u) => (count[u.id] ?? 0) < 3).map((u) => `${u.id}:${count[u.id] ?? 0}`);
    expect(thin).toEqual([]);
  });
  it('generator cards instantiate', () => {
    const gens = allQuestions().filter((q) => q.gen);
    expect(gens.length).toBeGreaterThan(30);
    for (const g of gens) {
      const inst = instantiate(g, 42);
      expect(inst.prompt).not.toBe(g.prompt);
      expect(judge(inst, inst.answer).correct).toBe(true);
    }
  });
  it('reports bank size', () => {
    const by: Record<string, number> = {};
    for (const q of BUILTIN_QUESTIONS) by[q.subject] = (by[q.subject] ?? 0) + 1;
    console.log('question counts', by, 'total', BUILTIN_QUESTIONS.length);
  });
});

describe('pack import', () => {
  it('parses the CSV template', () => {
    const pack = csvToPack(CSV_TEMPLATE, 'template');
    const { questions, errors } = normalizePack(pack, 'pack:t');
    expect(errors).toEqual([]);
    expect(questions.length).toBe(5);
    expect(questions.find((q) => q.type === 'order')!.answer).toBe('平城京|平安京|鎌倉幕府');
    expect(questions.find((q) => q.type === 'tf')!.answer).toBe('o');
  });
  it('parses the JSON template', () => {
    const { questions, errors } = normalizePack(JSON.parse(JSON_TEMPLATE), 'pack:j');
    expect(errors).toEqual([]);
    expect(questions.length).toBe(3);
    expect(questions[0].answer).toBe('右下がりの直線');
  });
});
