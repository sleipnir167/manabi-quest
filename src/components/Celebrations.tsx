// ===== トースト・レベルアップ・バッジ獲得の演出 =====
import { useEffect, useState } from 'react';
import { onAppEvent, type AppEvent } from '../lib/events';
import { Modal } from './ui';
import { Mascot } from './Mascot';
import { confetti } from './Confetti';
import { sfx } from '../lib/sound';

interface ToastItem {
  id: number;
  text: string;
  icon?: string;
  tone: string;
}

export function Celebrations() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [queue, setQueue] = useState<AppEvent[]>([]);

  useEffect(
    () =>
      onAppEvent((e) => {
        if (e.type === 'toast') push(e.text, e.icon, e.tone ?? 'info');
        else if (e.type === 'mission') {
          push(`ミッション達成！「${e.mission.text}」 +${e.mission.xp}XP`, '🎯', 'good');
          sfx.badge();
        } else if (e.type === 'streak') {
          if (e.usedFreeze) push(`おやすみチケットで連続記録を守ったよ！ ${e.streak}日連続`, '🧊', 'good');
          else if (e.streak >= 2) push(`${e.streak}日連続学習！`, '🔥', 'good');
        } else setQueue((q) => [...q, e]);
      }),
    [],
  );

  const push = (text: string, icon: string | undefined, tone: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, icon, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  };

  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    confetti({ count: cur.type === 'levelup' ? 180 : 100 });
    if (cur.type === 'badge') sfx.badge();
  }, [cur]);

  return (
    <>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.icon && <span className="ti">{t.icon}</span>}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {cur && (
        <Modal onClose={() => setQueue((q) => q.slice(1))}>
          <div className="celebrate">
            {cur.type === 'levelup' && (
              <>
                <div className="level-burst">
                  <div>
                    <small>Lv.</small>
                    {cur.to}
                  </div>
                </div>
                <h2>レベルアップ！</h2>
                <p className="muted">
                  称号「<b>{cur.title}</b>」
                </p>
              </>
            )}
            {cur.type === 'badge' && (
              <>
                <div className="big-icon">{cur.badge.icon}</div>
                <h2>バッジ獲得！</h2>
                <p>
                  <b>{cur.badge.name}</b>
                </p>
                <p className="muted small">{cur.badge.desc}</p>
              </>
            )}
            <div style={{ marginTop: 18 }}>
              <Mascot size={70} mood="wow" />
            </div>
            <button className="btn primary lg" style={{ marginTop: 12, minWidth: 200 }} onClick={() => setQueue((q) => q.slice(1))}>
              やったね！
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
