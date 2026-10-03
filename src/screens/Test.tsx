// ===== 実力診断テスト（適応型テスト CAT で推定偏差値を出す） =====
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SUBJECTS, gradeLabel, subjectName, type Question, type SubjectId } from '../content/types';
import { allQuestions, instantiate, unitName } from '../content/registry';
import { db, type DiagnosticResult } from '../lib/db';
import { deviationLabel, eap, itemParams, selectNextItem, toDeviation, type ItemParams, type Response } from '../lib/irt';
import { judge } from '../lib/normalize';
import { recordAnswer, afterXpChange } from '../lib/record';
import { exitTo, navigate, setExitGuard, type TestConfig } from '../lib/router';
import { sfx } from '../lib/sound';
import { profile, settings } from '../lib/store';
import { dayKey, fmtSec, groupBy } from '../lib/util';
import { QuestionView } from '../components/QuestionView';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { Modal, PageHead, Seg } from '../components/ui';
import { BellCurve, Radar, topPercent } from '../components/charts';
import { confetti } from '../components/Confetti';
import { chat, aiReady } from '../lib/ai';
import { Markdown } from '../components/Markup';
import { levelInfo } from '../lib/game';

// ---------- 設定・履歴 ----------
export function TestSetup() {
  const [subjects, setSubjects] = useState<SubjectId[]>(SUBJECTS.map((s) => s.id));
  const [per, setPer] = useState(15);
  const [grade, setGrade] = useState(settings.get().grade);
  const history = useLiveQuery(() => db.diagnostics.orderBy('ts').reverse().toArray(), []) ?? [];
  const groups = Object.entries(groupBy(history, (d) => d.group ?? String(d.id))).sort((a, b) => b[1][0].ts - a[1][0].ts);

  const toggle = (s: SubjectId) => setSubjects((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  return (
    <div className="page test">
      <PageHead title="🧭 実力診断テスト" sub="答えに合わせて次の問題の難しさが変わる「適応型テスト」。少ない問題数で実力を推定します。" />
      <div className="grid-2 wide-left">
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>受ける教科</h3>
          <div className="chips">
            {SUBJECTS.map((s) => (
              <button key={s.id} data-subject={s.id} className={`chip ${subjects.includes(s.id) ? 'active' : ''}`} onClick={() => toggle(s.id)}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
          <div className="setting-row">
            <div className="label">
              <b>1教科あたりの問題数</b>
              <small>多いほど正確（15問で約8分）</small>
            </div>
            <Seg value={per} onChange={setPer} options={[{ value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' }, { value: 30, label: '30' }]} />
          </div>
          <div className="setting-row">
            <div className="label">
              <b>くらべる学年</b>
              <small>この学年の標準を偏差値50とします</small>
            </div>
            <Seg value={grade} onChange={setGrade} options={[6, 7, 8, 9].map((g) => ({ value: g, label: gradeLabel(g) }))} />
          </div>
          <button
            className="btn primary lg block"
            disabled={!subjects.length}
            onClick={() => {
              sfx.start();
              navigate({ name: 'test-run', config: { subjects: SUBJECTS.map((s) => s.id).filter((s) => subjects.includes(s)), perSubject: per, grade } });
            }}
          >
            <Icon name="play" /> テストを始める（約{Math.round((subjects.length * per * 32) / 60)}分）
          </button>
        </div>
        <div className="card test-explain">
          <Mascot size={70} mood="think" />
          <ul className="small muted">
            <li>正解すると難しい問題、まちがえるとやさしい問題が出ます。</li>
            <li>テスト中は正解・不正解を表示しません。わからないときは「わからない」でOK（当てずっぽうより正確に測れます）。</li>
            <li>結果は「推定偏差値」。このアプリの問題の難しさをもとにした目安です。</li>
            <li>月に1回くらい受けると、成長がグラフでわかります。</li>
          </ul>
        </div>
      </div>

      <div className="section-title">
        <h2>これまでの結果</h2>
      </div>
      {!groups.length ? (
        <div className="card">
          <p className="muted center">まだ受けていません。最初のテストで今の実力をはかってみよう！</p>
        </div>
      ) : (
        <div className="list card">
          {groups.map(([g, list]) => {
            const avg = list.reduce((s, d) => s + d.deviation, 0) / list.length;
            return (
              <button key={g} className="list-row history-row" onClick={() => navigate({ name: 'test-result', ids: list.map((d) => d.id!) })}>
                <span className="num history-dev">{avg.toFixed(1)}</span>
                <span className="grow">
                  <b>{list.length > 1 ? `${list.length}教科` : subjectName(list[0].subject)}</b>
                  <span className="tiny faint">
                    {' '}
                    {list[0].day}・{gradeLabel(list[0].grade)}基準
                  </span>
                  <div className="chips" style={{ marginTop: 4 }}>
                    {list.map((d) => (
                      <span key={d.id} className="chip sc tiny" data-subject={d.subject}>
                        {SUBJECTS.find((s) => s.id === d.subject)?.short} {d.deviation.toFixed(1)}
                      </span>
                    ))}
                  </div>
                </span>
                <Icon name="right" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- テスト実行 ----------
interface PoolItem {
  q: Question;
  p: ItemParams;
}

export function TestRun({ config }: { config: TestConfig }) {
  const [si, setSi] = useState(0); // 何教科目か
  const [cur, setCur] = useState<PoolItem | null>(null);
  const [n, setN] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [between, setBetween] = useState<DiagnosticResult | null>(null);
  const responses = useRef<Response[]>([]);
  const items = useRef<DiagnosticResult['items']>([]);
  const used = useRef(new Set<string>());
  const unitCounts = useRef<Record<string, number>>({});
  const shownAt = useRef(Date.now());
  const subjStart = useRef(Date.now());
  const savedIds = useRef<number[]>([]);
  const group = useMemo(() => `g${Date.now()}`, []);
  const subject = config.subjects[si];

  const pool = useMemo<PoolItem[]>(() => {
    if (!subject) return [];
    return allQuestions()
      .filter((q) => q.subject === subject && q.grade <= config.grade && q.grade >= Math.min(6, config.grade) && q.type !== 'order')
      .map((q) => ({ q, p: itemParams(q, config.grade) }));
  }, [subject, config.grade]);

  useEffect(() => {
    setExitGuard(() => setConfirmExit(true));
    return () => setExitGuard(null);
  }, []);

  const pickNext = () => {
    const { theta } = eap(responses.current);
    const avail = pool.filter((x) => !used.current.has(x.q.id));
    const nx = selectNextItem(avail, theta, unitCounts.current);
    if (!nx) return null;
    used.current.add(nx.q.id);
    return { q: instantiate(nx.q), p: nx.p };
  };

  useEffect(() => {
    responses.current = [];
    items.current = [];
    unitCounts.current = {};
    subjStart.current = Date.now();
    setN(0);
    setCur(pickNext());
    shownAt.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [si]);

  const finishSubject = async () => {
    const { theta, se } = eap(responses.current);
    const units = Object.entries(groupBy(items.current, (x) => x.unit)).map(([unit, xs]) => ({
      unit,
      total: xs.length,
      correct: xs.filter((x) => x.correct).length,
    }));
    const res: DiagnosticResult = {
      ts: Date.now(),
      day: dayKey(),
      subject,
      grade: config.grade,
      theta,
      se,
      deviation: toDeviation(theta),
      total: items.current.length,
      correct: items.current.filter((x) => x.correct).length,
      durationMs: Date.now() - subjStart.current,
      units,
      items: items.current,
      group,
    };
    const id = await db.diagnostics.add(res);
    savedIds.current.push(id);
    profile.set((p) => ({ ...p, totals: { ...p.totals, diagnostics: p.totals.diagnostics + (si === 0 ? 1 : 0) }, xp: p.xp + 30 }));
    await afterXpChange(levelInfo(profile.get().xp - 30).level);
    if (si + 1 < config.subjects.length) {
      setBetween({ ...res, id });
    } else {
      setExitGuard(null);
      sfx.complete();
      confetti({ count: 120 });
      navigate({ name: 'test-result', ids: savedIds.current }, { replace: true });
    }
  };

  const onAnswer = async (given: string, meta: { selfGraded?: boolean }) => {
    if (!cur) return;
    const timeMs = Date.now() - shownAt.current;
    const correct = meta.selfGraded ? given === cur.q.answer : judge(cur.q, given).correct;
    sfx.select();
    responses.current.push({ p: cur.p, correct });
    items.current.push({ qid: cur.q.id, correct, difficulty: cur.q.difficulty, unit: cur.q.unit, timeMs });
    unitCounts.current[cur.q.unit] = (unitCounts.current[cur.q.unit] ?? 0) + 1;
    recordAnswer({ q: cur.q, correct, given, timeMs, mode: 'test' });
    const count = n + 1;
    setN(count);
    const { se } = eap(responses.current);
    if (count >= config.perSubject || (count >= Math.max(8, config.perSubject * 0.6) && se < 0.3)) {
      setCur(null);
      await finishSubject();
      return;
    }
    const nx = pickNext();
    if (!nx) {
      setCur(null);
      await finishSubject();
      return;
    }
    setCur(nx);
    shownAt.current = Date.now();
  };

  const totalQ = config.subjects.length * config.perSubject;
  const doneQ = si * config.perSubject + n;

  if (between)
    return (
      <div className="runner" data-subject={between.subject}>
        <div className="runner-body center stack between">
          <Mascot mood="happy" size={100} />
          <h2>{subjectName(between.subject)} おわり！</h2>
          <p className="muted">結果は最後にまとめて見られます。少し休けいしてもOK。</p>
          <p className="small">
            次は <b data-subject={config.subjects[si + 1]} style={{ color: 'var(--sc)' }}>{subjectName(config.subjects[si + 1])}</b>（{si + 2}/{config.subjects.length}教科目）
          </p>
          <button
            className="btn primary lg"
            onClick={() => {
              setBetween(null);
              setSi(si + 1);
            }}
          >
            次の教科へ <Icon name="arrow" />
          </button>
        </div>
      </div>
    );

  return (
    <div className="runner test-run" data-subject={subject}>
      <header className="runner-top">
        <button className="icon-btn" onClick={() => setConfirmExit(true)} aria-label="やめる">
          <Icon name="x" />
        </button>
        <span className="chip sc">
          {SUBJECTS.find((s) => s.id === subject)?.emoji} {subjectName(subject)} {n + 1}/{config.perSubject}
        </span>
        <div className="grow">
          <div className="bar thin">
            <i style={{ width: `${(doneQ / totalQ) * 100}%` }} />
          </div>
        </div>
        <span className="tiny faint">{si + 1}/{config.subjects.length}教科</span>
      </header>
      <div className="runner-body">
        {cur ? (
          <QuestionView key={cur.q.id + n} q={cur.q} testMode onAnswer={onAnswer} />
        ) : (
          <div className="center stack" style={{ paddingTop: 80 }}>
            <Mascot mood="think" size={90} />
            <p className="muted">集計中…</p>
          </div>
        )}
      </div>
      {confirmExit && (
        <Modal onClose={() => setConfirmExit(false)}>
          <div className="center stack">
            <Mascot mood="sad" size={80} />
            <h2>テストを中断する？</h2>
            <p className="muted">{savedIds.current.length ? 'おわった教科の結果は保存されています。' : 'この教科の結果は保存されません。'}</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmExit(false)}>
                つづける
              </button>
              <button
                className="btn ng grow"
                onClick={() => (savedIds.current.length ? navigate({ name: 'test-result', ids: savedIds.current }, { replace: true }) : exitTo({ name: 'test' }))}
              >
                中断する
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- 結果 ----------
export function TestResult({ ids }: { ids: number[] }) {
  const results = useLiveQuery(() => db.diagnostics.bulkGet(ids), [ids.join(',')]);
  const prevAll = useLiveQuery(() => db.diagnostics.orderBy('ts').toArray(), []);
  const [ai, setAi] = useState<{ text: string; loading: boolean; err?: string }>({ text: '', loading: false });
  if (!results || !prevAll) return <div className="page" />;
  const rs = results.filter(Boolean) as DiagnosticResult[];
  if (!rs.length) return <div className="page">結果が見つかりません</div>;
  const avg = rs.reduce((s, r) => s + r.deviation, 0) / rs.length;
  const avgSe = Math.sqrt(rs.reduce((s, r) => s + r.se * r.se, 0)) / rs.length;
  const prevOf = (r: DiagnosticResult) => prevAll.filter((p) => p.subject === r.subject && p.ts < r.ts && p.grade === r.grade).pop();

  const askAI = async () => {
    setAi({ text: '', loading: true });
    try {
      const summary = rs.map((r) => ({
        教科: subjectName(r.subject),
        推定偏差値: r.deviation,
        前回: prevOf(r)?.deviation ?? null,
        正解: `${r.correct}/${r.total}`,
        単元: r.units.map((u) => `${unitName(u.unit)} ${u.correct}/${u.total}`).join('、'),
      }));
      const out = await chat(
        [
          { role: 'system', content: 'あなたは小中学生を応援する学習アドバイザーのフクロウ「フクロン先生」です。やさしく前向きな口調で、具体的なアドバイスをします。' },
          {
            role: 'user',
            content: `実力診断テスト（${gradeLabel(rs[0].grade)}基準）の結果です。\n${JSON.stringify(summary)}\n\n次の構成で、合計400字以内で書いてください。\n1. よかったところ（1〜2行）\n2. 伸ばすと効果が大きい単元とその理由\n3. 次の2週間の具体的な勉強プラン（箇条書き3つ）\n4. はげましの一言`,
          },
        ],
        { cacheKey: `diag:${ids.join(',')}`, onToken: (t) => setAi({ text: t, loading: true }) },
      );
      setAi({ text: out.text, loading: false });
    } catch (e) {
      setAi({ text: '', loading: false, err: (e as Error).message.split('\n')[0] });
    }
  };

  return (
    <div className="page test-result">
      <div className="row between" style={{ marginBottom: 10 }}>
        <button className="btn ghost sm" onClick={() => exitTo({ name: 'test' })}>
          <Icon name="left" /> テスト一覧
        </button>
        <span className="small faint">
          {rs[0].day}・{gradeLabel(rs[0].grade)}基準
        </span>
      </div>
      <div className="card result-hero">
        <div>
          <p className="eyebrow">{rs.length > 1 ? `${rs.length}教科の総合` : subjectName(rs[0].subject)}・推定偏差値</p>
          <div className="hero-dev num">{avg.toFixed(1)}</div>
          <div className="row wrap">
            <span className="chip warn">{deviationLabel(avg)}</span>
            {avg >= 50 ? <span className="chip">上位 約{topPercent(avg)}%</span> : <span className="chip">平均（50）まで あと {(50 - avg).toFixed(1)}</span>}
            <span className="chip">
              信頼区間 {(avg - 10 * avgSe).toFixed(0)}〜{(avg + 10 * avgSe).toFixed(0)}
            </span>
          </div>
          <p className="tiny faint" style={{ marginTop: 8 }}>
            ※このアプリの問題の難易度から推定した目安です。実際の模試の偏差値とは異なることがあります。
          </p>
        </div>
        <BellCurve deviation={avg} low={avg - 10 * avgSe} high={avg + 10 * avgSe} />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {rs.length >= 3 && (
          <div className="card center">
            <h3 style={{ marginBottom: 6 }}>教科バランス</h3>
            <Radar
              domain={[20, 80]}
              axes={SUBJECTS.map((s) => ({ label: s.name.replace('算数・', ''), value: rs.find((r) => r.subject === s.id)?.deviation ?? null, color: `var(--${s.id})` }))}
              compare={SUBJECTS.map((s) => {
                const r = rs.find((x) => x.subject === s.id);
                return r ? prevOf(r)?.deviation ?? null : null;
              })}
            />
            <p className="tiny faint">点線は前回の結果</p>
          </div>
        )}
        <div className="card">
          <div className="card-title">
            <h3>🦉 フクロン先生の総評</h3>
            {!ai.text && !ai.loading && (
              <button className="btn soft sm" onClick={() => (aiReady() ? askAI() : navigate({ name: 'settings', tab: 'ai' }))}>
                <Icon name="sparkles" /> AIに聞く
              </button>
            )}
          </div>
          {ai.text ? <Markdown text={ai.text} streaming={ai.loading} /> : ai.err ? <div className="note ng">{ai.err}</div> : <LocalAdvice rs={rs} />}
        </div>
      </div>

      {rs.map((r) => {
        const prev = prevOf(r);
        const diff = prev ? r.deviation - prev.deviation : null;
        const units = r.units.slice().sort((a, b) => a.correct / a.total - b.correct / b.total);
        return (
          <div className="card subject-result" data-subject={r.subject} key={r.id} style={{ marginTop: 16 }}>
            <div className="row between wrap">
              <h2>
                {SUBJECTS.find((s) => s.id === r.subject)?.emoji} {subjectName(r.subject)}
              </h2>
              <div className="row">
                <span className="num sr-dev">{r.deviation.toFixed(1)}</span>
                {diff != null && <span className={`delta ${diff >= 0 ? 'up' : 'down'} num`}>{diff >= 0 ? `▲${diff.toFixed(1)}` : `▼${(-diff).toFixed(1)}`}</span>}
              </div>
            </div>
            <p className="small muted">
              {r.total}問中 {r.correct}問 正解・{fmtSec(r.durationMs)}・±{(10 * r.se).toFixed(1)}
            </p>
            <div className="unit-results">
              {units.map((u) => {
                const rate = u.correct / u.total;
                return (
                  <div key={u.unit} className="unit-result">
                    <span className="grow small">{unitName(u.unit)}</span>
                    <span className="dots">
                      {Array.from({ length: u.total }, (_, i) => (
                        <i key={i} className={i < u.correct ? 'ok' : 'ng'} />
                      ))}
                    </span>
                    {rate < 0.6 && (
                      <button
                        className="btn sm soft"
                        onClick={() =>
                          navigate({ name: 'play', config: { title: `特訓：${unitName(u.unit)}`, mode: 'weak', spec: { kind: 'unit', units: [u.unit] }, subject: r.subject } })
                        }
                      >
                        特訓
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LocalAdvice({ rs }: { rs: DiagnosticResult[] }) {
  const sorted = rs.slice().sort((a, b) => b.deviation - a.deviation);
  const weakUnits = rs
    .flatMap((r) => r.units.map((u) => ({ ...u, subject: r.subject })))
    .filter((u) => u.total >= 2 && u.correct / u.total < 0.5)
    .slice(0, 3);
  return (
    <div className="stack small">
      {rs.length > 1 && (
        <p>
          いちばん得意なのは <b>{subjectName(sorted[0].subject)}</b>（{sorted[0].deviation.toFixed(1)}）。
          {sorted.length > 1 && (
            <>
              {' '}
              伸びしろが大きいのは <b>{subjectName(sorted[sorted.length - 1].subject)}</b>。
            </>
          )}
        </p>
      )}
      {weakUnits.length > 0 ? (
        <p>
          とくに練習すると効果が大きい単元：
          {weakUnits.map((u) => unitName(u.unit)).join('、')}
        </p>
      ) : (
        <p>大きな苦手単元は見つかりませんでした。すばらしい！</p>
      )}
      <p className="faint tiny">「AIに聞く」を押すと、より詳しいアドバイスと勉強プランを作ります。</p>
    </div>
  );
}
