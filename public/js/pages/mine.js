/* ============================================================
 * 我的页：收藏 / 我的评分 / 我的评论 / 本地数据同步
 * ============================================================ */

import { CONFIG, issueUrl } from '../config.js';
import { localCollections, pendingLocal, clearLocal, invalidate } from '../data.js';
import {
  $, esc, stars, fmtDate, thumbHtml, currentUser, toast,
} from '../ui.js';

export function renderMine(root, data) {
  const user = currentUser();
  const isGuest = user === 'guest';

  const collectedIds = localCollections(user);
  const collected = data.maps.filter((m) => collectedIds.includes(m.id));
  const myRatings = data.ratings.filter((r) => r.user === user);
  const myComments = data.comments.filter((c) => c.author === user);
  const pending = pendingLocal();

  root.innerHTML = `<div class="wrap" style="padding-bottom:70px">
    <section class="hero">
      <h1 class="hero__title">${isGuest ? '我的' : esc(user)}</h1>
      <p class="hero__sub">
        ${isGuest
          ? '还没设置昵称。点右上角设置一个，你的评分和评论就会归到你名下。'
          : '这里汇总你的收藏、评分和评论。'}
      </p>
      <div class="hero__stats">
        <div class="stat"><span class="stat__num">${collected.length}</span><span class="stat__label">收藏</span></div>
        <div class="stat"><span class="stat__num">${myRatings.length}</span><span class="stat__label">评分</span></div>
        <div class="stat"><span class="stat__num">${myComments.length}</span><span class="stat__label">评论</span></div>
      </div>
    </section>

    <h2 class="section-title">收藏的地图</h2>
    ${collected.length
      ? `<div class="grid">${collected.map((m) => `
          <a class="card" href="#/map/${encodeURIComponent(m.id)}">
            ${thumbHtml(m)}
            <div class="card__body">
              <h3 class="card__title">${esc(m.name)}</h3>
              <p class="card__desc">${esc(m.description || '')}</p>
              <div class="card__meta">${stars(m.ratingAvg, { size: 13, showValue: true })}</div>
            </div>
          </a>`).join('')}</div>`
      : `<div class="empty"><div class="empty__mark">◇</div><p>还没有收藏。在地图详情页点「收藏」。</p></div>`}

    <h2 class="section-title">我的评分</h2>
    ${myRatings.length
      ? [...myRatings].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((r) => {
          const m = data.maps.find((x) => x.id === r.mapId);
          return `<div class="rank-row">
            <span class="rank-row__n">${Number(r.stars)}</span>
            <span>
              <span class="rank-row__title">${esc(m ? m.name : r.mapId)}</span>
              <span class="rank-row__sub" style="display:block">${fmtDate(r.at)}${r._local ? ' · 本地未同步' : ''}</span>
            </span>
            <span><a class="btn btn--sm btn--ghost" href="#/map/${encodeURIComponent(r.mapId)}">查看</a></span>
          </div>`;
        }).join('')
      : `<div class="empty" style="margin-bottom:20px"><div class="empty__mark">◇</div><p>还没有评分。</p></div>`}

    <h2 class="section-title">我的评论</h2>
    ${myComments.length
      ? [...myComments].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((c) => {
          const m = data.maps.find((x) => x.id === c.mapId);
          return `<article class="comment">
            <div class="comment__head">
              <a class="comment__author" href="#/map/${encodeURIComponent(c.mapId)}">${esc(m ? m.name : c.mapId)}</a>
              ${c.stars ? stars(c.stars, { size: 12 }) : ''}
              <span class="comment__time">${fmtDate(c.at)}</span>
              ${c._local ? '<span class="local-flag">本地未同步</span>' : ''}
            </div>
            <p class="comment__body">${esc(c.body || '')}</p>
          </article>`;
        }).join('')
      : `<div class="empty" style="margin-bottom:20px"><div class="empty__mark">◇</div><p>还没有评论。</p></div>`}

    <h2 class="section-title">数据</h2>
    <div class="scorebox">
      <p style="margin:0 0 14px;font-size:13.5px;color:var(--text-2)">
        本站是纯静态站点，你的评分和评论先保存在浏览器本地。
        ${pending.ratings + pending.comments > 0
          ? `当前有 <strong>${pending.ratings} 条评分、${pending.comments} 条评论</strong> 待同步到仓库。`
          : '当前没有待同步的内容。'}
      </p>
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <a class="btn" id="issueSync" target="_blank" rel="noopener">同步到仓库（提交 Issue）</a>
        <button class="btn btn--ghost" id="clearLocal">清空本地数据</button>
      </div>
    </div>
  </div>`;

  // 生成一个包含全部本地内容的 Issue，交给维护者合并进数据仓库
  const payload = {
    user,
    ratings: data.ratings.filter((r) => r._local),
    comments: data.comments.filter((c) => c._local),
    collections: data.collections.filter((c) => c._local),
  };
  $('#issueSync').href = issueUrl('comments', {
    title: `[数据同步] ${user} 的评分与评论`,
    body: [
      '以下内容由站点生成，合并进数据仓库后即可公开可见。',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
    ].join('\n'),
    labels: ['data-sync'],
  });

  $('#clearLocal').addEventListener('click', () => {
    if (!confirm('将清空浏览器里保存的评分、评论和收藏，确定？')) return;
    clearLocal();
    invalidate();
    toast('本地数据已清空');
    renderMine(root, data);
  });
}
