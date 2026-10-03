// ===== グラフ（SVG・ホバー/タップで値を表示） =====
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    setW(Math.floor(ref.current.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function TipBox({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(8, tip.x + 12), Math.max(8, width - 190));
  return (
    <div className="chart-tip" style={{ left, top: Math.max(0, tip.y - 10) }}>
      {tip.content}
    </div>
  );
}

export interface Series {
  key: string;
  label: string;
  color: string; // CSS 色（var(--math) など）
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

// ---------- 積み上げ縦棒（日別の学習量） ----------
export function StackedColumns({
  data,
  series,
  height = 200,
  unit = '問',
}: {
  data: { label: string; sub?: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  unit?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padL = 34,
    padB = 26,
    padT = 8;
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const innerW = Math.max(0, w - padL - 4);
  const band = data.length ? innerW / data.length : 0;
  const bw = Math.min(24, band * 0.62);
  const ih = height - padB - padT;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)));
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="日別の学習量">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={w} y1={y(max * f)} y2={y(max * f)} className="grid" />
              <text x={padL - 6} y={y(max * f) + 4} textAnchor="end" className="axis">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + band * i + band / 2;
            let acc = 0;
            const segs = series
              .map((s) => ({ s, v: d.values[s.key] ?? 0 }))
              .filter((x) => x.v > 0)
              .map((x, j, arr) => {
                const y0 = y(acc);
                acc += x.v;
                const y1 = y(acc);
                const top = j === arr.length - 1;
                const hgt = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                const r = top ? Math.min(4, hgt / 2, bw / 2) : 0;
                const yTop = y1;
                const path = `M${cx - bw / 2},${yTop + hgt} V${yTop + r} Q${cx - bw / 2},${yTop} ${cx - bw / 2 + r},${yTop} H${cx + bw / 2 - r} Q${cx + bw / 2},${yTop} ${cx + bw / 2},${yTop + r} V${yTop + hgt} Z`;
                return <path key={x.s.key} d={path} style={{ fill: x.s.color }} />;
              });
            return (
              <g key={i}>
                {segs}
                <rect
                  x={cx - band / 2}
                  y={padT}
                  width={band}
                  height={ih}
                  fill="transparent"
                  onPointerEnter={(e) => {
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({
                      x: e.clientX - r.left,
                      y: y(totals[i]) - 30,
                      content: (
                        <>
                          <b>
                            {d.label} {d.sub}
                          </b>
                          <div>
                            合計 {totals[i]}
                            {unit}
                          </div>
                          {series
                            .filter((s) => d.values[s.key])
                            .map((s) => (
                              <div key={s.key} className="tip-row">
                                <i style={{ background: s.color }} />
                                {s.label} {d.values[s.key]}
                              </div>
                            ))}
                        </>
                      ),
                    });
                  }}
                />
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="axis">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={padL} x2={w} y1={y(0)} y2={y(0)} className="baseline" />
        </svg>
      )}
      <TipBox tip={tip} width={w} />
    </div>
  );
}

// ---------- 単一系列の縦棒 ----------
export function Columns({
  data,
  height = 160,
  color = 'var(--primary)',
  format = (v: number) => String(v),
  highlight,
}: {
  data: { label: string; value: number; tip?: ReactNode; dim?: boolean }[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  highlight?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padB = 24,
    padT = 18;
  const max = Math.max(1e-9, ...data.map((d) => d.value));
  const band = data.length ? w / data.length : 0;
  const bw = Math.min(24, band * 0.6);
  const ih = height - padB - padT;
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height}>
          {data.map((d, i) => {
            const h = (d.value / max) * ih;
            const cx = band * i + band / 2;
            const r = Math.min(4, h / 2, bw / 2);
            const top = padT + ih - h;
            return (
              <g key={i}>
                {h > 0 && (
                  <path
                    d={`M${cx - bw / 2},${padT + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${padT + ih} Z`}
                    style={{ fill: color, opacity: d.dim ? 0.35 : 1 }}
                  />
                )}
                {(highlight === i || data.length <= 8) && d.value > 0 && (
                  <text x={cx} y={top - 5} textAnchor="middle" className="val">
                    {format(d.value)}
                  </text>
                )}
                <text x={cx} y={height - 6} textAnchor="middle" className="axis">
                  {d.label}
                </text>
                <rect
                  x={cx - band / 2}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  onPointerEnter={(e) => {
                    const rr = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({ x: e.clientX - rr.left, y: top - 30, content: d.tip ?? `${d.label}：${format(d.value)}` });
                  }}
                />
              </g>
            );
          })}
          <line x1={0} x2={w} y1={padT + ih} y2={padT + ih} className="baseline" />
        </svg>
      )}
      <TipBox tip={tip} width={w} />
    </div>
  );
}

