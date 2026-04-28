// Vercel Serverless Function: 后端中转 Reddit 请求
// 浏览器调用: /api/reddit?sub=AMD_Stock&days=3
// 这个函数:用正确的 User-Agent 调 Reddit,绕过浏览器 CORS

export default async function handler(req, res) {
  // 设置 CORS 头(允许你的网站调用)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { sub, days = '3' } = req.query;

  if (!sub) {
    return res.status(400).json({ error: 'Missing sub parameter' });
  }

  // 验证 sub 名只包含合法字符(防止注入)
  if (!/^[a-zA-Z0-9_]+$/.test(sub)) {
    return res.status(400).json({ error: 'Invalid sub name' });
  }

  const daysNum = parseInt(days, 10);
  const cutoff = Math.floor(Date.now() / 1000) - daysNum * 86400;

  try {
    const redditUrl = `https://www.reddit.com/r/${sub}/hot.json?limit=15`;

    const redditRes = await fetch(redditUrl, {
      headers: {
        // Reddit 要求自定义 User-Agent,这是关键!
        'User-Agent': 'web:stock-playground:v1.0 (by /u/anonymous_dashboard)'
      }
    });

    if (!redditRes.ok) {
      return res.status(redditRes.status).json({
        error: `Reddit returned ${redditRes.status}`
      });
    }

    const data = await redditRes.json();

    if (!data.data || !data.data.children) {
      return res.status(500).json({ error: 'Unexpected Reddit response format' });
    }

    // 过滤 + 整理数据
    const posts = data.data.children
      .map(c => c.data)
      .filter(p => p.created_utc >= cutoff && !p.stickied)
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        title: p.title,
        selftext: p.selftext ? p.selftext.slice(0, 280) : '',
        score: p.score,
        num_comments: p.num_comments,
        created_utc: p.created_utc,
        permalink: p.permalink,
        sub: sub
      }));

    // 缓存 5 分钟(Vercel CDN 层面,减少 Reddit 调用)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({ posts });

  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Unknown error'
    });
  }
}
