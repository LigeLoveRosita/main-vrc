/* ============================================================
 * 详情页：大图 / 评分分布 / 打分 / 评论 / 标签页
 * ============================================================ */

import { CONFIG, issueUrl } from '../config.js';
import {
  loadAll, invalidate, saveLocalRating, saveLocalComment,
  toggleLocalCollect, localCollections, ratingBuckets,
} from '../data.js';
import {
  $, $$, esc, stars, fmtDate, thumbHtml, platformBadges,
  currentUser, toast,
} from '../ui.js';

export function renderDetail(root, data, mapId) {
  const map = data.maps.find((m) => m.id === mapId);
  if (!map) {
    root.innerHTML = `<div class="wrap" style="padding:60px 20px 80px">
      <div class="empty">
        <div class="empty__mark">◇</div>
        <p><strong>找不到这张地图</strong></p>
        <p style="font-size:13.5px">它可能已被移除，或者链接有误。</p>
        <p style="margin-top:16px"><a class="btn" href="#/">返回发现页</a></p>
      </div>
    </div>`;
    return;
  }

  const user = currentUser();
  const myRatings = data.ratings.filter((r) => r.mapId === mapId);
  const myRating = myRatings.find((r) => r.user === user);
  const comments = data.comments
    .filter((c) => c.mapId === mapId)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const buckets = ratingBuckets(data.ratings, mapId);
  const collected = localCollections(user).includes(mapId);
  const maxBucket = Math.max(1, ...buckets);

  const related = data.maps
    .filter((m) => m.id !== mapId && (m.tags || []).some((t) => (map.tags || []).includes(t)))
    .sort((a, b) => b.ratingAvg - a.ratingAvg)
    .slice(0, 4);

  root.innerHTML = `<div class="wrap detail">
    <p style="margin:0 0 16px"><a href="#/" style="font-size:13.5px">← 返回发现页</a></p>

    <div class="detail__hero">
      <div>
        <div class="detail__thumb">${thumbHtml(map, { ratio: '16 / 9' })}</div>
        <p class="detail__desc">${esc(map.description || '暂无简介。')}</p>
      </div>

      <div>
        <h1 class="detail__title">${esc(map.name)}</h1>
        <div class="detail__author">作者 ${esc(map.author || '未知')}${
          map.publishedAt ? ` · 发布于 ${esc(map.publishedAt)}` : ''
        }</div>
        <div class="badge-row" style="margin-bottom:16px">${platformBadges(map.platform)}</div>
        <div class="badge-row" style="margin-bottom:16px">
          ${(map.tags || []).map((t) => `<a class="badge" href="#/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
        </div>

        <div class="scorebox">
          <div class="scorebox__big">
            <div class="scorebox__num">${map.ratingAvg ? map.ratingAvg.toFixed(1) : '—'}<span>/5</span></div>
            <div>
              ${stars(map.ratingAvg, { size: 18 })}
              <div class="rating-count">${map.ratingCount} 人评分 · ${map.commentCount} 条评论</div>
            </div>
          </div>

          <div class="bars">
            ${[5, 4, 3, 2, 1].map((s) => {
              const n = buckets[s - 1];
              const pct = (n / maxBucket) * 100;
              return `<div class="bar-row">
                <span>${s} 星</span>
                <span class="bar"><span class="bar__fill" style="width:${pct}%"></span></span>
                <span>${n}</span>
              </div>`;
            }).join('')}
          </div>

          <div class="ratebox">
            <div class="ratebox__label">
              ${myRating ? `你打了 ${myRating.stars} 星，可以改` : '给它打个分'}
            </div>
            <div class="star-picker" id="picker">
              ${[1, 2, 3, 4, 5].map((s) => `<button type="button" data-s="${s}" class="${myRating && s <= myRating.stars ? 'is-on' : ''}">★</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="detail__actions">
          <button class="btn ${collected ? 'btn--primary' : ''}" id="collectBtn">
            ${collected ? '★ 已收藏' : '☆ 收藏'}
          </button>
          <a class="btn" href="${esc(map.url || '#')}" target="_blank" rel="noopener">在 VRChat 打开 ↗</a>
          <button class="btn btn--ghost" id="toclip">复制链接</button>
        </div>
      </div>
    </div>

    <nav class="tabs" id="tabs">
      <button data-tab="comments" class="is-active">评论 ${comments.length}</button>
      <button data-tab="ratings">评分 ${myRatings.length}</button>
      ${related.length ? '<button data-tab="related">相似地图</button>' : ''}
    </nav>

    <div class="tab-panel" id="panel"></div>
  </div>`;

  /* ---------------- 打分 ---------------- */
  $('#picker').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-s]');
    if (!btn) return;
    const value = Number(btn.dataset.s);

    saveLocalRating({ mapId, user, stars: value });
    submitRemotely({ kind: 'rating', mapId, user, stars: value });
    toast(`已记录 ${value} 星`);
    rerender();
  });

  /* ---------------- 收藏 ---------------- */
  $('#collectBtn').addEventListener('click', () => {
    const now = toggleLocalCollect({ mapId, user });
    toast(now ? '已加入收藏' : '已取消收藏');
    rerender();
  });

  /* ---------------- 复制 ---------------- */
  $('#toclip').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/map/${map.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('链接已复制');
    } catch {
      toast('复制失败，请手动复制地址栏', 'err');
    }
  });

  /* ---------------- 标签页 ---------------- */
  let activeTab = 'comments';
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paintPanel();
  });

  function commentFormHtml() {
    return `<form class="comment-form" id="cform">
      <div class="form-row">
        <label class="field">
          <span class="field__label">昵称</span>
          <input type="text" name="author" maxlength="24" required
                 value="${esc(user === 'guest' ? '' : user)}" placeholder="你的昵称">
        </label>
        <label class="field" style="flex:0 0 130px">
          <span class="field__label">评分（可选）</span>
          <input type="number" name="stars" min="1" max="5" step="1" placeholder="1-5">
        </label>
      </div>
      <label class="field">
        <span class="field__label">评论</span>
        <textarea name="body" rows="3" maxlength="600" required
                  placeholder="说点什么：值不值得去、什么时间去最好、有什么坑…"></textarea>
      </label>
      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button class="btn btn--primary" type="submit">发表评论</button>
        <span style="font-size:12.5px;color:var(--text-3)">
          没有后端，评论先存入本地；点「同步到仓库」可提交为 GitHub Issue 由维护者合并。
        </span>
      </div>
    </form>`;
  }

  function paintPanel() {
    const panel = $('#panel');

    if (activeTab === 'comments') {
      panel.innerHTML = commentFormHtml() + (comments.length
        ? comments.map((c) => `<article class="comment">
            <div class="comment__head">
              <span class="comment__author">${esc(c.author || '匿名')}</span>
              ${c.stars ? stars(c.stars, { size: 12 }) : ''}
              <span class="comment__time">${fmtDate(c.at)}</span>
              ${c._local ? '<span class="local-flag">本地未同步</span>' : ''}
            </div>
            <p class="comment__body">${esc(c.body || '')}</p>
            <div class="comment__foot"><span>♡ ${c.likes || 0}</span></div>
          </article>`).join('')
        : `<div class="empty"><div class="empty__mark">◇</div><p>还没有评论，来当第一个。</p></div>`);

      $('#cform').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = String(fd.get('body') || '').trim();
        if (!body) return toast('评论内容不能为空', 'err');

        const author = String(fd.get('author') || '').trim() || 'guest';
        const starsRaw = String(fd.get('stars') || '').trim();
        const starVal = starsRaw ? Math.min(5, Math.max(1, Number(starsRaw))) : null;

        saveLocalComment({ mapId, author, stars: starVal, body });
        if (starVal) saveLocalRating({ mapId, user: author, stars: starVal });

        submitRemotely({ kind: 'comment', mapId, author, stars: starVal, body });
        toast('评论已发布（本地）');
        rerender();
      });

    } else if (activeTab === 'ratings') {
      panel.innerHTML = myRatings.length
        ? myRatings
            .sort((a, b) => Number(b.stars) - Number(a.stars))
            .map((r) => `<div class="rank-row">
              <span class="rank-row__n">${Number(r.stars)}</span>
              <span>
                <span class="rank-row__title">${esc(r.user || '匿名')}</span>
              </span>
              <span class="rank-row__sub">${fmtDate(r.at)}</span>
            </div>`)
            .join('')
        : `<div class="empty"><div class="empty__mark">◇</div><p>还没有人评分。</p></div>`;

    } else {
      panel.innerHTML = `<div class="grid">${related.map((m) => `
        <a class="card" href="#/map/${encodeURIComponent(m.id)}">
          ${thumbHtml(m)}
          <div class="card__body">
            <h3 class="card__title">${esc(m.name)}</h3>
            <div class="card__meta">${stars(m.ratingAvg, { size: 13, showValue: true })}</div>
          </div>
        </a>`).join('')}</div>`;
    }
  }

  /** 远端写入：未启用后端时，退化为「生成 GitHub Issue」入口 */
  function submitRemotely(payload) {
    if (!CONFIG.api.enabled) return;

    fetch(`${CONFIG.api.base}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      toast('已同步到仓库');
      invalidate();
    }).catch((err) => {
      console.warn('[submit] 失败', err);
      toast('同步失败，已保留在本地', 'err');
    });
  }

  async function rerender() {
    invalidate();
    const fresh = await loadAll();
    renderDetail(root, fresh, mapId);
  }

  paintPanel();
}
