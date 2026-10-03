// ===== 記録・分析 =====
import { useEffect, useState } from 'react';
import { SUBJECTS, subjectName } from '../content/types';
import { allUnits, useRegistryVersion } from '../content/registry';
import {
  abilityTrend,
  avgRetention,
  compactSummary,
  dailyRange,
  errorBreakdown,
  hourlyAccuracy,
  memoryStages,
  subjectSummaries,
  type SubjectSummary,
} from '../lib/stats';
import { masteryOf, unitStats, type UnitStat } from '../lib/selection';
import { computeInsights, type Insight } from '../lib/insights';
import { STAGE_LABEL, type MemoryStage } from '../lib/fsrs';
import { ERROR_LABEL, type ErrorType } from '../lib/normalize';
import { BADGES, currentStreak, levelInfo } from '../lib/game';
import { profile } from '../lib/store';
import { aiReady, chat } from '../lib/ai';
import { navigate } from '../lib/router';
import { addDays, dayKey, fmtDuration } from '../lib/util';
import { db, type DailyRow } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { fmtSec } from '../lib/util';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markup';
import { Bar, PageHead, Seg, Tile } from '../components/ui';
import { Columns, Heatmap, HBars, Legend, LineChart, StackedColumns, StageBar } from '../components/charts';
import { toast } from '../lib/events';

const SERIES = SUBJECTS.map((s) => ({ key: s.id, label: s.name.replace('算数・', ''), color: `var(--${s.id})` }));
const STAGE_COLORS: Record<MemoryStage, string> = {
  new: 'var(--surface-3)',
  learning: 'var(--stage-1)',
  short: 'var(--stage-2)',
  mid: 'var(--stage-3)',
  long: 'var(--stage-4)',
  master: 'var(--stage-5)',
};

