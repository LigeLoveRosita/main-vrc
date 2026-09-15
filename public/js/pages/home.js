/* ============================================================
 * 首页：搜索 / 筛选 / 排序 / 卡片网格
 * ============================================================ */

import { CONFIG, PLATFORMS, SORT_OPTIONS, issueUrl } from '../config.js';
import { allTags, localCollections } from '../data.js';
import {
  $, $$, esc, stars, thumbHtml, platformBadges, debounce, currentUser,
} from '../ui.js';

/** 从 URL query 恢复筛选状态（可分享的链接） */
function readState() {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  return {
    q: p.get('q') || '',
    platform: p.get('platform') || 'ALL',
    tag: p.get('tag') || '',
    sort: p.get('sort') || 'rating',
  };
}

function writeState(s) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.platform && s.platform !== 'ALL') p.set('platform', s.platform);
  if (s.tag) p.set('tag', s.tag);
  if (s.sort && s.sort !== 'rating') p.set('sort', s.sort);
  const qs = p.toString();
  history.replaceState(null, '', `#/${qs ? '?' + qs : ''}`);
}

function filterMaps(maps, s) {
  let list = maps.slice();

  if (s.platform !== 'ALL') {
    list = list.filter((m) => (m.platform || []).includes(s.platform));
  }
  if (s.tag) {
    list = list.filter((m) => (m.tags || []).includes(s.tag));
  }
  if (s.q) {
    const q = s.q.toLowerCase();
    list = list.filter((m) =>
      [m.name, m.author, m.description, ...(m.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  const by = {
    rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
    popular: (a, b) => b.ratingCount - a.ratingCount || b.commentCount - a.commentCount,
    newest: (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'),
  };
  return list.sort(by[s.sort] || by.rating);
}

function cardHtml(m) {
  return `<a class="card" href="#/map/${encodeURIComponent(m.id)}">
    ${thumbHtml(m)}
    <div class="card__body">
      <div>
        <h3 class="card__title">${esc(m.name)}</h3>
        <div class="card__author">by ${esc(m.author || '未知作者')}</div>
      </div>
      <p class="card__desc">${esc(m.description || '暂无简介')}</p>
      <div class="badge-row">${platformBadges(m.platform)}</div>
      <div class="card__meta">
        ${stars(m.ratingAvg, { size: 13, showValue: true })}
        <span class="card__meta-item">${m.ratingCount} 人评</span>
        <span class="card__meta-item">${m.commentCount} 评论</span>
      </div>
    </div>
  </a>`;
}

export function renderHome(root, data) {
  const state = readState();
  const tags = allTags(data.maps);
  const collected = new Set(localCollections(currentUser()));

  const totalRatings = data.ratings.length;
  const avgAll = data.maps.length
    ? (data.maps.reduce((a, m) => a + m.ratingAvg, 0) / data.maps.filter((m) => m.ratingCount).length || 0).toFixed(1)
    : '0.0';

  root.innerHTML = `<div class="wrap">
    <section class="hero">
      <h1 class="hero__title">把好图找出来</h1>
      <p class="hero__sub">${CONFIG.tagline} · 社区推荐与评分，按平台和标签筛，看真实评价再决定去哪。</p>
      <div class="hero__stats">
        <div class="stat"><span class="stat__num">${data.maps.length}</span><span class="stat__label">收录地图</span></div>
        <div class="stat"><span class="stat__num">${totalRatings}</span><span class="stat__label">评分记录</span></div>
        <div class="stat"><span class="stat__num">${data.comments.length}</span><span class="stat__label">评论</span></div>
        <div class="stat"><span class="stat__num">${avgAll}</span><span class="stat__label">平均分</span></div>
      </div>
    </section>

    <section class="toolbar">
      <div class="search">
        <span class="search__icon">⌕</span>
        <input type="text" id="q" placeholder="搜索地图名、作者、标签…" value="${esc(state.q)}" autocomplete="off">
      </div>
      <div class="segmented" id="platformSeg">
        <button data-p="ALL" class="${state.platform === 'ALL' ? 'is-active' : ''}">全部平台</button>
        ${PLATFORMS.map((p) => `<button data-p="${p}" class="${state.platform === p ? 'is-active' : ''}">${p}</button>`).join('')}
      </div>
      <select class="control" id="sort">
        ${SORT_OPTIONS.map((o) => `<option value="${o.key}"${state.sort === o.key ? ' selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <a class="btn" id="submitBtn" target="_blank" rel="noopener">投稿地图</a>
    </section>

    <section class="tagbar" id="tagbar">
      <button class="tag-pill ${state.tag ? '' : 'is-active'}" data-tag="">全部标签</button>
      ${tags.map((t) => `<button class="tag-pill ${state.tag === t.tag ? 'is-active' : ''}" data-tag="${esc(t.tag)}">${esc(t.tag)}<span class="tag-pill__n">${t.count}</span></button>`).join('')}
    </section>

    <section class="grid" id="grid"></section>
  </div>`;

  const grid = $('#grid');
  const tagbar = $('#tagbar');

  function paint() {
    const list = filterMaps(data.maps, state);
    writeState(state);

    if (!list.length) {
      grid.style.display = 'block';
      grid.innerHTML = `<div class="empty">
        <div class="empty__mark">◇</div>
        <p><strong>没有匹配的地图</strong></p>
        <p style="font-size:13.5px">试试放宽筛选条件，或者直接投稿一个。</p>
      </div>`;
      return;
    }
    grid.style.display = 'grid';
    grid.innerHTML = list.map(cardHtml).join('');
  }

  // 搜索（防抖）
  $('#q').addEventListener('input', debounce((e) => {
    state.q = e.target.value.trim();
    paint();
  }, 220));

  // 平台
  $('#platformSeg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-p]');
    if (!btn) return;
    state.platform = btn.dataset.p;
    $$('#platformSeg button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paint();
  });

  // 排序
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    paint();
  });

  // 标签
  tagbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tag]');
    if (!btn) return;
    state.tag = btn.dataset.tag;
    $$('#tagbar button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paint();
  });

  // 投稿 -> 该仓库的 Issue，不需要后端
  const body = [
    '### 地图名称',
    '',
    '### 作者 / 世界 ID',
    '',
    '### 平台',
    '- [ ] PC',
    '- [ ] Quest',
    '',
    '### 标签',
    '',
    '### 简介',
    '',
    '### 世界链接',
    '',
  ].join('\n');
  $('#submitBtn').href = issueUrl('ratings', {
    title: '[投稿] 地图名称',
    body,
    labels: ['submission'],
  });

  paint();
}
