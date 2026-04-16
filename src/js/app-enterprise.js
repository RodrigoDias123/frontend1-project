/**
 * app-enterprise.js — Enterprise three-column PM app logic.
 *
 * Layout: Sidebar | Activity Feed | Task Detail
 * Inspired by Linear / ClickUp / DesignCollab style.
 */

import { localFetch as fetch } from './localApi.js';
import { updateStats } from './stats.js';
import { initExport } from './export.js';
import { initPomodoro } from './pomodoro.js';
import { initShortcuts } from './shortcuts.js';
import { initAutomationsUI } from './automations.js';
import { initGitTools } from './git-tools.js';
import { initDeepWork } from './deep-work.js';
import { initPostMortem } from './post-mortem.js';
import { initTechDebt } from './tech-debt.js';

const SESSION_KEY = 'devtasks_user';

// ── State ─────────────────────────────────────────────────────────────────────

let _session  = null;
let _tasks    = [];
let _users    = [];
let _projects = [];
let _orgName  = '';
let _filter   = 'all';
let _activeId = null;
let _activeTab = 'comment';

// ── Colour palettes ───────────────────────────────────────────────────────────

const USER_COLORS  = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#d97706','#0ea5e9','#10b981'];
const LABEL_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#f97316','#0ea5e9','#10b981'];
const _uc = {}, _lc = {};

function _userColor(name) {
  if (!_uc[name]) _uc[name] = USER_COLORS[Object.keys(_uc).length % USER_COLORS.length];
  return _uc[name];
}
function _labelColor(label) {
  const k = label.toLowerCase();
  if (!_lc[k]) _lc[k] = LABEL_COLORS[Object.keys(_lc).length % LABEL_COLORS.length];
  return _lc[k];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _rel(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d atrás`;
  return new Date(iso).toLocaleDateString('pt-PT', { day:'2-digit', month:'short' });
}

function _avatarEl(name, size = '') {
  const el = document.createElement('div');
  el.className = `ent-avatar${size ? ' ent-avatar--' + size : ''}`;
  el.textContent = (name ?? '?')[0].toUpperCase();
  el.style.background = _userColor(name ?? '');
  return el;
}

function _fmtHms(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return '0m';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function _toast(msg, type = 'primary') {
  const toastEl = _el('app-toast');
  const msgEl   = _el('toast-message');
  if (!toastEl || !msgEl) return;
  msgEl.textContent = msg;
  toastEl.className = `toast align-items-center border-0 text-bg-${type}`;
  const bsToast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
  bsToast.show();
}

async function _handleEntSave(taskId, data) {
  const existing = _tasks.find(t => String(t.id) === String(taskId));
  if (!existing) return;
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  try {
    await fetch(`/tasks/${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  } catch {}
  _tasks = _tasks.map(t => String(t.id) === String(taskId) ? updated : t);
  _renderFeed();
  _updateSidebarCounts();
  if (String(_activeId) === String(taskId)) _showDetail(taskId);
}

async function init() {
  _session = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
  })();

  if (!_session?.organizationId) { location.replace('app.html'); return; }

  _initSidebarUser();
  _initTopbarUser();
  _bindLogout();
  _bindSidebarNav();
  _bindNewTask();
  _bindSearch();
  _bindViewTabs();

  // Load data
  _users  = await _loadOrgUsers();
  _orgName = await _loadOrgName();
  _el('ent-org-name').textContent = _orgName || 'Organização';
  const menuOrg = _el('ent-user-menu-org');
  if (menuOrg) menuOrg.textContent = `Org: ${_orgName || 'Organização'}`;
  _tasks  = await _loadOrgTasks();
  _projects = await _loadProjects();

  _renderSidebarLabels();
  _renderSidebarProjects();
  _renderTopbarProjects();
  _updateSidebarCounts();
  _renderFeed();

  // Default to calendar view
  _switchView('calendar');

  // Bind detail-specific events (once)
  _bindCommentForm();
  _bindStatusChange();
  _bindLogTime();
  _bindDetailNav();
  _bindTabs();

  // Org users modal
  _initOrgUsersModal();

  // Project modal
  _initProjectModal();

  // Profile modal
  _initProfileModal();

  // Notifications
  _bindNotifications();

  // ── Feature modules ────────────────────────────────────────────────────────
  _bindStatsToggle();
  updateStats(_tasks);
  initExport(() => _tasks);
  initPomodoro(_handleTimeLog);
  initAutomationsUI(() => updateStats(_tasks));
  initGitTools(() => _tasks, (taskId, data) => _handleEntSave(taskId, data));
  initDeepWork(() => _tasks);
  initPostMortem(() => _tasks);
  initTechDebt(() => _tasks, (taskId, data) => _handleEntSave(taskId, data));
  initShortcuts(_buildEntCommands());

  // ── Dropdown button handlers (not bound by feature modules) ────────────────
  _el('btn-show-dag')?.addEventListener('click', () => {
    window.bootstrap.Modal.getOrCreateInstance(_el('dagModal')).show();
  });
  _el('btn-show-automations')?.addEventListener('click', () => {
    window.bootstrap.Modal.getOrCreateInstance(_el('automationsModal')).show();
  });
  _el('btn-show-pomodoro')?.addEventListener('click', () => {
    const w = _el('pomo-widget');
    if (w) w.hidden = false;
  });
}

// ── Session / user ────────────────────────────────────────────────────────────

function _initSidebarUser() {
  const av = _el('ent-sidebar-avatar');
  if (av) {
    av.textContent = (_session.name ?? 'U')[0].toUpperCase();
    av.style.background = _userColor(_session.name ?? '');
  }
  const nameEl = _el('ent-sidebar-name');
  const roleEl = _el('ent-sidebar-role');
  if (nameEl) nameEl.textContent = _session.name ?? 'Utilizador';
  if (roleEl) roleEl.textContent = _session.role === 'admin' ? 'Administrador' : 'Membro';
}

function _initTopbarUser() {
  const av = _el('ent-topbar-avatar');
  if (av) {
    av.textContent = (_session.name ?? 'U')[0].toUpperCase();
    av.style.background = _userColor(_session.name ?? '');
    av.title = _session.name ?? '';
  }
  const comAv = _el('ent-comment-av');
  if (comAv) {
    comAv.textContent = (_session.name ?? 'U')[0].toUpperCase();
    comAv.style.background = _userColor(_session.name ?? '');
  }
  // User menu info
  const menuAv = _el('ent-user-menu-avatar');
  if (menuAv) {
    menuAv.textContent = (_session.name ?? 'U')[0].toUpperCase();
    menuAv.style.background = _userColor(_session.name ?? '');
  }
  const menuName = _el('ent-user-menu-name');
  if (menuName) menuName.textContent = _session.name ?? 'Utilizador';
  const menuEmail = _el('ent-user-menu-email');
  if (menuEmail) menuEmail.textContent = _session.email ?? '';
  const menuRole = _el('ent-user-menu-role');
  if (menuRole) menuRole.textContent = `Cargo: ${_session.role === 'admin' ? 'Administrador' : 'Membro'}`;

  // Apply saved avatar photo
  const savedAvatar = localStorage.getItem(`devtasks_avatar_${_session.id}`);
  if (savedAvatar) _applyAvatarEverywhere(savedAvatar);

  // Logout from user menu
  _el('btn-user-menu-logout')?.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    location.href = 'login.html';
  });

  // Only show org-users button for admins
  if (_session.role === 'admin') {
    _el('btn-ent-org-users')?.classList.remove('d-none');
    _el('btn-new-project')?.classList.remove('d-none');
  } else {
    _el('btn-ent-org-users')?.classList.add('d-none');
    _el('btn-new-project')?.classList.add('d-none');
  }
}

