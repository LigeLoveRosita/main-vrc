/* ============================================================
 * 站点配置 —— 部署后基本只需要改这一个文件
 * ============================================================ */

export const CONFIG = {
  /* ------------------------------------------------------------
   * 三个仓库的地址
   * fork 或换账号时改这里，其余代码不用动
   * ------------------------------------------------------------ */
  repos: {
    // 推荐 + 评分（数据仓库，不部署）
    ratings: {
      owner: 'LigeLoveRosita',
      repo: 'vrc-map-ratings',
      branch: 'main',
      baseDir: 'data',
      mapsFile: 'maps.json',
      ratingsFile: 'ratings.json',
    },
    // 评论（数据仓库，不部署）
    comments: {
      owner: 'LigeLoveRosita',
      repo: 'vrc-map-comments',
      branch: 'main',
      baseDir: 'data',
      commentsFile: 'comments.json',
    },
  },

  /* 站点本体仓库（页脚链接、投稿 Issue 用） */
  siteRepo: { owner: 'LigeLoveRosita', repo: 'main-vrc' },

  /* ------------------------------------------------------------
   * 数据读取方式
   *   'local'    本地 public/data/ 下的副本
   *              — 最快，但改数据要重新部署
   *   'jsdelivr' jsDelivr CDN
   *              — 推荐，国内速度好，改数据刷新即生效
   *   'raw'      raw.githubusercontent.com 直连
   *              — 会跟随 CDN 缓存，更新有延迟
   * ------------------------------------------------------------ */
  dataSource: 'local',

  /* ------------------------------------------------------------
   * 可选后端（Cloudflare Pages Functions / Workers）
   * 开启前请先配好 GH_TOKEN 环境变量，见 README
   * ------------------------------------------------------------ */
  api: {
    enabled: false, // 改为 true 后，评分/评论会直接写进数据仓库
    base: '',       // 与站点同域部署就留空
  },

  /* 站点文案 */
  siteName: 'VRC 地图图鉴',
  tagline: '社区驱动的地图推荐',
};

/* 支持的平台 —— 与数据里的 platform 字段对应 */
export const PLATFORMS = ['PC', 'Quest', 'Android', 'iOS'];

/* 排序方式 */
export const SORT_OPTIONS = [
  { key: 'rating', label: '按评分' },
  { key: 'popular', label: '按热度' },
  { key: 'newest', label: '按发布时间' },
  { key: 'name', label: '按名称' },
];

/* ---------------- 以下为内部辅助，一般不用改 ---------------- */

/** 拼出数据文件的读取地址 */
export function dataUrl(kind, file) {
  const r = CONFIG.repos[kind];
  if (!r) throw new Error(`未知数据源: ${kind}`);

  const path = [r.baseDir, file].filter(Boolean).join('/');

  switch (CONFIG.dataSource) {
    case 'local':
      return `/data/${file}`;
    case 'jsdelivr':
      return `https://cdn.jsdelivr.net/gh/${r.owner}/${r.repo}@${r.branch}/${path}`;
    case 'raw':
      return `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${r.branch}/${path}`;
    default:
      throw new Error(`未知 dataSource: ${CONFIG.dataSource}`);
  }
}

/** 生成数据仓库的 Issue 链接（投稿 / 数据同步用） */
export function issueUrl(kind, { title, body, labels = [] }) {
  const r = CONFIG.repos[kind] || CONFIG.siteRepo;
  const p = new URLSearchParams({ title, body });
  if (labels.length) p.set('labels', labels.join(','));
  return `https://github.com/${r.owner}/${r.repo}/issues/new?${p}`;
}
