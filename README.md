# VRC 地图图鉴

VRChat 地图推荐与评分站。纯静态，零构建，直接部署到 **Cloudflare Pages**（或 Workers）。

<p align="center">
  <img alt="部署" src="https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white">
  <img alt="依赖" src="https://img.shields.io/badge/dependencies-0-brightgreen">
  <img alt="许可" src="https://img.shields.io/badge/license-Apache--2.0-blue">
</p>

---

## 三个仓库的分工

| 仓库 | 作用 | 部署 |
| --- | --- | --- |
| **main-vrc**（本仓库） | 站点本体：HTML / CSS / JS | Cloudflare Pages |
| **vrc-map-ratings** | 地图清单 + 用户评分 + 收藏 | 不部署，当数据源 |
| **vrc-map-comments** | 评论数据 | 不部署，当数据源 |

站点通过 `fetch` 读取另外两个仓库里的 JSON。数据改动不需要重新部署本站，刷新即可生效。

```
main-vrc/                     vrc-map-ratings/          vrc-map-comments/
├── public/                   └── data/                 └── data/
│   ├── index.html                ├── maps.json             └── comments.json
│   ├── 404.html                  └── ratings.json
│   ├── _headers
│   ├── _routes.json
│   ├── css/style.css
│   ├── data/           ← 本地副本，首次加载的兜底源
│   │   ├── maps.json
│   │   ├── ratings.json
│   │   └── comments.json
│   ├── js/
│   │   ├── config.js   ← 部署后只需要改这里
│   │   ├── data.js     数据层：加载 / 聚合 / 缓存
│   │   ├── ui.js       视图工具
│   │   ├── app.js      入口 + 哈希路由
│   │   └── pages/
│   │       ├── home.js     发现页
│   │       ├── detail.js   详情页
│   │       ├── board.js    榜单页
│   │       └── mine.js     我的页
│   └── api/submit.js   ← 可选：Pages Function，写入数据仓库
├── wrangler.toml
└── package.json
```

---

## 功能

- **发现页** — 卡片网格、关键字搜索（名称 / 作者 / 简介 / 标签）、平台切换（PC / Quest / Android / iOS）、标签云、四种排序
- **详情页** — 大图、评分分布柱状图、五星打分、评论列表、发表评论、收藏、相似地图推荐
- **榜单页** — 高分榜（贝叶斯平滑）、热门榜、新图榜
- **我的页** — 收藏、我的评分、我的评论、本地数据管理
- **分享链接** — 筛选条件写入 URL，可以直接发给别人
- **亮 / 暗主题** — 跟随系统
- **响应式** — 移动端单列

---

## 部署到 Cloudflare Pages

### 方式一：Git 集成（推荐，改代码自动部署）

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择 `main-vrc` 仓库
3. 构建设置：
   - **Framework preset**: `None`
   - **Build command**: 留空
   - **Build output directory**: `public`
4. **Save and Deploy**

之后每次 push 到 `main` 会自动重新部署。

### 方式二：命令行直传

```bash
npm install
npx wrangler pages deploy public --project-name=vrc-map-site
```

首次会引导你登录 Cloudflare 账号。

### 方式三：Workers（静态资源模式）

`wrangler.toml` 已经配好，直接：

```bash
npx wrangler deploy
```

---

## 部署后要改的地方

打开 `public/js/config.js`，把三个仓库的信息改成你自己的：

```js
export const CONFIG = {
  repos: {
    ratings:  { owner: '你的用户名', repo: 'vrc-map-ratings',  branch: 'main', ... },
    comments: { owner: '你的用户名', repo: 'vrc-map-comments', branch: 'main', ... },
  },

  // 读取方式：
  //   'local'    → 用 public/data/ 下的副本（默认，最快，但数据不会自动更新）
  //   'jsdelivr' → CDN，国内速度好，有缓存
  //   'raw'      → raw.githubusercontent.com 直连
  dataSource: 'local',
};
```

