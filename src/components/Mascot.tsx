// ===== マスコット「フクロン先生」 =====
export type Mood = 'idle' | 'happy' | 'sad' | 'think' | 'wow';

const INK = '#1B2340';

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'happy')
    return (
      <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M35 61q9-11 18 0" />
        <path d="M67 61q9-11 18 0" />
      </g>
    );
  if (mood === 'think')
    return (
      <g>
        <circle cx="44" cy="58" r="11" fill="#fff" />
        <circle cx="46" cy="54" r="5.5" fill={INK} />
        <circle cx="48" cy="52" r="1.8" fill="#fff" />
        <path d="M67 59h18" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      </g>
    );
  const big = mood === 'wow';
  const r = big ? 13 : 11;
  const pr = big ? 7 : 5.8;
  const py = mood === 'sad' ? 62 : 59;
  return (
    <g>
      <circle cx="44" cy="58" r={r} fill="#fff" />
      <circle cx="76" cy="58" r={r} fill="#fff" />
      <circle cx="45" cy={py} r={pr} fill={INK} />
      <circle cx="77" cy={py} r={pr} fill={INK} />
      <circle cx="47.5" cy={py - 3} r="2" fill="#fff" />
      <circle cx="79.5" cy={py - 3} r="2" fill="#fff" />
      {mood === 'idle' && (
        <g fill="#EEE9FF">
          <ellipse className="eye-lid" cx="44" cy="58" rx="12.5" ry="12.5" />
          <ellipse className="eye-lid" cx="76" cy="58" rx="12.5" ry="12.5" />
        </g>
      )}
    </g>
  );
}

export function Mascot({ size = 96, mood = 'idle', bob = true }: { size?: number; mood?: Mood; bob?: boolean }) {
  return (
    <svg className={`mascot${bob ? ' bob' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="mqBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8E80FF" />
          <stop offset="1" stopColor="#5646DD" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="115" rx="27" ry="4" fill="rgba(20,20,60,.14)" />
      <path d="M60 22c-24 0-40 18-40 44 0 27 16 46 40 46s40-19 40-46c0-26-16-44-40-44z" fill="url(#mqBody)" />
      <path d="M23 68c-9 7-10 22-2 31 4-9 6-20 2-31z" fill="#4636C2" />
      <path d="M97 68c9 7 10 22 2 31-4-9-6-20-2-31z" fill="#4636C2" />
      <ellipse cx="60" cy="89" rx="24" ry="20" fill="#F1EDFF" />
      <path d="M50 84q4 4 8 0M62 84q4 4 8 0M56 94q4 4 8 0" stroke="#CFC5FF" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="44" cy="58" r="16.5" fill="#EEE9FF" />
      <circle cx="76" cy="58" r="16.5" fill="#EEE9FF" />
      <Eyes mood={mood} />
      {mood === 'sad' && (
        <g>
          <path d="M33 44l14 5M87 44l-14 5" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M31 70q-3.5 6 0 8q3.5-2 0-8z" fill="#7CC4FF" />
        </g>
      )}
      {(mood === 'happy' || mood === 'wow') && (
        <g fill="#FF8FB1" opacity=".55">
          <ellipse cx="32" cy="71" rx="6" ry="3.5" />
          <ellipse cx="88" cy="71" rx="6" ry="3.5" />
        </g>
      )}
      <path d={mood === 'wow' ? 'M60 65l-6 6q6 8 12 0z' : 'M60 65l-6 7q6 5 12 0z'} fill="#FFB020" />
      <path d="M60 6 97 19 60 32 23 19z" fill="#1B2340" />
      <path d="M39 24v8q21 10 42 0v-8" fill="#2B3566" />
      <path d="M95 20v14" stroke="#FFB020" strokeWidth="3" strokeLinecap="round" />
      <circle cx="95" cy="36" r="3.8" fill="#FFB020" />
      <path d="M48 111q3-5 7 0M65 111q3-5 7 0" stroke="#FFB020" strokeWidth="4" strokeLinecap="round" fill="none" />
      {mood === 'wow' && (
        <g fill="#FFC93C">
          <path d="M14 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M106 46l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
        </g>
      )}
      {mood === 'think' && (
        <text x="102" y="58" fontSize="22" fontWeight="900" fill="#8E80FF">
          ?
        </text>
      )}
    </svg>
  );
}
