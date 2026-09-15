/* ============================================================
 * 数据层
 * - 从三个仓库的 JSON 读取
 * - 聚合评分 / 评论数 / 收藏数
 * - 带内存缓存与 localStorage 本地覆盖（用户自己打的分先本地生效）
 * ============================================================ */

import { CONFIG, dataUrl } from './config.js';

const CACHE_KEY = 'vrcmaps.cache.v1';
const LOCAL_OVERRIDE_KEY = 'vrcmaps.local.v1';
const CACHE_TTL = 5 * 60 * 1000;

let memory = null;

function readLocalOverride() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_OVERRIDE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalOverride(v) {
  try {
    localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(v));
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** 带降级：优先远端，失败回落到本地 /data/ 副本与浏览器缓存 */
async function loadFile(kind, file, fallbackName) {
  const candidates = [dataUrl(kind, file)];
  if (CONFIG.dataSource !== 'local') candidates.push(`/data/${fallbackName}`);

  for (const url of candidates) {
    try {
      return await fetchJson(url);
    } catch (err) {
      console.warn('[data] 读取失败，尝试下一个源:', url, err.message);
    }
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached[fallbackName]) {
      console.warn('[data] 使用浏览器缓存:', fallbackName);
      return cached[fallbackName];
    }
  } catch {
    /* ignore */
  }

  throw new Error(`无法加载 ${fallbackName}`);
}

/** 加载并聚合全部数据 */
export async function loadAll() {
  if (memory) return memory;

  const [mapsDoc, ratingsDoc, commentsDoc] = await Promise.all([
    loadFile('ratings', CONFIG.repos.ratings.mapsFile, 'maps.json'),
    loadFile('ratings', CONFIG.repos.ratings.ratingsFile, 'ratings.json'),
    loadFile('comments', CONFIG.repos.comments.commentsFile, 'comments.json'),
  ]);

  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        at: Date.now(),
        'maps.json': mapsDoc,
        'ratings.json': ratingsDoc,
        'comments.json': commentsDoc,
      }),
    );
  } catch {
    /* ignore */
  }

  const ov = readLocalOverride();

  const ratings = [...(ratingsDoc.ratings || []), ...(ov.ratings || [])];
  const comments = [...(commentsDoc.comments || []), ...(ov.comments || [])];
  const collections = [...(ratingsDoc.collections || []), ...(ov.collections || [])];

  const maps = (mapsDoc.maps || []).map((m) => {
    const mine = ratings.filter((r) => r.mapId === m.id);
    const sum = mine.reduce((a, r) => a + Number(r.stars || 0), 0);
    const myComments = comments.filter((c) => c.mapId === m.id);

    return {
      ...m,
      ratingCount: mine.length,
      ratingAvg: mine.length ? Math.round((sum / mine.length) * 10) / 10 : 0,
      commentCount: myComments.length,
      collectCount: collections.filter((c) => c.mapId === m.id).length,
      latestCommentAt: myComments.length
        ? myComments.map((c) => c.at).sort().at(-1)
        : null,
    };
  });

  memory = { maps, ratings, comments, collections, updatedAt: mapsDoc.updatedAt };
  return memory;
}

export function invalidate() {
  memory = null;
}

/* ---------------- 本地立即生效的写入（离线/未配置后端时） ---------------- */

export function saveLocalRating({ mapId, user, stars }) {
  const ov = readLocalOverride();
  ov.ratings = (ov.ratings || []).filter((r) => !(r.mapId === mapId && r.user === user));
  ov.ratings.push({ mapId, user, stars, at: new Date().toISOString(), _local: true });
  writeLocalOverride(ov);
  invalidate();
}

export function saveLocalComment({ mapId, author, stars, body }) {
  const ov = readLocalOverride();
  ov.comments = ov.comments || [];
  ov.comments.push({
    id: `local-${Date.now()}`,
    mapId,
    author,
    stars,
    body,
    at: new Date().toISOString(),
    likes: 0,
    _local: true,
  });
  writeLocalOverride(ov);
  invalidate();
}

export function toggleLocalCollect({ mapId, user }) {
  const ov = readLocalOverride();
  ov.collections = ov.collections || [];
  const idx = ov.collections.findIndex((c) => c.mapId === mapId && c.user === user);
  let collected;
  if (idx >= 0) {
    ov.collections.splice(idx, 1);
    collected = false;
  } else {
    ov.collections.push({ mapId, user, at: new Date().toISOString(), _local: true });
    collected = true;
  }
  writeLocalOverride(ov);
  invalidate();
  return collected;
}

export function localCollections(user) {
  const ov = readLocalOverride();
  return (ov.collections || []).filter((c) => c.user === user).map((c) => c.mapId);
}

/** 统计我的本地贡献，用于「待提交」提示 */
export function pendingLocal() {
  const ov = readLocalOverride();
  return {
    ratings: (ov.ratings || []).filter((r) => r._local).length,
    comments: (ov.comments || []).filter((c) => c._local).length,
  };
}

export function clearLocal() {
  localStorage.removeItem(LOCAL_OVERRIDE_KEY);
  invalidate();
}

/* ---------------- 聚合工具 ---------------- */

export function allTags(maps) {
  const set = new Map();
  maps.forEach((m) => (m.tags || []).forEach((t) => set.set(t, (set.get(t) || 0) + 1)));
  return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ tag: t, count: n }));
}

export function ratingBuckets(ratings, mapId) {
  const buckets = [0, 0, 0, 0, 0]; // index 0 => 1 星
  ratings
    .filter((r) => r.mapId === mapId)
    .forEach((r) => {
      const i = Math.min(5, Math.max(1, Math.round(Number(r.stars)))) - 1;
      buckets[i] += 1;
    });
  return buckets;
}