> **建议**：先在 Cloudflare Pages 上用 `dataSource: 'jsdelivr'`，这样在网页上就能直接改数据、刷新即生效。
> 用 `'local'` 则每次改数据都要重新部署。

---

## 数据格式

### vrc-map-ratings / `data/maps.json`

```json
{
  "version": 1,
  "updatedAt": "2026-09-15T00:00:00Z",
  "maps": [
    {
      "id": "the-great-pug",
      "name": "The Great Pug",
      "author": "PugGaming",
      "platform": ["PC", "Quest"],
      "capacity": 0,
      "tags": ["酒馆", "社交", "经典"],
      "thumbnail": "",
      "description": "地图简介",
      "url": "https://vrchat.com/home/world/wrld_xxx",
      "publishedAt": "2020-03-12"
    }
  ]
}
```

- `id` — 唯一标识，出现在链接里（`#/map/the-great-pug`），一经确定不建议修改
- `platform` — 只会匹配 `PLATFORMS` 里列出的值
- `thumbnail` — 留空则显示渐变色占位块；填图片直链即可
- `capacity` — 人数上限，填 `0` 表示不限

### vrc-map-ratings / `data/ratings.json`

```json
{
  "ratings": [
    { "mapId": "the-great-pug", "user": "LigeLoveRosita", "stars": 5, "at": "2026-08-01T12:20:00Z" }
  ],
  "collections": [
    { "user": "LigeLoveRosita", "mapId": "the-great-pug", "at": "2026-08-01T12:21:00Z" }
  ]
}
```

同一个 `mapId` + `user` 只保留最新一条。

### vrc-map-comments / `data/comments.json`

```json
{
  "comments": [
    {
      "id": "c-0001",
      "mapId": "the-great-pug",
      "author": "LigeLoveRosita",
      "stars": 5,
      "body": "评论内容",
      "at": "2026-08-01T12:25:00Z",
      "likes": 12
    }
  ]
}
```

评分平均值由站点实时聚合，**不需要**手工维护平均分字段。

---

## 写入数据的三条路

站点是纯静态的，没有服务器，所以「写」需要选一条路。

### A. 零后端（默认已可用）

用户在「我的」页点 **同步到仓库**，会生成一个预填好 JSON 的 GitHub Issue。
你在数据仓库里建一个 `data-sync` 标签，Issue 到了以后直接复制 JSON 合并进对应文件。

优点：不需要任何密钥，不会被刷。
缺点：需要你人工合并。

### B. Pages Function 直接写入（推荐用于真实运营）

`public/api/submit.js` 已经写好，配置环境变量即可启用。

在 Cloudflare Pages → **Settings** → **Environment variables** 添加：

| 变量 | 说明 |
| --- | --- |
| `GH_TOKEN` | GitHub PAT，只需对两个数据仓库有 **Contents: Read and write** |
| `GH_OWNER` | 仓库所属账号 |
| `RATINGS_REPO` | `vrc-map-ratings` |
| `COMMENTS_REPO` | `vrc-map-comments` |
| `SUBMIT_SECRET` | 可选，设置后前端需带 `x-submit-secret` 头 |

然后把 `config.js` 改成：

```js
api: { enabled: true, base: '' },   // 同域部署留空即可
```

已内置：请求体长度限制、按 IP 的简易限流、字段白名单清洗。

> **注意**：Function 写入同一个 JSON 文件时存在并发覆盖的可能。访问量上来后建议换成
> 「每次提交写一个独立小文件 + 定时任务合并」或改用 D1 数据库。

### C. 直接编辑 JSON

数据量小时最省事：改 `vrc-map-ratings/data/maps.json`，提交，刷新页面。

---

## 本地开发

```bash
# 用 wrangler（能跑 Pages Functions）
npm install
npm run dev

# 或者只要静态预览
python -m http.server 8777 --directory public
```

`python -m http.server` 不会执行 `public/api/submit.js`，所以本地测试写入请用 `npm run dev`。

---

## 许可

Apache-2.0
