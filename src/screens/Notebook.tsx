// ===== 間違いノート・あとで見直す =====
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SUBJECTS, type Question, type SubjectId } from '../content/types';
import { getQuestion, unitName } from '../content/registry';
import { db, type CardRow } from '../lib/db';
import { ERROR_LABEL } from '../lib/normalize';
import { navigate } from '../lib/router';
import { fmtRelative } from '../lib/util';
import { Icon } from '../components/Icon';
import { Markup } from '../components/Markup';
import { AIExplain } from '../components/AIExplain';
import { Empty, PageHead, Seg } from '../components/ui';
import { speakQuestion } from '../components/QuestionView';

export function Notebook() {
  const [tab, setTab] = useState<'mistakes' | 'flagged' | 'resolved'>('mistakes');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const cards = useLiveQuery(() => db.cards.toArray(), []) ?? [];

  const list = cards
    .filter((c) => (subject === 'all' || c.subject === subject) && getQuestion(c.qid))
    .filter((c) => (tab === 'mistakes' ? c.wrongCount > 0 && !c.resolved : tab === 'flagged' ? c.flagged : c.wrongCount > 0 && c.resolved))
    .sort((a, b) => Number(a.lastCorrect) - Number(b.lastCorrect) || b.wrongCount - a.wrongCount || b.updatedAt - a.updatedAt);

  const counts = {
    mistakes: cards.filter((c) => c.wrongCount > 0 && !c.resolved).length,
    flagged: cards.filter((c) => c.flagged).length,
  };

  const practice = () => {
    const qids = list.slice(0, 20).map((c) => c.qid);
    navigate({ name: 'play', config: { title: tab === 'flagged' ? '見直しリスト' : '間違いノートの復習', mode: 'retry', spec: { kind: 'retry', qids }, subject: subject === 'all' ? 'mix' : subject } });
  };

  return (
    <div className="page notebook">
      <PageHead
        title="📒 間違いノート"
        sub="まちがえた問題が自動でたまります。正解できるようになったら「もう大丈夫」で卒業！"
        right={
          list.length > 0 && tab !== 'resolved' ? (
            <button className="btn primary" onClick={practice}>
              <Icon name="play" /> まとめて復習（{Math.min(20, list.length)}問）
            </button>
          ) : undefined
        }
      />
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mistakes', label: `まちがい ${counts.mistakes}` },
            { value: 'flagged', label: `🚩 見直す ${counts.flagged}` },
            { value: 'resolved', label: '卒業' },
          ]}
        />
        <div className="chips">
          <button className={`chip ${subject === 'all' ? 'active' : ''}`} onClick={() => setSubject('all')}>
            すべて
          </button>
          {SUBJECTS.map((s) => (
            <button key={s.id} data-subject={s.id} className={`chip ${subject === s.id ? 'active' : ''}`} onClick={() => setSubject(s.id)}>
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      </div>
      {!list.length ? (
        <div className="card">
          <Empty mood="happy" title={tab === 'mistakes' ? 'まちがえた問題はありません' : tab === 'flagged' ? '見直しリストは空です' : '卒業した問題はまだありません'}>
            {tab === 'flagged' ? '問題をといているときに 🚩 を押すと、ここに保存されます。' : '問題をとくと、ここに自動でたまっていきます。'}
          </Empty>
        </div>
      ) : (
        <div className="note-list">
          {list.map((c) => (
            <NoteItem key={c.qid} c={c} q={getQuestion(c.qid)!} open={open === c.qid} onToggle={() => setOpen(open === c.qid ? null : c.qid)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteItem({ c, q, open, onToggle }: { c: CardRow; q: Question; open: boolean; onToggle: () => void }) {
  const answerText = q.type === 'tf' ? (q.answer === 'o' ? '○' : '×') : q.type === 'order' ? (q.choices ?? []).join(' → ') : q.answer;
  const givenText = c.lastGiven ? (q.type === 'tf' ? (c.lastGiven === 'o' ? '○' : '×') : c.lastGiven.replace(/\|/g, ' → ')) : '（わからない）';
  return (
    <div className={`note-item card ${open ? 'open' : ''}`} data-subject={q.subject}>
      <button className="note-head" onClick={onToggle}>
        <span className="dot" />
        <span className="grow">
          <span className="tiny faint">
            {unitName(q.unit)}・{c.wrongCount}回まちがい{c.lastError ? `・${ERROR_LABEL[c.lastError]}` : ''}
          </span>
          <span className="note-q">
            <Markup text={q.listening ? `🔊 ${q.speak}` : q.gen ? `${q.prompt}（計算問題）` : q.prompt} />
          </span>
        </span>
        {c.lastCorrect ? <span className="chip ok tiny">直近は正解</span> : <span className="chip ng tiny">要復習</span>}
        <Icon name="right" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} />
      </button>
      {open && (
        <div className="note-body">
          {q.figure && <div className="q-figure small-fig" dangerouslySetInnerHTML={{ __html: q.figure }} />}
          {q.type === 'choice' && q.choices && (
            <div className="chips" style={{ marginBottom: 8 }}>
              {q.choices.map((ch) => (
                <span key={ch} className={`chip ${ch === q.answer ? 'ok' : ch === c.lastGiven ? 'ng' : ''}`}>
                  <Markup text={ch} />
                </span>
              ))}
            </div>
          )}
          {!q.gen && (
            <p>
              正解：<b><Markup text={answerText} /></b> {q.unitSuffix}
              <span className="faint"> ／ 最後の答え：{givenText}</span>
            </p>
          )}
          {q.explanation && !q.gen && (
            <div className="expl-text">
              <Markup text={q.explanation} />
            </div>
          )}
          <p className="tiny faint">次の復習：{fmtRelative(c.due)}・正解 {c.correctCount}回 / まちがい {c.wrongCount}回</p>
          {!q.gen && <AIExplain q={q} given={c.lastGiven ?? ''} correct={false} />}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn sm subject" onClick={() => navigate({ name: 'play', config: { title: 'もう一度', mode: 'retry', spec: { kind: 'retry', qids: [q.id] }, subject: q.subject } })}>
              <Icon name="play" /> もう一度とく
            </button>
            <button className="btn sm" onClick={() => speakQuestion(q)}>
              <Icon name="speaker" /> 読み上げ
            </button>
            {!c.resolved ? (
              <button className="btn sm ok" onClick={() => db.cards.update(c.qid, { resolved: true })}>
                <Icon name="check" /> もう大丈夫
              </button>
            ) : (
              <button className="btn sm" onClick={() => db.cards.update(c.qid, { resolved: false })}>
                ノートにもどす
              </button>
            )}
            {c.flagged && (
              <button className="btn sm ghost" onClick={() => db.cards.update(c.qid, { flagged: false })}>
                🚩 見直しを外す
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
