/**
 * Cloudflare Pages Function — 可选的写入通道
 * 路由：POST /api/submit
 *
 * 目的：让「评分 / 评论」能直接落到数据仓库，而不是只存在浏览器本地。
 * 默认关闭；只有在你配置了环境变量之后才会真正工作。
 *
 * 需要配置的 Pages 环境变量（Settings → Environment variables）：
 *   GH_TOKEN        — GitHub PAT，权限只需目标仓库的 Contents: Read and write
 *   GH_OWNER        — 仓库所属账号，如 LigeLoveRosita
 *   RATINGS_REPO    — 推荐/评分仓库名，如 vrc-map-ratings
 *   COMMENTS_REPO   — 评论仓库名，如 vrc-map-comments
 *   SUBMIT_SECRET   — 可选。设置后前端请求需带 x-submit-secret 头
 *
 * 安全提示：本函数只写 JSON 数据文件，不接受任意路径与任意内容，
 * 且对每个来源做了简单限流（基于 IP + 时间窗，内存态）。
 */

const MAX_BODY = 1200;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;

// 简单的内存限流。Workers 实例是无状态的，多实例下不精确，
// 但足以挡住最粗暴的刷屏；要严格限流请接 Durable Object 或 KV。
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + RATE_WINDOW_MS;
  }
  rec.count += 1;
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear(); // 防内存膨胀
  return rec.count > RATE_MAX;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function clean(v, max = 600) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

/** 读 GitHub 上的文件，返回 { content, sha }；不存在则内容为空数组 */
async function readJsonFile(env, owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      'User-Agent': 'vrc-map-site',
      Accept: 'application/vnd.github+json',
    },
  });

  if (res.status === 404) {
    return { doc: { version: 1, updatedAt: null, items: [] }, sha: null };
  }
  if (!res.ok) throw new Error(`读取 ${path} 失败: ${res.status} ${await res.text()}`);

  const info = await res.json();
  const text = atob(info.content.replace(/\n/g, ''));
  const decoded = new TextDecoder().decode(
    Uint8Array.from(text, (c) => c.charCodeAt(0)),
  );
  return { doc: JSON.parse(decoded), sha: info.sha, path: info.path };
}

async function writeJsonFile(env, owner, repo, path, doc, sha, message) {
  const content = btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(doc, null, 2))),
  );
  const body = { message, content, branch: 'main' };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      'User-Agent': 'vrc-map-site',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`写入 ${path} 失败: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimited(ip)) return json({ ok: false, error: '请求过于频繁，稍后再试' }, 429);

  if (!env.GH_TOKEN || !env.GH_OWNER) {
    return json({ ok: false, error: '服务端未配置 GH_TOKEN / GH_OWNER' }, 503);
  }

  if (env.SUBMIT_SECRET) {
    if (request.headers.get('x-submit-secret') !== env.SUBMIT_SECRET) {
      return json({ ok: false, error: '未授权' }, 401);
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
  }

  const kind = clean(payload.kind, 16);
  const mapId = clean(payload.mapId, 80);
  if (!mapId) return json({ ok: false, error: '缺少 mapId' }, 400);

  const ratingsRepo = env.RATINGS_REPO || 'vrc-map-ratings';
  const commentsRepo = env.COMMENTS_REPO || 'vrc-map-comments';
  const stamp = new Date().toISOString();

  try {
    if (kind === 'rating') {
      const stars = Math.min(5, Math.max(1, Number(payload.stars) || 0));
      const user = clean(payload.user, 24) || 'guest';
      const path = 'data/ratings.json';

      const { doc, sha } = await readJsonFile(env, env.GH_OWNER, ratingsRepo, path);
      const list = (doc.ratings || []).filter((r) => !(r.mapId === mapId && r.user === user));
      list.push({ mapId, user, stars, at: stamp });
      doc.ratings = list;
      doc.version = (doc.version || 1) + 1;
      doc.updatedAt = stamp;

      await writeJsonFile(env, env.GH_OWNER, ratingsRepo, path, doc, sha,
        `rating: ${mapId} → ${stars}★ by ${user}`);
      return json({ ok: true, kind, mapId, stars });
    }

    if (kind === 'comment') {
      const body = clean(payload.body, MAX_BODY);
      if (!body) return json({ ok: false, error: '评论内容为空' }, 400);

      const author = clean(payload.author, 24) || 'guest';
      const starsRaw = payload.stars;
      const stars = starsRaw ? Math.min(5, Math.max(1, Number(starsRaw))) : null;
      const path = 'data/comments.json';

      const { doc, sha } = await readJsonFile(env, env.GH_OWNER, commentsRepo, path);
      const list = doc.comments || [];
      list.push({
        id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        mapId,
        author,
        stars,
        body,
        at: stamp,
        likes: 0,
      });
      doc.comments = list;
      doc.version = (doc.version || 1) + 1;
      doc.updatedAt = stamp;

      await writeJsonFile(env, env.GH_OWNER, commentsRepo, path, doc, sha,
        `comment: ${mapId} by ${author}`);
      return json({ ok: true, kind, mapId });
    }

    return json({ ok: false, error: `未知 kind: ${kind}` }, 400);
  } catch (err) {
    console.error('[submit]', err);
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-submit-secret',
      'Access-Control-Max-Age': '86400',
    },
  });
}
