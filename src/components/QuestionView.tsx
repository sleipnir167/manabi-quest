// ===== 1問分の表示と解答入力 =====
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../content/types';
import { unitName } from '../content/registry';
import { Markup } from './Markup';
import { Icon } from './Icon';
import { Stars } from './ui';
import { Keypad, NumDisplay } from './Keypad';
import { DrawPad, type DrawPadHandle } from './DrawPad';
import { sfx } from '../lib/sound';
import { listen, speak, sttSupported, stopSpeak } from '../lib/speech';
import { settings } from '../lib/store';
import { normText } from '../lib/normalize';
import { shuffle } from '../lib/util';
import { toast } from '../lib/events';

export interface AnswerMeta {
  usedHint: boolean;
  selfGraded?: boolean;
}

export interface QuestionViewProps {
  q: Question;
  /** 解答後（正誤表示中） */
  locked?: boolean;
  given?: string;
  correct?: boolean;
  /** テスト中（ヒントなし・手書き問題は選択式） */
  testMode?: boolean;
  onAnswer: (given: string, meta: AnswerMeta) => void;
  flagged?: boolean;
  onFlag?: () => void;
  onScratch?: () => void;
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 表示に使う解答形式（設定・モードで切りかえ） */
export function effectiveType(q: Question, testMode?: boolean): Question['type'] {
  const s = settings.get();
  if (q.type === 'write' && (testMode || !s.handwriteKanji) && q.choices?.length) return 'choice';
  if (q.type === 'input' && q.choices?.length && (s.choiceForInput || testMode)) return 'choice';
  return q.type;
}

export function speakQuestion(q: Question) {
  if (q.speak && (q.speakLang === 'en' || q.subject === 'english')) {
    if (q.listening) return speak(q.speak, 'en');
    // 英語の問題：日本語の指示は読まず、英語部分を読む
    return speak(q.speak, 'en');
  }
  return speak(`${q.ask ? q.ask + '。' : ''}${q.prompt}`, 'ja');
}

export function QuestionView({ q, locked, given, correct, testMode, onAnswer, flagged, onFlag, onScratch }: QuestionViewProps) {
  const type = effectiveType(q, testMode);
  const [usedHint, setUsedHint] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [text, setText] = useState('');
  const [num, setNum] = useState('');
  const [order, setOrder] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const padRef = useRef<DrawPadHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const choices = useMemo(() => {
    if (type === 'choice') return shuffle(q.choices ?? []);
    if (type === 'order') {
      let s = shuffle(q.choices ?? []);
      for (let i = 0; i < 5 && s.join('|') === (q.choices ?? []).join('|'); i++) s = shuffle(q.choices ?? []);
      return s;
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type]);

  useEffect(() => {
    setText('');
    setNum('');
    setOrder([]);
    setRevealed(false);
    setUsedHint(false);
    setShowHint(false);
    setInterim('');
    padRef.current?.clear();
    if (q.listening || settings.get().tts.autoRead) {
      const t = setTimeout(() => speakQuestion(q), 250);
      return () => {
        clearTimeout(t);
        stopSpeak();
      };
    }
    return () => stopSpeak();
  }, [q]);

  const submit = (g: string, meta: Partial<AnswerMeta> = {}) => {
    if (locked) return;
    stopRef.current?.();
    onAnswer(g, { usedHint, ...meta });
  };

  // キーボード操作（iPad の外付けキーボード・PC）
  useEffect(() => {
    if (locked) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (type === 'choice') {
        const i = '1234'.indexOf(e.key);
        const j = 'abcd'.indexOf(e.key.toLowerCase());
        const k = i >= 0 ? i : j;
        if (k >= 0 && choices[k] !== undefined) {
          e.preventDefault();
          sfx.select();
          submit(choices[k]);
        }
      } else if (type === 'tf') {
        if (e.key === 'o' || e.key === '1' || e.key === 'ArrowLeft') submit('o');
        if (e.key === 'x' || e.key === '2' || e.key === 'ArrowRight') submit('x');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const voiceInput = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    try {
      setListening(true);
      const lang = q.subject === 'english' && !/[ぁ-んァ-ン一-龥]/.test(q.answer) ? 'en' : 'ja';
      const h = listen(lang, setInterim);
      stopRef.current = h.stop;
      const alts = await h.result;
      // 候補の中に正解と一致するものがあればそれを使う（同音異字のずれを減らす）
      const ans = [q.answer, ...(q.accept ?? [])].map(normText);
      const best = alts.find((a) => ans.includes(normText(a))) ?? alts[0] ?? '';
      if (best) setText(best);
    } catch (e) {
      toast((e as Error).message, '🎤', 'warn');
    } finally {
      setListening(false);
      setInterim('');
      stopRef.current = null;
    }
  };

  const stateOf = (c: string) => {
    if (!locked) return '';
    if (normText(c) === normText(q.answer)) return 'correct';
    if (c === given) return 'wrong';
    return 'dim';
  };

  return (
    <div className="qv" data-subject={q.subject}>
      <div className={`q-card ${locked ? (correct ? 'is-ok' : 'is-ng') : ''}`}>
        <div className="q-meta">
          <span className="chip sc">{unitName(q.unit)}</span>
          <Stars n={q.difficulty} />
          {q.source === 'ai' && <span className="chip ai">AI作成</span>}
          {q.source?.startsWith('pack:') && <span className="chip">追加問題</span>}
          <span className="grow" />
          <button className="icon-btn" onClick={() => speakQuestion(q)} aria-label="読み上げ">
            <Icon name="speaker" />
          </button>
          {onScratch && (
            <button className="icon-btn" onClick={onScratch} aria-label="計算メモ">
              <Icon name="pencil" />
            </button>
          )}
          {onFlag && (
            <button className={`icon-btn ${flagged ? 'on' : ''}`} onClick={onFlag} aria-label="あとで見直す">
              <Icon name="flag" />
            </button>
          )}
        </div>
        {q.ask && <p className="q-ask">{q.ask}</p>}
        {q.listening ? (
          <div className="q-listen">
            <button className="listen-btn" onClick={() => speakQuestion(q)} aria-label="もう一度聞く">
              <Icon name="speaker" size={40} />
            </button>
            <p className="muted">{q.prompt.replace('🔊', '').trim()}</p>
            {locked && <p className="q-reveal num">{q.speak}</p>}
          </div>
        ) : (
          <div className={`q-prompt ${q.subject === 'english' && /^[\x20-\x7e]+$/.test(q.prompt) ? 'en' : ''} ${q.prompt.length > 70 ? 'long' : ''}`}>
            <Markup text={q.prompt} />
          </div>
        )}
        {q.figure && <div className="q-figure" dangerouslySetInnerHTML={{ __html: q.figure }} />}
        {!testMode && q.hint && !locked && (
          <div className="q-hint">
            {showHint ? (
              <div className="note warn">
                💡 <Markup text={q.hint} />
              </div>
            ) : (
              <button
                className="btn ghost sm"
                onClick={() => {
                  setShowHint(true);
                  setUsedHint(true);
                }}
              >
                <Icon name="bulb" /> ヒント
              </button>
            )}
          </div>
        )}
      </div>

      <div className="answer-area">
        {type === 'choice' && (
          <div className={`choices ${choices.some((c) => c.length > 14) ? 'long' : ''}`}>
            {choices.map((c, i) => (
              <button
                key={c + i}
                className={`choice ${stateOf(c)}`}
                disabled={locked}
                onClick={() => {
                  sfx.select();
                  submit(c);
                }}
              >
                <span className="choice-key">{LABELS[i]}</span>
                <span className="choice-text">
                  <Markup text={c} />
                </span>
                {locked && stateOf(c) === 'correct' && <Icon name="check" className="choice-mark" />}
                {locked && stateOf(c) === 'wrong' && <Icon name="x" className="choice-mark" />}
              </button>
            ))}
          </div>
        )}

        {type === 'tf' && (
          <div className="tf">
            {(['o', 'x'] as const).map((v) => (
              <button
                key={v}
                className={`tf-btn ${v} ${locked ? (q.answer === v ? 'correct' : given === v ? 'wrong' : 'dim') : ''}`}
                disabled={locked}
                onClick={() => {
                  sfx.select();
                  submit(v);
                }}
                aria-label={v === 'o' ? '正しい' : 'まちがい'}
              >
                {v === 'o' ? '○' : '×'}
              </button>
            ))}
          </div>
        )}

        {type === 'input' && (
          <form
            className="input-answer"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) submit(text);
            }}
          >
            <div className="input-wrap">
              <input
                ref={inputRef}
                className={`input big ${locked ? (correct ? 'ok' : 'ng') : ''}`}
                value={locked ? given ?? text : listening && interim ? interim : text}
                onChange={(e) => setText(e.target.value)}
                placeholder={q.subject === 'english' ? 'ここに入力（英語）' : 'ここに入力'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                lang={q.subject === 'english' ? 'en' : 'ja'}
                disabled={locked}
                enterKeyHint="done"
              />
              {sttSupported() && !locked && (
                <button type="button" className={`mic-btn ${listening ? 'on' : ''}`} onClick={voiceInput} aria-label="音声で答える">
                  <Icon name="mic" />
                </button>
              )}
            </div>
            {!locked && (
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => submit('')}>
                  わからない
                </button>
                <button type="submit" className="btn primary grow" disabled={!text.trim()}>
                  決定
                </button>
              </div>
            )}
          </form>
        )}

        {type === 'numeric' && (
          <div className="numeric-answer">
            <NumDisplay value={locked ? given ?? num : num} kind={q.numKind ?? 'num'} unit={q.unitSuffix} locked={locked} />
            {!locked && (
              <>
                <Keypad value={num} onChange={setNum} onSubmit={() => submit(num)} kind={q.numKind ?? 'num'} />
                <button className="btn ghost sm skip" onClick={() => submit('')}>
                  わからない
                </button>
              </>
            )}
          </div>
        )}

        {type === 'order' && (
          <div className="order-answer">
            <div className="order-slots">
              {(q.choices ?? []).map((_, i) => {
                const picked = order[i];
                const item = picked !== undefined ? choices[picked] : null;
                const ok = locked && item === q.choices![i];
                return (
                  <button
                    key={i}
                    className={`order-slot ${item ? 'filled' : ''} ${locked ? (ok ? 'correct' : 'wrong') : ''}`}
                    disabled={locked || !item}
                    onClick={() => setOrder(order.filter((_, j) => j !== i))}
                  >
                    <span className="order-n">{i + 1}</span>
                    {item ?? <span className="faint">（ここに入る）</span>}
                  </button>
                );
              })}
            </div>
            {!locked && (
              <>
                <div className="order-pool">
                  {choices.map((c, i) =>
                    order.includes(i) ? null : (
                      <button
                        key={i}
                        className="order-item"
                        onClick={() => {
                          sfx.select();
                          setOrder([...order, i]);
                        }}
                      >
                        {c}
                      </button>
                    ),
                  )}
                </div>
                <div className="row">
                  <button className="btn ghost" onClick={() => setOrder([])}>
                    やり直す
                  </button>
                  <button
                    className="btn primary grow"
                    disabled={order.length !== choices.length}
                    onClick={() => submit(order.map((i) => choices[i]).join('|'))}
                  >
                    決定
                  </button>
                </div>
              </>
            )}
            {locked && !correct && (
              <div className="note ok" style={{ marginTop: 10 }}>
                正しい順番：{(q.choices ?? []).join(' → ')}
              </div>
            )}
          </div>
        )}

        {type === 'write' && (
          <div className="write-answer">
            {!locked && <DrawPad ref={padRef} height={260} guide="kanji" />}
            {!locked && !revealed && (
              <div className="row">
                <button className="btn ghost" onClick={() => submit('', { selfGraded: true })}>
                  わからない
                </button>
                <button
                  className="btn primary grow"
                  onClick={() => {
                    sfx.flip();
                    setRevealed(true);
                  }}
                >
                  <Icon name="eye" /> 答えを見る
                </button>
              </div>
            )}
            {(revealed || locked) && (
              <div className="write-reveal">
                <div className="write-answer-kanji">{q.answer}</div>
                {!locked && (
                  <>
                    <p className="muted small center">自分の字と見くらべて、正しく書けたか判定しよう（とめ・はね・はらいも！）</p>
                    <div className="row">
                      <button className="btn ng grow" onClick={() => submit('（手書き：まちがい）', { selfGraded: true })}>
                        × まちがえた
                      </button>
                      <button className="btn ok grow" onClick={() => submit(q.answer, { selfGraded: true })}>
                        ○ 書けた
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
