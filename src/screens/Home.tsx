// ===== ホーム =====
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SUBJECTS } from '../content/types';
import { db } from '../lib/db';
import { computeInsights, type Insight } from '../lib/insights';
import { dueCount, masteryOf, unitStats, type UnitStat } from '../lib/selection';
import { dueForecast, subjectSummaries, weakUnits, type SubjectSummary, type WeakUnit } from '../lib/stats';
import { currentStreak, levelInfo, missionProgress } from '../lib/game';
import { profile, settings } from '../lib/store';
import { navigate } from '../lib/router';
import { dayKey, greeting } from '../lib/util';
import { Mascot } from '../components/Mascot';
import { Icon } from '../components/Icon';
import { Bar, Ring } from '../components/ui';
import { Columns } from '../components/charts';
import { AIChat } from '../components/AIExplain';
import { sfx } from '../lib/sound';
import { getUnit, useRegistryVersion } from '../content/registry';

export function Home() {
  const p = profile.use();
  const s = settings.use();
  const regVer = useRegistryVersion();
  const today = useLiveQuery(() => db.daily.get(dayKey()), []);
  const [due, setDue] = useState(0);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [ustats, setUstats] = useState<Record<string, UnitStat>>({});
  const [weak, setWeak] = useState<WeakUnit[]>([]);
  const [forecast, setForecast] = useState<{ day: string; count: number }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [insightIdx, setInsightIdx] = useState(0);

  useEffect(() => {
    (async () => {
      setDue(await dueCount());
      setInsights(await computeInsights());
      setSubjects(await subjectSummaries(60));
      setUstats(await unitStats());
      setWeak(await weakUnits(30, 3));
      setForecast(await dueForecast(7));
    })();
  }, [today?.count, regVer]);

  const li = levelInfo(p.xp);
  const streak = currentStreak(p);
  const count = today?.count ?? 0;
  const goalRate = Math.min(1, count / s.dailyGoal);
  const missions = missionProgress();
  const ins = insights[insightIdx % Math.max(1, insights.length)];
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日（${'日月火水木金土'[now.getDay()]}）`;

  const subjectMastery = (sid: string) => {
    const list = Object.values(ustats).filter((u) => {
      const unit = getUnit(u.unit);
      return unit?.subject === sid && unit.grade <= s.grade;
    });
    const total = list.reduce((a, u) => a + u.total, 0);
    return total ? list.reduce((a, u) => a + masteryOf(u) * u.total, 0) / total : 0;
  };

  const runInsight = (i?: Insight) => {
    const a = i?.action;
    if (!a) return;
    if (a.kind === 'review') navigate({ name: 'play', config: { title: '復習', mode: 'review', spec: { kind: 'review' }, subject: 'mix' } });
    else if (a.kind === 'unit' && a.unit)
      navigate({ name: 'play', config: { title: '苦手特訓', mode: 'weak', spec: { kind: 'unit', units: [a.unit] } } });
    else navigate({ name: 'play', config: { title: 'おまかせ学習', mode: 'study', spec: { kind: 'smart', size: a.label === '5問だけ' ? 5 : undefined }, subject: 'mix' } });
  };

  return (
    <div className="page home">
      <header className="hero">
        <div className="hero-bg" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="hero-text">
          <p className="eyebrow">{dateStr}</p>
          <h1>
            {greeting()}
            {s.name ? `、${s.name}さん` : '！'}
          </h1>
          <div className="hero-stats">
            <span className={`streak ${streak ? 'on' : ''}`} title="連続学習日数">
              <Icon name="flame" size={20} /> <b className="num">{streak}</b>日連続
            </span>
            <span className="level-pill">
              <b className="num">Lv.{li.level}</b> {li.title}
            </span>
            {p.freezes > 0 && <span className="freeze" title="1日休んでも連続記録が続くチケット">🧊×{p.freezes}</span>}
          </div>
          <div className="xp-line">
            <Bar value={li.into / li.need} className="xp" />
            <span className="tiny faint num">
              {li.into}/{li.need} XP
            </span>
          </div>
        </div>
        <div className="hero-mascot">
          <div className="bubble" onClick={() => insights.length > 1 && setInsightIdx((i) => i + 1)}>
            {ins ? (
              <>
                <span className="bubble-icon">{ins.icon}</span> {ins.text}
                {ins.action && (
                  <button
                    className="btn sm primary"
                    style={{ marginTop: 8, display: 'flex' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      runInsight(ins);
                    }}
                  >
                    {ins.action.label} <Icon name="arrow" />
                  </button>
                )}
              </>
            ) : (
              '今日もいっしょにがんばろう！'
            )}
          </div>
          <Mascot size={108} mood={count >= s.dailyGoal ? 'happy' : 'idle'} />
        </div>
      </header>

      <section className="grid-2 wide-left" style={{ marginTop: 18 }}>
        <div className="card today-card">
          <div className="today-main">
            <Ring value={goalRate} size={124} stroke={13} className="goal-ring">
              <div>
                <div className="num" style={{ fontSize: 34, lineHeight: 1 }}>
                  {count}
                </div>
                <div className="tiny faint">/ {s.dailyGoal}問</div>
              </div>
            </Ring>
            <div className="grow stack" style={{ gap: 10 }}>
              <h2>{goalRate >= 1 ? '今日の目標クリア！🎉' : '今日の学習'}</h2>
              <div className="today-stats small muted">
                <span>
                  正答率 <b className="num">{count ? Math.round(((today?.correct ?? 0) / count) * 100) : 0}%</b>
                </span>
                <span>
                  学習時間 <b className="num">{Math.round((today?.timeMs ?? 0) / 60000)}分</b>
                </span>
              </div>
              <button
                className="btn primary lg block"
                onClick={() => navigate({ name: 'play', config: { title: 'おまかせ学習', mode: 'study', spec: { kind: 'smart' }, subject: 'mix' } })}
              >
                <Icon name="sparkles" /> おまかせ学習（{s.sessionSize}問）
              </button>
              <div className="row">
                <button
                  className="btn grow"
                  disabled={!due}
                  onClick={() => navigate({ name: 'play', config: { title: '復習', mode: 'review', spec: { kind: 'review' }, subject: 'mix' } })}
                >
                  <Icon name="refresh" /> 復習 {due > 0 && <span className="badge-count">{due}</span>}
                </button>
                <button className="btn grow" onClick={() => navigate({ name: 'play', config: { title: '苦手克服', mode: 'weak', spec: { kind: 'weak' }, subject: 'mix' } })}>
                  <Icon name="target" /> 苦手克服
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card missions">
          <div className="card-title">
            <h3>🎯 今日のミッション</h3>
            <span className="hint">クリアでXP</span>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            {missions.map(({ mission: m, value, done }) => (
              <div key={m.id} className={`mission ${done ? 'done' : ''}`}>
                <span className="mission-icon">{done ? '✅' : m.icon}</span>
                <div className="grow">
                  <div className="row between">
                    <b className="small">{m.text}</b>
                    <span className="tiny num" style={{ color: 'var(--gold-ink)' }}>
                      +{m.xp}XP
                    </span>
                  </div>
                  <Bar value={value / m.target} className="thin xp" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-title">
        <h2>教科</h2>
        <button className="btn ghost sm" onClick={() => navigate({ name: 'learn' })}>
          すべての単元 <Icon name="right" />
        </button>
      </div>
      <div className="subject-grid">
        {SUBJECTS.map((sub) => {
          const sum = subjects.find((x) => x.subject === sub.id);
          const m = subjectMastery(sub.id);
          return (
            <button
              key={sub.id}
              className="subject-card"
              data-subject={sub.id}
              onClick={() => {
                sfx.select();
                navigate({ name: 'learn', subject: sub.id });
              }}
            >
              <span className="subject-emoji">{sub.emoji}</span>
              <b className="subject-name">{sub.name}</b>
              <Ring value={m} size={58} stroke={7}>
                <span className="num tiny">{Math.round(m * 100)}%</span>
              </Ring>
              <span className="subject-meta tiny">{sum?.deviation != null ? <>推定偏差値 <b className="num">{sum.deviation.toFixed(1)}</b></> : '習熟度'}</span>
            </button>
          );
        })}
      </div>

      <section className="grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-title">
            <h3>💪 苦手ピックアップ</h3>
            <span className="hint">直近30日</span>
          </div>
          {weak.length ? (
            <div className="list">
              {weak.map((w) => (
                <div key={w.unit} className="list-row" data-subject={w.subject}>
                  <span className="dot" />
                  <span className="grow">
                    <b className="small">{w.name}</b>
                    <div className="tiny faint">
                      正答率 {Math.round(w.acc * 100)}%（{w.attempts}問）
                    </div>
                  </span>
                  <button
                    className="btn sm subject"
                    onClick={() => navigate({ name: 'play', config: { title: `特訓：${w.name}`, mode: 'weak', spec: { kind: 'unit', units: [w.unit] }, subject: w.subject } })}
                  >
                    特訓
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">もう少し問題をとくと、苦手な単元がここに出てきます。</p>
          )}
        </div>
        <div className="card">
          <div className="card-title">
            <h3>🗓️ これからの復習予定</h3>
            <span className="hint">忘れる前にお知らせ</span>
          </div>
          <Columns
            data={forecast.map((f, i) => ({ label: i === 0 ? '今日' : `${Number(f.day.slice(8))}日`, value: f.count, tip: `${f.day}：${f.count}問` }))}
            height={150}
            color="var(--primary)"
          />
        </div>
      </section>

      <div className="section-title">
        <h2>モード</h2>
      </div>
      <div className="quick-grid">
        <button className="quick" onClick={() => navigate({ name: 'rapid' })}>
          <span className="quick-icon" style={{ background: 'linear-gradient(135deg,#FFB020,#FF6A1A)' }}>
            ⚡
          </span>
          <b>爆速周回</b>
          <span className="tiny faint">暗記を高速でくり返す</span>
        </button>
        <button className="quick" onClick={() => navigate({ name: 'test' })}>
          <span className="quick-icon" style={{ background: 'linear-gradient(135deg,#5B5BF6,#8B5CF6)' }}>
            🧭
          </span>
          <b>実力診断</b>
          <span className="tiny faint">推定偏差値をはかる</span>
        </button>
        <button className="quick" onClick={() => navigate({ name: 'notebook' })}>
          <span className="quick-icon" style={{ background: 'linear-gradient(135deg,#F04462,#FF8A8F)' }}>
            📒
          </span>
          <b>間違いノート</b>
          <span className="tiny faint">まちがえた問題を復習</span>
        </button>
        <button className="quick" onClick={() => setChatOpen(true)}>
          <span className="quick-icon" style={{ background: 'linear-gradient(135deg,#12B76A,#38BDF8)' }}>
            🦉
          </span>
          <b>AI先生に質問</b>
          <span className="tiny faint">写真でも質問できる</span>
        </button>
      </div>
      {chatOpen && <AIChat onClose={() => setChatOpen(false)} />}
    </div>
  );
}
