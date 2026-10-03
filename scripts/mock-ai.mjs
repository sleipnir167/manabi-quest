// 動作確認用：OpenAI互換のにせAIサーバー（クレジット不要）
//   node scripts/mock-ai.mjs  →  http://localhost:8787/v1
import http from 'node:http';

const EXPLAIN = `**ポイント**は「地租改正」で、土地の値段（地価）の **3%** を **お金で** 納める税にしたことです。

1. それまでは米で年貢を納めていたので、豊作・不作で国の収入が変わってしまった
2. お金で納めるようにして、国の収入を安定させた

**覚え方のコツ**：「地租＝地価のソ（3）%」とイメージしよう！

まちがえても大丈夫。次はきっと正解できるよ！`;

const QUESTIONS = JSON.stringify({
  questions: [
    { prompt: '水溶液を蒸発させると白い固体が残るのはどれ？', choices: ['食塩水', '炭酸水', '塩酸', 'アンモニア水'], explanation: '食塩水は固体がとけているので、水を蒸発させると食塩が残る。' },
    { prompt: '赤色リトマス紙を青色に変える水溶液は？', choices: ['アンモニア水', '塩酸', '炭酸水', '食塩水'], explanation: 'アンモニア水はアルカリ性。' },
  ],
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.url?.endsWith('/models')) {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
    }
    let body = '';
    for await (const c of req) body += c;
    const j = JSON.parse(body || '{}');
    const last = JSON.stringify(j.messages?.at(-1)?.content ?? '');
    const text = j.response_format || last.includes('出力形式') ? QUESTIONS : last.includes('接続OK') ? '接続OK' : EXPLAIN;
    console.log(new Date().toISOString(), 'model=', j.model, 'stream=', j.stream, 'chars=', body.length);
    if (j.stream) {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
      const chunks = text.match(/[\s\S]{1,6}/g) ?? [];
      for (const ch of chunks) {
        res.write(`data: ${JSON.stringify({ model: 'mock-model', choices: [{ delta: { content: ch } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, 15));
      }
      res.write(`data: ${JSON.stringify({ model: 'mock-model', choices: [{ delta: {} }], usage: { total_tokens: 420, cost: 0.00002 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'mock-model', choices: [{ message: { content: text } }], usage: { total_tokens: 420, cost: 0.00002 } }));
  })
  .listen(8787, () => console.log('mock AI on http://localhost:8787/v1'));
