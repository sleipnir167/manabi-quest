// ===== 紙ふぶき =====
import { useEffect, useRef } from 'react';

type Burst = { x?: number; y?: number; count?: number; spread?: number };
const listeners = new Set<(b: Burst) => void>();
export function confetti(b: Burst = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  listeners.forEach((l) => l(b));
}

const COLORS = ['#5B5BF6', '#FFB020', '#12B76A', '#F04462', '#38BDF8', '#F472B6', '#8B5CF6'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  life: number;
  shape: 0 | 1;
}

export function ConfettiLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let pieces: Piece[] = [];
    let raf = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const tick = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      pieces = pieces.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      for (const p of pieces) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        p.life -= 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.min(1, p.life / 30);
        ctx.fillStyle = p.c;
        if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        else {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (pieces.length) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const fire = (b: Burst) => {
      const x = b.x ?? innerWidth / 2;
      const y = b.y ?? innerHeight * 0.35;
      const n = b.count ?? 120;
      const spread = b.spread ?? 1;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
        const sp = 6 + Math.random() * 10;
        pieces.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.3,
          w: 7 + Math.random() * 6,
          h: 10 + Math.random() * 8,
          c: COLORS[i % COLORS.length],
          life: 110 + Math.random() * 60,
          shape: Math.random() < 0.7 ? 0 : 1,
        });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
