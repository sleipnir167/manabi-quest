// ===== じっくり学習（1セット）の画面 =====
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '../content/types';
import { QuestionView, effectiveType } from '../components/QuestionView';
import { AIExplain } from '../components/AIExplain';
import { DrawPad } from '../components/DrawPad';
import { Icon } from '../components/Icon';
import { Markup } from '../components/Markup';
import { Mascot, type Mood } from '../components/Mascot';
import { Modal, Ring } from '../components/ui';
import { confetti } from '../components/Confetti';
import { buildSession } from '../lib/selection';
import { judge, ERROR_LABEL, type ErrorType } from '../lib/normalize';
import { recordAnswer, recordSession, toggleFlag } from '../lib/record';
import { sfx } from '../lib/sound';
import { exitTo, navigate, setExitGuard, type PlayConfig } from '../lib/router';
import { db } from '../lib/db';
import { settings } from '../lib/store';
import { fmtSec } from '../lib/util';
import { speak } from '../lib/speech';

interface Item {
  q: Question;
  retry?: boolean;
}
interface Res {
  q: Question;
  given: string;
  correct: boolean;
  timeMs: number;
  xp: number;
  error?: ErrorType;
  note?: string;
  retry?: boolean;
}

export function Player({ config }: { config: PlayConfig }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'answer' | 'feedback' | 'done'>('answer');
  const [results, setResults] = useState<Res[]>([]);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [scratch, setScratch] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showExpl, setShowExpl] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<{ bonus: number; perfect: boolean } | null>(null);
  const qStart = useRef(Date.now());
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      const qs = config.questions ?? (config.spec ? await buildSession(config.spec) : []);
      if (!alive) return;
      setItems(qs.map((q) => ({ q })));
      const cards = await db.cards.bulkGet(qs.map((q) => q.id));
      setFlags(Object.fromEntries(qs.map((q, i) => [q.id, !!cards[i]?.flagged])));
      qStart.current = Date.now();
      sessionStart.current = Date.now();
      sfx.start();
    })();
    return () => {
      alive = false;
    };
  }, [config]);

  useEffect(() => {
    setExitGuard(() => setConfirmExit(true));
    return () => setExitGuard(null);
  }, []);

  useEffect(() => {
    if (phase === 'done') return;
    const t = setInterval(() => setElapsed(Date.now() - sessionStart.current), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const cur = items?.[idx];

  const onAnswer = useCallback(
    async (given: string, meta: { usedHint: boolean; selfGraded?: boolean }) => {
      if (!cur || phase !== 'answer') return;
      const timeMs = Date.now() - qStart.current;
      const j = meta.selfGraded ? { correct: given === cur.q.answer, error: given ? ('knowledge' as ErrorType) : ('skip' as ErrorType) } : judge(cur.q, given);
      const newCombo = j.correct ? combo + 1 : 0;
      setCombo(newCombo);
      setMaxCombo((m) => Math.max(m, newCombo));
      if (j.correct) {
        sfx.correct(newCombo);
        if (newCombo > 0 && newCombo % 5 === 0) confetti({ count: 60 });
      } else sfx.wrong();
      setPhase('feedback');
      setShowExpl(!j.correct);
      const r = await recordAnswer({
        q: cur.q,
        correct: j.correct,
        given,
        timeMs,
        mode: config.mode,
        usedHint: meta.usedHint,
        error: 'error' in j ? j.error : undefined,
        combo: newCombo,
      });
      setResults((rs) => [...rs, { q: cur.q, given, correct: j.correct, timeMs, xp: r.xp, error: r.error, note: 'note' in j ? j.note : undefined, retry: cur.retry }]);
      // まちがえた問題は、少しあとにもう一度出す（その場で覚え直す）
      if (!j.correct && !cur.retry && items) {
        const pos = Math.min(items.length, idx + 3 + Math.floor(Math.random() * 2));
        const next = items.slice();
        next.splice(pos, 0, { q: cur.q, retry: true });
        setItems(next);
      }
      if (settings.get().tts.readAnswer && !j.correct && cur.q.speak && cur.q.speakLang === 'en') speak(cur.q.speak, 'en');
    },
    [cur, phase, combo, config.mode, idx, items],
  );

  const next = useCallback(async () => {
    if (!items) return;
    sfx.whoosh();
    if (idx + 1 >= items.length) {
      setPhase('done');
      setExitGuard(null);
      const first = [...results].filter((r) => !r.retry);
      const correct = first.filter((r) => r.correct).length;
      const s = await recordSession({
        startedAt: sessionStart.current,
        endedAt: Date.now(),
        mode: config.mode,
        subject: config.subject,
        title: config.title,
        total: first.length,
        correct,
        durationMs: Date.now() - sessionStart.current,
        maxCombo,
        xp: results.reduce((a, r) => a + r.xp, 0),
      });
      setSummary(s);
      if (s.perfect) {
        sfx.complete();
        confetti({ count: 160 });
      } else sfx.complete();
      return;
    }
    setIdx(idx + 1);
    setPhase('answer');
    qStart.current = Date.now();
  }, [items, idx, results, config, maxCombo]);

  useEffect(() => {
    if (phase !== 'feedback') return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, next]);

  if (!items)
    return (
      <div className="runner loading">
        <Mascot mood="think" size={100} />
        <p className="muted">問題を準備しています…</p>
      </div>
    );

  if (!items.length)
    return (
      <div className="runner loading">
        <Mascot mood="happy" size={100} />
        <h2>今は出せる問題がありません</h2>
        <p className="muted">{config.spec?.kind === 'review' ? '復習が必要な問題はありません。すばらしい！' : '別の単元やモードを選んでみよう。'}</p>
        <button className="btn primary" onClick={() => exitTo()}>
          もどる
        </button>
      </div>
    );

  if (phase === 'done') return <Results config={config} results={results} maxCombo={maxCombo} elapsed={elapsed} summary={summary} />;

  const last = results[results.length - 1];
  const fbCorrect = phase === 'feedback' && last?.correct;
  const subject = cur!.q.subject;
  const done = results.length;
  const mood: Mood = phase === 'feedback' ? (fbCorrect ? (combo >= 3 ? 'wow' : 'happy') : 'sad') : 'idle';

  return (
    <div className="runner" data-subject={subject}>
      <header className="runner-top">
        <button className="icon-btn" onClick={() => (results.length ? setConfirmExit(true) : exitTo())} aria-label="やめる">
          <Icon name="x" />
        </button>
        <div className="runner-progress" aria-label={`${idx + 1}問目 / ${items.length}問`}>
          {items.map((it, i) => (
            <i key={i} className={i < done ? (results[i]?.correct ? 'ok' : 'ng') : i === idx ? 'cur' : ''} data-retry={it.retry ? '1' : undefined} />
          ))}
        </div>
        <span className="counter num">
          {idx + 1}/{items.length}
        </span>
        {combo >= 2 && (
          <span className="combo" key={combo}>
            <Icon name="flame" size={18} /> {combo}
          </span>
        )}
        {settings.get().showTimer && <span className="timer num">{fmtSec(elapsed)}</span>}
      </header>

      <div className="runner-body">
        {cur!.retry && phase === 'answer' && <div className="retry-banner">🔁 さっきまちがえた問題にもう一度チャレンジ！</div>}
        <QuestionView
          key={idx}
          q={cur!.q}
          locked={phase === 'feedback'}
          given={last?.given}
          correct={last?.correct}
          onAnswer={onAnswer}
          flagged={flags[cur!.q.id]}
          onFlag={async () => {
            const f = await toggleFlag(cur!.q);
            setFlags((x) => ({ ...x, [cur!.q.id]: f }));
          }}
          onScratch={['math', 'science'].includes(subject) ? () => setScratch(true) : undefined}
        />
      </div>

      {phase === 'feedback' && last && (
        <div className={`feedback ${fbCorrect ? 'ok' : 'ng'}`}>
          <div className="fb-inner">
            <div className="fb-head">
              <Mascot size={58} mood={mood} bob={false} />
              <div className="grow">
                <div className="fb-title">{fbCorrect ? (combo >= 5 ? `${combo}連続正解！すごい！` : combo >= 3 ? 'いい調子！' : '正解！') : last.given ? 'おしい！' : '答えを確認しよう'}</div>
                {!fbCorrect && (
                  <div className="fb-answer">
                    正解：
                    <b>
                      <Markup text={cur!.q.type === 'tf' ? (cur!.q.answer === 'o' ? '○' : '×') : cur!.q.type === 'order' ? (cur!.q.choices ?? []).join(' → ') : cur!.q.answer} />
                      {cur!.q.unitSuffix && <span className="faint"> {cur!.q.unitSuffix}</span>}
                    </b>
                    {last.note && <div className="fb-note">⚠️ {last.note}</div>}
                    {last.error && last.error !== 'skip' && !last.note && <span className="chip ng tiny">{ERROR_LABEL[last.error]}</span>}
                  </div>
                )}
              </div>
              <span className="xp-pop num">+{last.xp} XP</span>
            </div>
            {cur!.q.explanation && (
              <div className="fb-expl">
                {showExpl ? (
                  <div className="expl-text">
                    <Markup text={cur!.q.explanation} />
                  </div>
                ) : (
                  <button className="link-btn" onClick={() => setShowExpl(true)}>
                    解説を見る
                  </button>
                )}
              </div>
            )}
            {!fbCorrect && <AIExplain q={cur!.q} given={last.given} correct={false} autoStart={settings.get().ai.autoExplainOnWrong} />}
            <div className="fb-actions">
              {!fbCorrect && cur!.q.gen && (
                <span className="tiny faint">次の問題で似た計算がまた出てくるよ</span>
              )}
              <button className={`btn lg ${fbCorrect ? 'ok' : 'primary'} grow`} onClick={next} autoFocus>
                {idx + 1 >= items.length ? '結果を見る' : '次へ'} <Icon name="arrow" />
              </button>
            </div>
          </div>
        </div>
      )}

      {scratch && (
        <div className="scratch-layer">
          <div className="scratch-head">
            <b>✏️ 計算メモ</b>
            <span className="grow small muted">Apple Pencil・指で書けます</span>
            <button className="btn sm" onClick={() => setScratch(false)}>
              とじる
            </button>
          </div>
          <div className="scratch-q">
            <Markup text={cur!.q.prompt} />
          </div>
          <DrawPad height="calc(100% - 120px)" guide="grid" />
        </div>
      )}

      {confirmExit && (
        <Modal onClose={() => setConfirmExit(false)}>
          <div className="center stack">
            <Mascot mood="sad" size={80} />
            <h2>ここでやめる？</h2>
            <p className="muted">ここまでの記録はちゃんと保存されているよ。</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmExit(false)}>
                つづける
              </button>
              <button className="btn ng grow" onClick={() => exitTo()}>
                やめる
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- 結果画面 ----------
function Results({
  config,
  results,
  maxCombo,
  elapsed,
  summary,
}: {
  config: PlayConfig;
  results: Res[];
  maxCombo: number;
  elapsed: number;
  summary: { bonus: number; perfect: boolean } | null;
}) {
  const first = results.filter((r) => !r.retry);
  const correct = first.filter((r) => r.correct).length;
  const rate = first.length ? correct / first.length : 0;
  const xp = results.reduce((a, r) => a + r.xp, 0) + (summary?.bonus ?? 0);
  const wrongIds = Array.from(new Set(results.filter((r) => !r.correct).map((r) => r.q.id)));
  const [open, setOpen] = useState<number | null>(null);
  const title = rate === 1 ? 'パーフェクト！' : rate >= 0.8 ? 'すばらしい！' : rate >= 0.6 ? 'よくがんばった！' : 'のびしろたっぷり！';
  const mood: Mood = rate === 1 ? 'wow' : rate >= 0.6 ? 'happy' : 'think';
  const subject = config.subject ?? first[0]?.q.subject ?? 'mix';

  return (
    <div className="runner results" data-subject={subject}>
      <div className="results-inner">
        <div className="results-hero">
          <Mascot size={110} mood={mood} />
          <div>
            <p className="eyebrow">{config.title}</p>
            <h1>{title}</h1>
            <p className="muted">
              {first.length}問中 <b className="num">{correct}</b>問 正解
            </p>
          </div>
          <Ring value={rate} size={120} stroke={12}>
            <div>
              <div className="num" style={{ fontSize: 30 }}>
                {Math.round(rate * 100)}
                <small style={{ fontSize: 14 }}>%</small>
              </div>
              <div className="tiny faint">正答率</div>
            </div>
          </Ring>
        </div>
        <div className="tiles" style={{ marginTop: 18 }}>
          <div className="tile">
            <div className="label">獲得XP</div>
            <div className="value" style={{ color: 'var(--gold-ink)' }}>
              +{xp}
            </div>
            {summary?.bonus ? <div className="tiny faint">ボーナス +{summary.bonus}</div> : null}
          </div>
          <div className="tile">
            <div className="label">最大コンボ</div>
            <div className="value">
              {maxCombo}
              <small>連続</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">かかった時間</div>
            <div className="value" style={{ fontSize: 24 }}>
              {fmtSec(elapsed)}
            </div>
          </div>
          <div className="tile">
            <div className="label">再チャレンジ</div>
            <div className="value">
              {results.filter((r) => r.retry && r.correct).length}/{results.filter((r) => r.retry).length}
              <small>正解</small>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">
            <h3>ふりかえり</h3>
            <span className="hint">タップで解説</span>
          </div>
          <div className="list">
            {results.map((r, i) => (
              <div key={i}>
                <button className="list-row result-row" onClick={() => setOpen(open === i ? null : i)}>
                  <span className={`mark ${r.correct ? 'ok' : 'ng'}`}>{r.correct ? '○' : '×'}</span>
                  <span className="grow result-q">
                    {r.retry && <span className="chip tiny">再</span>} <Markup text={r.q.listening ? `🔊 ${r.q.speak}` : r.q.prompt} />
                  </span>
                  <span className="tiny faint">{fmtSec(r.timeMs)}</span>
                  <Icon name={open === i ? 'left' : 'right'} size={18} style={{ transform: open === i ? 'rotate(-90deg)' : undefined }} />
                </button>
                {open === i && (
                  <div className="result-detail">
                    <p>
                      正解：<b><Markup text={r.q.type === 'tf' ? (r.q.answer === 'o' ? '○' : '×') : r.q.type === 'order' ? (r.q.choices ?? []).join(' → ') : r.q.answer} /></b>
                      {r.q.unitSuffix}
                      {!r.correct && (
                        <>
                          {' '}
                          ／ あなた：<span className="ng-text">{r.given ? (r.q.type === 'tf' ? (r.given === 'o' ? '○' : '×') : r.given.replace(/\|/g, ' → ')) : '（わからない）'}</span>
                        </>
                      )}
                    </p>
                    {r.q.explanation && (
                      <div className="expl-text">
                        <Markup text={r.q.explanation} />
                      </div>
                    )}
                    {!r.correct && effectiveType(r.q) !== 'write' && <AIExplain q={r.q} given={r.given} correct={false} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="results-actions">
          {wrongIds.length > 0 && (
            <button
              className="btn ng lg"
              onClick={() =>
                navigate({ name: 'play', config: { title: 'まちがえた問題', mode: 'retry', spec: { kind: 'retry', qids: wrongIds }, subject } }, { replace: true })
              }
            >
              <Icon name="refresh" /> まちがえた{wrongIds.length}問をもう一度
            </button>
          )}
          {config.spec && config.spec.kind !== 'retry' && (
            <button className="btn primary lg" onClick={() => navigate({ name: 'play', config: { ...config } }, { replace: true })}>
              <Icon name="play" /> 次のセット
            </button>
          )}
          <button className="btn lg" onClick={() => exitTo()}>
            <Icon name="home" /> ホームへ
          </button>
        </div>
      </div>
    </div>
  );
}