function _initProfileModal() {
  // Open profile modal from user menu
  _el('btn-user-menu-profile')?.addEventListener('click', () => {
    _populateProfile();
    window.bootstrap.Modal.getOrCreateInstance(_el('entProfileModal')).show();
  });

  // Avatar file input
  _el('ent-profile-avatar-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { _showProfileMsg('Imagem demasiado grande (máx 2MB).', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      localStorage.setItem(`devtasks_avatar_${_session.id}`, dataUrl);
      _applyAvatarEverywhere(dataUrl);
      _showProfileMsg('Foto de perfil atualizada!', 'success');
    };
    reader.readAsDataURL(file);
  });

  // Save name
  _el('btn-ent-save-name')?.addEventListener('click', async () => {
    const newName = _el('ent-profile-name-input')?.value.trim();
    if (!newName) return;
    try {
      const res = await fetch(`/users/${_session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error();
      _session.name = newName;
      localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
      // Update all name displays
      _initSidebarUser();
      _initTopbarUser();
      _populateProfile();
      _showProfileMsg('Nome atualizado com sucesso!', 'success');
    } catch {
      _showProfileMsg('Erro ao guardar o nome.', 'danger');
    }
  });

  // Save password
  _el('btn-ent-save-password')?.addEventListener('click', async () => {
    const pw = _el('ent-profile-pw-new')?.value;
    const confirm = _el('ent-profile-pw-confirm')?.value;
    if (!pw || pw.length < 6) { _showProfileMsg('A palavra-passe deve ter pelo menos 6 caracteres.', 'warning'); return; }
    if (pw !== confirm) { _showProfileMsg('As palavras-passe não coincidem.', 'warning'); return; }
    try {
      const res = await fetch(`/users/${_session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) throw new Error();
      _el('ent-profile-pw-new').value = '';
      _el('ent-profile-pw-confirm').value = '';
      _showProfileMsg('Palavra-passe atualizada!', 'success');
    } catch {
      _showProfileMsg('Erro ao guardar a palavra-passe.', 'danger');
    }
  });
}

function _populateProfile() {
  const av = _el('ent-profile-avatar-lg');
  const avatarUrl = localStorage.getItem(`devtasks_avatar_${_session.id}`);
  if (av) {
    const img = _el('ent-profile-avatar-img');
    if (avatarUrl && img) {
      img.src = avatarUrl;
      img.classList.remove('d-none');
      av.textContent = '';
    } else {
      if (img) img.classList.add('d-none');
      av.textContent = (_session.name ?? 'U')[0].toUpperCase();
    }
    av.style.background = _userColor(_session.name ?? '');
  }
  _applyAvatarEverywhere(avatarUrl);
  const nameD = _el('ent-profile-name-display');
  if (nameD) nameD.textContent = _session.name ?? 'Utilizador';
  const emailD = _el('ent-profile-email-display');
  if (emailD) emailD.textContent = _session.email ?? '';
  const roleB = _el('ent-profile-role-badge');
  if (roleB) roleB.textContent = _session.role === 'admin' ? 'Administrador' : 'Membro';

  const nameI = _el('ent-profile-name-input');
  if (nameI) nameI.value = _session.name ?? '';

  // Stats
  const myTasks = _tasks.filter(t => String(t.userId) === String(_session.id));
  const done = myTasks.filter(t => t.status === 'done').length;
  const totalSec = myTasks.reduce((s, t) => s + (t.history ?? []).filter(h => h.action === 'time_log').reduce((a, h) => a + (h.seconds ?? 0), 0), 0);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);

  const statTotal = _el('ent-pstat-total');
  if (statTotal) statTotal.textContent = myTasks.length;
  const statDone = _el('ent-pstat-done');
  if (statDone) statDone.textContent = done;
  const statTime = _el('ent-pstat-time');
  if (statTime) statTime.textContent = h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
}

