// Xfani 中继 Worker（Cloudflare Workers 免费版即可）
// v1.3 并行 + 缓存版：三域名并行试，取首个成功返回；成功结果缓存 1 小时，
// 同一集重复请求直接回缓存（手机上不再等接口，秒回）。
// 作用：手机直连 Supabase 取视频接口被挡，改走这个中继。
// 中继在 Cloudflare 边缘跑，能正常调通 Supabase 的三个域名，
// 把结果原样返回给手机。手机只要能打开 workers.dev 就行。
//
// 部署（免费，5 分钟）：
//  1. 注册 Cloudflare 账号（cloudflare.com，免费）
//  2. 左侧 Workers & Pages → Create → Worker → 随便起个名字
//  3. 把下面这段代码整段粘贴进去，点 Deploy
//  4. 部署完会给一个地址，形如 https://xfani-relay.你的名字.workers.dev
//  5. 把这个地址填到 Mangayomi 里 Xfani 扩展的设置 → “中继地址” 里
//     （不用加 /functions/v1/issue-web-playback 后缀，扩展自己会拼）
//
// 注意：apikey 是稀饭网站前端公开的 publishable key，不是私密凭证。

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const episodeId = body.episode_id;
    const sourceId = body.source_id;
    if (!episodeId) {
      return new Response(JSON.stringify({ ok: false, error: 'missing episode_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 先查缓存：同一集 + 同一线路，成功结果缓存 1 小时。
    const cache = caches.default;
    const cacheKey = new Request(
      'https://xfani-relay-cache/episode/' + episodeId + '/' + (sourceId || 'all'),
      { method: 'GET' }
    );
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch (e) { /* 缓存不可用就继续走接口 */ }

    const key = 'sb_publishable_OBIVAWACIX6lPXrO98_z24_HcsmalkA';
    const hosts = [
      'https://rzmsnqblptbceicadbyd.galentwww.cn',
      'https://api.xifanacg.com',
      'https://supa.xifanacg.com',
    ];
    const payload = { action: 'fallback', episode_id: episodeId };
    if (sourceId) payload.source_id = sourceId;

    // 三个域名并行试，哪个先返回就用哪个。任一成功即返回。
    const attempts = hosts.map(async (host) => {
      const res = await fetch(host + '/functions/v1/issue-web-playback', {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    });
    try {
      const data = await Promise.any(attempts);
      const resp = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=3600',
        },
      });
      // 只缓存成功结果（ok:true 且有地址），失败不缓存。
      try {
        if (data && data.ok && (data.url || (data.candidates && data.candidates.length))) {
          await cache.put(cacheKey, resp.clone());
        }
      } catch (e) { /* 缓存失败不影响返回 */ }
      return resp;
    } catch (e) {
      // 三个都失败了
    }
    return new Response(JSON.stringify({ ok: false, error: 'all hosts failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
