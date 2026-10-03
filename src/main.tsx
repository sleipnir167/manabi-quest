import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

// PWA：サービスワーカー登録（オフライン対応・更新のお知らせ）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new Event('mq:need-refresh'));
      },
      onRegisteredSW(_url, reg) {
        // 1時間ごとに更新を確認
        if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      },
    });
  });
}

createRoot(document.getElementById('root')!).render(<App updateSW={(r) => (updateSW ? updateSW(r) : Promise.resolve())} />);