function _applyAvatarEverywhere(dataUrl) {
  const targets = [
    _el('ent-topbar-avatar'),
    _el('ent-sidebar-avatar'),
    _el('ent-user-menu-avatar'),
    _el('ent-comment-av'),
  ];
  for (const el of targets) {
    if (!el) continue;
    if (dataUrl) {
      el.textContent = '';
      el.style.backgroundImage = `url(${dataUrl})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundImage = '';
      el.textContent = (_session.name ?? 'U')[0].toUpperCase();
      el.style.background = _userColor(_session.name ?? '');
    }
  }
}

function _showProfileMsg(text, type) {
  const el = _el('ent-profile-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `alert py-2 small alert-${type}`;
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 3000);
}

function _bindLogout() {
  _el('btn-ent-logout')?.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    location.href = 'login.html';
  });
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function _loadOrgUsers() {
  try {
    const res = await fetch(`/users?organizationId=${_session.organizationId}`);
    return res.ok ? res.json() : [];
  } catch { return []; }
}

async function _loadOrgName() {
  try {
    const res = await fetch(`/organizations/${_session.organizationId}`);
    if (res.ok) { const org = await res.json(); return org.name ?? ''; }
  } catch {}
  return '';
}

async function _loadOrgTasks() {
  try {
    // primary: tasks tagged with this organizationId
    const res   = await fetch(`/tasks?organizationId=${_session.organizationId}`);
    let tasks   = res.ok ? await res.json() : [];

    if (tasks.length === 0 && _users.length > 0) {
      // fallback: load tasks for each org member
      const results = await Promise.allSettled(
        _users.map(u => fetch(`/tasks?userId=${u.id}`).then(r => r.json()).catch(() => []))
      );
      tasks = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      // dedupe by id
      tasks = [...new Map(tasks.map(t => [t.id, t])).values()];
    }
    return tasks;
  } catch { return []; }
}

async function _loadProjects() {
  try {
    const res = await fetch(`/projects?organizationId=${_session.organizationId}`);
    return res.ok ? res.json() : [];
  } catch { return []; }
}

// ── Sidebar nav & counts ──────────────────────────────────────────────────────

function _bindSidebarNav() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b =>
        b.classList.remove('ent-nav-item--active'));
      btn.classList.add('ent-nav-item--active');
      _filter = btn.dataset.filter;
      _renderFeed();
    });
  });
}

function _renderSidebarLabels() {
  const container = _el('ent-labels-list');
  if (!container) return;

  // Collect all labels
  const counts = {};
  _tasks.forEach(t => (t.labels ?? []).forEach(l => {
    counts[l] = (counts[l] ?? 0) + 1;
  }));

  const entries = Object.entries(counts);
  if (entries.length === 0) {
    container.innerHTML = '<li class="ent-label-empty">Nenhum label ainda.</li>';
    return;
  }

  container.innerHTML = entries.map(([lbl, cnt]) => `
    <li>
      <button class="ent-nav-item" data-filter="label:${_esc(lbl)}">
        <span class="ent-label-dot" style="background:${_labelColor(lbl)}"></span>
        <span class="ent-nav-item-text">${_esc(lbl)}</span>
        <span class="ent-nav-item-count">${cnt}</span>
      </button>
    </li>`).join('');

  _bindSidebarNav();
  _updateSidebarCounts();
}

function _updateSidebarCounts() {
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);

  const map = {
    all:      _tasks.length,
    mine:     _tasks.filter(t => String(t.userId) === String(_session.id)).length,
    inbox:    _tasks.filter(t => (t.comments ?? []).some(c => String(c.authorId) !== String(_session.id))).length,
    onhold:   _tasks.filter(t => t.status === 'todo' && t.dueDate && new Date(t.dueDate) < now).length,
    sent:     _tasks.filter(t => String(t.userId) === String(_session.id) && (t.comments ?? []).length > 0).length,
    trash:    0,
    done:     _tasks.filter(t => t.status === 'done').length,
    thisweek: _tasks.filter(t => t.dueDate && new Date(t.dueDate) <= weekEnd && new Date(t.dueDate) >= now).length,
    overdue:  _tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done').length,
  };

  Object.entries(map).forEach(([key, val]) => {
    const el = _el(`count-${key}`);
    if (el) el.textContent = val > 0 ? val : '';
  });
  // The sidebar uses count-done-nav to avoid conflict with stats panel count-done
  const doneNav = _el('count-done-nav');
  if (doneNav) doneNav.textContent = map.done > 0 ? map.done : '';
}

// ── Feed ──────────────────────────────────────────────────────────────────────

function _filteredTasks() {
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);

  if (_filter === 'mine')     return _tasks.filter(t => String(t.userId) === String(_session.id));
  if (_filter === 'inbox')    return _tasks.filter(t => (t.comments ?? []).some(c => String(c.authorId) !== String(_session.id)));
  if (_filter === 'onhold')   return _tasks.filter(t => t.status === 'todo' && t.dueDate && new Date(t.dueDate) < now);
  if (_filter === 'done')     return _tasks.filter(t => t.status === 'done');
  if (_filter === 'sent')     return _tasks.filter(t => String(t.userId) === String(_session.id) && (t.comments ?? []).length > 0);
  if (_filter === 'trash')    return [];
  if (_filter === 'thisweek') return _tasks.filter(t => t.dueDate && new Date(t.dueDate) <= weekEnd && new Date(t.dueDate) >= now);
  if (_filter === 'overdue')  return _tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done');
  if (_filter?.startsWith('label:')) {
    const lbl = _filter.slice(6);
    return _tasks.filter(t => (t.labels ?? []).includes(lbl));
  }
  if (_filter?.startsWith('project:')) {
    const pid = _filter.slice(8);
    return _tasks.filter(t => String(t.projectId) === pid);
  }
  if (_filter === 'noproject') return _tasks.filter(t => !t.projectId);
  return _tasks;
}

function _buildActivity() {
  const items = [];
  _filteredTasks().forEach(task => {
    const history = task.history ?? [];
    if (history.length > 0) {
      history.forEach(h => items.push({ task, event: h }));
    } else {
      items.push({ task, event: { action: 'created', createdAt: task.createdAt, userId: task.userId } });
    }
    (task.comments ?? []).forEach(c =>
      items.push({ task, event: { action: 'comment', createdAt: c.createdAt, userId: c.authorId, text: c.text } })
    );
  });
  return items.sort((a, b) =>
    new Date(b.event.createdAt ?? 0) - new Date(a.event.createdAt ?? 0)
  );
}

function _actionLabel(event) {
  const ST = { todo:'A Fazer', doing:'Em Progresso', done:'Concluído' };
  switch (event.action) {
    case 'status_change':
      return `Alterou o estado de '${ST[event.from] ?? event.from ?? 'Open'}' para '${ST[event.to] ?? event.to ?? '...'}'`;
    case 'time_log': {
      const h = Math.floor((event.seconds ?? 0) / 3600);
      const m = Math.floor(((event.seconds ?? 0) % 3600) / 60);
      return `Registou ${h > 0 ? h + ' Hr ' : ''}${m} Min`;
    }
    case 'comment':
      return `Comentou: "${_esc((event.text ?? '').slice(0, 50))}${(event.text ?? '').length > 50 ? '…' : ''}"`;
    case 'created': return 'Criou a tarefa';
    default:        return 'Atualizou a tarefa';
  }
}

function _typeLabel(task) {
  if ((task.labels ?? []).includes('bug') || task.priority === 'alta') return 'Bug';
  if ((task.labels ?? []).includes('feature')) return 'Funcionalidade';
  return 'Tarefa';
}

function _renderFeed(searchQ = '') {
  const feedEl = _el('ent-feed-list');
  if (!feedEl) return;

  const isProjectView = _filter?.startsWith('project:') || _filter === 'noproject';

  if (isProjectView) {
    // ── Task-only list (no activity events) ──
    let tasks = _filteredTasks();
    if (searchQ) {
      tasks = tasks.filter(t =>
        t.title?.toLowerCase().includes(searchQ) ||
        t.description?.toLowerCase().includes(searchQ)
      );
    }

    if (tasks.length === 0) {
      feedEl.innerHTML = '<p class="ent-feed-empty">Nenhuma tarefa neste projecto.</p>';
      return;
    }

    const STATUS = { todo: 'A Fazer', doing: 'Em Progresso', done: 'Concluído' };
    const STATUS_ICON = { todo: 'bi-circle', doing: 'bi-play-circle-fill', done: 'bi-check-circle-fill' };
    const STATUS_CLR  = { todo: '#58a6ff', doing: '#d29922', done: '#3fb950' };

    feedEl.innerHTML = tasks
      .sort((a, b) => {
        const ord = { doing: 0, todo: 1, done: 2 };
        return (ord[a.status] ?? 1) - (ord[b.status] ?? 1) || new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0);
      })
      .map(task => {
        const assignee = _users.find(u => String(u.id) === String(task.userId));
        const name     = assignee?.name ?? _session.name;
        const initial  = name[0].toUpperCase();
        const color    = _userColor(name);
        const isActive = String(task.id) === String(_activeId);

        return `
        <div class="ent-feed-item ${isActive ? 'ent-feed-item--active' : ''}"
             data-task-id="${task.id}" role="listitem" tabindex="0"
             aria-label="${_esc(task.title)}">
          <div class="ent-avatar" style="background:${color}">${initial}</div>
          <div class="ent-feed-item-body">
            <div class="ent-feed-item-header">
              <span class="ent-feed-item-user">${_esc(task.title)}</span>
              <span class="ent-feed-item-time">${_rel(task.updatedAt ?? task.createdAt)}</span>
            </div>
            <div class="ent-feed-item-action">
              <span class="ent-feed-item-id">DT-${task.id}</span>
              <i class="${STATUS_ICON[task.status] ?? 'bi-circle'}" style="color:${STATUS_CLR[task.status] ?? '#58a6ff'};font-size:.75rem"></i>
              <span style="color:${STATUS_CLR[task.status] ?? '#8b949e'};font-size:.8rem">${STATUS[task.status] ?? task.status}</span>
            </div>
            <div class="ent-feed-item-task">
              ${task.priority === 'alta' ? '🔴' : task.priority === 'media' ? '🟡' : '🟢'}
              ${_esc(_typeLabel(task))} · ${_esc(name)}
            </div>
          </div>
        </div>`;
      }).join('');

    feedEl.querySelectorAll('.ent-feed-item').forEach(el => {
      el.addEventListener('click', () => _showDetail(el.dataset.taskId));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _showDetail(el.dataset.taskId); }
      });
    });
    return;
  }

  // ── Activity feed (default) ──
  let items = _buildActivity();

  if (searchQ) {
    items = items.filter(({ task }) =>
      task.title?.toLowerCase().includes(searchQ) ||
      task.description?.toLowerCase().includes(searchQ)
    );
  }

  if (items.length === 0) {
    feedEl.innerHTML = '<p class="ent-feed-empty">Nenhuma atividade para este filtro.</p>';
    return;
  }

  feedEl.innerHTML = items.map(({ task, event }) => {
    const user    = _users.find(u => String(u.id) === String(event.userId)) ?? { name: _session.name };
    const name    = user.name ?? 'Utilizador';
    const initial = name[0].toUpperCase();
    const color   = _userColor(name);
    const taskId  = `DT-${task.id}`;
    const isActive = String(task.id) === String(_activeId);
    const proj    = task.projectId ? _projects.find(p => String(p.id) === String(task.projectId)) : null;

    return `
      <div class="ent-feed-item ${isActive ? 'ent-feed-item--active' : ''}"
           data-task-id="${task.id}" role="listitem" tabindex="0"
           aria-label="${_esc(task.title)} — ${_esc(name)}">
        <div class="ent-avatar" style="background:${color}">${initial}</div>
        <div class="ent-feed-item-body">
          <div class="ent-feed-item-header">
            <span class="ent-feed-item-user">${_esc(name)}</span>
            <span class="ent-feed-item-time">${_rel(event.createdAt)}</span>
          </div>
          <div class="ent-feed-item-action">
            <span class="ent-feed-item-id">${_esc(taskId)}</span>
            ${proj ? `<span class="ent-feed-project-badge" style="--proj-color:${_esc(proj.color)}">${_esc(proj.name)}</span>` : ''}
            ${_esc(_actionLabel(event))}
          </div>
          <div class="ent-feed-item-task">
            ${task.priority === 'alta' ? '🔴' : task.priority === 'media' ? '🟡' : '🟢'}
            ${_esc(_typeLabel(task))}: '${_esc(task.title)}'
          </div>
        </div>
      </div>`;
  }).join('');

  feedEl.querySelectorAll('.ent-feed-item').forEach(el => {
    el.addEventListener('click', () => _showDetail(el.dataset.taskId));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _showDetail(el.dataset.taskId); }
    });
  });
}

// ── Detail ────────────────────────────────────────────────────────────────────

function _showDetail(taskId) {
  _activeId = String(taskId);
  const task = _tasks.find(t => String(t.id) === _activeId);
  if (!task) return;

  // Highlight feed item
  document.querySelectorAll('.ent-feed-item').forEach(el =>
    el.classList.toggle('ent-feed-item--active', el.dataset.taskId === _activeId)
  );

  // Show content, hide empty
  _el('ent-detail-empty')?.classList.add('d-none');
  const content = _el('ent-detail-content');
  if (content) { content.classList.remove('d-none'); content.style.display = 'flex'; }

  _renderDetailHeader(task);
  _switchTab(_activeTab, task);
}

function _renderDetailHeader(task) {
  const assignee = _users.find(u => String(u.id) === String(task.userId)) ?? { name: _session.name };
  const ST_COLORS = { todo:'#3b82f6', doing:'#f59e0b', done:'#22c55e' };
  const ST_LABELS = { todo:'A Fazer', doing:'Em Progresso', done:'Concluído' };

  // Breadcrumb
  const proj = task.projectId ? _projects.find(p => String(p.id) === String(task.projectId)) : null;
  _el('ent-detail-breadcrumb').textContent =
    `${_orgName} / ${proj ? proj.name : (task.labels?.[0]) ?? 'Geral'} /`;

  // ID + Title
  _el('ent-detail-id').textContent    = `DT-${task.id}`;
  _el('ent-detail-title').textContent = task.title ?? '(sem título)';

  // Assignee avatar
  const av = _el('ent-detail-assignee-av');
  if (av) {
    av.textContent = (assignee.name ?? 'U')[0].toUpperCase();
    av.style.background = _userColor(assignee.name ?? '');
  }
  const nameEl = _el('ent-detail-assignee-name');
  if (nameEl) nameEl.textContent = assignee.name ?? 'Não atribuído';

  // Tags
  const tagsEl = _el('ent-detail-tags');
  if (tagsEl) {
    const PRIO_COLORS = { alta:'#ef4444', media:'#f59e0b', baixa:'#22c55e' };
    const PRIO_LABELS = { alta:'Alta Prioridade', media:'Média Prioridade', baixa:'Baixa Prioridade' };
    let html = '';
    if (proj) html += `<span class="ent-tag" style="--tag-color:${proj.color ?? '#3b82f6'}"><i class="bi bi-folder-fill me-1" style="font-size:.6rem"></i>${_esc(proj.name)}</span>`;
    html += (task.labels ?? []).map(l =>
      `<span class="ent-tag" style="--tag-color:${_labelColor(l)}">${_esc(l)}</span>`
    ).join('');
    if (task.priority) html += `<span class="ent-tag" style="--tag-color:${PRIO_COLORS[task.priority] ?? '#8b949e'}">${PRIO_LABELS[task.priority] ?? task.priority}</span>`;
    tagsEl.innerHTML = html;
  }

  // Status display
  const statusEl = _el('ent-detail-status');
  if (statusEl) {
    const color = ST_COLORS[task.status] ?? '#8b949e';
    const label = ST_LABELS[task.status] ?? task.status;
    statusEl.innerHTML = `<i class="bi bi-circle-fill me-1" style="font-size:.5rem;color:${color};vertical-align:middle"></i><span style="color:${color}">${label}</span>`;
  }
  const sel = _el('ent-status-select');
  if (sel) { sel.value = task.status ?? 'todo'; sel.dataset.taskId = String(task.id); }

  // Time
  const logged = task.totalSeconds ?? 0;
  const estSecs = (task.estimatedHours ?? 0) * 3600;
  _el('ent-detail-time-logged').textContent    = _fmtHms(logged);
  _el('ent-detail-time-estimated').textContent = task.estimatedHours != null ? `${task.estimatedHours}h` : '—';
  const pct = estSecs > 0 ? Math.min(100, (logged / estSecs) * 100) : 0;
  const bar = _el('ent-time-bar-fill');
  if (bar) { bar.style.width = pct + '%'; bar.style.background = pct > 90 ? '#ef4444' : '#3b82f6'; }

  // Dates
  const dateEl = _el('ent-detail-dates');
  if (dateEl) {
    const fmt = iso => iso ? new Date(iso).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
    dateEl.innerHTML = `<span>Início: <strong>${fmt(task.createdAt)}</strong></span><span>Prazo: <strong>${fmt(task.dueDate)}</strong></span>`;
  }

  // Description
  _el('ent-detail-description').textContent = task.description || '(sem descrição)';
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function _bindTabs() {
  document.querySelectorAll('.ent-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = _tasks.find(t => String(t.id) === _activeId);
      _switchTab(btn.dataset.tab, task);
    });
  });
}

function _switchTab(tab, task) {
  _activeTab = tab;
  const t = task ?? _tasks.find(t => String(t.id) === _activeId);

  document.querySelectorAll('.ent-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('ent-tab-btn--active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  ['ent-tab-comment', 'ent-tab-history', 'ent-tab-testcases'].forEach(id =>
    _el(id)?.classList.add('d-none')
  );

  if (!t) return;
  if (tab === 'comment')   _renderCommentTab(t);
  if (tab === 'history')   _renderHistoryTab(t);
  if (tab === 'testcases') _renderTestCasesTab(t);
}

// ── Comments ──────────────────────────────────────────────────────────────────

function _renderCommentTab(task) {
  const pane = _el('ent-tab-comment');
  if (pane) pane.classList.remove('d-none');

  const list = _el('ent-comment-list');
  if (!list) return;

  const comments = task.comments ?? [];
  list.innerHTML = comments.length === 0
    ? '<p class="text-muted small py-2 mb-0">Sem comentários ainda.</p>'
    : comments.map(c => {
        const user = _users.find(u => String(u.id) === String(c.authorId)) ?? { name: c.authorName ?? 'Utilizador' };
        const name = user.name;
        return `
          <div class="ent-comment">
            <div class="ent-avatar ent-avatar--sm" style="background:${_userColor(name)}" aria-hidden="true">${name[0].toUpperCase()}</div>
            <div class="ent-comment-body">
              <div class="ent-comment-meta">
                <strong>${_esc(name)}</strong>
                <span class="text-muted small ms-2">${_rel(c.createdAt)}</span>
              </div>
              <p class="ent-comment-text mb-1">${_esc(c.text)}</p>
              <div class="ent-comment-actions">
                <button type="button">Reply</button>
                <span class="ent-dot-sep">&bull;</span>
                <button type="button">Delete</button>
                <span class="ent-dot-sep">&bull;</span>
                <button type="button">Add As Task</button>
              </div>
            </div>
          </div>`;
      }).join('');
}

function _bindCommentForm() {
  _el('ent-comment-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const task = _tasks.find(t => String(t.id) === _activeId);
    if (!task) return;

    const input = _el('ent-comment-input');
    const text  = input?.value.trim();
    if (!text) return;

    const comment = {
      id:         Date.now(),
      authorId:   _session.id,
      authorName: _session.name,
      text,
      createdAt:  new Date().toISOString(),
    };

    task.comments = [...(task.comments ?? []), comment];
    task.history  = [...(task.history  ?? []), {
      action: 'comment', userId: _session.id, text, createdAt: comment.createdAt,
    }];
    task.updatedAt = comment.createdAt;

    try {
      await fetch(`/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    } catch { /* offline — already updated locally */ }

    if (input) input.value = '';
    _renderCommentTab(task);
    _renderFeed();
    _updateSidebarCounts();
  });
}

