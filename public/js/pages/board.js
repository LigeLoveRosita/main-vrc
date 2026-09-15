/* ============================================================
 * 榜单页：高分榜 / 热门榜 / 新图榜
 * ============================================================ */

import { esc, stars, thumbHtml, platformBadges } from '../ui.js';

function rankRow(m, i) {
  return `<a class="rank-row" href="#/map/${encodeURIComponent(m.id)}">
    <span class="rank-row__n${i < 3 ? ' rank-row__n--top' : ''}">${i + 1}</span>
    <span>
      <span class="rank-row__title">${esc(m.name)}</span>
      <span class="rank-row__sub" style="display:block">
        by ${esc(m.author || '未知')} · ${platformBadges(m.platform)}
      </span>
    </span>
    <span style="text-align:right">
      ${stars(m.ratingAvg, { size: 12, showValue: true })}
      <span class="rank-row__sub" style="display:block">
        ${m.ratingCount} 人评 · ${m.commentCount} 评论
      </span>
    </span>
  </a>`;
}

function podiumCard(label, m) {
  if (!m) return '';
  return `<a class="podium__card" href="#/map/${encodeURIComponent(m.id)}">
    <span class="podium__rank">${esc(label)}</span>
    ${thumbHtml(m, { ratio: '16 / 9' })}
    <h3 style="font-size:16px;margin:12px 0 5px">${esc(m.name)}</h3>
    <div class="card__meta">
      ${stars(m.ratingAvg, { size: 13, showValue: true })}
      <span class="card__meta-item">${m.ratingCount} 人评</span>
    </div>
  </a>`;
}

export function renderBoard(root, data) {
  const rated = data.maps.filter((m) => m.ratingCount > 0);

  // 综合分：贝叶斯平滑，避免 1 个 5 星就登顶
  const prior = 4.0, priorWeight = 3;
  const weighted = (m) =>
    (m.ratingAvg * m.ratingCount + prior * priorWeight) / (m.ratingCount + priorWeight);

  const topRated = [...rated].sort((a, b) => weighted(b) - weighted(a)).slice(0, 20);
  const popular = [...data.maps]
    .sort((a, b) => b.ratingCount + b.commentCount * 2 - (a.ratingCount + a.commentCount * 2))
    .slice(0, 20);
  const newest = [...data.maps]
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, 20);

  root.innerHTML = `<div class="wrap" style="padding-bottom:70px">
    <section class="hero" style="padding-bottom:8px">
      <h1 class="hero__title">榜单</h1>
      <p class="hero__sub">高分榜采用贝叶斯平滑，评分人数少的地图不会因为一两个满分就冲上来。</p>
    </section>

    <section class="podium">
      ${podiumCard('高分 · 第 1', topRated[0])}
      ${podiumCard('最热 · 第 1', popular[0])}
      ${podiumCard('最新 · 第 1', newest[0])}
    </section>

    <nav class="tabs" id="boardTabs">
      <button data-k="rated" class="is-active">高分榜</button>
      <button data-k="popular">热门榜</button>
      <button data-k="newest">新图榜</button>
    </nav>
    <div id="boardPanel"></div>
  </div>`;

  const lists = { rated: topRated, popular, newest };

  function paint(key) {
    const list = lists[key];
    const panel = root.querySelector('#boardPanel');
    panel.innerHTML = list.length
      ? list.map(rankRow).join('')
      : `<div class="empty"><div class="empty__mark">◇</div><p>暂无数据。</p></div>`;
  }

  root.querySelector('#boardTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-k]');
    if (!btn) return;
    root.querySelectorAll('#boardTabs button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paint(btn.dataset.k);
  });

  paint('rated');
}
