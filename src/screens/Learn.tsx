// ===== 学習（教科→単元） =====
import { useEffect, useState } from 'react';
import { SUBJECTS, gradeLabel, type SubjectId } from '../content/types';
import { unitsOf, useRegistryVersion } from '../content/registry';
import { masteryOf, unitStats, type UnitStat } from '../lib/selection';
import { navigate } from '../lib/router';
import { settings } from '../lib/store';
import { groupBy } from '../lib/util';
import { deckFromUnits } from '../lib/decks';
import { Icon } from '../components/Icon';
import { Bar, PageHead, Seg } from '../components/ui';
import { sfx } from '../lib/sound';

export function Learn({ subject: initial }: { subject?: SubjectId }) {
  const s = settings.use();
  const [subject, setSubject] = useState<SubjectId>(initial ?? 'kokugo');
  const [grade, setGrade] = useState<number | 'all'>(s.grade <= 6 ? 6 : 'all');
  const [stats, setStats] = useState<Record<string, UnitStat>>({});
  const reg = useRegistryVersion();

  useEffect(() => {
    if (initial) setSubject(initial);
  }, [initial]);
  useEffect(() => {
    unitStats(subject).then(setStats);
  }, [subject, reg]);

  const units = unitsOf(subject).filter((u) => grade === 'all' || u.grade === grade);
  const grades = Array.from(new Set(unitsOf(subject).map((u) => u.grade))).sort();
  const byArea = groupBy(units, (u) => u.area ?? 'その他');
  const sub = SUBJECTS.find((x) => x.id === subject)!;
  const play = (title: string, kind: 'smart' | 'review' | 'weak' | 'new' | 'unit', units?: string[]) =>
    navigate({ name: 'play', config: { title, mode: kind === 'review' ? 'review' : kind === 'weak' ? 'weak' : 'study', spec: { kind, subject, units }, subject } });

  return (
    <div className="page learn" data-subject={subject}>
      <PageHead title="学習" sub="教科と単元をえらぼう。おまかせなら、復習と苦手を自動でまぜます。" />
      <div className="chips scroll subject-tabs">
        {SUBJECTS.map((x) => (
          <button
            key={x.id}
            data-subject={x.id}
            className={`chip ${subject === x.id ? 'active' : ''}`}
            onClick={() => {
              sfx.select();
              setSubject(x.id);
              navigate({ name: 'learn', subject: x.id }, { replace: true });
            }}
          >
            {x.emoji} {x.name}
          </button>
        ))}
      </div>

      <div className="learn-hero">
        <div className="learn-hero-text">
          <span className="learn-emoji">{sub.emoji}</span>
          <div>
            <h2>{sub.name}</h2>
            <p className="small muted">
              {units.length}単元・{units.reduce((a, u) => a + (stats[u.id]?.total ?? 0), 0)}問
              {units.some((u) => stats[u.id]?.hasGen) && '＋自動生成問題'}
            </p>
          </div>
        </div>
        <div className="learn-actions">
          <button className="btn subject lg" onClick={() => play(`${sub.name}おまかせ`, 'smart')}>
            <Icon name="sparkles" /> おまかせ
          </button>
          <button className="btn" onClick={() => play(`${sub.name}の復習`, 'review')}>
            <Icon name="refresh" /> 復習
          </button>
          <button className="btn" onClick={() => play(`${sub.name}の苦手`, 'weak')}>
            <Icon name="target" /> 苦手
          </button>
          <button className="btn" onClick={() => play(`${sub.name}の新しい問題`, 'new')}>
            <Icon name="plus" /> 新しい問題
          </button>
        </div>
      </div>

      {grades.length > 1 && (
        <div style={{ margin: '18px 0 4px' }}>
          <Seg value={grade} onChange={setGrade} options={[...grades.map((g) => ({ value: g as number | 'all', label: gradeLabel(g) })), { value: 'all' as const, label: 'すべて' }]} />
        </div>
      )}

      {Object.entries(byArea).map(([area, list]) => (
        <section key={area}>
          <h3 className="area-title">{area}</h3>
          <div className="unit-list">
            {list.map((u) => {
              const st = stats[u.id];
              const m = masteryOf(st);
              const flash = deckFromUnits([u.id], 'flash').length;
              return (
                <div key={u.id} className="unit-row">
                  <button className="unit-main" onClick={() => play(u.name, 'unit', [u.id])}>
                    <div className="row between">
                      <b className="unit-name">{u.name}</b>
                      {u.grade > 6 && <span className="chip tiny">{gradeLabel(u.grade)}</span>}
                    </div>
                    <div className="unit-meta tiny">
                      <span>{st?.hasGen ? '計算問題∞' : `${st?.total ?? 0}問`}</span>
                      {st?.accuracy != null && <span>正答率 {Math.round(st.accuracy * 100)}%</span>}
                      {st?.mastered ? <span>マスター {st.mastered}</span> : null}
                      {st?.due ? <span className="due">復習 {st.due}</span> : null}
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <Bar value={m} className="thin grow" />
                      <span className="tiny num faint">{Math.round(m * 100)}%</span>
                    </div>
                  </button>
                  <div className="unit-btns">
                    <button className="btn sm subject" onClick={() => play(u.name, 'unit', [u.id])} aria-label="じっくり学習">
                      <Icon name="play" />
                    </button>
                    {flash > 0 && (
                      <button
                        className="btn sm"
                        onClick={() => navigate({ name: 'rapid-run', config: { kind: 'flash', title: u.name, qids: deckFromUnits([u.id], 'flash').sort(() => Math.random() - 0.5), subject } })}
                        aria-label="高速周回"
                      >
                        <Icon name="rapid" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
