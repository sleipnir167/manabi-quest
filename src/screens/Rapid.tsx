// ===== 爆速周回モード：フラッシュカード周回 / タイムアタック / 聞き流し =====
import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, type Question, type SubjectId } from '../content/types';
import { getQuestion, unitName, unitsOf } from '../content/registry';
import { PRESETS, attackChoices, deckFor, deckFromUnits, faceOf, type DeckPreset } from '../lib/decks';
import { recordAnswer, recordSession } from '../lib/record';
import { exitTo, navigate, setExitGuard, type RapidConfig } from '../lib/router';
import { sfx } from '../lib/sound';
import { listen, pronunciationMatch, speak, stopSpeak, sttSupported } from '../lib/speech';
import { profile, settings } from '../lib/store';
import { fmtSec, hash, shuffle } from '../lib/util';
import { Icon } from '../components/Icon';
import { Markup } from '../components/Markup';
import { Mascot } from '../components/Mascot';
import { Modal, PageHead, Ring, Seg, Switch } from '../components/ui';
import { DrawPad } from '../components/DrawPad';
import { confetti } from '../components/Confetti';
import { toast } from '../lib/events';
import { judge, normText } from '../lib/normalize';
import { db } from '../lib/db';

type Kind = RapidConfig['kind'];

// ---------- 設定画面 ----------
export function RapidSetup() {
  const [kind, setKind] = useState<Kind>('flash');
  const [subject, setSubject] = useState<SubjectId | 'preset'>('preset');
  const [units, setUnits] = useState<string[]>([]);
  const [size, setSize] = useState<number>(30);
  const [reverse, setReverse] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const c: Record<string, number> = {};
      for (const p of PRESETS) c[p.id] = (await deckFor(p, kind)).length;
      setCounts(c);
    })();
  }, [kind]);

  const start = async (preset?: DeckPreset) => {
    let ids = preset ? await deckFor(preset, kind) : deckFromUnits(units, kind);
    if (!ids.length) return toast('このデッキには使える問題がありません', '🃏', 'warn');
    // 復習期限・苦手を優先して並べる
    const cards = await db.cards.bulkGet(ids);
    const now = Date.now();
    const pri = (i: number) => {
      const c = cards[i];
      if (!c || !c.reps) return 1 + Math.random();
      return (c.due <= now ? 3 : 0) + (c.lastCorrect ? 0 : 2) + Math.random();
    };
    ids = ids
      .map((id, i) => ({ id, p: pri(i) }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.id);
    if (size > 0) ids = ids.slice(0, size);
    const title = preset ? preset.label : units.length === 1 ? unitName(units[0]) : `${units.length}単元ミックス`;
    sfx.start();
    navigate({
      name: 'rapid-run',
      config: {
        kind,
        title,
        qids: shuffle(ids),
        reverse,
        subject: preset?.subject ?? (subject === 'preset' ? 'mix' : subject),
        seconds: 60,
        deckId: `${preset ? preset.id : units.slice().sort().join('+')}:${size}:${reverse ? 'r' : ''}`,
      },
    });
  };

  const modes: { k: Kind; icon: string; name: string; desc: string }[] = [
    { k: 'flash', icon: '🃏', name: 'フラッシュ周回', desc: '覚えるまで何周でも。わからないカードは何度も出る' },
    { k: 'attack', icon: '⏱️', name: 'タイムアタック', desc: '60秒で何問とけるか！コンボで高得点' },
    { k: 'listen', icon: '🎧', name: '聞き流し', desc: '自動で読み上げ。移動中やねる前に' },
  ];

  return (
    <div className="page rapid">
      <PageHead title="⚡ 爆速周回" sub="暗記ものは「短時間で何周もくり返す」のがいちばん効く！" />
      <div className="mode-cards">
        {modes.map((m) => (
          <button
            key={m.k}
            className={`mode-card ${kind === m.k ? 'active' : ''}`}
            onClick={() => {
              sfx.select();
              setKind(m.k);
            }}
          >
            <span className="mode-icon">{m.icon}</span>
            <b>{m.name}</b>
            <span className="small muted">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="section-title">
        <h2>デッキを選ぶ</h2>
        <Seg
          value={size}
          onChange={setSize}
          options={[
            { value: 20, label: '20枚' },
            { value: 30, label: '30枚' },
            { value: 50, label: '50枚' },
            { value: 0, label: 'ぜんぶ' },
          ]}
        />
      </div>
      {kind === 'flash' && (
        <div className="row" style={{ marginBottom: 12 }}>
          <Switch checked={reverse} onChange={setReverse} label="裏返し" />
          <span className="small">
            <b>裏返しモード</b>（答え → 問題。英単語なら「日本語 → 英語」）
          </span>
        </div>
      )}
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className="preset" data-subject={p.subject} onClick={() => start(p)} disabled={!counts[p.id]}>
            <span className="preset-icon">{p.icon}</span>
            <span className="grow">
              <b>{p.label}</b>
              <span className="tiny faint">{counts[p.id] ?? '…'} 枚</span>
            </span>
            <Icon name="play" size={18} />
          </button>
        ))}
      </div>

      <div className="section-title">
        <h2>単元をえらんで作る</h2>
      </div>
      <div className="chips scroll" style={{ marginBottom: 12 }}>
        {SUBJECTS.map((s) => (
          <button
            key={s.id}
            className={`chip ${subject === s.id ? 'active' : ''}`}
            data-subject={s.id}
            onClick={() => {
              setSubject(s.id);
              setUnits([]);
            }}
          >
            {s.emoji} {s.name}
          </button>
        ))}
      </div>
      {subject !== 'preset' && (
        <div className="card">
          <div className="chips">
            {unitsOf(subject)
              .filter((u) => deckFromUnits([u.id], kind).length > 0)
              .map((u) => (
                <button
                  key={u.id}
                  className={`chip ${units.includes(u.id) ? 'active' : ''}`}
                  data-subject={subject}
                  onClick={() => setUnits(units.includes(u.id) ? units.filter((x) => x !== u.id) : [...units, u.id])}
                >
                  {u.name}
                </button>
              ))}
          </div>
          <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={!units.length} onClick={() => start()}>
            <Icon name="rapid" /> スタート（{deckFromUnits(units, kind).length}枚から）
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 実行画面（種類で分岐） ----------
export function RapidRun({ config }: { config: RapidConfig }) {
  const qs = useMemo(() => config.qids.map((id) => getQuestion(id)).filter(Boolean) as Question[], [config]);
  const [confirmExit, setConfirmExit] = useState(false);
  useEffect(() => {
    setExitGuard(() => setConfirmExit(true));
    return () => setExitGuard(null);
  }, []);
  const deckKey = config.kind + ':' + (config.deckId ?? hash(config.qids.slice().sort().join(',')));
  return (
    <div className="runner rapid-run" data-subject={config.subject ?? 'mix'}>
      {config.kind === 'flash' && <FlashRun qs={qs} config={config} deckKey={deckKey} onExit={() => setConfirmExit(true)} />}
      {config.kind === 'attack' && <AttackRun qs={qs} config={config} deckKey={deckKey} onExit={() => setConfirmExit(true)} />}
      {config.kind === 'listen' && <ListenRun qs={qs} config={config} onExit={() => exitTo({ name: 'rapid' })} />}
      {confirmExit && (
        <Modal onClose={() => setConfirmExit(false)}>
          <div className="center stack">
            <Mascot mood="sad" size={80} />
            <h2>周回をやめる？</h2>
            <p className="muted">ここまでの記録は保存されています。</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmExit(false)}>
                つづける
              </button>
              <button className="btn ng grow" onClick={() => exitTo({ name: 'rapid' })}>
                やめる
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- フラッシュカード周回 ----------
function FlashRun({ qs, config, deckKey, onExit }: { qs: Question[]; config: RapidConfig; deckKey: string; onExit: () => void }) {
  const [queue, setQueue] = useState<number[]>(() => qs.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [cleared, setCleared] = useState(0);
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [seenOnce, setSeenOnce] = useState<Set<number>>(new Set());
  const [lap, setLap] = useState(1);
  const [firstCorrect, setFirstCorrect] = useState(0);
  const [drag, setDrag] = useState(0);
  const [pad, setPad] = useState(false);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<{ prev?: number; now: number } | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const start = useRef(Date.now());
  const dragStart = useRef<number | null>(null);
  const passCount = useRef(0);

  const cur = queue[0];
  const q = qs[cur];
  const face = q ? faceOf(q, config.reverse) : null;

  useEffect(() => {
    shownAt.current = Date.now();
    setHeard(null);
    if (face && face.frontLang === 'en') speak(face.front, 'en');
    return () => stopSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, queue.length]);

  const flip = () => {
    if (!q) return;
    sfx.flip();
    setFlipped(true);
    if (face && (face.backLang === 'en' || settings.get().tts.readAnswer)) speak(face.back, face.backLang);
  };

  const grade = async (ok: boolean) => {
    if (!q || done) return;
    const t = Date.now() - shownAt.current;
    const first = !seenOnce.has(cur);
    setSeenOnce((s) => new Set(s).add(cur));
    setFlipped(false);
    setDrag(0);
    passCount.current++;
    if (ok) {
      sfx.correct(Math.min(8, cleared % 8));
      if (first) setFirstCorrect((n) => n + 1);
    } else sfx.wrong();
    // 復習スケジュールには最初の1回だけ反映（同じ周回中のくり返しは記録だけ）
    recordAnswer({
      q,
      correct: ok,
      given: ok ? q.answer : '',
      timeMs: t,
      mode: 'rapid',
      rating: ok ? (t < 3500 && first ? 4 : 3) : 1,
      updateSrs: first || !missed.has(cur),
    });
    const rest = queue.slice(1);
    let next: number[];
    if (ok) {
      next = rest;
      setCleared((c) => c + 1);
    } else {
      setMissed((m) => new Set(m).add(cur));
      const pos = Math.min(rest.length, 3 + Math.floor(Math.random() * 3));
      next = [...rest.slice(0, pos), cur, ...rest.slice(pos)];
    }
    if (passCount.current >= qs.length * lap) setLap((l) => l + 1);
    setQueue(next);
    if (!next.length) {
      setDone(true);
      const ms = Date.now() - start.current;
      const prev = profile.get().records.flashBestMs[deckKey];
      if (!prev || ms < prev) profile.set((p) => ({ ...p, records: { ...p.records, flashBestMs: { ...p.records.flashBestMs, [deckKey]: ms } } }));
      setBest({ prev, now: ms });
      confetti({ count: 150 });
      sfx.complete();
      setExitGuard(null);
      await recordSession({
        startedAt: start.current,
        endedAt: Date.now(),
        mode: 'rapid',
        subject: config.subject,
        title: `周回：${config.title}`,
        total: qs.length,
        correct: qs.length,
        durationMs: ms,
      });
    }
  };

  // キーボード：スペースでめくる、←まだ →覚えた
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) flip();
      } else if (e.key === 'ArrowRight' && flipped) grade(true);
      else if (e.key === 'ArrowLeft' && flipped) grade(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const sayIt = async () => {
    if (!face) return;
    const target = face.frontLang === 'en' ? face.front : face.back;
    try {
      const alts = await listen('en').result;
      const ok = pronunciationMatch(target, alts);
      setHeard(alts[0] ?? '');
      if (ok) {
        sfx.correct(3);
        toast(`Great! 「${alts[0]}」`, '🎉', 'good');
      } else toast(`聞こえた：「${alts[0] ?? '…'}」 もう一度！`, '🎤', 'warn');
    } catch (e) {
      toast((e as Error).message, '🎤', 'warn');
    }
  };

  if (done)
    return (
      <div className="runner-body center stack rapid-done">
        <Mascot mood="wow" size={120} />
        <h1>周回クリア！</h1>
        <p className="muted">
          {qs.length}枚を {fmtSec(best?.now ?? 0)} でクリア（1周目の正解 {firstCorrect}/{qs.length}）
        </p>
        {best && (!best.prev || best.now < best.prev) && <div className="chip warn">🏆 ベストタイム更新！{best.prev ? `（前回 ${fmtSec(best.prev)}）` : ''}</div>}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {missed.size > 0 && (
            <button
              className="btn ng lg"
              onClick={() => navigate({ name: 'rapid-run', config: { ...config, qids: shuffle([...missed].map((i) => qs[i].id)) } }, { replace: true })}
            >
              <Icon name="refresh" /> 一度まちがえた{missed.size}枚だけ
            </button>
          )}
          <button className="btn primary lg" onClick={() => navigate({ name: 'rapid-run', config: { ...config, qids: shuffle(config.qids) } }, { replace: true })}>
            <Icon name="repeat" /> もう一周
          </button>
          <button className="btn lg" onClick={() => exitTo({ name: 'rapid' })}>
            おわる
          </button>
        </div>
      </div>
    );

  const isEnCard = face && (face.frontLang === 'en' || face.backLang === 'en');
  return (
    <>
      <header className="runner-top">
        <button className="icon-btn" onClick={onExit} aria-label="やめる">
          <Icon name="x" />
        </button>
        <div className="grow">
          <div className="bar">
            <i style={{ width: `${(cleared / qs.length) * 100}%` }} />
          </div>
        </div>
        <span className="counter num">
          {cleared}/{qs.length}
        </span>
        <span className="chip tiny">{lap}周目</span>
      </header>
      <div className="runner-body flash-body">
        <p className="center small muted">{config.title}・残り {queue.length} 枚{missed.has(cur) ? '・🔁 さっきまちがえたカード' : ''}</p>
        <div
          className={`flashcard ${flipped ? 'flipped' : ''}`}
          style={{ transform: drag ? `translateX(${drag}px) rotate(${drag / 25}deg)` : undefined }}
          onClick={() => !flipped && flip()}
          onPointerDown={(e) => {
            if (flipped) dragStart.current = e.clientX;
          }}
          onPointerMove={(e) => {
            if (dragStart.current != null) setDrag(e.clientX - dragStart.current);
          }}
          onPointerUp={() => {
            if (dragStart.current == null) return;
            dragStart.current = null;
            if (drag > 90) grade(true);
            else if (drag < -90) grade(false);
            else setDrag(0);
          }}
        >
          <div className="fc-face fc-front">
            <div className={`fc-text ${face?.frontLang === 'en' ? 'en' : ''} ${(face?.front.length ?? 0) > 40 ? 'long' : ''}`}>
              <Markup text={face?.front ?? ''} />
            </div>
            <span className="fc-tap">タップでめくる</span>
          </div>
          <div className="fc-face fc-back">
            {face && face.front.length <= 40 && (
              <div className="fc-mini">
                <Markup text={face.front.replace(/\n/g, ' ')} />
              </div>
            )}
            <div className={`fc-text ${face?.backLang === 'en' ? 'en' : ''} ${(face?.back.length ?? 0) > 40 ? 'long' : ''}`}>
              <Markup text={face?.back ?? ''} />
            </div>
            {face?.sub && (
              <div className="fc-sub">
                <Markup text={face.sub} />
              </div>
            )}
          </div>
          {drag > 40 && <span className="swipe-badge ok">覚えた</span>}
          {drag < -40 && <span className="swipe-badge ng">まだ</span>}
        </div>
        <div className="flash-tools">
          <button className="icon-btn" onClick={() => face && speak(flipped ? face.back : face.front, flipped ? face.backLang : face.frontLang)} aria-label="読み上げ">
            <Icon name="speaker" />
          </button>
          {isEnCard && sttSupported() && (
            <button className="btn sm soft" onClick={sayIt}>
              <Icon name="mic" /> 発音チェック
            </button>
          )}
          <button className={`icon-btn ${pad ? 'on' : ''}`} onClick={() => setPad(!pad)} aria-label="手書きパッド">
            <Icon name="pencil" />
          </button>
        </div>
        {heard !== null && <p className="center small muted">🎤 「{heard}」</p>}
        {pad && <DrawPad height={220} guide="kanji" />}
        <div className="flash-actions">
          {!flipped ? (
            <button className="btn primary lg block" onClick={flip}>
              <Icon name="eye" /> 答えを見る <span className="kbd">Space</span>
            </button>
          ) : (
            <>
              <button className="btn ng lg grow" onClick={() => grade(false)}>
                × まだ <span className="kbd">←</span>
              </button>
              <button className="btn ok lg grow" onClick={() => grade(true)}>
                ○ 覚えた <span className="kbd">→</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- タイムアタック ----------
function AttackRun({ qs, config, deckKey, onExit }: { qs: Question[]; config: RapidConfig; deckKey: string; onExit: () => void }) {
  const total = (config.seconds ?? 60) * 1000;
  const [order] = useState(() => shuffle(qs.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [left, setLeft] = useState(total);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correctN, setCorrectN] = useState(0);
  const [misses, setMisses] = useState<Question[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; pick: string } | null>(null);
  const [phase, setPhase] = useState<'ready' | 'run' | 'end'>('ready');
  const [countdown, setCountdown] = useState(3);
  const shownAt = useRef(0);
  const startAt = useRef(0);
  const maxCombo = useRef(0);

  const q = qs[order[pos % order.length]];
  const choices = useMemo(() => (q ? shuffle(attackChoices(q, qs)) : []), [q, qs, pos]);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (countdown <= 0) {
      setPhase('run');
      startAt.current = Date.now();
      shownAt.current = Date.now();
      sfx.start();
      return;
    }
    sfx.tick();
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const l = Math.max(0, total - (Date.now() - startAt.current));
      setLeft(l);
      if (l <= 5000 && l > 0 && Math.floor(l / 1000) !== Math.floor((l + 100) / 1000)) sfx.tick();
      if (l <= 0) finish();
    }, 100);
    return () => clearInterval(t);
  });

  const finish = async () => {
    if (phase === 'end') return;
    setPhase('end');
    setExitGuard(null);
    sfx.timeUp();
    const prev = profile.get().records.attackBest[deckKey] ?? 0;
    if (score > prev) {
      profile.set((p) => ({ ...p, records: { ...p.records, attackBest: { ...p.records.attackBest, [deckKey]: score } } }));
      setTimeout(() => confetti({ count: 140 }), 400);
    }
    await recordSession({
      startedAt: startAt.current,
      endedAt: Date.now(),
      mode: 'attack',
      subject: config.subject,
      title: `タイムアタック：${config.title}`,
      total: answered,
      correct: correctN,
      durationMs: total,
      maxCombo: maxCombo.current,
      score,
    });
  };

  const pick = (c: string) => {
    if (phase !== 'run' || flash || !q) return;
    const t = Date.now() - shownAt.current;
    const j = q.type === 'tf' ? { correct: c === q.answer } : judge({ ...q, type: 'choice' }, c);
    const ok = j.correct || normText(c) === normText(q.answer);
    setAnswered((n) => n + 1);
    if (ok) {
      const nc = combo + 1;
      setCombo(nc);
      maxCombo.current = Math.max(maxCombo.current, nc);
      setCorrectN((n) => n + 1);
      setScore((s) => s + 1 + (nc >= 10 ? 2 : nc >= 5 ? 1 : 0));
      sfx.correct(nc);
      if (nc % 10 === 0) confetti({ count: 50 });
    } else {
      setCombo(0);
      setMisses((m) => (m.includes(q) ? m : [...m, q]));
      sfx.wrong();
    }
    recordAnswer({ q, correct: ok, given: c, timeMs: t, mode: 'attack', combo: ok ? combo + 1 : 0 });
    setFlash({ ok, pick: c });
    setTimeout(
      () => {
        setFlash(null);
        setPos((p) => p + 1);
        shownAt.current = Date.now();
      },
      ok ? 220 : 900,
    );
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const i = '1234'.indexOf(e.key);
      if (i >= 0 && choices[i]) pick(choices[i]);
      if (q?.type === 'tf' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) pick(e.key === 'ArrowLeft' ? 'o' : 'x');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (phase === 'ready')
    return (
      <div className="runner-body center stack countdown">
        <p className="muted">{config.title}</p>
        <div className="count-num num" key={countdown}>
          {countdown > 0 ? countdown : 'GO!'}
        </div>
      </div>
    );

  if (phase === 'end') {
    const prev = profile.get().records.attackBest[deckKey];
    return (
      <div className="runner-body center stack rapid-done">
        <Mascot mood={score >= 20 ? 'wow' : 'happy'} size={110} />
        <p className="eyebrow">タイムアタック：{config.title}</p>
        <div className="big-score num">{score}<small>点</small></div>
        {score >= (prev ?? 0) && score > 0 && <div className="chip warn">🏆 自己ベスト！</div>}
        <p className="muted">
          {answered}問中 {correctN}問 正解・最大 {maxCombo.current} コンボ{prev && score < prev ? `（ベスト ${prev}点）` : ''}
        </p>
        {misses.length > 0 && (
          <div className="card" style={{ width: 'min(640px, 100%)', textAlign: 'left' }}>
            <h3 style={{ marginBottom: 8 }}>まちがえた問題</h3>
            {misses.map((m) => (
              <div key={m.id} className="list-row">
                <span className="mark ng">×</span>
                <span className="grow small">
                  <Markup text={m.listening ? `🔊 ${m.speak}` : m.prompt} />
                </span>
                <b className="small">
                  <Markup text={m.type === 'tf' ? (m.answer === 'o' ? '○' : '×') : m.answer} />
                </b>
              </div>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn primary lg" onClick={() => navigate({ name: 'rapid-run', config: { ...config, qids: shuffle(config.qids) } }, { replace: true })}>
            <Icon name="refresh" /> もう一回
          </button>
          {misses.length > 0 && (
            <button
              className="btn ng lg"
              onClick={() =>
                navigate({ name: 'play', config: { title: 'タイムアタックの復習', mode: 'retry', spec: { kind: 'retry', qids: misses.map((m) => m.id) }, subject: config.subject } }, { replace: true })
              }
            >
              まちがえた問題をじっくり
            </button>
          )}
          <button className="btn lg" onClick={() => exitTo({ name: 'rapid' })}>
            おわる
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="runner-top">
        <button className="icon-btn" onClick={onExit} aria-label="やめる">
          <Icon name="x" />
        </button>
        <Ring value={left / total} size={46} stroke={6} className={left < 10000 ? 'hurry' : ''}>
          <span className="num small">{Math.ceil(left / 1000)}</span>
        </Ring>
        <span className="grow" />
        {combo >= 2 && (
          <span className="combo" key={combo}>
            <Icon name="flame" size={18} /> {combo}
          </span>
        )}
        <span className="score-pill num">{score}点</span>
      </header>
      <div className="runner-body attack-body">
        {q && (
          <>
            <div className={`q-card attack-q ${flash ? (flash.ok ? 'is-ok' : 'is-ng') : ''}`} key={pos}>
              {q.ask && <p className="q-ask">{q.ask}</p>}
              {q.listening ? (
                <button className="listen-btn" onClick={() => speak(q.speak ?? '', 'en')}>
                  <Icon name="speaker" size={40} />
                </button>
              ) : (
                <div className="q-prompt">
                  <Markup text={q.prompt} />
                </div>
              )}
            </div>
            <div className={`choices ${q.type === 'tf' ? 'two' : ''} ${choices.some((c) => c.length > 14) ? 'long' : ''}`}>
              {choices.map((c, i) => {
                const st = flash ? (normText(c) === normText(q.answer) ? 'correct' : c === flash.pick ? 'wrong' : 'dim') : '';
                return (
                  <button key={c + i} className={`choice ${st}`} onClick={() => pick(c)}>
                    <span className="choice-key">{q.type === 'tf' ? '' : 'ABCD'[i]}</span>
                    <span className="choice-text">{q.type === 'tf' ? (c === 'o' ? '○' : '×') : <Markup text={c} />}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------- 聞き流し ----------
function ListenRun({ qs, config, onExit }: { qs: Question[]; config: RapidConfig; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showBack, setShowBack] = useState(false);
  const [rate, setRate] = useState(1);
  const [gap, setGap] = useState(2);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const q = qs[i % Math.max(1, qs.length)];
  const face = q ? faceOf(q, config.reverse) : null;

  // 画面が消えないようにする（対応ブラウザのみ）
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
      stopSpeak();
    };
  }, []);

  useEffect(() => {
    if (!playing || !face) return;
    let cancelled = false;
    (async () => {
      setShowBack(false);
      await speak(face.front.replace('🔊', ''), face.frontLang, rate);
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, gap * 1000));
      if (cancelled) return;
      setShowBack(true);
      await speak(face.back, face.backLang, rate);
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled || !playingRef.current) return;
      setI((x) => x + 1);
    })();
    return () => {
      cancelled = true;
      stopSpeak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, rate, gap]);

  return (
    <>
      <header className="runner-top">
        <button className="icon-btn" onClick={onExit} aria-label="やめる">
          <Icon name="x" />
        </button>
        <b className="grow">🎧 {config.title}</b>
        <span className="counter num">
          {(i % qs.length) + 1}/{qs.length}
        </span>
      </header>
      <div className="runner-body listen-body">
        <div className="listen-card">
          <div className={`fc-text ${face?.frontLang === 'en' ? 'en' : ''}`}>
            <Markup text={face?.front ?? ''} />
          </div>
          <div className={`listen-back ${showBack ? 'show' : ''}`}>
            <Markup text={face?.back ?? ''} />
          </div>
        </div>
        <div className="listen-controls">
          <button className="icon-btn big" onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="前へ">
            <Icon name="left" size={30} />
          </button>
          <button className="play-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? '一時停止' : '再生'}>
            <Icon name={playing ? 'pause' : 'play'} size={34} />
          </button>
          <button className="icon-btn big" onClick={() => setI((x) => x + 1)} aria-label="次へ">
            <Icon name="right" size={30} />
          </button>
        </div>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Seg value={rate} onChange={setRate} options={[{ value: 0.8, label: 'ゆっくり' }, { value: 1, label: 'ふつう' }, { value: 1.25, label: 'はやい' }]} />
          <Seg value={gap} onChange={setGap} options={[{ value: 1, label: '間1秒' }, { value: 2, label: '2秒' }, { value: 4, label: '4秒' }]} />
        </div>
        <p className="center tiny faint">答えを言われる前に、心の中で答えてみよう</p>
      </div>
    </>
  );
}
