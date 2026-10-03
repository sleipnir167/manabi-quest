// ===== 数字キーパッド（分数・比・文字式に対応、iPadで押しやすい大きさ） =====
import { useEffect } from 'react';
import type { NumKind } from '../content/types';
import { Markup } from './Markup';
import { Icon } from './Icon';
import { sfx } from '../lib/sound';

type Key = { k: string; label?: string; wide?: boolean; kind?: 'op' | 'del' | 'ok' };

function layout(kind: NumKind): Key[] {
  const digits = (ks: string[]) => ks.map((k) => ({ k }));
  if (kind === 'ratio')
    return [
      ...digits(['7', '8', '9']), { k: 'del', kind: 'del' },
      ...digits(['4', '5', '6']), { k: ':', label: '：', kind: 'op' },
      ...digits(['1', '2', '3']), { k: '.', label: '.', kind: 'op' },
      { k: '0', wide: true }, { k: 'clear', label: 'C', kind: 'op' }, { k: 'ok', label: '決定', kind: 'ok' },
    ];
  if (kind === 'expr')
    return [
      ...digits(['7', '8', '9']), { k: 'del', kind: 'del' },
      ...digits(['4', '5', '6']), { k: 'x', label: 'x', kind: 'op' },
      ...digits(['1', '2', '3']), { k: '+', label: '+', kind: 'op' },
      { k: '0' }, { k: '/', label: '分数', kind: 'op' }, { k: '-', label: '−', kind: 'op' }, { k: 'ok', label: '決定', kind: 'ok' },
    ];
  return [
    ...digits(['7', '8', '9']), { k: 'del', kind: 'del' },
    ...digits(['4', '5', '6']), { k: '/', label: '分数', kind: 'op' },
    ...digits(['1', '2', '3']), { k: ' ', label: '帯分数', kind: 'op' },
    { k: '0' }, { k: '.', label: '.', kind: 'op' }, { k: '-', label: '−', kind: 'op' }, { k: 'ok', label: '決定', kind: 'ok' },
  ];
}

/** 入力中の値を見やすく表示（分数は縦に） */
export function NumDisplay({ value, kind, unit, locked }: { value: string; kind: NumKind; unit?: string; locked?: boolean }) {
  let shown: string = value;
  if (kind !== 'ratio') {
    // "1 3/4" や "3/4" を分数表示に
    shown = value.replace(/(-?\d+ )?(\d+|x)\/(\d*)/g, (_m, w: string | undefined, n: string, d: string) => `[[${w ? w : ''}${n}/${d || '□'}]]`);
  }
  shown = shown.replace(/-/g, '−');
  return (
    <div className="num-display" aria-live="polite">
      {value ? <Markup text={shown} /> : <span className="placeholder">答えを入力</span>}
      {!locked && <span className="caret" />}
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function Keypad({
  value,
  onChange,
  onSubmit,
  kind = 'num',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  kind?: NumKind;
  disabled?: boolean;
}) {
  const press = (k: string) => {
    if (disabled) return;
    sfx.tap();
    if (k === 'ok') return value.trim() && onSubmit();
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === 'clear') return onChange('');
    if (k === '-') {
      // 先頭ならマイナス符号、式の途中ならひき算
      if (kind !== 'expr' && value === '') return onChange('-');
      if (kind !== 'expr' && value === '-') return onChange('');
      if (kind !== 'expr') return;
    }
    if (k === '/' && (value.includes('/') && kind !== 'expr')) return;
    if (k === ' ' && (!/\d$/.test(value) || value.includes(' ') || value.includes('/'))) return;
    if (value.length > 24) return;
    onChange(value + k);
  };

  // 外付けキーボード・PCでも入力できるように
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (disabled || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const map: Record<string, string> = { Backspace: 'del', Enter: 'ok', Escape: 'clear', '−': '-' };
      const k = map[e.key] ?? e.key;
      if (/^[0-9.:/x+\- ]$/.test(k) || ['del', 'ok', 'clear'].includes(k)) {
        e.preventDefault();
        press(k);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div className={`keypad ${disabled ? 'disabled' : ''}`}>
      {layout(kind).map((key, i) => (
        <button
          key={i}
          className={`key ${key.kind ?? ''} ${key.wide ? 'wide' : ''}`}
          onClick={() => press(key.k)}
          disabled={disabled}
          aria-label={key.k === 'del' ? '1文字消す' : key.label ?? key.k}
        >
          {key.k === 'del' ? <Icon name="left" /> : key.label ?? key.k}
        </button>
      ))}
    </div>
  );
}
