/* ============================================================
 * 视图工具：DOM、格式化、星级、缩略图回退
 * ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 转义，所有用户内容必须经过它 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 星级：支持小数显示 */
export function stars(value, { size = 14, showValue = false } = {}) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  let html = '<span class="stars" aria-label="' + v.toFixed(1) + ' 分">';
  for (let i = 1; i <= 5; i++) {
    const fill = Math.max(0, Math.min(1, v - (i - 1)));
    html += `<span class="star" style="--size:${size}px;--fill:${(fill * 100).toFixed(0)}%">★</span>`;
  }
  html += '</span>';
  if (showValue && v > 0) html += `<span class="rating-num">${v.toFixed(1)}</span>`;
  return html;
}

const GRADIENTS = [
  ['#6d8cff', '#9d6dff'],
  ['#ff8f6d', '#ff5f8f'],
  ['#4fc3a1', '#3aa6d8'],
  ['#f7b955', '#ef6c4d'],
  ['#8f7bff', '#4ea8ff'],
  ['#ff6d9d', '#b76dff'],
];

export function gradientFor(id = '') {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function initials(name = '') {
  const s = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (!s) return 'VRC';
  const parts = s.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

/**
 * 缩略图：有 thumbnail 就用图片，否则用渐变 + 名字占位。
 * 地图 URL 字段若为图片也一并支持。
 */
export function thumbHtml(map, { ratio = '16 / 9' } = {}) {
  const src = (map.thumbnail || '').trim();
  const label = esc(initials(map.name));
  const bg = gradientFor(map.id || map.name);

  if (src) {
    return `<div class="thumb" style="aspect-ratio:${ratio}">
      <img src="${esc(src)}" alt="${esc(map.name)}" loading="lazy"
           onerror="this.closest('.thumb').classList.add('thumb--fallback')">
      <span class="thumb-fallback" style="background:${bg}">${label}</span>
    </div>`;
  }
  return `<div class="thumb thumb--fallback" style="aspect-ratio:${ratio}">
    <span class="thumb-fallback" style="background:${bg}">${label}</span>
  </div>`;
}

export function platformBadges(platforms = []) {
  return platforms
    .map((p) => `<span class="badge badge--${esc(String(p).toLowerCase())}">${esc(p)}</span>`)
    .join('');
}

export function toast(msg, type = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast toast--${type} is-open`;
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-open'), 2600);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 「当前用户」——没有登录系统，用本地昵称代替 */
const USER_KEY = 'vrcmaps.user';
export function currentUser() {
  return localStorage.getItem(USER_KEY) || 'guest';
}
export function setCurrentUser(name) {
  const n = String(name || '').trim();
  if (n) localStorage.setItem(USER_KEY, n.slice(0, 24));
  else localStorage.removeItem(USER_KEY);
}