// ── History ───────────────────────────────────────────────────────────────────

function _renderHistoryTab(task) {
  const pane = _el('ent-tab-history');
  if (pane) pane.classList.remove('d-none');

  const list = _el('ent-history-list');
  if (!list) return;

  const history = [
    ...(task.history ?? []),
    { action: 'created', userId: task.userId, createdAt: task.createdAt },
  ].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));

  list.innerHTML = history.map(h => {
    const user = _users.find(u => String(u.id) === String(h.userId)) ?? { name: _session.name };
    const ICONS = {
      created:       'bi-plus-circle-fill text-success',
      status_change: 'bi-arrow-right-circle-fill text-primary',
      comment:       'bi-chat-fill text-warning',
      time_log:      'bi-stopwatch-fill text-secondary',
    };
    return `
      <div class="ent-history-item">
        <i class="bi ${ICONS[h.action] ?? 'bi-circle-fill text-muted'} ent-history-icon" aria-hidden="true"></i>
        <div class="ent-history-body">
          <span class="fw-semibold">${_esc(user.name)}</span>
          <span class="text-muted"> — ${_esc(_actionLabel(h))}</span>
          <div class="text-muted small">${_rel(h.createdAt)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Test Cases ────────────────────────────────────────────────────────────────

function _renderTestCasesTab(task) {
  const pane = _el('ent-tab-testcases');
  if (pane) pane.classList.remove('d-none');

  const list      = _el('ent-testcases-list');
  if (!list) return;

  const testCases = task.testCases ?? [];

  const addBtn = `<button class="btn btn-outline-secondary btn-sm mt-2" id="btn-add-testcase">
    <i class="bi bi-plus me-1" aria-hidden="true"></i>Adicionar caso
  </button>`;

  list.innerHTML = testCases.length === 0
    ? `<p class="text-muted small py-2 mb-0">Sem casos de teste.</p>${addBtn}`
    : testCases.map((tc, i) => `
        <div class="ent-testcase">
          <button class="ent-testcase-toggle ${tc.passed ? 'ent-testcase-toggle--pass' : ''}"
                  data-tc-index="${i}" aria-label="${tc.passed ? 'Passou' : 'Falhou'}">
            <i class="bi ${tc.passed ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}" aria-hidden="true"></i>
          </button>
          <span class="ent-testcase-title ${tc.passed ? 'text-decoration-line-through text-muted' : ''}">${_esc(tc.title)}</span>
        </div>`).join('') + addBtn;

  list.querySelectorAll('.ent-testcase-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.tcIndex, 10);
      task.testCases[i].passed = !task.testCases[i].passed;
      try {
        await fetch(`/tasks/${task.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        });
      } catch {}
      _renderTestCasesTab(task);
    });
  });

  list.querySelector('#btn-add-testcase')?.addEventListener('click', async () => {
    const title = prompt('Título do caso de teste:');
    if (!title?.trim()) return;
    task.testCases = [...(task.testCases ?? []), { id: Date.now(), title: title.trim(), passed: false }];
    try {
      await fetch(`/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    } catch {}
    _renderTestCasesTab(task);
  });
}

// ── Status change ─────────────────────────────────────────────────────────────

function _bindStatusChange() {
  _el('ent-status-select')?.addEventListener('change', async e => {
    const task = _tasks.find(t => String(t.id) === String(e.target.dataset.taskId));
    if (!task) return;

    const oldStatus = task.status;
    task.status     = e.target.value;
    task.updatedAt  = new Date().toISOString();
    task.history    = [...(task.history ?? []), {
      action: 'status_change', from: oldStatus, to: task.status,
      userId: _session.id, createdAt: task.updatedAt,
    }];

    try {
      await fetch(`/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    } catch {}

    _renderDetailHeader(task);
    _renderFeed();
    _updateSidebarCounts();
  });
}