export function Stats() {
  const [days, setDays] = useState(14);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [prev, setPrev] = useState<DailyRow[]>([]);
  const [heat, setHeat] = useState<DailyRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [trends, setTrends] = useState<Record<string, { day: string; deviation: number }[]>>({});
  const [stages, setStages] = useState<Record<MemoryStage, number> | null>(null);
  const [retention, setRetention] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ErrorType, number>>>({});
  const [hours, setHours] = useState<{ hour: number; count: number; acc: number }[]>([]);
  const [ustats, setUstats] = useState<Record<string, UnitStat>>({});
  const [insights, setInsights] = useState<Insight[]>([]);
  const [report, setReport] = useState<{ text: string; loading: boolean; err?: string }>({ text: '', loading: false });
  const p = profile.use();
  const reg = useRegistryVersion();
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(15).toArray(), []) ?? [];

  useEffect(() => {
    (async () => {
      setDaily(await dailyRange(days));
      setPrev((await dailyRange(days * 2)).slice(0, days));
      setErrors(await errorBreakdown(days));
    })();
  }, [days]);
  useEffect(() => {
    (async () => {
      setHeat(await dailyRange(7 * 17));
      setSubjects(await subjectSummaries(90));
      const t: typeof trends = {};
      for (const s of SUBJECTS) t[s.id] = await abilityTrend(s.id, 90);
      setTrends(t);
      setStages(await memoryStages());
      setRetention(await avgRetention());
      setHours(await hourlyAccuracy(60));
      setUstats(await unitStats());
      setInsights(await computeInsights());
    })();
  }, [reg]);

  const sum = (rows: DailyRow[]) => rows.reduce((a, r) => ({ n: a.n + r.count, c: a.c + r.correct, t: a.t + r.timeMs }), { n: 0, c: 0, t: 0 });
  const cur = sum(daily),
    pre = sum(prev);
  const acc = cur.n ? cur.c / cur.n : 0;
  const preAcc = pre.n ? pre.c / pre.n : 0;
  const delta = (v: number, pv: number, fmt: (x: number) => string) => {
    if (!pv) return undefined;
    const d = v - pv;
    return <div className={`delta ${d >= 0 ? 'up' : 'down'}`}>{d >= 0 ? '▲' : '▼'} {fmt(Math.abs(d))}（前の{days}日比）</div>;
  };

  const weekKey = dayKey(Date.now() - new Date().getDay() * 86400000);
  const makeReport = async (refresh = false) => {
    setReport({ text: '', loading: true });
    try {
      const data = await compactSummary(7);
      const r = await chat(
        [
          {
            role: 'system',
            content:
              'あなたは小中学生の学習コーチのフクロウ「フクロン先生」です。データにもとづいて、本人に向けて前向きで具体的なふりかえりを書きます。データにないことは推測で断定しないこと。',
          },
          {
            role: 'user',
            content: `この1週間の学習データです。\n${JSON.stringify(data)}\n\n次の見出しで、合計500字以内で書いてください（見出しは **太字** で）。\n**がんばったこと**\n**のびているところ**\n**気をつけたいクセ**（ミスの種類や時間帯から）\n**来週のおすすめ**（箇条書き3つ、具体的な単元名を入れる）\n最後に一言はげまし。`,
          },
        ],
        { cacheKey: `report:${weekKey}:${data.解いた問題}`, refresh, onToken: (t) => setReport({ text: t, loading: true }) },
      );
      setReport({ text: r.text, loading: false });
    } catch (e) {
      setReport({ text: '', loading: false, err: (e as Error).message.split('\n')[0] });
    }
  };

  const share = async () => {
    const text = [
      `📚 まなびクエスト 学習レポート（直近${days}日）`,
      `解いた問題：${cur.n}問（正答率${Math.round(acc * 100)}%）`,
      `学習時間：${fmtDuration(cur.t)}`,
      `連続学習：${currentStreak(p)}日 / レベル${levelInfo(p.xp).level}`,
      ...subjects.filter((s) => s.deviation != null).map((s) => `${subjectName(s.subject)}：推定偏差値 ${s.deviation!.toFixed(1)}`),
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('レポートをコピーしました', '📋', 'good');
      }
    } catch {
      /* キャンセル */
    }
  };

  const unitRows = allUnits()
    .map((u) => ({ u, st: ustats[u.id] }))
    .filter((x) => x.st && x.st.seen > 0)
    .sort((a, b) => masteryOf(a.st) - masteryOf(b.st));
  const errItems = Object.entries(errors)
    .filter(([k]) => k !== 'skip')
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => ({ label: ERROR_LABEL[k as ErrorType], value: v ?? 0 }));
  const hasTrend = SUBJECTS.some((s) => (trends[s.id]?.length ?? 0) >= 2);

  return (
    <div className="page stats">
      <PageHead
        title="📊 記録と分析"
        sub="毎日の積み重ねと、実力の伸びを見える化"
        right={
          <div className="row">
            <Seg value={days} onChange={setDays} options={[{ value: 7, label: '7日' }, { value: 14, label: '14日' }, { value: 30, label: '30日' }, { value: 90, label: '90日' }]} />
            <button className="icon-btn" onClick={share} aria-label="レポートを共有">
              <Icon name="share" />
            </button>
          </div>
        }
      />
      <div className="tiles">
        <Tile label="解いた問題" value={cur.n} unit="問" delta={delta(cur.n, pre.n, (x) => `${x}問`)} />
        <Tile label="正答率" value={Math.round(acc * 100)} unit="%" delta={delta(acc * 100, preAcc * 100, (x) => `${x.toFixed(0)}pt`)} />
        <Tile label="学習時間" value={Math.round(cur.t / 60000)} unit="分" delta={delta(cur.t / 60000, pre.t / 60000, (x) => `${x.toFixed(0)}分`)} />
        <Tile label="連続学習" value={currentStreak(p)} unit="日" delta={<div className="delta faint">最高 {p.bestStreak}日</div>} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>日別の学習量</h3>
          <Legend series={SERIES} />
        </div>
        <StackedColumns
          data={daily.map((d) => ({
            label: `${Number(d.day.slice(5, 7))}/${Number(d.day.slice(8))}`,
            sub: d.count ? `正答率${Math.round((d.correct / d.count) * 100)}%` : '',
            values: Object.fromEntries(SUBJECTS.map((s) => [s.id, d.subjects[s.id]?.count ?? 0])),
          }))}
          series={SERIES}
          height={days > 30 ? 180 : 210}
        />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">
            <h3>📅 学習カレンダー</h3>
            <span className="hint">{heat.filter((d) => d.count > 0).length}日 学習</span>
          </div>
          <Heatmap days={heat.map((d) => ({ day: d.day, count: d.count }))} weeks={16} />
        </div>
        <div className="card">
          <div className="card-title">
            <h3>🧠 記憶の定着</h3>
            <span className="hint">{retention != null ? `今思い出せる確率 平均 ${Math.round(retention * 100)}%` : ''}</span>
          </div>
          {stages && (
            <StageBar
              parts={(['learning', 'short', 'mid', 'long', 'master'] as MemoryStage[]).map((k) => ({ key: k, label: STAGE_LABEL[k], value: stages[k], color: STAGE_COLORS[k] }))}
            />
          )}
          <p className="tiny faint" style={{ marginTop: 10 }}>
            忘却曲線にあわせて、忘れかけたころに復習が出ます。「長期記憶」「マスター」が増えるほど、しっかり身についています。
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>📈 推定偏差値の推移</h3>
          <span className="hint">毎日の学習から推定（点線＝50）</span>
        </div>
        {hasTrend ? (
          <>
            <LineChart
              series={SERIES.map((s) => ({ ...s, points: (trends[s.key] ?? []).map((t) => ({ x: t.day, y: t.deviation })) })).filter((s) => s.points.length)}
            />
            <Legend series={SERIES.filter((s) => (trends[s.key]?.length ?? 0) > 0)} />
          </>
        ) : (
          <p className="muted small">各教科を数日つづけて学習すると、ここに成長のグラフが出ます。</p>
        )}
        <div className="dev-list">
          {subjects.map((s) => (
            <div key={s.subject} className="dev-item" data-subject={s.subject}>
              <span className="dot" />
              <span className="grow small">{subjectName(s.subject)}</span>
              <b className="num">{s.deviation != null ? s.deviation.toFixed(1) : '—'}</b>
              <span className="tiny faint">{s.n}問</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">
            <h3>🔎 ミスの傾向</h3>
            <span className="hint">直近{days}日</span>
          </div>
          {errItems.length ? <HBars items={errItems} color="var(--ng)" format={(v) => `${v}回`} /> : <p className="muted small">まだデータがありません。</p>}
        </div>
        <div className="card">
          <div className="card-title">
            <h3>⏰ 時間帯別の正答率</h3>
            <span className="hint">60日・5問以上の時間帯</span>
          </div>
          {hours.some((h) => h.count >= 5) ? (
            <Columns
              data={hours
                .filter((h) => h.hour >= 5 || h.count > 0)
                .filter((h, i, arr) => h.count > 0 || (i > 0 && i < arr.length - 1))
                .map((h) => ({ label: `${h.hour}`, value: h.count >= 5 ? Math.round(h.acc * 100) : 0, dim: h.count < 5, tip: `${h.hour}時台：${h.count}問・正答率${Math.round(h.acc * 100)}%` }))}
              format={(v) => `${v}%`}
              color="var(--science)"
            />
          ) : (
            <p className="muted small">いろいろな時間に学習すると、集中できる時間帯がわかります。</p>
          )}
        </div>
      </div>

      <div className="card ai-report" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>🦉 今週のふりかえり</h3>
          {aiReady() ? (
            <button className="btn soft sm" onClick={() => makeReport(!!report.text)} disabled={report.loading}>
              <Icon name="sparkles" /> {report.text ? '作り直す' : 'AIレポートを作る'}
            </button>
          ) : (
            <button className="btn ghost sm" onClick={() => navigate({ name: 'settings', tab: 'ai' })}>
              AIを設定する
            </button>
          )}
        </div>
        {report.text ? (
          <Markdown text={report.text} streaming={report.loading} />
        ) : report.err ? (
          <div className="note ng">{report.err}</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {insights.map((i, k) => (
              <div key={k} className={`insight ${i.tone}`}>
                <span>{i.icon}</span>
                <span className="small">{i.text}</span>
              </div>
            ))}
            <p className="tiny faint">AIレポートは1週間分のデータを小さくまとめて送るので、1回あたりのクレジット消費はごくわずかです（同じ週は保存した結果を再利用）。</p>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>📚 単元ごとの習熟度</h3>
          <span className="hint">低い順</span>
        </div>
        {unitRows.length ? (
          <div className="unit-table">
            {unitRows.slice(0, 30).map(({ u, st }) => (
              <button
                key={u.id}
                className="unit-trow"
                data-subject={u.subject}
                onClick={() => navigate({ name: 'play', config: { title: u.name, mode: 'study', spec: { kind: 'unit', units: [u.id] }, subject: u.subject } })}
              >
                <span className="dot" />
                <span className="grow small">{u.name}</span>
                <span className="tiny faint">{st.accuracy != null ? `正答率${Math.round(st.accuracy * 100)}%` : ''}</span>
                <span className="unit-tbar">
                  <Bar value={masteryOf(st)} className="thin" />
                </span>
                <span className="num tiny" style={{ width: 36, textAlign: 'right' }}>
                  {Math.round(masteryOf(st) * 100)}%
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">問題をとくと、単元ごとの習熟度が表示されます。</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>🕘 学習の履歴</h3>
          <span className="hint">最近15回</span>
        </div>
        {sessions.length ? (
          <div className="list">
            {sessions.map((x) => {
              const d = new Date(x.startedAt);
              const rate = x.total ? x.correct / x.total : 0;
              return (
                <div key={x.id} className="list-row" data-subject={x.subject ?? 'mix'}>
                  <span className="dot" />
                  <span className="grow">
                    <b className="small">{x.title}</b>
                    <div className="tiny faint">
                      {d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}・{fmtSec(x.durationMs)}
                      {x.maxCombo ? `・最大${x.maxCombo}コンボ` : ''}
                    </div>
                  </span>
                  <span className={`chip tiny ${rate >= 0.8 ? 'ok' : rate < 0.5 ? 'ng' : ''}`}>
                    {x.score != null ? `${x.score}点` : `${x.correct}/${x.total}`}
                  </span>
                  <span className="tiny num" style={{ color: 'var(--gold-ink)', minWidth: 52, textAlign: 'right' }}>
                    +{x.xp}XP
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">まだ記録がありません。</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>🏅 バッジコレクション</h3>
          <span className="hint">
            {Object.keys(p.badges).length}/{BADGES.length}
          </span>
        </div>
        <div className="badge-grid">
          {BADGES.map((b) => {
            const got = p.badges[b.id];
            return (
              <div key={b.id} className={`badge ${got ? 'got' : ''}`} title={b.desc}>
                <span className="badge-icon">{got ? b.icon : '🔒'}</span>
                <b>{b.name}</b>
                <span className="tiny faint">{got ? addDays(dayKey(got), 0) : b.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
