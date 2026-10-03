// ===== 手書きキャンバス（Apple Pencil の筆圧対応・パームリジェクション） =====
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Pt {
  x: number;
  y: number;
  p: number;
}
interface Stroke {
  pts: Pt[];
  erase: boolean;
  color: string;
}

export interface DrawPadHandle {
  clear: () => void;
  isEmpty: () => boolean;
}

export const DrawPad = forwardRef<DrawPadHandle, { height?: number | string; guide?: 'grid' | 'kanji' | 'none'; className?: string }>(
  function DrawPad({ height = 320, guide = 'grid', className }, ref) {
    const wrap = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Stroke[]>([]);
    const current = useRef<Stroke | null>(null);
    const penSeen = useRef(false);
    const [erase, setErase] = useState(false);
    const [, force] = useState(0);

    const colorOf = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#182040';

    const redraw = () => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) drawStroke(ctx, s);
    };

    const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
      ctx.save();
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1],
          b = s.pts[i];
        ctx.lineWidth = s.erase ? 26 : 2 + 4.5 * ((a.p + b.p) / 2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    };

    useEffect(() => {
      const resize = () => {
        const c = canvas.current,
          w = wrap.current;
        if (!c || !w) return;
        const dpr = window.devicePixelRatio || 1;
        const r = w.getBoundingClientRect();
        c.width = Math.max(1, r.width * dpr);
        c.height = Math.max(1, r.height * dpr);
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
        redraw();
      };
      resize();
      const ro = new ResizeObserver(resize);
      if (wrap.current) ro.observe(wrap.current);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        strokes.current = [];
        redraw();
        force((x) => x + 1);
      },
      isEmpty: () => strokes.current.length === 0,
    }));

    const pos = (e: React.PointerEvent): Pt => {
      const r = canvas.current!.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.55;
      return { x: e.clientX - r.left, y: e.clientY - r.top, p };
    };

    const down = (e: React.PointerEvent) => {
      if (e.pointerType === 'pen') penSeen.current = true;
      if (penSeen.current && e.pointerType === 'touch') return; // ペン使用中は手のひらを無視
      (e.target as Element).setPointerCapture?.(e.pointerId);
      current.current = { pts: [pos(e)], erase, color: colorOf() };
    };
    const move = (e: React.PointerEvent) => {
      if (!current.current) return;
      const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
      const r = canvas.current!.getBoundingClientRect();
      for (const ev of events) {
        current.current.pts.push({
          x: ev.clientX - r.left,
          y: ev.clientY - r.top,
          p: ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.55,
        });
      }
      const ctx = canvas.current!.getContext('2d')!;
      const pts = current.current.pts;
      drawStroke(ctx, { ...current.current, pts: pts.slice(-events.length - 1) });
    };
    const up = () => {
      if (current.current) {
        if (current.current.pts.length === 1) current.current.pts.push({ ...current.current.pts[0], x: current.current.pts[0].x + 0.5 });
        strokes.current.push(current.current);
        current.current = null;
        redraw();
        force((x) => x + 1);
      }
    };

    return (
      <div className={`drawpad ${className ?? ''}`} style={{ height }}>
        <div ref={wrap} className={`drawpad-surface guide-${guide}`}>
          <canvas
            ref={canvas}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          />
        </div>
        <div className="drawpad-tools">
          <button className={`icon-btn ${!erase ? 'on' : ''}`} onClick={() => setErase(false)} aria-label="ペン">
            <Icon name="pencil" />
          </button>
          <button className={`icon-btn ${erase ? 'on' : ''}`} onClick={() => setErase(true)} aria-label="消しゴム">
            <Icon name="eraser" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              strokes.current.pop();
              redraw();
              force((x) => x + 1);
            }}
            aria-label="ひとつ戻す"
          >
            <Icon name="undo" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              strokes.current = [];
              redraw();
              force((x) => x + 1);
            }}
            aria-label="全部消す"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    );
  },
);