// ── Log time ──────────────────────────────────────────────────────────────────

function _bindLogTime() {
  _el('btn-ent-log-time')?.addEventListener('click', async () => {
    const task = _tasks.find(t => String(t.id) === _activeId);
    if (!task) return;

    const input = prompt('Registar tempo (ex: 1h30m, 45m, 2h):');
    if (!input) return;

    let seconds = 0;
    const hM = input.match(/(\d+)\s*h/i);
    const mM = input.match(/(\d+)\s*m/i);
    if (hM) seconds += parseInt(hM[1], 10) * 3600;
    if (mM) seconds += parseInt(mM[1], 10) * 60;
    if (!hM && !mM) {
      const n = parseInt(input, 10);
      if (!isNaN(n)) seconds = n * 60;
    }
    if (seconds <= 0) { alert('Formato inválido. Use ex: 1h30m, 45m, 2h'); return; }

    const now = new Date().toISOString();
    task.totalSeconds = (task.totalSeconds ?? 0) + seconds;
    task.updatedAt    = now;
    task.history      = [...(task.history ?? []), {
      action: 'time_log', seconds, userId: _session.id, createdAt: now,
    }];

    try {
      await fetch(`/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    } catch {}

    _renderDetailHeader(task);
    _renderFeed();
  });
}

// ── Detail navigation (prev / next) ──────────────────────────────────────────

function _bindDetailNav() {
  _el('btn-detail-prev')?.addEventListener('click', () => _navDetail(-1));
  _el('btn-detail-next')?.addEventListener('click', () => _navDetail(+1));
}

function _navDetail(dir) {
  const sorted = [..._filteredTasks()].sort((a, b) =>
    new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0)
  );
  const idx = sorted.findIndex(t => String(t.id) === _activeId);
  if (idx === -1) return;
  const next = sorted[idx + dir];
  if (next) _showDetail(next.id);
}

// ── New task ──────────────────────────────────────────────────────────────────

function _bindNewTask() {
  const togglePanel = () => {
    // Switch to feed view if not already there
    _switchView('feed');
    document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
    document.querySelector('.ent-view-tab[data-view="feed"]')?.classList.add('ent-view-tab--active');

    const panel = _el('ent-new-task-panel');
    panel?.classList.toggle('d-none');
    if (!panel?.classList.contains('d-none')) {
      _populateNewTaskProjectSelect();
      _populateNewTaskAssigneeSelect();
      _el('ent-new-title')?.focus();
    }
  };

  _el('btn-ent-new')?.addEventListener('click', togglePanel);
  _el('btn-ent-new-quick')?.addEventListener('click', togglePanel);

  _el('btn-cancel-new')?.addEventListener('click', () =>
    _el('ent-new-task-panel')?.classList.add('d-none')
  );

  _el('ent-new-task-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const title = _el('ent-new-title')?.value.trim();
    if (!title) return;

    const now  = new Date().toISOString();
    const projectId = _el('ent-new-project')?.value || null;
    const task = {
      title,
      description:    _el('ent-new-desc')?.value.trim() || '',
      priority:       _el('ent-new-priority')?.value || 'media',
      status:         'todo',
      labels:         [],
      userId:         Number(_el('ent-new-assignee')?.value) || _session.id,
      organizationId: _session.organizationId,
      projectId:      projectId ? Number(projectId) : null,
      createdAt:      now,
      updatedAt:      now,
      comments:       [],
      history:        [],
      testCases:      [],
    };

    try {
      const res     = await fetch('/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const created = await res.json();
      _tasks.unshift(created);
    } catch {
      task.id = Date.now();
      _tasks.unshift(task);
    }

    _el('ent-new-task-panel')?.classList.add('d-none');
    _el('ent-new-task-form')?.reset();
    _renderSidebarLabels();
    _renderFeed();
    _updateSidebarCounts();
    _showDetail(_tasks[0]?.id);
  });
}

// ── View Tabs (Calendar / Analytics) ──────────────────────────────────────────

let _calMonth = new Date().getMonth();
let _calYear  = new Date().getFullYear();

function _bindViewTabs() {
  document.querySelectorAll('.ent-view-tab[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
      btn.classList.add('ent-view-tab--active');

      const view = btn.dataset.view;
      _switchView(view);
    });
  });

  // Calendar nav
  _el('btn-cal-prev')?.addEventListener('click', () => {
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    _renderCalendar();
  });
  _el('btn-cal-next')?.addEventListener('click', () => {
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    _renderCalendar();
  });
  _el('btn-cal-today')?.addEventListener('click', () => {
    const now = new Date();
    _calMonth = now.getMonth();
    _calYear  = now.getFullYear();
    _renderCalendar();
  });

  // Back from analytics
  _el('btn-back-from-analytics')?.addEventListener('click', () => {
    _switchView('feed');
    document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
    document.querySelector('.ent-view-tab[data-view="feed"]')?.classList.add('ent-view-tab--active');
  });
}

function _switchView(view) {
  const calView  = _el('ent-calendar-view');
  const feedEl   = document.querySelector('.ent-feed');
  const detailEl = document.querySelector('.ent-detail');
  const statsPanel = _el('stats-panel');
  const backBtn  = _el('btn-back-from-analytics');

  if (view === 'calendar') {
    calView?.classList.remove('d-none');
    feedEl?.classList.add('d-none');
    detailEl?.classList.add('d-none');
    if (statsPanel) statsPanel.hidden = true;
    backBtn?.classList.add('d-none');
    _renderCalendar();
  } else if (view === 'analytics') {
    calView?.classList.add('d-none');
    feedEl?.classList.add('d-none');
    detailEl?.classList.add('d-none');
    if (statsPanel) { statsPanel.hidden = false; updateStats(_tasks); }
    backBtn?.classList.remove('d-none');
  } else {
    calView?.classList.add('d-none');
    feedEl?.classList.remove('d-none');
    detailEl?.classList.remove('d-none');
    if (statsPanel) statsPanel.hidden = true;
    backBtn?.classList.add('d-none');
  }
}

function _renderCalendar() {
  const MONTHS = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];

  _el('ent-cal-month').textContent = `${MONTHS[_calMonth]} ${_calYear}`;

  const daysEl = _el('ent-cal-days');
  if (!daysEl) return;

  // First day of month (0=Sun => adjust for Mon start)
  const firstDay = new Date(_calYear, _calMonth, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert: 0=Mon

  const daysInMonth  = new Date(_calYear, _calMonth + 1, 0).getDate();
  const daysInPrev   = new Date(_calYear, _calMonth, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Build task map: date string → tasks[]
  const taskMap = {};
  _tasks.forEach(t => {
    const dates = [];
    if (t.dueDate) dates.push(t.dueDate.slice(0, 10));
    if (t.createdAt) dates.push(t.createdAt.slice(0, 10));
    dates.forEach(d => {
      if (!taskMap[d]) taskMap[d] = [];
      if (!taskMap[d].find(x => x.id === t.id)) taskMap[d].push(t);
    });
  });

  let html = '';
  const totalCells = startDow + daysInMonth;
  const rows = Math.ceil(totalCells / 7) * 7;

  for (let i = 0; i < rows; i++) {
    let day, isOther = false, dateStr;
    if (i < startDow) {
      // Previous month
      day = daysInPrev - startDow + 1 + i;
      const pm = _calMonth === 0 ? 11 : _calMonth - 1;
      const py = _calMonth === 0 ? _calYear - 1 : _calYear;
      dateStr = `${py}-${String(pm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      isOther = true;
    } else if (i - startDow >= daysInMonth) {
      // Next month
      day = i - startDow - daysInMonth + 1;
      const nm = _calMonth === 11 ? 0 : _calMonth + 1;
      const ny = _calMonth === 11 ? _calYear + 1 : _calYear;
      dateStr = `${ny}-${String(nm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      isOther = true;
    } else {
      day = i - startDow + 1;
      dateStr = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    const isToday = dateStr === todayStr;
    const cls = `ent-cal-day${isOther ? ' ent-cal-day--other' : ''}${isToday ? ' ent-cal-day--today' : ''}`;

    const dayTasks = taskMap[dateStr] ?? [];
    const MAX_SHOW = 3;
    let tasksHtml = dayTasks.slice(0, MAX_SHOW).map(t => {
      const pCls = t.status === 'done' ? 'done' : (t.priority ?? 'media');
      return `<div class="ent-cal-task ent-cal-task--${_esc(pCls)}" data-task-id="${t.id}" title="${_esc(t.title)}">${_esc(t.title)}</div>`;
    }).join('');

    if (dayTasks.length > MAX_SHOW) {
      tasksHtml += `<div class="ent-cal-more">+${dayTasks.length - MAX_SHOW} mais</div>`;
    }

    html += `<div class="${cls}" data-date="${dateStr}"><div class="ent-cal-day-num">${day}</div>${tasksHtml}</div>`;
  }

  daysEl.innerHTML = html;

  // Click on task → show feed+detail
  daysEl.querySelectorAll('.ent-cal-task').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      _switchView('feed');
      document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
      document.querySelector('.ent-view-tab[data-view="feed"]')?.classList.add('ent-view-tab--active');
      _showDetail(el.dataset.taskId);
    });
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

function _bindSearch() {
  _el('ent-search')?.addEventListener('input', e => {
    _renderFeed(e.target.value.toLowerCase().trim());
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

const NOTIF_KEY = 'devtasks_notif_cleared';

function _getNotifications() {
  const clearedAt = localStorage.getItem(`${NOTIF_KEY}_${_session.id}`);
  const cutoff = clearedAt ? new Date(clearedAt) : null;

  const items = [];
  for (const task of _tasks) {
    // Status changes
    for (const h of (task.history ?? [])) {
      if (h.action === 'status_change' && String(h.userId) !== String(_session.id)) {
        items.push({ task, type: 'status', event: h, date: new Date(h.createdAt ?? 0) });
      }
    }
    // Comments by others
    for (const c of (task.comments ?? [])) {
      if (String(c.authorId) !== String(_session.id)) {
        items.push({ task, type: 'comment', event: c, date: new Date(c.createdAt ?? 0) });
      }
    }
    // Tasks assigned to me by others
    if (String(task.userId) === String(_session.id) && task.createdAt) {
      const created = new Date(task.createdAt);
      items.push({ task, type: 'assigned', event: null, date: created });
    }
  }

  items.sort((a, b) => b.date - a.date);

  return items.map(n => ({
    ...n,
    unread: cutoff ? n.date > cutoff : true,
  }));
}

function _renderNotifications() {
  const notifs = _getNotifications();
  const listEl = _el('ent-notif-list');
  const badge = _el('ent-notif-badge');

  const unreadCount = notifs.filter(n => n.unread).length;
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  if (!listEl) return;

  if (notifs.length === 0) {
    listEl.innerHTML = '<div class="ent-notif-empty"><i class="bi bi-bell-slash" style="font-size:1.5rem;display:block;margin-bottom:.5rem"></i>Sem notificações</div>';
    return;
  }

  const ST = { todo: 'A Fazer', doing: 'Em Progresso', done: 'Concluído' };

  listEl.innerHTML = notifs.slice(0, 30).map(n => {
    let icon = '', text = '';
    const taskLabel = `<strong>DT-${n.task.id}</strong>`;

    if (n.type === 'status') {
      const actor = _users.find(u => String(u.id) === String(n.event.userId));
      const name = actor?.name ?? 'Alguém';
      icon = `<div class="ent-notif-item-icon" style="background:#1f6feb;color:#fff"><i class="bi bi-arrow-repeat"></i></div>`;
      text = `${_esc(name)} alterou ${taskLabel} para <em>${ST[n.event.to] ?? n.event.to}</em>`;
    } else if (n.type === 'comment') {
      const actor = _users.find(u => String(u.id) === String(n.event.authorId));
      const name = actor?.name ?? 'Alguém';
      icon = `<div class="ent-notif-item-icon" style="background:#238636;color:#fff"><i class="bi bi-chat-dots-fill"></i></div>`;
      text = `${_esc(name)} comentou em ${taskLabel}`;
    } else if (n.type === 'assigned') {
      icon = `<div class="ent-notif-item-icon" style="background:#8b5cf6;color:#fff"><i class="bi bi-person-plus-fill"></i></div>`;
      text = `Tarefa ${taskLabel} — <em>${_esc(n.task.title)}</em>`;
    }

    return `
      <div class="ent-notif-item ${n.unread ? 'ent-notif-item--unread' : ''}" data-task-id="${n.task.id}">
        ${icon}
        <div class="ent-notif-item-body">
          <span class="ent-notif-item-text">${text}</span>
          <span class="ent-notif-item-time">${_rel(n.date.toISOString())}</span>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.ent-notif-item').forEach(el => {
    el.addEventListener('click', () => {
      _switchView('feed');
      document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
      document.querySelector('.ent-view-tab[data-view="feed"]')?.classList.add('ent-view-tab--active');
      _showDetail(el.dataset.taskId);
    });
  });
}

function _clearNotifications() {
  localStorage.setItem(`${NOTIF_KEY}_${_session.id}`, new Date().toISOString());
  _renderNotifications();
  _toast('Notificações limpas.', 'secondary');
}

function _bindNotifications() {
  // Topbar bell opens dropdown — render on open
  _el('btn-ent-notifications')?.addEventListener('click', () => {
    _renderNotifications();
  });

  // Clear all from dropdown
  _el('btn-clear-notifications')?.addEventListener('click', () => {
    _clearNotifications();
  });

  // Clear from feed header
  _el('btn-feed-clear-notif')?.addEventListener('click', () => {
    _clearNotifications();
  });

  // Initial badge count
  _renderNotifications();
}

// ── Projects ──────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#0ea5e9','#f97316','#ec4899'];

function _renderSidebarProjects() {
  const container = _el('ent-projects-list');
  if (!container) return;

  if (_projects.length === 0) {
    container.innerHTML = '<li class="ent-label-empty">Nenhum projecto ainda.</li>';
    return;
  }

  container.innerHTML = _projects.map(p => {
    const cnt = _tasks.filter(t => String(t.projectId) === String(p.id)).length;
    return `
    <li>
      <button class="ent-nav-item" data-filter="project:${p.id}">
        <span class="ent-label-dot" style="background:${_esc(p.color ?? '#3b82f6')}"></span>
        <span class="ent-nav-item-text">${_esc(p.name)}</span>
        <span class="ent-nav-item-count">${cnt || ''}</span>
      </button>
      ${_session.role === 'admin' ? `<button class="ent-project-edit-btn" data-project-id="${p.id}" title="Editar projecto"><i class="bi bi-pencil-fill"></i></button>` : ''}
    </li>`;
  }).join('');

  // Rebind sidebar nav to include project filters
  _bindSidebarNav();

  // Edit buttons
  container.querySelectorAll('.ent-project-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const proj = _projects.find(p => String(p.id) === btn.dataset.projectId);
      if (proj) _openProjectModal(proj);
    });
  });
}

function _renderTopbarProjects() {
  const menu = _el('ent-topbar-project-menu');
  if (!menu) return;

  // Rebuild: header + "Todos" + "Sem projecto" + divider + each project
  const noProjectCnt = _tasks.filter(t => !t.projectId).length;
  menu.innerHTML = `
    <li><h6 class="dropdown-header small">Projectos</h6></li>
    <li>
      <button class="dropdown-item small" data-project-filter="all">
        <i class="bi bi-grid-fill me-2 text-secondary" aria-hidden="true"></i>Todos
      </button>
    </li>
    <li>
      <button class="dropdown-item small d-flex align-items-center" data-project-filter="noproject">
        <i class="bi bi-inbox me-2 text-warning" aria-hidden="true"></i>Sem Projecto
        <span class="ms-auto badge bg-secondary" style="font-size:.65rem">${noProjectCnt}</span>
      </button>
    </li>
    <li><hr class="dropdown-divider" /></li>
    ${_projects.map(p => {
      const cnt = _tasks.filter(t => String(t.projectId) === String(p.id)).length;
      return `<li>
        <button class="dropdown-item small d-flex align-items-center" data-project-filter="${p.id}">
          <span class="ent-topbar-project-menu-dot" style="background:${_esc(p.color ?? '#3b82f6')}"></span>
          ${_esc(p.name)}
          <span class="ms-auto badge bg-secondary" style="font-size:.65rem">${cnt}</span>
        </button>
      </li>`;
    }).join('')}
    ${_projects.length === 0 ? '<li><span class="dropdown-item-text small text-muted">Nenhum projecto</span></li>' : ''}
  `;

  // Bind click
  menu.querySelectorAll('[data-project-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.projectFilter;
      if (val === 'all') {
        _filter = 'all';
        _el('ent-topbar-project-label').textContent = 'Projectos';
      } else if (val === 'noproject') {
        _filter = 'noproject';
        _el('ent-topbar-project-label').textContent = 'Sem Projecto';
      } else {
        _filter = `project:${val}`;
        const proj = _projects.find(p => String(p.id) === val);
        _el('ent-topbar-project-label').textContent = proj ? proj.name : 'Projectos';
      }
      // Ensure feed view is active
      _switchView('feed');
      document.querySelectorAll('.ent-view-tab').forEach(b => b.classList.remove('ent-view-tab--active'));
      document.querySelector('.ent-view-tab[data-view="feed"]')?.classList.add('ent-view-tab--active');

      // Update sidebar active state
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('ent-nav-item--active'));
      const sidebarBtn = document.querySelector(`[data-filter="${_filter}"]`);
      if (sidebarBtn) sidebarBtn.classList.add('ent-nav-item--active');

      _renderFeed();
    });
  });
}

