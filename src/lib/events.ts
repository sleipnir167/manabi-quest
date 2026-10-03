// ===== アプリ内イベント（トースト・レベルアップ・バッジ獲得の演出用） =====
import type { Badge, Mission } from './game';

export type AppEvent =
  | { type: 'toast'; text: string; icon?: string; tone?: 'info' | 'good' | 'warn' | 'bad' }
  | { type: 'levelup'; from: number; to: number; title: string }
  | { type: 'badge'; badge: Badge }
  | { type: 'mission'; mission: Mission }
  | { type: 'streak'; streak: number; usedFreeze: boolean };

type Handler = (e: AppEvent) => void;
const handlers = new Set<Handler>();

export function onAppEvent(h: Handler) {
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}

export function emit(e: AppEvent) {
  handlers.forEach((h) => h(e));
}

export const toast = (text: string, icon?: string, tone: 'info' | 'good' | 'warn' | 'bad' = 'info') =>
  emit({ type: 'toast', text, icon, tone });
