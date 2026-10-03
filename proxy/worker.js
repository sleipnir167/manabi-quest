// ===== （任意）AIプロキシ：Cloudflare Workers 用 =====
// iPad に APIキーを置きたくないとき・自前サーバー(HTTP)を HTTPS 経由で使いたいときに使います。
//
// 使い方
//   1. Cloudflare ダッシュボード → Workers → 新規作成 → このファイルの中身を貼り付け
//   2. 設定 → 変数 に以下を登録
//        OPENROUTER_KEY : OpenRouter の APIキー（シークレット）
//        APP_TOKEN      : 好きな合言葉（アプリの「APIキー」欄に入れる）
//        ALLOW_ORIGIN   : アプリのURL（例 https://manabi.pages.dev）
//        UPSTREAM       : 省略時 https://openrouter.ai/api/v1（自前 Gemma なら http://<IP>:11434/v1 など）
//   3. アプリの設定 → AI → 「無料LLM API」欄などに
//        URL = https://<worker名>.<アカウント>.workers.dev/v1
//        APIキー = APP_TOKEN の値
//      を入れる

export default {
  async fetch(req, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Title, HTTP-Referer',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (env.APP_TOKEN && token !== env.APP_TOKEN) return new Response('unauthorized', { status: 401, headers: cors });

    const url = new URL(req.url);
    const upstream = (env.UPSTREAM || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const path = url.pathname.replace(/^\/v1/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (env.OPENROUTER_KEY) headers.Authorization = `Bearer ${env.OPENROUTER_KEY}`;
    headers['X-Title'] = 'Manabi Quest';

    const res = await fetch(upstream + path, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.text() : undefined,
    });
    // ストリーミングもそのまま中継する
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  },
};