function _populateNewTaskProjectSelect() {
  const sel = _el('ent-new-project');
  if (!sel) return;
  // Keep first option, rebuild rest
  sel.innerHTML = '<option value="">Sem projecto</option>' +
    _projects.map(p => `<option value="${p.id}">${_esc(p.name)}</option>`).join('');

  // If currently filtering by project, pre-select it
  if (_filter?.startsWith('project:')) {
    sel.value = _filter.slice(8);
  }
}

function _populateNewTaskAssigneeSelect() {
  const sel = _el('ent-new-assignee');
  if (!sel) return;
  sel.innerHTML = `<option value="">Atribuir a… (eu)</option>` +
    _users.map(u => `<option value="${u.id}"${String(u.id) === String(_session.id) ? ' selected' : ''}>${_esc(u.name)}${u.role === 'admin' ? ' (admin)' : ''}</option>`).join('');
}

function _openProjectModal(project = null) {
  const isEdit = !!project;
  _el('project-modal-title').textContent = isEdit ? 'Editar Projecto' : 'Novo Projecto';
  _el('project-edit-id').value = isEdit ? project.id : '';
  _el('project-name').value = isEdit ? project.name : '';
  _el('project-desc').value = isEdit ? (project.description ?? '') : '';

  // Color picker
  const color = isEdit ? (project.color ?? '#3b82f6') : '#3b82f6';
  document.querySelectorAll('#project-color-picker .ent-color-dot').forEach(dot => {
    dot.classList.toggle('ent-color-dot--active', dot.dataset.color === color);
  });

  // Delete button
  const delBtn = _el('btn-delete-project');
  if (delBtn) {
    delBtn.classList.toggle('d-none', !isEdit);
  }

  // Render members checkboxes
  _renderProjectMembers(isEdit ? (project.memberIds ?? []) : [_session.id]);

  // Clear messages
  _el('project-form-error')?.classList.add('d-none');
  _el('project-form-success')?.classList.add('d-none');

  window.bootstrap.Modal.getOrCreateInstance(_el('projectModal')).show();
}

