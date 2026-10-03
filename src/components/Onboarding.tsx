// ===== はじめての起動 =====
import { useState } from 'react';
import { gradeLabel } from '../content/types';
import { profile, settings } from '../lib/store';
import { requestPersist } from '../lib/db';
import { sfx, unlockAudio } from '../lib/sound';
import { Mascot } from './Mascot';
import { Seg } from './ui';
import { Icon } from './Icon';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = settings.use();
  const [step, setStep] = useState(0);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;

  const finish = async () => {
    profile.set((p) => ({ ...p, onboarded: true }));
    await requestPersist();
    sfx.complete();
    onDone();
  };

  return (
    <div className="modal-back onboarding">
      <div className="modal">
        {step === 0 && (
          <div className="center stack">
            <Mascot size={120} mood="happy" />
            <h1>まなびクエストへようこそ！</h1>
            <p className="muted">
              ぼくはフクロン先生。
              <br />
              忘れかけたころに復習を出したり、苦手を見つけたりして、きみの勉強を全力でサポートするよ！
            </p>
            <button
              className="btn primary lg"
              onClick={() => {
                unlockAudio();
                sfx.start();
                setStep(1);
              }}
            >
              はじめる <Icon name="arrow" />
            </button>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <h2>きみのことを教えて</h2>
            <label className="field">
              <span>ニックネーム</span>
              <input className="input" value={s.name} onChange={(e) => settings.set({ name: e.target.value })} placeholder="例：ゆうき" autoFocus />
            </label>
            <div className="field">
              <span>学年</span>
              <Seg value={s.grade} onChange={(g) => settings.set({ grade: g })} options={[6, 7, 8, 9].map((g) => ({ value: g, label: gradeLabel(g) }))} />
            </div>
            <div className="field">
              <span>1日の目標（問題数）</span>
              <Seg value={s.dailyGoal} onChange={(g) => settings.set({ dailyGoal: g })} options={[10, 20, 30, 50].map((g) => ({ value: g, label: `${g}問` }))} />
            </div>
            <button className="btn primary lg" onClick={() => setStep(2)}>
              つぎへ <Icon name="arrow" />
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <h2>このアプリのつかい方</h2>
            <div className="howto">
              <div>
                <span>✨</span>
                <p>
                  <b>おまかせ学習</b>：復習・苦手・新しい問題を自動でミックス
                </p>
              </div>
              <div>
                <span>⚡</span>
                <p>
                  <b>爆速周回</b>：英単語や漢字をフラッシュカードで何周も
                </p>
              </div>
              <div>
                <span>🧭</span>
                <p>
                  <b>実力診断</b>：推定偏差値と苦手単元がわかる
                </p>
              </div>
              <div>
                <span>🦉</span>
                <p>
                  <b>AI先生</b>：わからない問題をくわしく解説（保護者の設定が必要）
                </p>
              </div>
            </div>
            {!standalone && (
              <div className="note">
                <b>📱 ホーム画面に追加しよう</b>
                <br />
                {isIOS ? (
                  <>
                    Safari の共有ボタン <Icon name="share" size={16} /> →「ホーム画面に追加」で、アプリのように全画面で使えます。
                  </>
                ) : (
                  <>Chrome のメニュー ⋮ →「アプリをインストール」で、アプリのように使えます。</>
                )}
              </div>
            )}
            <button className="btn primary lg" onClick={finish}>
              さっそく始める！
            </button>
          </div>
        )}
        <div className="dots-step">
          {[0, 1, 2].map((i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
