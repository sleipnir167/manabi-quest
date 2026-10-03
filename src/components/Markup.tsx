// ===== 問題文の記法とマークダウンの表示（innerHTML を使わず安全に） =====
import { Fragment, type ReactNode } from 'react';

function Frac({ n, d }: { n: string; d: string }) {
  return (
    <span className="frac" role="math" aria-label={`${d}ぶんの${n}`}>
      <span>{n}</span>
      <span>{d}</span>
    </span>
  );
}

function renderFrac(content: string, key: string | number): ReactNode {
  const mixed = content.match(/^(-?\d+)\s+([^/]+)\/(.+)$/);
  if (mixed)
    return (
      <span className="mixed" key={key}>
        {mixed[1]}
        <Frac n={mixed[2]} d={mixed[3]} />
      </span>
    );
  const idx = content.indexOf('/');
  if (idx < 0) return <Fragment key={key}>{content}</Fragment>;
  return <Frac key={key} n={content.slice(0, idx)} d={content.slice(idx + 1)} />;
}

/** 問題文の記法: [[3/4]] [[1 3/4]] __下線__ **太字** 改行 */
export function Markup({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\[\[(.+?)\]\]|__(.+?)__|\*\*(.+?)\*\*|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(renderFrac(m[1], k++));
    else if (m[2] !== undefined)
      out.push(
        <span className="ul" key={k++}>
          {m[2]}
        </span>,
      );
    else if (m[3] !== undefined) out.push(<b key={k++}>{m[3]}</b>);
    else out.push(<br key={k++} />);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// ---------- 簡易マークダウン（AIの回答用） ----------
function inline(s: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={keyBase + i++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={keyBase + i++}>{m[2]}</code>);
    else out.push(renderFrac(m[3], keyBase + i++));
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = blocks.length;
      blocks.push(
        <p key={k}>
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l, `${k}-${i}-`)}
            </Fragment>
          ))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = blocks.length;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}-`)}</li>);
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.replace(/^#{1,6}\s+/, '').trimEnd();
    const ul = line.match(/^\s*[-*・]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)．]\s*(.*)$/);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className={`md ${streaming ? 'cursor-blink' : ''}`}>{blocks}</div>;
}