function _renderProjectMembers(selectedIds = []) {
  const container = _el('project-members-list');
  if (!container) return;

  if (_users.length === 0) {
    container.innerHTML = '<p class="text-muted small">Sem membros na organização.</p>';
    return;
  }

  container.innerHTML = _users.map(u => {
    const checked = selectedIds.includes(u.id) || selectedIds.includes(String(u.id));
    return `
      <div class="ent-project-member-row">
        <input type="checkbox" class="form-check-input" id="pm-user-${u.id}" value="${u.id}" ${checked ? 'checked' : ''} />
        <div class="ent-avatar ent-avatar--sm" style="background:${_userColor(u.name ?? '')}">${(u.name ?? '?')[0].toUpperCase()}</div>
        <label for="pm-user-${u.id}" class="ent-project-member-label">
          <span class="fw-semibold">${_esc(u.name)}</span>
          <span class="text-muted small">${_esc(u.email)}</span>
        </label>
        <span class="badge ${u.role === 'admin' ? 'bg-warning text-dark' : 'bg-secondary'}" style="font-size:.6rem">${u.role === 'admin' ? 'Admin' : 'Membro'}</span>
      </div>`;
  }).join('');
}

function _getSelectedColor() {
  const active = document.querySelector('#project-color-picker .ent-color-dot--active');
  return active?.dataset.color ?? '#3b82f6';
}

function _getSelectedMemberIds() {
  return [...document.querySelectorAll('#project-members-list input[type="checkbox"]:checked')]
    .map(cb => Number(cb.value));
}

function _initProjectModal() {
  // New project button in sidebar (admin only)
  _el('btn-new-project')?.addEventListener('click', () => {
    if (_session.role !== 'admin') {
      _toast('Apenas administradores podem criar projectos.', 'warning');
      return;
    }
    _openProjectModal(null);
  });

  // Color picker
  document.querySelectorAll('#project-color-picker .ent-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('#project-color-picker .ent-color-dot').forEach(d => d.classList.remove('ent-color-dot--active'));
      dot.classList.add('ent-color-dot--active');
    });
  });

  // Form submit
  _el('project-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = _el('project-name')?.value.trim();
    if (!name) {
      _el('project-form-error').textContent = 'O nome do projecto é obrigatório.';
      _el('project-form-error').classList.remove('d-none');
      return;
    }

    const editId    = _el('project-edit-id')?.value;
    const isEdit    = !!editId;
    const color     = _getSelectedColor();
    const memberIds = _getSelectedMemberIds();
    const now       = new Date().toISOString();

    const payload = {
      name,
      description:    _el('project-desc')?.value.trim() || '',
      color,
      memberIds,
      organizationId: _session.organizationId,
      createdBy:      isEdit ? undefined : _session.id,
      createdAt:      isEdit ? undefined : now,
      updatedAt:      now,
    };

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    try {
      if (isEdit) {
        const existing = _projects.find(p => String(p.id) === editId);
        const merged = { ...existing, ...payload };
        const res = await fetch(`/projects/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        });
        if (!res.ok) throw new Error('Erro ao atualizar projecto.');
        const updated = await res.json();
        _projects = _projects.map(p => String(p.id) === editId ? updated : p);
        _toast('Projecto atualizado.', 'success');
      } else {
        const res = await fetch('/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Erro ao criar projecto.');
        const created = await res.json();
        _projects.push(created);
        _toast('Projecto criado com sucesso!', 'success');
      }

      _renderSidebarProjects();
      _renderTopbarProjects();
      _populateNewTaskProjectSelect();
      window.bootstrap.Modal.getInstance(_el('projectModal'))?.hide();
    } catch (err) {
      _el('project-form-error').textContent = err.message ?? 'Erro inesperado.';
      _el('project-form-error').classList.remove('d-none');
    }
  });

  // Delete project
  _el('btn-delete-project')?.addEventListener('click', async () => {
    const editId = _el('project-edit-id')?.value;
    if (!editId) return;
    const proj = _projects.find(p => String(p.id) === editId);
    if (!confirm(`Eliminar o projecto "${proj?.name ?? ''}"? As tarefas não serão eliminadas.`)) return;

    try {
      await fetch(`/projects/${editId}`, { method: 'DELETE' });
      _projects = _projects.filter(p => String(p.id) !== editId);

      // Remove projectId from tasks that belonged to this project
      const affectedTasks = _tasks.filter(t => String(t.projectId) === editId);
      for (const t of affectedTasks) {
        t.projectId = null;
        fetch(`/tasks/${t.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        }).catch(() => {});
      }

      _renderSidebarProjects();
      _renderTopbarProjects();
      _populateNewTaskProjectSelect();
      _renderFeed();
      _toast('Projecto eliminado.', 'danger');
      window.bootstrap.Modal.getInstance(_el('projectModal'))?.hide();

      // Reset filter if was filtering by deleted project
      if (_filter === `project:${editId}`) {
        _filter = 'all';
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('ent-nav-item--active'));
        document.querySelector('[data-filter="all"]')?.classList.add('ent-nav-item--active');
        _renderFeed();
      }
    } catch {
      _toast('Erro ao eliminar projecto.', 'danger');
    }
  });
}

