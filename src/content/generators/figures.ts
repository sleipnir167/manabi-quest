// ===== 問題用の図（SVG）=====
// 色は CSS 変数で指定しているのでダークモードでも見やすい

const wrap = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" class="fig" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const FILL = 'var(--fig-fill)';
const ACC = 'var(--fig-accent)';
const txt = (x: number, y: number, s: string, anchor = 'middle', color = 'currentColor') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="16" font-weight="700">${s}</text>`;

export function circleFig(label: string, mode: 'r' | 'd'): string {
  const line =
    mode === 'r'
      ? `<line x1="100" y1="100" x2="180" y2="100" stroke="${ACC}" stroke-width="3"/>${txt(140, 92, label, 'middle', ACC)}`
      : `<line x1="20" y1="100" x2="180" y2="100" stroke="${ACC}" stroke-width="3"/>${txt(100, 92, label, 'middle', ACC)}`;
  return wrap(
    200,
    200,
    `<circle cx="100" cy="100" r="80" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>${line}<circle cx="100" cy="100" r="3.5" fill="currentColor"/>`,
  );
}

export function semiCircleFig(label: string): string {
  return wrap(
    200,
    150,
    `<path d="M20 125 A80 80 0 0 1 180 125 Z" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>
     <line x1="100" y1="125" x2="180" y2="125" stroke="${ACC}" stroke-width="3"/>${txt(140, 145, label, 'middle', ACC)}
     <circle cx="100" cy="125" r="3.5" fill="currentColor"/>`,
  );
}

export function quarterFig(label: string): string {
  return wrap(
    200,
    200,
    `<path d="M40 170 L40 30 A140 140 0 0 1 180 170 Z" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>
     <path d="M40 155 L55 155 L55 170" fill="none" stroke="currentColor" stroke-width="1.5"/>
     ${txt(110, 192, label, 'middle', ACC)}<line x1="40" y1="170" x2="180" y2="170" stroke="${ACC}" stroke-width="3"/>`,
  );
}

export function squareMinusQuarterFig(label: string): string {
  return wrap(
    200,
    200,
    `<path d="M40 30 L180 30 L180 170 A140 140 0 0 0 40 30 Z" fill="${FILL}" stroke="none"/>
     <rect x="40" y="30" width="140" height="140" fill="none" stroke="currentColor" stroke-width="2.5"/>
     <path d="M40 30 A140 140 0 0 1 180 170" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/>
     <circle cx="40" cy="170" r="3.5" fill="currentColor"/>
     ${txt(110, 192, label, 'middle', ACC)}`,
  );
}

export function boxFig(w: string, h: string, d: string): string {
  return wrap(
    240,
    200,
    `<path d="M30 70 L150 70 L150 170 L30 170 Z" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>
     <path d="M30 70 L80 30 L200 30 L150 70 M150 170 L200 130 L200 30" fill="${FILL}" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M30 170 L80 130 L200 130 M80 130 L80 30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
     ${txt(90, 192, w, 'middle', ACC)}${txt(22, 125, h, 'end', ACC)}${txt(186, 160, d, 'start', ACC)}`,
  );
}

export function triPrismFig(base: string, height: string, length: string): string {
  return wrap(
    260,
    200,
    `<path d="M30 170 L130 170 L30 70 Z" fill="${FILL}" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M30 70 L120 40 L220 140 L130 170 M220 140" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M30 170 L120 140 L220 140 M120 140 L120 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
     <path d="M30 155 L45 155 L45 170" fill="none" stroke="currentColor" stroke-width="1.5"/>
     ${txt(80, 192, base, 'middle', ACC)}${txt(22, 125, height, 'end', ACC)}${txt(186, 172, length, 'start', ACC)}`,
  );
}

export function cylinderFig(rLabel: string, hLabel: string): string {
  return wrap(
    220,
    210,
    `<path d="M40 45 L40 165 A60 16 0 0 0 160 165 L160 45" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>
     <ellipse cx="100" cy="45" rx="60" ry="16" fill="${FILL}" stroke="currentColor" stroke-width="2.5"/>
     <path d="M40 165 A60 16 0 0 1 160 165" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
     <line x1="100" y1="45" x2="160" y2="45" stroke="${ACC}" stroke-width="3"/><circle cx="100" cy="45" r="3" fill="currentColor"/>
     ${txt(130, 36, rLabel, 'middle', ACC)}${txt(170, 112, hLabel, 'start', ACC)}`,
  );
}

export function trapPrismFig(top: string, bottom: string, h: string, len: string): string {
  return wrap(
    270,
    210,
    `<path d="M60 70 L120 70 L150 170 L30 170 Z" fill="${FILL}" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M60 70 L150 30 L210 30 L240 130 L150 170 M120 70 L210 30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M60 70 L60 170" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
     ${txt(90, 62, top, 'middle', ACC)}${txt(90, 194, bottom, 'middle', ACC)}${txt(66, 128, h, 'start', ACC)}${txt(200, 165, len, 'start', ACC)}`,
  );
}

export interface LeverWeight {
  pos: number; // 1..6
  label: string;
  unknown?: boolean;
}

export function leverFig(left: LeverWeight[], right: LeverWeight[], unknownPos?: { side: 'L' | 'R' }): string {
  const cx = 200;
  const step = 28;
  let body = `<rect x="22" y="52" width="356" height="10" rx="5" fill="currentColor" opacity=".85"/>
    <path d="M${cx} 62 L${cx - 16} 92 L${cx + 16} 92 Z" fill="${ACC}"/>`;
  for (let i = 1; i <= 6; i++) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * i * step;
      body += `<line x1="${x}" y1="44" x2="${x}" y2="52" stroke="currentColor" stroke-width="2"/>`;
      body += `<text x="${x}" y="38" text-anchor="middle" font-size="12" fill="currentColor" opacity=".7">${i}</text>`;
    }
  }
  const draw = (ws: LeverWeight[], sx: number) =>
    ws
      .map((w, idx) => {
        const x = cx + sx * w.pos * step;
        const drop = 30 + idx * 4;
        return `<line x1="${x}" y1="62" x2="${x}" y2="${62 + drop}" stroke="currentColor" stroke-width="1.5"/>
          <rect x="${x - 22}" y="${62 + drop}" width="44" height="30" rx="6" fill="${w.unknown ? ACC : FILL}" stroke="currentColor" stroke-width="2"/>
          <text x="${x}" y="${62 + drop + 21}" text-anchor="middle" font-size="14" font-weight="800" fill="${w.unknown ? '#fff' : 'currentColor'}">${w.label}</text>`;
      })
      .join('');
  body += draw(left, -1) + draw(right, 1);
  if (unknownPos) {
    const sx = unknownPos.side === 'L' ? -1 : 1;
    body += `<text x="${cx + sx * 90}" y="160" text-anchor="middle" font-size="14" fill="${ACC}" font-weight="800">どの目盛り？</text>`;
  }
  return wrap(400, 175, body);
}
