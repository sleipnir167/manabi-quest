// ===== 設定（プロフィール・音・AI・問題パック・データ） =====
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SUBJECTS, gradeLabel, subjectName, type PackFile, type SubjectId } from '../content/types';
import { allQuestions, normalizePack, unitName, unitsOf } from '../content/registry';
import { DEFAULT_PROVIDERS, aiUsage, settings, type AIProvider } from '../lib/store';
import { AIError, chat, fetchOpenRouterModels, parseJsonLoose, remainingToday, testProvider, usedToday } from '../lib/ai';
import { db, requestPersist } from '../lib/db';
import { CSV_TEMPLATE, JSON_TEMPLATE, deletePack, importPackText, savePack, setPackEnabled, syncRemotePacks } from '../lib/packs';
import { exportAll, importAll, resetAll } from '../lib/backup';
import { voicesFor, speak, sttSupported, ttsSupported } from '../lib/speech';
import { toast } from '../lib/events';
import { downloadText, hash } from '../lib/util';
import { weakUnits } from '../lib/stats';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import { Modal, PageHead, Seg, Switch } from '../components/ui';
import { sfx } from '../lib/sound';

type Tab = 'basic' | 'ai' | 'packs' | 'data';

export function Settings({ tab: initial }: { tab?: string }) {
  const s = settings.use();
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? 'basic');
  const [unlocked, setUnlocked] = useState(!s.parentPin);
  const [pinInput, setPinInput] = useState('');
  useEffect(() => {
    if (initial) setTab(initial as Tab);
  }, [initial]);

  const locked = !!s.parentPin && !unlocked && (tab === 'ai' || tab === 'data');

  return (
    <div className="page settings">
      <PageHead title="⚙️ 設定" />
      <div className="chips scroll" style={{ marginBottom: 16 }}>
        {(
          [
            ['basic', '基本・音声'],
            ['ai', '🦉 AI'],
            ['packs', '📦 問題パック'],
            ['data', '💾 データ・保護者'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {locked ? (
        <div className="card center stack" style={{ maxWidth: 420, margin: '0 auto' }}>
          <Icon name="lock" size={40} />
          <h3>保護者ロック中</h3>
          <p className="small muted">この設定を変えるには暗証番号が必要です</p>
          <input className="input" type="password" inputMode="numeric" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="暗証番号" />
          <button
            className="btn primary"
            onClick={() => {
              if (pinInput === s.parentPin) setUnlocked(true);
              else toast('暗証番号がちがいます', '🔒', 'bad');
            }}
          >
            解除
          </button>
        </div>
      ) : (
        <>
          {tab === 'basic' && <BasicSettings />}
          {tab === 'ai' && <AISettings />}
          {tab === 'packs' && <PackSettings />}
          {tab === 'data' && <DataSettings />}
        </>
      )}
    </div>
  );
}

// ---------- 基本 ----------
function BasicSettings() {
  const s = settings.use();
  const [voices, setVoices] = useState({ ja: voicesFor('ja'), en: voicesFor('en') });
  useEffect(() => {
    const t = setTimeout(() => setVoices({ ja: voicesFor('ja'), en: voicesFor('en') }), 600);
    return () => clearTimeout(t);
  }, []);
  const set = settings.set;
  const applyTheme = (t: 'auto' | 'light' | 'dark') => {
    set({ theme: t });
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return (
    <div className="grid-2">
      <div className="card">
        <h3>👤 プロフィール</h3>
        <div className="setting-row">
          <div className="label">
            <b>ニックネーム</b>
          </div>
          <input className="input" style={{ maxWidth: 200 }} value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="なまえ" />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>学年</b>
            <small>おまかせ学習・偏差値の基準になります</small>
          </div>
          <select className="input" style={{ maxWidth: 120 }} value={s.grade} onChange={(e) => set({ grade: Number(e.target.value) })}>
            {[6, 7, 8, 9].map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div className="label">
            <b>1日の目標</b>
          </div>
          <Seg value={s.dailyGoal} onChange={(v) => set({ dailyGoal: v })} options={[10, 20, 30, 50, 80].map((v) => ({ value: v, label: `${v}問` }))} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>1セットの問題数</b>
          </div>
          <Seg value={s.sessionSize} onChange={(v) => set({ sessionSize: v })} options={[5, 10, 15, 20].map((v) => ({ value: v, label: `${v}` }))} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>記憶の目標</b>
            <small>高いほど復習の回数が増えます（ふつうは90%）</small>
          </div>
          <Seg value={s.retention} onChange={(v) => set({ retention: v })} options={[0.85, 0.9, 0.95].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} />
        </div>
      </div>
      <div className="card">
        <h3>🎨 画面・操作</h3>
        <div className="setting-row">
          <div className="label">
            <b>テーマ</b>
          </div>
          <Seg value={s.theme} onChange={applyTheme} options={[{ value: 'auto', label: '自動' }, { value: 'light', label: 'ライト' }, { value: 'dark', label: 'ダーク' }]} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>漢字の書き取りは手書きで</b>
            <small>オフにすると4択になります</small>
          </div>
          <Switch checked={s.handwriteKanji} onChange={(v) => set({ handwriteKanji: v })} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>入力問題を選択式にする</b>
            <small>漢字の読みなどを4択で（かんたんモード）</small>
          </div>
          <Switch checked={s.choiceForInput} onChange={(v) => set({ choiceForInput: v })} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>タイマーを表示</b>
          </div>
          <Switch checked={s.showTimer} onChange={(v) => set({ showTimer: v })} />
        </div>
      </div>
      <div className="card">
        <h3>🔊 効果音</h3>
        <div className="setting-row">
          <div className="label">
            <b>効果音</b>
          </div>
          <Switch checked={s.sound} onChange={(v) => set({ sound: v })} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>音量</b>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => set({ volume: Number(e.target.value) })}
            onPointerUp={() => sfx.correct(2)}
          />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>バイブレーション</b>
            <small>Android（Pixel など）のみ</small>
          </div>
          <Switch checked={s.haptics} onChange={(v) => set({ haptics: v })} />
        </div>
      </div>
      <div className="card">
        <h3>🗣️ 読み上げ・音声入力</h3>
        {!ttsSupported() && <div className="note warn">この端末は読み上げに対応していません</div>}
        <div className="setting-row">
          <div className="label">
            <b>問題を自動で読み上げ</b>
          </div>
          <Switch checked={s.tts.autoRead} onChange={(v) => set({ tts: { ...s.tts, autoRead: v } })} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>英語の答えを読み上げ</b>
            <small>まちがえたとき・カードをめくったとき</small>
          </div>
          <Switch checked={s.tts.readAnswer} onChange={(v) => set({ tts: { ...s.tts, readAnswer: v } })} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>読む速さ</b>
          </div>
          <Seg value={s.tts.rate} onChange={(v) => set({ tts: { ...s.tts, rate: v } })} options={[{ value: 0.8, label: 'ゆっくり' }, { value: 1, label: 'ふつう' }, { value: 1.2, label: 'はやい' }]} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>日本語の声</b>
          </div>
          <select className="input" style={{ maxWidth: 200 }} value={s.tts.jaVoice} onChange={(e) => set({ tts: { ...s.tts, jaVoice: e.target.value } })}>
            <option value="">自動</option>
            {voices.ja.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => speak('こんにちは。いっしょにがんばろう。', 'ja')} aria-label="試聴">
            <Icon name="speaker" />
          </button>
        </div>
        <div className="setting-row">
          <div className="label">
            <b>英語の声</b>
          </div>
          <select className="input" style={{ maxWidth: 200 }} value={s.tts.enVoice} onChange={(e) => set({ tts: { ...s.tts, enVoice: e.target.value } })}>
            <option value="">自動</option>
            {voices.en.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => speak('Hello! Nice to meet you.', 'en')} aria-label="試聴">
            <Icon name="speaker" />
          </button>
        </div>
        <p className="tiny faint">
          音声入力：{sttSupported() ? '使えます（🎤ボタン）' : 'このブラウザでは使えません'}。iPad は「設定 → Siri」で音声入力をオンにすると使えます。
        </p>
      </div>
    </div>
  );
}

// ---------- AI ----------
function AISettings() {
  const s = settings.use();
  const u = aiUsage.use();
  const [models, setModels] = useState<{ id: string; name: string; ctx: number; price: number }[] | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const cacheCount = useLiveQuery(() => db.aiCache.count(), []) ?? 0;
  const ai = s.ai;
  const setAi = (patch: Partial<typeof ai>) => settings.set({ ai: { ...ai, ...patch } });
  const setProv = (id: string, patch: Partial<AIProvider>) => setAi({ providers: ai.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const move = (i: number, d: number) => {
    const list = ai.providers.slice();
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setAi({ providers: list });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="row between wrap">
          <div>
            <h3>🦉 AI先生（解説・質問・レポート・問題づくり）</h3>
            <p className="small muted">問題には最初から解説が入っています。AIは「もっと詳しく」のときだけ使い、一度作った解説は保存して再利用するので、クレジットをほとんど使いません。</p>
          </div>
          <Switch checked={ai.enabled} onChange={(v) => setAi({ enabled: v })} />
        </div>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile">
            <div className="label">今日の利用</div>
            <div className="value">
              {usedToday()}
              <small>/ {ai.dailyLimit}回</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">今月の利用</div>
            <div className="value">
              {u.monthCalls}
              <small>回</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">今月の費用（目安）</div>
            <div className="value">
              ${u.monthCostUsd.toFixed(4)}
            </div>
            <div className="tiny faint">約{Math.round(u.monthCostUsd * 150 * 10) / 10}円・{u.monthTokens.toLocaleString()} tokens</div>
          </div>
          <div className="tile">
            <div className="label">保存済みの解説</div>
            <div className="value">
              {cacheCount}
              <small>件</small>
            </div>
            <button className="btn ghost sm" onClick={() => db.aiCache.clear().then(() => toast('AIキャッシュを消しました', '🧹'))}>
              消す
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div className="label">
            <b>1日の利用回数の上限</b>
            <small>使いすぎ防止。残り {remainingToday()} 回</small>
          </div>
          <Seg value={ai.dailyLimit} onChange={(v) => setAi({ dailyLimit: v })} options={[10, 20, 40, 100, 300].map((v) => ({ value: v, label: String(v) }))} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>回答の長さ（最大トークン）</b>
          </div>
          <Seg value={ai.maxTokens} onChange={(v) => setAi({ maxTokens: v })} options={[400, 700, 1200].map((v) => ({ value: v, label: v === 400 ? '短め' : v === 700 ? 'ふつう' : '長め' }))} />
        </div>
        <div className="setting-row">
          <div className="label">
            <b>まちがえたら自動でAI解説</b>
            <small>オフなら「聞く」を押したときだけ（節約）</small>
          </div>
          <Switch checked={ai.autoExplainOnWrong} onChange={(v) => setAi({ autoExplainOnWrong: v })} />
        </div>
      </div>

      <div className="card">
        <h3>接続先（上から順に試します）</h3>
        <p className="small muted" style={{ marginBottom: 10 }}>
          無料モデル → 無料API → 低価格モデル → 自前サーバー、のように並べると、混雑時も自動で切りかわります。
        </p>
        <div className="stack">
          {ai.providers.map((p, i) => (
            <div key={p.id} className={`provider ${p.enabled ? 'on' : ''}`}>
              <div className="row between">
                <div className="row">
                  <Switch checked={p.enabled} onChange={(v) => setProv(p.id, { enabled: v })} />
                  <b>
                    {i + 1}. {p.name}
                  </b>
                </div>
                <div className="row" style={{ gap: 2 }}>
                  <button className="icon-btn" onClick={() => move(i, -1)} aria-label="上へ">
                    <Icon name="left" style={{ transform: 'rotate(90deg)' }} />
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} aria-label="下へ">
                    <Icon name="right" style={{ transform: 'rotate(90deg)' }} />
                  </button>
                </div>
              </div>
              {p.note && <p className="tiny faint">{p.note}</p>}
              {p.enabled && (
                <div className="provider-fields">
                  <label className="field">
                    <span>APIのURL（OpenAI互換・/v1 まで）</span>
                    <input className="input" value={p.baseUrl} onChange={(e) => setProv(p.id, { baseUrl: e.target.value.trim() })} placeholder="https://example.com/v1" />
                  </label>
                  <label className="field">
                    <span>APIキー {p.kind === 'openrouter' && '（OpenRouter の2つの接続先で共通）'}</span>
                    <input className="input" type="password" value={p.apiKey} onChange={(e) => setProv(p.id, { apiKey: e.target.value.trim() })} placeholder={p.kind === 'openrouter' ? 'sk-or-v1-…' : '不要なら空でOK'} autoComplete="off" />
                  </label>
                  <label className="field">
                    <span>モデル（カンマ区切りで予備も）</span>
                    <input className="input" value={p.model} onChange={(e) => setProv(p.id, { model: e.target.value })} />
                  </label>
                  <div className="row wrap">
                    <button
                      className="btn sm"
                      disabled={testing === p.id}
                      onClick={async () => {
                        setTesting(p.id);
                        try {
                          toast(`接続OK：${await testProvider(p)}`, '✅', 'good');
                        } catch (e) {
                          toast((e as AIError).message, '⚠️', 'bad');
                        } finally {
                          setTesting(null);
                        }
                      }}
                    >
                      {testing === p.id ? '確認中…' : '接続テスト'}
                    </button>
                    {p.kind === 'openrouter' && (
                      <button
                        className="btn sm ghost"
                        onClick={async () => {
                          try {
                            setModels(await fetchOpenRouterModels(p.id === 'openrouter-free'));
                          } catch {
                            toast('モデル一覧を取得できませんでした', '⚠️', 'bad');
                          }
                        }}
                      >
                        {p.id === 'openrouter-free' ? '無料モデル一覧' : 'モデル一覧'}
                      </button>
                    )}
                    <label className="row tiny">
                      待ち時間
                      <select className="input" style={{ width: 90, minHeight: 36 }} value={p.timeoutSec} onChange={(e) => setProv(p.id, { timeoutSec: Number(e.target.value) })}>
                        {[20, 40, 60, 120, 180].map((t) => (
                          <option key={t} value={t}>
                            {t}秒
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setAi({ providers: DEFAULT_PROVIDERS.map((d) => ({ ...d, apiKey: ai.providers.find((p) => p.id === d.id)?.apiKey ?? '' })) })}>
          初期設定にもどす（キーは残す）
        </button>
        <div className="note" style={{ marginTop: 12 }}>
          <b>自前サーバー（Oracle Cloud の Gemma など）を使うとき</b>
          <br />
          このアプリは HTTPS で動くので、サーバー側も HTTPS ＋ CORS 許可が必要です。Ollama なら <code>OLLAMA_ORIGINS=*</code> を設定し、Caddy などで HTTPS 化して <code>https://あなたのドメイン/v1</code> を入れてください。詳しくは README。
        </div>
      </div>

      <div className="card">
        <div className="row between wrap">
          <div>
            <h3>✨ AIで苦手克服問題を作る</h3>
            <p className="small muted">苦手な単元の問題をAIが作って「AI作成」パックに追加します。答えがまちがっていたら削除できます。</p>
          </div>
          <button className="btn primary" onClick={() => setGen(true)}>
            <Icon name="wand" /> 問題を作る
          </button>
        </div>
      </div>
      {gen && <AIGenerate onClose={() => setGen(false)} />}
      {models && (
        <Modal onClose={() => setModels(null)} title="OpenRouter のモデル" wide>
          <p className="small muted">タップするとコピーします。モデル欄にカンマ区切りで貼りつけてください。</p>
          <div className="model-list">
            {models.slice(0, 150).map((m) => (
              <button
                key={m.id}
                className="list-row"
                onClick={() => {
                  navigator.clipboard?.writeText(m.id);
                  toast(`コピー：${m.id}`, '📋', 'good');
                }}
              >
                <span className="grow">
                  <b className="small">{m.id}</b>
                  <div className="tiny faint">{m.name}</div>
                </span>
                <span className="tiny">{m.price === 0 ? '無料' : `$${m.price.toFixed(2)}/M`}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- AIによる問題生成 ----------
function AIGenerate({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState<SubjectId>('science');
  const [unit, setUnit] = useState('');
  const [count, setCount] = useState(5);
  const [diff, setDiff] = useState(3);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  const [weak, setWeak] = useState<{ unit: string; name: string }[]>([]);
  useEffect(() => {
    weakUnits(60, 5).then((w) => setWeak(w));
  }, []);
  const units = unitsOf(subject);
  const target = unit || units[0]?.id;

  const run = async () => {
    setBusy(true);
    setOut('');
    try {
      const examples = allQuestions()
        .filter((q) => q.unit === target && !q.gen && q.type === 'choice')
        .slice(0, 3)
        .map((q) => ({ prompt: q.prompt, choices: q.choices, explanation: q.explanation }));
      const r = await chat(
        [
          { role: 'system', content: 'あなたは日本の小中学校の教材作成のプロです。学習指導要領に沿った、事実として正確な問題だけを作ります。あいまいな問題・答えが複数ある問題は作りません。出力はJSONのみ。' },
          {
            role: 'user',
            content: `${subjectName(subject)}「${unitName(target)}」の4択問題を${count}問作ってください。難しさは5段階の${diff}。\n参考（既存の問題）：${JSON.stringify(examples)}\n既存の問題と同じ問題は作らないこと。\n出力形式：{"questions":[{"prompt":"問題文","choices":["正解","誤答1","誤答2","誤答3"],"explanation":"なぜその答えになるか（60字以内）"}]}\nchoices の1つ目を必ず正解にすること。`,
          },
        ],
        { json: true, maxTokens: 2000, temperature: 0.7, onToken: (t) => setOut(t) },
      );
      const j = parseJsonLoose<{ questions: { prompt: string; choices: string[]; explanation?: string }[] }>(r.text);
      const qs = (j?.questions ?? []).filter((q) => q.prompt && Array.isArray(q.choices) && q.choices.length >= 3 && new Set(q.choices).size === q.choices.length);
      if (!qs.length) throw new Error('問題を読み取れませんでした。もう一度ためしてください。');
      const existing = await db.packs.get('ai-generated');
      const pack: PackFile = existing?.data ?? { id: 'ai-generated', name: 'AI作成問題', version: 1, questions: [] };
      const newIds = qs.map((q) => `ai:${hash(target + q.prompt)}`);
      pack.questions = [
        ...pack.questions.filter((x) => !newIds.includes(String(x.id))),
        ...qs.map((q) => ({
          id: `ai:${hash(target + q.prompt)}`,
          unit: target,
          subject,
          type: 'choice' as const,
          prompt: q.prompt,
          choices: q.choices.map(String),
          answer: String(q.choices[0]),
          explanation: q.explanation,
          difficulty: diff,
        })),
      ];
      pack.version = (pack.version ?? 1) + 1;
      const { errors } = normalizePack(pack, 'ai');
      await savePack(pack, 'ai');
      toast(`${qs.length}問を追加しました${errors.length ? `（${errors.length}件エラー）` : ''}`, '✨', 'good');
      onClose();
      navigate({ name: 'play', config: { title: `AI問題：${unitName(target)}`, mode: 'study', spec: { kind: 'retry', qids: newIds }, subject } });
    } catch (e) {
      toast((e as Error).message.split('\n')[0], '⚠️', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="✨ AIで問題を作る">
      {weak.length > 0 && (
        <>
          <p className="small muted">苦手な単元から選ぶ：</p>
          <div className="chips" style={{ marginBottom: 12 }}>
            {weak.map((w) => (
              <button
                key={w.unit}
                className={`chip ${target === w.unit ? 'active' : ''}`}
                onClick={() => {
                  const u = allQuestions().find((q) => q.unit === w.unit);
                  if (u) setSubject(u.subject);
                  setUnit(w.unit);
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="stack">
        <label className="field">
          <span>教科</span>
          <select className="input" value={subject} onChange={(e) => (setSubject(e.target.value as SubjectId), setUnit(''))}>
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>単元</span>
          <select className="input" value={target} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {gradeLabel(u.grade)} {u.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row between">
          <span className="small">問題数</span>
          <Seg value={count} onChange={setCount} options={[3, 5, 10].map((v) => ({ value: v, label: `${v}問` }))} />
        </div>
        <div className="row between">
          <span className="small">難しさ</span>
          <Seg value={diff} onChange={setDiff} options={[2, 3, 4].map((v) => ({ value: v, label: ['', '', 'やさしい', 'ふつう', 'むずかしい'][v] }))} />
        </div>
        {busy && <pre className="gen-preview">{out.slice(-400) || '作成中…'}</pre>}
        <button className="btn primary lg" onClick={run} disabled={busy}>
          {busy ? '作成中…' : '作成する'}
        </button>
        <p className="tiny faint">※AIはまちがえることがあります。おかしな問題は「問題パック」から削除できます。</p>
      </div>
    </Modal>
  );
}

// ---------- 問題パック ----------
function PackSettings() {
  const packs = useLiveQuery(() => db.packs.toArray(), []) ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const builtin = allQuestions().filter((q) => q.source === 'builtin');

  const onFile = async (f: File) => {
    try {
      const text = await f.text();
      const r = await importPackText(text, f.name);
      toast(`「${r.pack.name}」${r.count}問を追加しました${r.errors.length ? `（${r.errors.length}行スキップ）` : ''}`, '📦', 'good');
    } catch (e) {
      toast(`読み込めませんでした：${(e as Error).message.split('\n')[0]}`, '⚠️', 'bad');
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h3>📦 問題を追加する</h3>
        <p className="small muted">
          中学校の問題などを、あとからどんどん追加できます。Excel や Google スプレッドシートで作って CSV で保存、または JSON ファイルを読み込みます。
        </p>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> ファイルを読み込む
          </button>
          <button className="btn" onClick={() => downloadText('問題テンプレート.csv', '﻿' + CSV_TEMPLATE, 'text/csv')}>
            <Icon name="download" /> CSVテンプレート
          </button>
          <button className="btn" onClick={() => downloadText('pack-template.json', JSON_TEMPLATE)}>
            <Icon name="download" /> JSONテンプレート
          </button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/pack.json（URLから読み込み）" />
          <button
            className="btn"
            disabled={!url || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await fetch(url);
                const r = await importPackText(await res.text(), url.split('/').pop() ?? 'pack.json');
                toast(`「${r.pack.name}」${r.count}問を追加しました`, '📦', 'good');
                setUrl('');
              } catch (e) {
                toast(`読み込めませんでした：${(e as Error).message}`, '⚠️', 'bad');
              } finally {
                setBusy(false);
              }
            }}
          >
            追加
          </button>
        </div>
        <div className="row between" style={{ marginTop: 12 }}>
          <div className="label small">
            <b>サーバーの packs/ フォルダから自動で追加</b>
            <div className="tiny faint">packs/index.json に書いたパックを起動時に自動インストール・更新します</div>
          </div>
          <div className="row">
            <Switch checked={settings.get().remotePacks} onChange={(v) => settings.set({ remotePacks: v })} />
            <button
              className="btn sm"
              onClick={async () => {
                const r = await syncRemotePacks();
                toast(r.error ? `取得できませんでした：${r.error}` : r.installed.length ? `追加・更新：${r.installed.join('、')}` : '新しいパックはありません', '🔄');
              }}
            >
              今すぐ確認
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>インストール済み</h3>
        <div className="list">
          <div className="list-row">
            <span className="pack-icon">📚</span>
            <span className="grow">
              <b>内蔵問題（小6〜中1）</b>
              <div className="tiny faint">{builtin.filter((q) => !q.gen).length}問 ＋ 計算の自動生成 {builtin.filter((q) => q.gen).length}種類</div>
            </span>
          </div>
          {packs.map((p) => {
            const n = normalizePack(p.data, 'x').questions.length;
            return (
              <div key={p.id} className="list-row">
                <span className="pack-icon">{p.origin === 'ai' ? '✨' : p.origin === 'remote' ? '☁️' : '📦'}</span>
                <span className="grow">
                  <b>{p.name}</b>
                  <div className="tiny faint">
                    {n}問・v{p.version}・{p.origin === 'ai' ? 'AI作成' : p.origin === 'remote' ? 'サーバー配信' : '読み込み'}
                  </div>
                </span>
                <Switch checked={p.enabled} onChange={(v) => setPackEnabled(p.id, v)} />
                {p.origin === 'ai' && <AIPackEditor id={p.id} />}
                <button className="icon-btn" onClick={() => downloadText(`${p.id}.json`, JSON.stringify(p.data, null, 2))} aria-label="書き出し">
                  <Icon name="download" />
                </button>
                <button className="icon-btn" onClick={() => confirm(`「${p.name}」を削除しますか？`) && deletePack(p.id)} aria-label="削除">
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>CSV の書き方</h3>
        <div className="table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>列</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>subject</td><td>国語 / 算数・数学(math) / 理科 / 社会 / 英語</td></tr>
              <tr><td>grade</td><td>6=小6、7=中1、8=中2、9=中3</td></tr>
              <tr><td>unit_id / unit_name</td><td>単元のID（半角英数）と名前。同じIDは同じ単元</td></tr>
              <tr><td>type</td><td>空欄なら自動。choice(4択) / input(入力) / numeric(数) / tf(○×) / order(並べ替え)</td></tr>
              <tr><td>prompt</td><td>問題文。分数は [[3/4]]、下線は __語__、改行は \n</td></tr>
              <tr><td>answer</td><td>正解。tf は o か x、order は「A|B|C」の正しい順</td></tr>
              <tr><td>wrong1〜3</td><td>選択式の誤答（入れると4択になる）</td></tr>
              <tr><td>explanation</td><td>解説</td></tr>
              <tr><td>difficulty</td><td>1〜5（偏差値の推定に使う）</td></tr>
              <tr><td>accept</td><td>別解を | で区切って（例：ふごう|符号）</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AIPackEditor({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const pack = useLiveQuery(() => db.packs.get(id), [id]);
  if (!pack) return null;
  const remove = async (qid: string) => {
    const data = { ...pack.data, questions: pack.data.questions.filter((q) => q.id !== qid), version: (pack.data.version ?? 1) + 1 };
    await savePack(data, 'ai');
  };
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="中身を見る">
        <Icon name="eye" />
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} title="AI作成問題" wide>
          <div className="list">
            {pack.data.questions.map((q) => (
              <div key={q.id} className="list-row">
                <span className="grow small">
                  <span className="tiny faint">{unitName(q.unit ?? '')}</span>
                  <div>{q.prompt}</div>
                  <div className="tiny">
                    正解：<b>{q.answer}</b>（{q.choices?.slice(1).join(' / ')}）
                  </div>
                </span>
                <button className="icon-btn" onClick={() => remove(q.id!)} aria-label="削除">
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------- データ・保護者 ----------
function DataSettings() {
  const s = settings.use();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const [pin, setPin] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const attempts = useLiveQuery(() => db.attempts.count(), []) ?? 0;
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)}MB 使用中`));
  }, []);
  return (
    <div className="grid-2">
      <div className="card">
        <h3>💾 バックアップ</h3>
        <p className="small muted">学習記録は この端末の中（ブラウザ）に保存されています。機種変更やもしものために、ときどきバックアップしましょう。</p>
        <p className="tiny faint" style={{ margin: '8px 0' }}>
          記録 {attempts.toLocaleString()} 件・{usage}・{persisted ? '消えにくい保存（永続化）ON' : '永続化：未設定'}
        </p>
        <div className="row wrap">
          <button
            className="btn primary"
            onClick={async () => {
              const data = await exportAll(false);
              downloadText(`manabi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
            }}
          >
            <Icon name="download" /> バックアップを保存
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (!confirm('今のデータをバックアップの内容で置きかえます。よろしいですか？')) return;
                await importAll(JSON.parse(await f.text()));
                toast('復元しました', '✅', 'good');
              } catch (err) {
                toast((err as Error).message, '⚠️', 'bad');
              }
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> 復元
          </button>
          {!persisted && (
            <button className="btn ghost" onClick={async () => setPersisted(await requestPersist())}>
              永続化をお願いする
            </button>
          )}
        </div>
        <p className="tiny faint" style={{ marginTop: 8 }}>※バックアップには AI の APIキーは含まれません。</p>
      </div>
      <div className="card">
        <h3>🔒 保護者ロック</h3>
        <p className="small muted">AI設定（APIキー）とデータ消去を暗証番号で守ります。</p>
        {s.parentPin ? (
          <div className="row" style={{ marginTop: 10 }}>
            <span className="chip ok">設定済み</span>
            <button className="btn sm" onClick={() => settings.set({ parentPin: '' })}>
              解除する
            </button>
          </div>
        ) : (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="4〜8桁の数字" />
            <button
              className="btn primary"
              disabled={pin.length < 4}
              onClick={() => {
                settings.set({ parentPin: pin });
                setPin('');
                toast('保護者ロックを設定しました', '🔒', 'good');
              }}
            >
              設定
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h3>📱 ホーム画面に追加</h3>
        <p className="small muted">
          <b>iPad / iPhone（Safari）</b>：共有ボタン <Icon name="share" size={16} /> →「ホーム画面に追加」
          <br />
          <b>Pixel（Chrome）</b>：メニュー ⋮ →「アプリをインストール」
          <br />
          追加すると全画面で動き、オフラインでも学習できます（AIはネットが必要）。
        </p>
      </div>
      <div className="card">
        <h3>⚠️ すべてリセット</h3>
        <p className="small muted">学習記録・XP・設定をすべて消します。元に戻せません。</p>
        <button className="btn ng" style={{ marginTop: 10 }} onClick={() => setConfirmReset(true)}>
          <Icon name="trash" /> すべて消す
        </button>
      </div>
      {confirmReset && (
        <Modal onClose={() => setConfirmReset(false)} title="本当に消しますか？">
          <p className="muted">学習記録がすべて消えます。先にバックアップを保存することをおすすめします。</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn grow" onClick={() => setConfirmReset(false)}>
              やめる
            </button>
            <button className="btn ng grow" onClick={() => resetAll()}>
              消す
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