// ── Org Users Modal (reuse org-users.js logic inline) ────────────────────────

function _handleTimeLog(taskId, seconds) {
  const task = _tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  const now = new Date().toISOString();
  task.totalSeconds = (task.totalSeconds ?? 0) + seconds;
  task.timeLog = [...(task.timeLog ?? []), { seconds, date: now }];
  task.updatedAt = now;
  fetch(`/tasks/${task.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  }).catch(() => {});
  if (String(_activeId) === String(task.id)) _renderDetailHeader(task);
  _renderFeed();
  _updateSidebarCounts();
}

function _buildEntCommands() {
  return [
    { label: 'Nova Tarefa',      icon: 'bi-plus-lg',                  shortcut: 'N', action: () => _el('btn-ent-new')?.click() },
    { label: 'Exportar JSON',    icon: 'bi-filetype-json',            action: () => _el('btn-export-json')?.click() },
    { label: 'Exportar CSV',     icon: 'bi-filetype-csv',             action: () => _el('btn-export-csv')?.click() },
    { label: 'Dependências',     icon: 'bi-diagram-3',                shortcut: 'D', action: () => _el('btn-show-dag')?.click() },
    { label: 'Automações',       icon: 'bi-gear-wide-connected',      shortcut: 'A', action: () => _el('btn-show-automations')?.click() },
    { label: 'Pomodoro',         icon: 'bi-stopwatch',                shortcut: 'P', action: () => _el('btn-show-pomodoro')?.click() },
    { label: 'Git Tools',        icon: 'bi-git',                      shortcut: 'G', action: () => _el('btn-show-git-tools')?.click() },
    { label: 'Modo Foco',        icon: 'bi-lightning-fill',           shortcut: 'F', action: () => _el('btn-show-deep-work')?.click() },
    { label: 'Post-mortem',      icon: 'bi-file-earmark-text',       action: () => _el('btn-show-postmortem')?.click() },
    { label: 'Débito Técnico',   icon: 'bi-bug-fill',                action: () => _el('btn-show-tech-debt')?.click() },
    { label: 'Estatísticas',     icon: 'bi-bar-chart-fill',          shortcut: 'S', action: () => _el('btn-toggle-stats')?.click() },
    { label: 'Gerir Utilizadores', icon: 'bi-people-fill',           action: () => _el('btn-ent-org-users')?.click() },
    { label: 'Terminar Sessão',  icon: 'bi-box-arrow-right',         action: () => _el('btn-ent-logout')?.click() },
  ];
}

function _bindStatsToggle() {
  const btn   = _el('btn-toggle-stats');
  const panel = _el('stats-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = !panel.hidden;
    panel.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
    if (!open) updateStats(_tasks);
  });
}

function _initOrgUsersModal() {
  const modalEl = _el('orgUsersModal');
  if (!modalEl) return;

  modalEl.addEventListener('show.bs.modal', _loadAndRenderOrgUsers);

  _el('org-btn-toggle-pw')?.addEventListener('click', () => {
    const pw  = _el('org-new-password');
    const eye = _el('org-pw-eye');
    if (!pw) return;
    pw.type    = pw.type === 'text' ? 'password' : 'text';
    eye.className = pw.type === 'text' ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  _el('org-create-user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = _el('org-new-name').value.trim();
    const email    = _el('org-new-email').value.trim();
    const password = _el('org-new-password').value;
    const role     = _el('org-new-role').value;

    if (!name || !email || !password) {
      _orgFormError('Preencha todos os campos obrigatórios.'); return;
    }
    if (password.length < 6) { _orgFormError('Palavra-passe mínima: 6 caracteres.'); return; }

    const btn = _el('org-btn-create-user');
    btn.disabled = true;

    try {
      const check = await fetch(`/users?email=${encodeURIComponent(email)}`);
      const exist = await check.json();
      if (exist.length > 0) { _orgFormError('Já existe uma conta com este email.'); return; }

      const res = await fetch('/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, organizationId: _session.organizationId, plan: _session.plan ?? 'business', createdAt: new Date().toISOString(), createdBy: _session.id }),
      });
      if (!res.ok) throw new Error('Erro ao criar utilizador.');

      _users = await _loadOrgUsers(); // refresh
      _el('org-create-user-form')?.reset();
      _orgFormError('');
      _orgFormSuccess(`${name} adicionado com sucesso.`);
      await _loadAndRenderOrgUsers();
    } catch (err) {
      _orgFormError(err.message ?? 'Erro inesperado.');
    } finally { btn.disabled = false; }
  });
}

async function _loadAndRenderOrgUsers() {
  const list  = _el('org-user-list');
  const count = _el('org-user-count');
  if (!list) return;

  list.innerHTML = '<p class="text-muted small text-center py-2">A carregar…</p>';

  try {
    const users = await _loadOrgUsers();
    if (count) count.textContent = users.length;

    if (users.length === 0) {
      list.innerHTML = '<p class="text-muted small text-center py-2">Sem membros.</p>';
      return;
    }

    list.innerHTML = users.map(u => {
      const isSelf = String(u.id) === String(_session.id);
      return `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem;border-radius:.45rem;background:#161b22;border:1px solid #21262d;margin-bottom:.4rem">
          <div class="ent-avatar ent-avatar--sm" style="background:${_userColor(u.name ?? '')}">${(u.name ?? '?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.85rem;font-weight:600;color:#c9d1d9">${_esc(u.name)} ${isSelf ? '<span class="badge bg-secondary ms-1" style="font-size:.6rem">Você</span>' : ''}</div>
            <div style="font-size:.75rem;color:#8b949e">${_esc(u.email)}</div>
          </div>
          <span style="font-size:.75rem;font-weight:600;color:${u.role === 'admin' ? '#d29922' : '#8b949e'}">${u.role === 'admin' ? 'Admin' : 'Membro'}</span>
          ${!isSelf && _session.role === 'admin' ? `<button class="btn btn-sm btn-outline-danger py-0 px-1 org-rm-btn" data-uid="${u.id}" data-name="${_esc(u.name)}" title="Remover"><i class="bi bi-person-x-fill"></i></button>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.org-rm-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Remover ${btn.dataset.name}?`)) return;
        await fetch(`/users/${btn.dataset.uid}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: null, role: 'user', plan: 'free' }),
        });
        _users = await _loadOrgUsers();
        await _loadAndRenderOrgUsers();
        _orgFormSuccess(`${btn.dataset.name} removido da organização.`);
      });
    });
  } catch {
    list.innerHTML = '<p class="text-danger small py-2">Erro ao carregar membros.</p>';
  }
}

function _orgFormError(msg) {
  const el = _el('org-form-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('d-none', !msg);
}

function _orgFormSuccess(msg) {
  const el = _el('org-form-success');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 4000);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
