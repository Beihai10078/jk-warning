// Vercel Serverless Function: 接收照片上传 → 提交到 GitHub 仓库 photos/ 目录
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const TOKEN = process.env.GH_TOKEN;
  const REPO = process.env.GH_REPO || 'Beihai10078/jk-warning';
  const BRANCH = process.env.GH_BRANCH || 'main';

  if (!TOKEN) {
    return res.status(500).json({
      error: 'GH_TOKEN 环境变量未配置，请在 Vercel Dashboard → Settings → Environment Variables 中添加 GH_TOKEN',
    });
  }

  try {
    const { image, category, label } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: '缺少 image 字段' });
    }
    if (!category) {
      return res.status(400).json({ error: '缺少 category 字段' });
    }

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeLabel = (label || 'photo').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 30);
    const filename = `${timestamp}_${safeLabel}.jpg`;
    const path = `photos/${category}/${filename}`;

    // base64 → buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const content = Buffer.from(base64Data, 'base64');

    // 获取文件 SHA（如果已存在则更新）
    let sha = null;
    try {
      const checkRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`,
        { headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'vercel-function' } }
      );
      if (checkRes.ok) {
        const data = await checkRes.json();
        sha = data.sha;
      }
    } catch (_) {}

    // 提交到 GitHub
    const commitRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'vercel-function',
        },
        body: JSON.stringify({
          message: `${category}/${filename}`,
          content: content.toString('base64'),
          branch: BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!commitRes.ok) {
      let errMsg = '';
      try { const d = await commitRes.json(); errMsg = JSON.stringify(d).slice(0, 500); } catch (_) {}
      return res.status(502).json({
        error: `GitHub API 提交失败 (HTTP ${commitRes.status})`,
        detail: errMsg,
      });
    }

    return res.status(200).json({
      success: true,
      path,
      url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`,
    });
  } catch (e) {
    return res.status(500).json({
      error: '函数内部异常',
      message: e.message,
      stack: String(e.stack).slice(0, 500),
    });
  }
}