// ---------- 折れ線（推定偏差値の推移） ----------
export function LineChart({
  series,
  height = 240,
  domain = [30, 70],
  refLine = 50,
}: {
  series: (Series & { points: { x: string; y: number }[] })[];
  height?: number;
  domain?: [number, number];
  refLine?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort();
  const padL = 34,
    padR = 64,
    padT = 12,
    padB = 26;
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const lo = Math.min(domain[0], Math.floor((Math.min(...ys, 50) - 2) / 5) * 5);
  const hi = Math.max(domain[1], Math.ceil((Math.max(...ys, 50) + 2) / 5) * 5);
  const iw = Math.max(1, w - padL - padR);
  const ih = height - padT - padB;
  const xPos = (x: string) => padL + (xs.length <= 1 ? iw / 2 : (xs.indexOf(x) / (xs.length - 1)) * iw);
  const yPos = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  const hv = hover ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hover) })).filter((x) => x.p) : [];
  const fmt = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <div
      ref={ref}
      className="chart"
      onPointerMove={(e) => {
        if (!xs.length) return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left - padL;
        const idx = Math.round((px / iw) * (xs.length - 1));
        setHover(xs[Math.max(0, Math.min(xs.length - 1, idx))]);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="推定偏差値の推移">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={yPos(t)} y2={yPos(t)} className="grid" />
              <text x={padL - 6} y={yPos(t) + 4} textAnchor="end" className="axis">
                {t}
              </text>
            </g>
          ))}
          <line x1={padL} x2={w - padR} y1={yPos(refLine)} y2={yPos(refLine)} className="ref" />
          {xs.length > 0 && (
            <>
              <text x={padL} y={height - 6} className="axis">
                {fmt(xs[0])}
              </text>
              <text x={w - padR} y={height - 6} textAnchor="end" className="axis">
                {fmt(xs[xs.length - 1])}
              </text>
            </>
          )}
          {series.map((s) => {
            if (!s.points.length) return null;
            const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${xPos(p.x)},${yPos(p.y)}`).join(' ');
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.key}>
                <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={xPos(last.x)} cy={yPos(last.y)} r={4.5} style={{ fill: s.color }} className="ring-dot" />
              </g>
            );
          })}
          {/* 右端ラベル（重なりをさけて配置） */}
          {(() => {
            const ends = series
              .filter((s) => s.points.length)
              .map((s) => ({ s, y: yPos(s.points[s.points.length - 1].y), v: s.points[s.points.length - 1].y }))
              .sort((a, b) => a.y - b.y);
            for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
            return ends.map((e) => (
              <g key={e.s.key}>
                <circle cx={w - padR + 10} cy={e.y} r={4} style={{ fill: e.s.color }} />
                <text x={w - padR + 18} y={e.y + 4} className="end-label">
                  {e.s.label.slice(0, 2)} {e.v.toFixed(1)}
                </text>
              </g>
            ));
          })()}
          {hover && (
            <line x1={xPos(hover)} x2={xPos(hover)} y1={padT} y2={padT + ih} className="crosshair" />
          )}
        </svg>
      )}
      {hover && hv.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(8, xPos(hover) + 12), Math.max(8, w - 190)), top: 6 }}>
          <b>{fmt(hover)}</b>
          {hv.map(({ s, p }) => (
            <div key={s.key} className="tip-row">
              <i style={{ background: s.color }} />
              {s.label} {p!.y.toFixed(1)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- レーダー（教科別の偏差値） ----------
export function Radar({
  axes,
  size = 280,
  domain = [30, 70],
  color = 'var(--primary)',
  compare,
}: {
  axes: { label: string; value: number | null; color?: string }[];
  size?: number;
  domain?: [number, number];
  color?: string;
  compare?: (number | null)[];
}) {
  const c = size / 2;
  const R = size / 2 - 46;
  const n = axes.length;
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const rv = (v: number) => (Math.max(domain[0], Math.min(domain[1], v)) - domain[0]) / (domain[1] - domain[0]);
  const pt = (i: number, f: number) => [c + Math.cos(ang(i)) * R * f, c + Math.sin(ang(i)) * R * f];
  const poly = (vals: (number | null)[]) =>
    vals.map((v, i) => pt(i, v == null ? 0 : rv(v)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="教科別の推定偏差値">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(i, f).join(',')).join(' ')} className={f === 0.5 ? 'ref-poly' : 'grid-poly'} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} className="grid" />;
      })}
      {compare && <polygon points={poly(compare)} className="cmp-poly" />}
      <polygon points={poly(axes.map((a) => a.value))} style={{ fill: color, stroke: color }} className="val-poly" />
      {axes.map((a, i) => {
        if (a.value == null) return null;
        const [x, y] = pt(i, rv(a.value));
        return <circle key={i} cx={x} cy={y} r={4.5} style={{ fill: a.color ?? color }} className="ring-dot" />;
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <g key={i}>
            <text x={x} y={y} textAnchor="middle" className="radar-label">
              {a.label}
            </text>
            <text x={x} y={y + 16} textAnchor="middle" className="radar-val">
              {a.value == null ? '—' : a.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- カレンダーヒートマップ ----------
export function Heatmap({ days, weeks = 16 }: { days: { day: string; count: number }[]; weeks?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const map = new Map(days.map((d) => [d.day, d.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - today.getDay());
  const cols = weeks + 1;
  const gap = 3;
  const cell = Math.max(8, Math.min(18, Math.floor((w - 24 - gap * cols) / cols)));
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const cells: ReactNode[] = [];
  const d = new Date(start);
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < 7; row++) {
      if (d > today) break;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const n = map.get(key) ?? 0;
      const x = 24 + col * (cell + gap);
      const y = row * (cell + gap);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      cells.push(
        <rect
          key={key}
          x={x}
          y={y}
          width={cell}
          height={cell}
          rx={3}
          className={`hm l${level(n)}`}
          onPointerEnter={() => setTip({ x, y, content: `${label}：${n}問` })}
        />,
      );
      d.setDate(d.getDate() + 1);
    }
  }
  const h = 7 * (cell + gap);
  return (
    <div ref={ref} className="chart" onPointerLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={h + 4} role="img" aria-label="学習カレンダー">
          {['日', '', '火', '', '木', '', '土'].map((l, i) => (
            <text key={i} x={0} y={i * (cell + gap) + cell - 2} className="axis">
              {l}
            </text>
          ))}
          {cells}
        </svg>
      )}
      <div className="hm-legend">
        少ない
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hm-key l${l}`} />
        ))}
        多い
      </div>
      <TipBox tip={tip} width={w} />
    </div>
  );
}

