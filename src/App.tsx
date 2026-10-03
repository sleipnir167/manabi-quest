// ===== アプリの骨組み =====
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRoute, navigate, isFullscreen, type Route, type TabName } from './lib/router';
import { reloadRegistry } from './content/registry';
import { syncRemotePacks } from './lib/packs';
import { db } from './lib/db';
import { profile } from './lib/store';
import { levelInfo, currentStreak } from './lib/game';
import { unlockAudio, sfx } from './lib/sound';
import { primeSpeech } from './lib/speech';
import { toast } from './lib/events';
import { Icon, type IconName } from './components/Icon';
import { Mascot } from './components/Mascot';
import { ConfettiLayer } from './components/Confetti';
import { Celebrations } from './components/Celebrations';
import { Onboarding } from './components/Onboarding';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Player } from './screens/Player';
import { RapidRun, RapidSetup } from './screens/Rapid';
import { TestResult, TestRun, TestSetup } from './screens/Test';
import { Notebook } from './screens/Notebook';
import { Stats } from './screens/Stats';
import { Settings } from './screens/Settings';
import { Bar } from './components/ui';

const NAV: { name: TabName; label: string; short: string; icon: IconName; tabbar?: boolean }[] = [
  { name: 'home', label: 'ホーム', short: 'ホーム', icon: 'home', tabbar: true },
  { name: 'learn', label: '学習', short: '学習', icon: 'learn', tabbar: true },
  { name: 'rapid', label: '爆速周回', short: '周回', icon: 'rapid', tabbar: true },
  { name: 'test', label: '実力診断', short: '診断', icon: 'test', tabbar: true },
  { name: 'notebook', label: '間違いノート', short: 'ノート', icon: 'note' },
  { name: 'stats', label: '記録・分析', short: '記録', icon: 'stats', tabbar: true },
  { name: 'settings', label: '設定', short: '設定', icon: 'settings' },
];

let routeSeq = 0;
const routeKeys = new WeakMap<Route, number>();
const keyOf = (r: Route) => {
  if (!routeKeys.has(r)) routeKeys.set(r, ++routeSeq);
  return routeKeys.get(r)!;
};

export function App({ updateSW }: { updateSW?: (reload?: boolean) => Promise<void> }) {
  const route = useRoute();
  const p = profile.use();
  const [ready, setReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const mistakes = useLiveQuery(() => db.cards.filter((c) => c.wrongCount > 0 && !c.resolved && !c.lastCorrect).count(), []) ?? 0;

  useEffect(() => {
    reloadRegistry().finally(() => setReady(true));
    syncRemotePacks().then((r) => r.installed.length && toast(`新しい問題パック：${r.installed.join('、')}`, '📦', 'good'));
    const unlock = () => {
      unlockAudio();
      primeSpeech();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    const onUpd = () => setNeedRefresh(true);
    window.addEventListener('mq:need-refresh', onUpd);
    return () => window.removeEventListener('mq:need-refresh', onUpd);
  }, []);

  const page = useMemo(() => {
    switch (route.name) {
      case 'home':
        return <Home />;
      case 'learn':
        return <Learn subject={route.subject} />;
      case 'rapid':
        return <RapidSetup />;
      case 'test':
        return <TestSetup />;
      case 'notebook':
        return <Notebook />;
      case 'stats':
        return <Stats />;
      case 'settings':
        return <Settings tab={route.tab} />;
      case 'play':
        return <Player key={keyOf(route)} config={route.config} />;
      case 'rapid-run':
        return <RapidRun key={keyOf(route)} config={route.config} />;
      case 'test-run':
        return <TestRun key={keyOf(route)} config={route.config} />;
      case 'test-result':
        return <TestResult key={keyOf(route)} ids={route.ids} />;
    }
  }, [route]);

  if (!ready)
    return (
      <div className="boot">
        <Mascot size={110} mood="happy" />
      </div>
    );

  const li = levelInfo(p.xp);
  const full = isFullscreen(route);
  const go = (name: TabName) => {
    sfx.tap();
    navigate({ name });
  };

  return (
    <>
      {full ? (
        page
      ) : (
        <div className="app">
          <nav className="sidebar" aria-label="メニュー">
            <div className="brand">
              <Mascot size={44} bob={false} />
              <div className="brand-text">
                <b>まなびクエスト</b>
                <small>
                  Lv.{li.level} {li.title}
                </small>
              </div>
            </div>
            {NAV.map((n) => (
              <button key={n.name} className={`nav-item ${route.name === n.name ? 'active' : ''}`} onClick={() => go(n.name)} aria-current={route.name === n.name ? 'page' : undefined}>
                <Icon name={n.icon} />
                <span className="nav-full">{n.label}</span>
                <span className="nav-short">{n.short}</span>
                {n.name === 'notebook' && mistakes > 0 && <span className="nav-badge">{mistakes > 99 ? '99+' : mistakes}</span>}
              </button>
            ))}
            <div className="sidebar-foot">
              <div className="side-stat">
                <span className={`streak ${currentStreak(p) ? 'on' : ''}`}>
                  <Icon name="flame" size={18} /> <b className="num">{currentStreak(p)}</b>日
                </span>
                <span className="tiny faint num">
                  {li.into}/{li.need}XP
                </span>
              </div>
              <Bar value={li.into / li.need} className="xp thin" />
            </div>
          </nav>
          <main className="main">{page}</main>
          <nav className="tabbar" aria-label="メニュー">
            {NAV.filter((n) => n.tabbar).map((n) => (
              <button key={n.name} className={`nav-item ${route.name === n.name ? 'active' : ''}`} onClick={() => go(n.name)}>
                <Icon name={n.icon} />
                <span>{n.short}</span>
              </button>
            ))}
          </nav>
          {route.name === 'home' && (
            <div className="mobile-top-actions">
              <button className="icon-btn" onClick={() => go('notebook')} aria-label="間違いノート">
                <Icon name="note" />
                {mistakes > 0 && <span className="dot-badge" />}
              </button>
              <button className="icon-btn" onClick={() => go('settings')} aria-label="設定">
                <Icon name="settings" />
              </button>
            </div>
          )}
        </div>
      )}
      {!p.onboarded && <Onboarding onDone={() => navigate({ name: 'home' }, { replace: true })} />}
      {needRefresh && (
        <div className="update-bar">
          <span>✨ 新しいバージョンがあります</span>
          <button className="btn sm primary" onClick={() => updateSW?.(true)}>
            更新する
          </button>
          <button className="icon-btn" onClick={() => setNeedRefresh(false)} aria-label="閉じる">
            <Icon name="x" />
          </button>
        </div>
      )}
      <Celebrations />
      <ConfettiLayer />
    </>
  );
}
