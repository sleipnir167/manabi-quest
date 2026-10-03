// ===== AIによる解説（キャッシュ優先・ストリーミング表示） =====
import { useEffect, useRef, useState } from 'react';
import type { Question } from '../content/types';
import { aiReady, chat, explainCacheKey, explainMessages, followupMessages, remainingToday, tutorSystem, type ChatContent, type ChatMessage } from '../lib/ai';
import { db } from '../lib/db';
import { profile, settings } from '../lib/store';
import { Markdown } from './Markup';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Modal } from './ui';
import { listen, speak, sttSupported } from '../lib/speech';
import { toast } from '../lib/events';
import { navigate } from '../lib/router';

export function AIExplain({ q, given, correct, autoStart }: { q: Question; given: string; correct: boolean; autoStart?: boolean }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [cached, setCached] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const key = explainCacheKey(q, given);

  useEffect(() => {
    let alive = true;
    setText('');
    setState('idle');
    db.aiCache.get(key).then((c) => {
      if (!alive) return;
      if (c) {
        setText(c.text);
        setCached(true);
        setState('done');
      } else if (autoStart && aiReady()) run();
    });
    return () => {
      alive = false;
      ctrl.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const run = async (refresh = false) => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setState('loading');
    setErr('');
    try {
      const r = await chat(explainMessages(q, given, correct), {
        cacheKey: key,
        onToken: setText,
        signal: ctrl.current.signal,
        refresh,
      });
      setText(r.text);
      setCached(r.cached);
      setState('done');
      if (!r.cached) profile.set((p) => ({ ...p, totals: { ...p.totals, aiAsked: p.totals.aiAsked + 1 } }));
    } catch (e) {
      setErr((e as Error).message);
      setState('error');
    }
  };

  if (!settings.get().ai.enabled) return null;

  return (
    <div className="ai-box">
      {state === 'idle' && (
        <button className="btn soft block" onClick={() => (aiReady() ? run() : navigate({ name: 'settings', tab: 'ai' }))}>
          <Icon name="sparkles" /> {aiReady() ? 'フクロン先生（AI）にくわしく聞く' : 'AI解説を使うには設定が必要です'}
        </button>
      )}
      {(state === 'loading' || state === 'done') && (
        <div className="ai-answer">
          <div className="ai-head">
            <Mascot size={36} mood={state === 'loading' ? 'think' : 'happy'} bob={false} />
            <b>フクロン先生</b>
            {cached && <span className="chip tiny">保存済み・無料</span>}
            <span className="grow" />
            {state === 'done' && (
              <button className="icon-btn" onClick={() => speak(text.replace(/\*\*/g, ''), 'ja')} aria-label="読み上げ">
                <Icon name="speaker" />
              </button>
            )}
          </div>
          {text ? <Markdown text={text} streaming={state === 'loading'} /> : <div className="skeleton" style={{ height: 60 }} />}
          {state === 'done' && (
            <div className="chips" style={{ marginTop: 10 }}>
              <button className="chip" onClick={() => setChatOpen(true)}>
                <Icon name="chat" size={16} /> 質問する
              </button>
              {!cached ? null : (
                <button className="chip" onClick={() => run(true)}>
                  <Icon name="refresh" size={16} /> 別の説明
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {state === 'error' && (
        <div className="note ng">
          {err.split('\n')[0]}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => run()}>
              もう一度
            </button>
            <button className="btn sm ghost" onClick={() => navigate({ name: 'settings', tab: 'ai' })}>
              AI設定
            </button>
          </div>
        </div>
      )}
      {chatOpen && (
        <AIChat
          q={q}
          seed={[
            { role: 'user', content: '解説してください' },
            { role: 'assistant', content: text },
          ]}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- AIチャット（質問・写真で質問） ----------
export function AIChat({ q, seed = [], onClose }: { q?: Question; seed?: ChatMessage[]; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(seed);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, stream]);

  const send = async (textArg?: string) => {
    const t = (textArg ?? input).trim();
    if ((!t && !image) || busy) return;
    const content: ChatContent = image
      ? [
          { type: 'text', text: t || 'この写真の問題を、やさしく解説してください。' },
          { type: 'image_url', image_url: { url: image } },
        ]
      : t;
    const userMsg: ChatMessage = { role: 'user', content };
    const history = msgs;
    setMsgs([...history, userMsg]);
    setInput('');
    setImage(null);
    setBusy(true);
    setStream('');
    try {
      const messages = q
        ? followupMessages(q, history, content)
        : [{ role: 'system' as const, content: tutorSystem() + '\n- 宿題の答えだけを教えず、考え方のヒントを出して自分で解けるように導く。' }, ...history, userMsg];
      const r = await chat(messages, { onToken: setStream, maxTokens: settings.get().ai.maxTokens });
      setMsgs((m) => [...m, { role: 'assistant', content: r.text }]);
      profile.set((p) => ({ ...p, totals: { ...p.totals, aiAsked: p.totals.aiAsked + 1 } }));
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `⚠️ ${(e as Error).message.split('\n')[0]}` }]);
    } finally {
      setBusy(false);
      setStream('');
    }
  };

  const onPhoto = async (f: File) => {
    // 送信量（=料金）をおさえるため縮小してから送る
    const img = await createImageBitmap(f);
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    setImage(c.toDataURL('image/jpeg', 0.8));
  };

  const voice = async () => {
    if (!sttSupported()) return toast('この端末では音声入力が使えません', '🎤', 'warn');
    setListening(true);
    try {
      const alts = await listen('ja', setInput).result;
      if (alts[0]) setInput(alts[0]);
    } catch (e) {
      toast((e as Error).message, '🎤', 'warn');
    } finally {
      setListening(false);
    }
  };

  const textOf = (c: ChatContent) => (typeof c === 'string' ? c : c.map((p) => (p.type === 'text' ? p.text : '📷 写真')).join(' '));
  const suggestions = q
    ? ['もっとかんたんに説明して', '具体的な例を出して', '覚え方のコツは？', 'この問題のポイントは？']
    : ['分数のわり算はなぜひっくり返すの？', '江戸時代の流れをざっくり教えて', '英語の be動詞って何？', '勉強のやる気が出ないときは？'];

  return (
    <Modal onClose={onClose} wide title={<span className="row">🦉 フクロン先生に質問</span>}>
      <div className="chat">
        {!msgs.length && (
          <div className="chat-hello">
            <Mascot size={72} mood="happy" />
            <div className="bubble">
              {q ? 'この問題について、わからないことを何でも聞いてね！' : 'なんでも質問してね！ 写真で問題を送ることもできるよ（📷）。'}
              <div className="tiny faint" style={{ marginTop: 4 }}>今日のAI残り回数：{remainingToday()}回</div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown text={textOf(m.content)} /> : <span>{textOf(m.content)}</span>}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            {stream ? <Markdown text={stream} streaming /> : <div className="typing"><i /><i /><i /></div>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chips" style={{ margin: '10px 0' }}>
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      {image && (
        <div className="chat-image">
          <img src={image} alt="送る写真" />
          <button className="icon-btn" onClick={() => setImage(null)} aria-label="写真をやめる">
            <Icon name="x" />
          </button>
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="写真で質問">
          <Icon name="camera" />
        </button>
        <button type="button" className={`icon-btn ${listening ? 'on' : ''}`} onClick={voice} aria-label="音声で質問">
          <Icon name="mic" />
        </button>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="質問を入力…" enterKeyHint="send" />
        <button className="btn primary" disabled={busy || (!input.trim() && !image)} aria-label="送信">
          <Icon name="send" />
        </button>
      </form>
    </Modal>
  );
}