// ---------- 正規分布の上での位置（偏差値） ----------
export function BellCurve({ deviation, low, high }: { deviation: number; low?: number; high?: number }) {
  const W = 320,
    H = 130,
    pad = 16;
  const x = (dev: number) => pad + ((dev - 20) / 60) * (W - pad * 2);
  const pdf = (dev: number) => Math.exp(-0.5 * ((dev - 50) / 10) ** 2);
  const yv = (p: number) => H - 26 - p * (H - 46);
  let path = '';
  let fill = '';
  for (let d = 20; d <= 80; d += 1) {
    path += `${d === 20 ? 'M' : 'L'}${x(d)},${yv(pdf(d))}`;
  }
  const dv = Math.max(20, Math.min(80, deviation));
  fill = `M${x(20)},${yv(0)}`;
  for (let d = 20; d <= dv; d += 0.5) fill += `L${x(d)},${yv(pdf(d))}`;
  fill += `L${x(dv)},${yv(0)}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bell" role="img" aria-label={`偏差値 ${deviation}`}>
      {low != null && high != null && (
        <rect x={x(Math.max(20, low))} y={14} width={Math.max(2, x(Math.min(80, high)) - x(Math.max(20, low)))} height={H - 40} className="ci" rx={6} />
      )}
      <path d={fill} className="bell-fill" />
      <path d={path} className="bell-line" fill="none" />
      <line x1={pad} x2={W - pad} y1={yv(0)} y2={yv(0)} className="baseline" />
      {[30, 40, 50, 60, 70].map((t) => (
        <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="axis">
          {t}
        </text>
      ))}
      <line x1={x(dv)} x2={x(dv)} y1={yv(pdf(dv)) - 14} y2={yv(0)} className="marker" />
      <circle cx={x(dv)} cy={yv(pdf(dv)) - 14} r={6} className="marker-dot" />
    </svg>
  );
}

/** 偏差値 → 上位何% */
export function topPercent(dev: number): number {
  const z = (dev - 50) / 10;
  // 標準正規分布の上側確率（近似）
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z < 0) p = 1 - p;
  return Math.max(0.1, Math.min(99.9, Math.round(p * 1000) / 10));
}

// ---------- 100%積み上げ横棒（記憶の段階） ----------
export function StageBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [tip, setTip] = useState<string | null>(null);
  return (
    <div>
      <div className="stagebar" onPointerLeave={() => setTip(null)}>
        {total === 0 ? (
          <span className="stage-empty" />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span
                key={p.key}
                style={{ flexGrow: p.value, background: p.color }}
                onPointerEnter={() => setTip(`${p.label}：${p.value}問（${Math.round((p.value / total) * 100)}%）`)}
              />
            ))
        )}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        {parts.map((p) => (
          <span key={p.key}>
            <i style={{ background: p.color }} />
            {p.label} <b className="num">{p.value}</b>
          </span>
        ))}
      </div>
      {tip && <div className="small muted" style={{ marginTop: 6 }}>{tip}</div>}
    </div>
  );
}

// ---------- 横棒リスト ----------
export function HBars({ items, color = 'var(--primary)', format = (v: number) => String(v) }: {
  items: { label: ReactNode; value: number; sub?: ReactNode }[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((it, i) => (
        <div key={i} className="hbar-row">
          <div className="hbar-label">{it.label}</div>
          <div className="hbar-track">
            <i style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
          <div className="hbar-val num">{format(it.value)}</div>
          {it.sub && <div className="hbar-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
