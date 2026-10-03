// ===== AIを使わない「コーチのひとこと」（無料・即時） =====
import { SUBJECTS } from '../content/types';
import { db } from './db';
import { ERROR_LABEL } from './normalize';
import { abilityTrend, errorBreakdown, hourlyAccuracy, weakUnits } from './stats';
import { dueCount } from './selection';
import { profile, settings } from './store';
import { currentStreak } from './game';
import { dayKey } from './util';

export interface Insight {
  icon: string;
  text: string;
  tone: 'good' | 'info' | 'warn';
  action?: { label: string; kind: 'review' | 'weak' | 'unit' | 'smart'; unit?: string };
}

export async function computeInsights(): Promise<Insight[]> {
  const out: Insight[] = [];
  const p = profile.get();
  const today = await db.daily.get(dayKey());
  const due = await dueCount();
  const goal = settings.get().dailyGoal;

  if (p.totals.answered === 0) {
    out.push({ icon: '👋', text: 'はじめまして！まずは「おまかせ学習」で10問といてみよう。', tone: 'info', action: { label: 'はじめる', kind: 'smart' } });
    out.push({ icon: '🧭', text: '「実力診断テスト」を受けると、いまの推定偏差値と苦手がわかるよ。', tone: 'info' });
    return out;
  }
  if (due >= 5) out.push({ icon: '⏰', text: `忘れかけている問題が ${due} 問あるよ。今のうちに復習すると記憶が長持ち！`, tone: 'warn', action: { label: '復習する', kind: 'review' } });

  const count = today?.count ?? 0;
  if (count === 0) out.push({ icon: '🌤️', text: `今日はまだ0問。5問だけでもやってみよう！${currentStreak(p) ? `（${currentStreak(p)}日連続記録が続いているよ）` : ''}`, tone: 'info', action: { label: '5問だけ', kind: 'smart' } });
  else if (count >= goal) out.push({ icon: '🎉', text: `今日の目標 ${goal} 問を達成！すばらしい！`, tone: 'good' });
  else out.push({ icon: '📝', text: `今日の目標まであと ${goal - count} 問。`, tone: 'info' });

  const weak = await weakUnits(30, 2);
  if (weak[0]) out.push({ icon: '💪', text: `「${weak[0].name}」の正答率が ${Math.round(weak[0].acc * 100)}%。集中特訓で苦手を克服しよう。`, tone: 'warn', action: { label: '特訓', kind: 'unit', unit: weak[0].unit } });

  for (const s of SUBJECTS) {
    const t = await abilityTrend(s.id, 21);
    if (t.length >= 3) {
      const diff = t[t.length - 1].deviation - t[0].deviation;
      if (diff >= 2) {
        out.push({ icon: '📈', text: `${s.name}の推定偏差値がこの3週間で +${diff.toFixed(1)}！力がついてきているよ。`, tone: 'good' });
        break;
      }
    }
  }

  const err = await errorBreakdown(14);
  const total = Object.values(err).reduce((a, b) => a + (b ?? 0), 0);
  if (total >= 6) {
    const [top, n] = Object.entries(err).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    if (top === 'careless' && (n ?? 0) / total > 0.3)
      out.push({ icon: '👀', text: '急いで答えてまちがえる「うっかり」が多め。問題文を最後まで読んでから答えよう。', tone: 'warn' });
    else if (top === 'reduce') out.push({ icon: '✂️', text: `最近「約分わすれ」が ${n} 回。答えを出したら「約分できる？」と確認しよう。`, tone: 'warn' });
    else if (top === 'sign') out.push({ icon: '➖', text: `最近「符号ミス」が ${n} 回。マイナスの計算はかっこをつけてていねいに。`, tone: 'warn' });
    else if (top) out.push({ icon: '🔎', text: `最近いちばん多いミスは「${ERROR_LABEL[top as keyof typeof ERROR_LABEL]}」。`, tone: 'info' });
  }

  const hours = (await hourlyAccuracy(30)).filter((h) => h.count >= 15);
  if (hours.length >= 2) {
    const best = hours.sort((a, b) => b.acc - a.acc)[0];
    out.push({ icon: '⏱️', text: `${best.hour}時台は正答率 ${Math.round(best.acc * 100)}% でいちばん集中できているみたい。むずかしい単元はこの時間に！`, tone: 'info' });
  }
  const streak = currentStreak(p);
  if (streak >= 3) out.push({ icon: '🔥', text: `${streak}日連続で学習中！この調子！`, tone: 'good' });
  return out;
}
