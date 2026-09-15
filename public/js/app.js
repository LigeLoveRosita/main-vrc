/* ============================================================
 * 应用入口：路由 + 页面切换
 * 纯前端哈希路由，兼容 Cloudflare Pages 静态托管
 * ============================================================ */

import { CONFIG } from './config.js';
import { loadAll, invalidate } from './data.js';
import { $, currentUser, setCurrentUser, toast } from './ui.js';
import { renderHome } from './pages/home.js';
import { renderDetail } from './pages/detail.js';
import { renderBoard } from './pages/board.js';
import { renderMine } from './pages/mine.js';

const NAV = [
  { hash: '#/', label: '发现' },
  { hash: '#/board', label: '榜单' },
  { hash: '#/mine', label: '我的' },
];

/* ---------------- 全局样式注入点 ---------------- */
const app = $('#app');

/* ---------------- 昵称 ---------------- */
function syncUser() {
  const u = currentUser();
  const isGuest = u === 'guest';
  $('#userName').textContent = isGuest ? '未设置昵称' : u;
  $('#userDot').textContent = (isGuest ? 'G' : u[0] || 'G').toUpperCase();
  document.body.dataset.user = u;
}

function openUserModal() {
  if ($('.modal-mask')) return;
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>设置昵称</h3>
      <p class="modal__sub">用于标记你提交的评分和评论。不做账号校验，纯粹是显示名。</p>
      <label class="field">
        <span class="field__label">昵称</span>
        <input type="text" id="nickInput" maxlength="24" placeholder="例如 VRC 里的名字"
               value="${currentUser() === 'guest' ? '' : currentUser()}">
      </label>
      <div class="modal__foot">
        <button class="btn btn--ghost" id="nickCancel">取消</button>
        <button class="btn btn--primary" id="nickSave">保存</button>
      </div>
    </div>`;
  document.body.appendChild(mask);

  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  $('#nickCancel').onclick = close;
  $('#nickSave').onclick = () => {
    const v = $('#nickInput').value.trim();
    if (!v) return toast('昵称不能为空', 'err');
    setCurrentUser(v);
    syncUser();
    invalidate();
    close();
    toast(`已设置为「${v}」`);
    route();
  };
  $('#nickInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#nickSave').click();
  });
  setTimeout(() => $('#nickInput').focus(), 50);
}

/* ---------------- 导航 ---------------- */
function syncNav(active) {
  $('#nav').innerHTML = NAV.map(
    (n) => `<a class="nav-link${n.hash === active ? ' is-active' : ''}" href="${n.hash}">${n.label}</a>`,
  ).join('');
}

function syncFooter() {
  const r = CONFIG.repos;
  const gh = (o, n) => `https://github.com/${o}/${n}`;
  $('#footerLinks').innerHTML = `
    <a href="${gh(r.ratings.owner, r.ratings.repo)}" target="_blank" rel="noopener">推荐/评分仓库</a>
    <a href="${gh(r.comments.owner, r.comments.repo)}" target="_blank" rel="noopener">评论仓库</a>
    <a href="${gh(CONFIG.siteRepo.owner, CONFIG.siteRepo.repo)}" target="_blank" rel="noopener">站点源码</a>
    <a href="${gh(CONFIG.siteRepo.owner, CONFIG.siteRepo.repo)}/issues/new" target="_blank" rel="noopener">反馈</a>`;
}

/* ---------------- 路由 ---------------- */
let booted = false;

async function route() {
  const hash = location.hash || '#/';
  const [, seg, param] = hash.split('/');

  syncUser();

  if (!booted) {
    app.innerHTML = `
      <div class="wrap" style="padding-top:60px;padding-bottom:60px">
        <div class="grid">
          <div class="skeleton sk-card"></div>
          <div class="skeleton sk-card"></div>
          <div class="skeleton sk-card"></div>
          <div class="skeleton sk-card"></div>
        </div>
      </div>`;
  }

  try {
    const data = await loadAll();

    if (seg === 'map' && param) {
      syncNav('');
      renderDetail(app, data, decodeURIComponent(param));
    } else if (seg === 'board') {
      syncNav('#/board');
      renderBoard(app, data);
    } else if (seg === 'mine') {
      syncNav('#/mine');
      renderMine(app, data);
    } else {
      syncNav('#/');
      renderHome(app, data);
    }
    booted = true;
    window.scrollTo({ top: 0, behavior: booted ? 'auto' : 'auto' });
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="wrap" style="padding-top:60px;padding-bottom:80px">
        <div class="empty">
          <div class="empty__mark">⚠</div>
          <p><strong>数据加载失败</strong></p>
          <p style="font-size:13.5px;max-width:520px;margin:8px auto 18px">
            ${err.message}<br>
            请检查 <code>js/config.js</code> 里的仓库地址是否正确、数据仓库是否为公开仓库。
          </p>
          <button class="btn" onclick="location.reload()">重试</button>
        </div>
      </div>`;
  }
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', () => {
  syncUser();
  syncFooter();
  $('#userChip').addEventListener('click', openUserModal);
  route();
});

// 若模块在 DOMContentLoaded 之后才执行
if (document.readyState !== 'loading') {
  syncUser();
  syncFooter();
  $('#userChip').addEventListener('click', openUserModal);
  route();
}
