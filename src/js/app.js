/**
 * app.js — Application entry point and orchestration layer.
 *
 * Responsibilities:
 *  - Service Worker registration (PWA)
 *  - Load tasks from API; fall back to LocalStorage when offline
 *  - Wire all modules together (board, modal, stats)
 *  - Handle CRUD operations (create, update, delete)
 *  - Handle drag-and-drop column moves (board:task-moved)
 *  - Online / offline detection and pending-op sync
 *  - Toast notifications
 */

import { getTasks, createTask, updateTask, deleteTask } from './api.js';
import {
  saveCache,
  getCache,
  updateCacheItem,
  removeCacheItem,
  addPendingOp,
  getPendingOps,
  clearPendingOps,
} from './storage.js';
import { initBoard, addTaskCard, removeTaskCard, updateTaskCard } from './board.js';
import { initModal, openForEdit } from './modal.js';
import { initStats, updateStats } from './stats.js';
import { initExport } from './export.js';
import { initPomodoro, startPomodoroFor } from './pomodoro.js';
import { initShortcuts } from './shortcuts.js';
import { evalRules, initAutomationsUI } from './automations.js';
import { initGitTools } from './git-tools.js';
import { initDeepWork } from './deep-work.js';
import { initPostMortem, promptPostMortem } from './post-mortem.js';
import { initTechDebt, refreshDebtList } from './tech-debt.js';
import { initOrgUsers } from './org-users.js';

// ── State ─────────────────────────────────────────────────────────────────────

/** In-memory task list — always kept in sync with the API / cache. */
let _tasks = [];

/** Task id queued for deletion, waiting for confirmation. */
let _pendingDeleteId = null;

/** Bootstrap Modal instance for the delete-confirm dialog. */
let _deleteModal = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  try {
    // 1. Unregister ALL Service Workers to clear stale caches
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch (_) { /* ignore */ }
    }

    // 2. Online / offline setup
    _syncOfflineBanner();
    window.addEventListener('online',  _handleOnline);
    window.addEventListener('offline', _handleOffline);

    // 3. Load tasks (scoped to the current user)
    const _sessionUser = JSON.parse(localStorage.getItem('devtasks_user') ?? 'null');
    const _userId = _sessionUser?.id ?? null;
    try {
      _tasks = await getTasks(_userId);
      saveCache(_tasks);
    } catch (_) {
      _tasks = getCache();
      if (!navigator.onLine) _showOfflineBanner(true);
    }

    // 4. Initialise UI modules
    initBoard(_tasks);
    initStats();
    updateStats(_tasks);
    initModal(_handleSave, () => _tasks);

    // 5. Bind global events
    _bindGlobalEvents();

    // 6. Display user name & wire logout
    _initSession();

    // 7. Wire new feature modules
    initExport(() => _tasks);
    initPomodoro(_handleTimeLog);
    initAutomationsUI(() => updateStats(_tasks));
    initShortcuts(_buildCommands());
    initGitTools(() => _tasks, (taskId, data) => _editTask(taskId, data));
    initDeepWork(() => _tasks);
    initPostMortem(() => _tasks);
    initTechDebt(() => _tasks, (taskId, data) => _handleSave(taskId, data));
    initOrgUsers();

  } catch (err) {
    console.error('[app] init failed:', err);
    throw err;
  }
}

// ── CRUD handlers ─────────────────────────────────────────────────────────────

/**
 * Called by modal.js when the user submits the task form.
 * @param {string|null} taskId  null → create; truthy string → edit
 * @param {Object}      data    Form data
 */
async function _handleSave(taskId, data) {
  if (taskId) {
    await _editTask(taskId, data);
  } else {
    await _createTask(data);
  }
}

async function _createTask(data) {
  const _sessionUser = JSON.parse(localStorage.getItem('devtasks_user') ?? 'null');
  const payload = {
    ...data,
    userId:       _sessionUser?.id ?? null,
    createdAt:    new Date().toISOString(),
    labels:       data.labels    ?? [],
    blockedBy:    data.blockedBy ?? [],
    timeLog:      [],
    totalSeconds: 0,
  };
  try {
    const created = await createTask(payload);
    _tasks.push(created);
    saveCache(_tasks);
    addTaskCard(created);
    updateStats(_tasks);
    const actions = evalRules('task_created', created, {});
    _applyAutomationActions(actions);
    refreshDebtList();
    _toast('Tarefa criada com sucesso!', 'success');
  } catch (_) {
    // Offline fallback — store locally with a temporary id
    const offline = { ...payload, id: `offline-${Date.now()}` };
    _tasks.push(offline);
    saveCache(_tasks);
    addTaskCard(offline);
    updateStats(_tasks);
    addPendingOp({ type: 'create', data: offline });
    _toast('Sem ligação — tarefa guardada localmente.', 'info');
  }
}

async function _editTask(taskId, data) {
  const existing = _tasks.find((t) => String(t.id) === String(taskId));
  if (!existing) return;
  const updated   = { ...existing, ...data };
  const oldStatus = existing.status;
  const newStatus = updated.status;
  try {
    const saved = await updateTask(taskId, updated);
    _tasks = _tasks.map((t) => (String(t.id) === String(taskId) ? saved : t));
    saveCache(_tasks);
    updateTaskCard(saved);
    updateStats(_tasks);
    _toast('Tarefa atualizada.', 'success');
  } catch (_) {
    // Persist locally and queue for sync
    _tasks = _tasks.map((t) => (String(t.id) === String(taskId) ? updated : t));
    saveCache(_tasks);
    updateCacheItem(updated);
    updateTaskCard(updated);
    updateStats(_tasks);
    addPendingOp({ type: 'update', id: taskId, data: updated });
    _toast('Sem ligação — alteração guardada localmente.', 'info');
  }
  // Evaluate automation rules on status change
  if (oldStatus !== newStatus) {
    const actions = evalRules('status_changed', updated, { newStatus, oldStatus });
    _applyAutomationActions(actions);
    if (newStatus === 'done') {
      const doneTask = _tasks.find((t) => String(t.id) === String(taskId));
      if (doneTask) promptPostMortem(doneTask);
    }
  }
}

async function _deleteTask(taskId) {
  try {
    await deleteTask(taskId);
  } catch (_) {
    addPendingOp({ type: 'delete', id: taskId });
  }
  _tasks = _tasks.filter((t) => String(t.id) !== String(taskId));
  saveCache(_tasks);
  removeCacheItem(taskId);
  removeTaskCard(taskId);
  updateStats(_tasks);
  _toast('Tarefa eliminada.', 'info');
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function _bindGlobalEvents() {
  // ── task:edit (from <task-card>) ──
  document.addEventListener('task:edit', (e) => {
    const task = _tasks.find((t) => String(t.id) === String(e.detail.taskId));
    if (task) openForEdit(task);
  });

  // ── task:delete (from <task-card>) ──
  document.addEventListener('task:delete', (e) => {
    _pendingDeleteId = e.detail.taskId;
    _deleteModal = window.bootstrap.Modal.getOrCreateInstance(
      document.getElementById('deleteModal')
    );
    _deleteModal.show();
  });

  // ── task:pomodoro (from <task-card>) ──
  document.addEventListener('task:pomodoro', (e) => {
    const task = _tasks.find((t) => String(t.id) === String(e.detail.taskId));
    if (task) startPomodoroFor(task);
  });

  // ── Delete confirmation button ──
  document.getElementById('btn-confirm-delete').addEventListener('click', () => {
    if (_pendingDeleteId) {
      const id = _pendingDeleteId;
      _pendingDeleteId = null;
      window.bootstrap.Modal.getInstance(document.getElementById('deleteModal'))?.hide();
      _deleteTask(id);
    }
  });

  // ── board:task-moved (from board.js Sortable) ──
  document.addEventListener('board:task-moved', async (e) => {
    const { taskId, newStatus } = e.detail;
    const task = _tasks.find((t) => String(t.id) === String(taskId));
    if (!task) return;

    const oldStatus = task.status;
    const updated   = { ...task, status: newStatus };
    task.status = newStatus; // mutate in-place for instant UI consistency
    updateStats(_tasks);

    // Evaluate automation rules
    const actions = evalRules('status_changed', updated, { newStatus, oldStatus });
    _applyAutomationActions(actions);

    try {
      const saved = await updateTask(taskId, updated);
      const idx = _tasks.findIndex((t) => String(t.id) === String(taskId));
      if (idx !== -1) _tasks[idx] = saved;
    } catch (_) {
      addPendingOp({ type: 'update', id: taskId, data: updated });
    }
    saveCache(_tasks);
  });

  // ── Feature panel buttons ──
  document.getElementById('btn-show-dag')?.addEventListener('click', _openDAG);
  document.getElementById('btn-show-automations')?.addEventListener('click', () => {
    window.bootstrap.Modal.getOrCreateInstance(
      document.getElementById('automationsModal')
    ).show();
  });
  document.getElementById('btn-show-pomodoro')?.addEventListener('click', () => {
    const w = document.getElementById('pomo-widget');
    if (w) w.hidden = false;
  });

  // ── board:task-moved — trigger post-mortem suggestion when moved to done ──
  document.addEventListener('board:task-moved', async (e) => {
    const { taskId, newStatus } = e.detail;
    if (newStatus === 'done') {
      const task = _tasks.find((t) => String(t.id) === String(taskId));
      if (task) promptPostMortem(task);
    }
  }, { capture: false });
}

// ── Online / Offline ──────────────────────────────────────────────────────────

function _syncOfflineBanner() {
  _showOfflineBanner(!navigator.onLine);
}

function _showOfflineBanner(show) {
  document.getElementById('offline-banner').hidden = !show;
}

function _handleOffline() {
  _showOfflineBanner(true);
}

async function _handleOnline() {
  _showOfflineBanner(false);
  await _flushPendingOps();
}

async function _flushPendingOps() {
  const ops = getPendingOps();
  if (!ops.length) return;

  for (const op of ops) {
    try {
      if (op.type === 'create') {
        const { id, ...fields } = op.data; // strip temporary offline id
        await createTask(fields);
      } else if (op.type === 'update') {
        await updateTask(op.id, op.data);
      } else if (op.type === 'delete') {
        await deleteTask(op.id);
      }
    } catch (_) { /* skip if still unreachable */ }
  }

  clearPendingOps();

  // Reload fresh data from server
  try {
    _tasks = await getTasks();
    saveCache(_tasks);
    initBoard(_tasks);
    updateStats(_tasks);
    _toast('Dados sincronizados com o servidor.', 'success');
  } catch (_) { /* remain on cached data */ }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

/**
 * @param {string} message
 * @param {'success'|'info'|'error'} type
 */
function _toast(message, type = 'info') {
  const toastEl = document.getElementById('app-toast');
  const msgEl   = document.getElementById('toast-message');

  toastEl.classList.remove('toast--success', 'toast--info', 'toast--error');
  toastEl.classList.add(`toast--${type}`);
  msgEl.textContent = message;

  window.bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3500 }).show();
}

// ── Time Log (Pomodoro callback) ──────────────────────────────────────────────

async function _handleTimeLog(taskId, seconds) {
  const task = _tasks.find((t) => String(t.id) === String(taskId));
  if (!task) return;
  const today   = new Date().toISOString().slice(0, 10);
  const timeLog = [...(task.timeLog ?? []), { date: today, seconds }];
  const updated = { ...task, timeLog, totalSeconds: (task.totalSeconds ?? 0) + seconds };
  await _editTask(String(task.id), updated);
}

// ── Automation Actions ────────────────────────────────────────────────────────

function _applyAutomationActions(actions) {
  for (const action of actions) {
    switch (action.type) {
      case 'show_toast':
        _toast(`🤖 ${action.ruleName}: ${action.params?.value || action.task.title}`, 'info');
        break;
      case 'move_to':
        if (action.params?.value) {
          const t = _tasks.find((x) => String(x.id) === String(action.task.id));
          if (t && t.status !== action.params.value) {
            _editTask(String(t.id), { ...t, status: action.params.value }).catch(() => {});
          }
        }
        break;
      case 'add_label':
        if (action.params?.value) {
          const t = _tasks.find((x) => String(x.id) === String(action.task.id));
          if (t) {
            const labels = [...new Set([...(t.labels ?? []), action.params.value])];
            _editTask(String(t.id), { ...t, labels }).catch(() => {});
          }
        }
        break;
    }
  }
}

// ── DAG View ──────────────────────────────────────────────────────────────────

function _openDAG() {
  const content = document.getElementById('dag-content');
  if (!content) return;
  const withDeps = _tasks.filter((t) => t.blockedBy?.length);
  if (!withDeps.length) {
    content.innerHTML = '<p class="text-muted small text-center py-3">Nenhuma dependência definida.</p>';
  } else {
    content.innerHTML = `<div class="dag-list">${
      withDeps.map((t) => {
        const deps = (t.blockedBy ?? []).map((id) => {
          const dep = _tasks.find((x) => String(x.id) === String(id));
          return dep
            ? `<span class="badge me-1 rounded-pill" style="background:var(--${dep.status === 'done' ? 'bs-success' : 'bs-danger'})">${_esc(dep.title)}</span>`
            : '';
        }).join('');
        return `<div class="mb-3 pb-3 border-bottom border-secondary-subtle">
          <div class="fw-semibold small mb-1">${_esc(t.title)} <span class="badge bg-secondary-subtle text-secondary ms-1">${t.status}</span></div>
          <div class="small">Bloqueado por: ${deps || '<em class="text-muted">nenhum</em>'}</div>
        </div>`;
      }).join('')
    }</div>`;
  }
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById('dagModal')).show();
}

// ── Command Palette Commands ──────────────────────────────────────────────────

function _buildCommands() {
  return [
    { label: 'Nova Tarefa',       icon: 'bi-plus-lg',              shortcut: 'N', action: () => document.getElementById('btn-new-task')?.click() },
    { label: 'Estatísticas',      icon: 'bi-bar-chart-fill',       shortcut: 'S', action: () => document.getElementById('btn-toggle-stats')?.click() },
    { label: 'Dependências (DAG)', icon: 'bi-diagram-3',           shortcut: 'D', action: _openDAG },
    { label: 'Automações',        icon: 'bi-gear-wide-connected',  shortcut: 'A', action: () => window.bootstrap.Modal.getOrCreateInstance(document.getElementById('automationsModal')).show() },
    { label: 'Pomodoro',          icon: 'bi-stopwatch',            shortcut: 'P', action: () => { const w = document.getElementById('pomo-widget'); if (w) w.hidden = false; } },
    { label: 'Exportar JSON',     icon: 'bi-filetype-json',                       action: () => document.getElementById('btn-export-json')?.click() },
    { label: 'Exportar CSV',      icon: 'bi-filetype-csv',                        action: () => document.getElementById('btn-export-csv')?.click() },
    { label: 'Git Tools',         icon: 'bi-git',          shortcut: 'G',         action: () => document.getElementById('btn-show-git-tools')?.click() },
    { label: 'Modo Foco',         icon: 'bi-lightning-fill', shortcut: 'F',       action: () => document.getElementById('btn-show-deep-work')?.click() },
    { label: 'Post-mortem',       icon: 'bi-file-earmark-text',                   action: () => document.getElementById('btn-show-postmortem')?.click() },
    { label: 'Débito Técnico',    icon: 'bi-bug-fill',                            action: () => document.getElementById('btn-show-tech-debt')?.click() },
  ];
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Session (user display & logout) ───────────────────────────────────────

function _initials(name, email) {
  const src = name || email || '?';
  return src.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Update every avatar element (header + profile modal) from user object
function _setAvatarDisplays(user) {
  const initials = _initials(user.name, user.email);
  const url = user.avatarUrl || null;

  // Header button
  const photoEl    = document.getElementById('user-avatar-photo');
  const initialsEl = document.getElementById('user-avatar-initials');
  if (initialsEl) initialsEl.textContent = initials;
  if (photoEl) {
    if (url) {
      photoEl.src = url;
      photoEl.classList.remove('d-none');
      initialsEl?.classList.add('d-none');
    } else {
      photoEl.classList.add('d-none');
      initialsEl?.classList.remove('d-none');
    }
  }

  // Profile modal large avatar
  const avLg = document.getElementById('profile-avatar-lg');
  if (avLg) {
    if (url) {
      avLg.textContent = '';
      avLg.style.backgroundImage  = `url(${url})`;
      avLg.style.backgroundSize   = 'cover';
      avLg.style.backgroundPosition = 'center';
    } else {
      avLg.textContent = initials;
      avLg.style.backgroundImage = '';
    }
  }
}

// Resize an image File to maxSize×maxSize and return a JPEG data URL
function _resizeImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function _handleAvatarChange(e, user) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    _showProfileMsg('Ficheiro inválido. Escolhe uma imagem.', 'danger'); return;
  }
  try {
    const dataUrl = await _resizeImage(file, 256);
    const res = await fetch(`/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl: dataUrl }),
    });
    if (!res.ok) throw new Error();
    user.avatarUrl = dataUrl;
    localStorage.setItem('devtasks_user', JSON.stringify(user));
    _setAvatarDisplays(user);
    _showProfileMsg('Foto atualizada com sucesso!');
  } catch {
    _showProfileMsg('Não foi possível guardar a foto. Tente novamente.', 'danger');
  }
  // reset so same file can be re-selected
  e.target.value = '';
}

function _initSession() {
  const raw = localStorage.getItem('devtasks_user');
  if (!raw) return;

  let user;
  try { user = JSON.parse(raw); } catch { return; }

  const avatarBtn = document.getElementById('btn-profile');
  if (avatarBtn) {
    _setAvatarDisplays(user);
    avatarBtn.classList.remove('d-none');
    avatarBtn.addEventListener('click', () => _openProfile());
  }

  // Logout button (header)
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('devtasks_user');
    window.location.href = 'login.html';
  });
}

// ── Profile Modal ───────────────────────────────────────────────────────────

function _openProfile() {
  const raw = localStorage.getItem('devtasks_user');
  if (!raw) return;
  let user;
  try { user = JSON.parse(raw); } catch { return; }

  // Populate hero
  _setAvatarDisplays(user);
  document.getElementById('profile-name-display').textContent = user.name  || '(sem nome)';
  document.getElementById('profile-email-display').textContent = user.email || '';
  document.getElementById('profile-name-input').value        = user.name  || '';
  _clearProfileMsg();

  // Wire avatar file input (clone to remove stale listeners)
  const fi = document.getElementById('profile-avatar-input');
  if (fi) {
    const newFi = fi.cloneNode(true);
    fi.replaceWith(newFi);
    newFi.addEventListener('change', (e) => _handleAvatarChange(e, user));
  }

  // Personal stats
  const total = _tasks.length;
  const done  = _tasks.filter((t) => t.status === 'done').length;
  const secs  = _tasks.reduce((s, t) => s + (t.totalSeconds ?? 0), 0);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  document.getElementById('pstat-total').textContent = total;
  document.getElementById('pstat-done').textContent  = done;
  document.getElementById('pstat-time').textContent  = secs > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : '0h';

  // Wire buttons once (remove old listeners by cloning)
  _rewire('btn-save-name',     () => _saveProfileName(user));
  _rewire('btn-save-password', () => _saveProfilePassword(user));
  _rewire('btn-logout-all',    () => { localStorage.removeItem('devtasks_user'); window.location.href = 'login.html'; });
  _rewire('btn-delete-account',() => _deleteAccount(user));

  window.bootstrap.Modal.getOrCreateInstance(document.getElementById('profileModal')).show();
}

function _rewire(id, fn) {
  const el  = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  clone.addEventListener('click', fn);
}

function _showProfileMsg(msg, type = 'success') {
  const el = document.getElementById('profile-msg');
  el.className = `alert alert-${type} py-2 small`;
  el.textContent = msg;
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 3500);
}

function _clearProfileMsg() {
  document.getElementById('profile-msg').classList.add('d-none');
}

async function _saveProfileName(user) {
  const newName = document.getElementById('profile-name-input').value.trim();
  if (!newName || newName.length < 2) {
    _showProfileMsg('O nome deve ter pelo menos 2 caracteres.', 'danger'); return;
  }
  try {
    const res = await fetch(`/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) throw new Error();
    user.name = newName;
    localStorage.setItem('devtasks_user', JSON.stringify(user));
    document.getElementById('profile-name-display').textContent = newName;
    _setAvatarDisplays(user);
    _showProfileMsg('Nome atualizado com sucesso!');
  } catch {
    _showProfileMsg('Não foi possível guardar. Tente novamente.', 'danger');
  }
}

async function _saveProfilePassword(user) {
  const current = document.getElementById('profile-pw-current').value;
  const next    = document.getElementById('profile-pw-new').value;
  const confirm = document.getElementById('profile-pw-confirm').value;

  if (!current) { _showProfileMsg('Introduza a palavra-passe atual.', 'danger'); return; }
  if (next.length < 6) { _showProfileMsg('A nova palavra-passe deve ter pelo menos 6 caracteres.', 'danger'); return; }
  if (next !== confirm) { _showProfileMsg('As palavras-passe não coincidem.', 'danger'); return; }

  try {
    const res = await fetch(`/users/${user.id}`);
    if (!res.ok) throw new Error();
    const serverUser = await res.json();
    if (serverUser.password !== current) {
      _showProfileMsg('Palavra-passe atual incorreta.', 'danger'); return;
    }
    const upd = await fetch(`/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: next }),
    });
    if (!upd.ok) throw new Error();
    // Clear fields
    ['profile-pw-current', 'profile-pw-new', 'profile-pw-confirm'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    _showProfileMsg('Palavra-passe alterada com sucesso!');
  } catch {
    _showProfileMsg('Não foi possível alterar a palavra-passe.', 'danger');
  }
}

async function _deleteAccount(user) {
  const confirmed = window.confirm(
    `Tens a certeza que queres apagar a conta "${user.email}"?\nEsta acção não pode ser desfeita.`
  );
  if (!confirmed) return;
  try {
    await fetch(`/users/${user.id}`, { method: 'DELETE' });
  } catch { /* ignore — still clear session */ }
  localStorage.removeItem('devtasks_user');
  window.location.href = 'register.html';
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Modules are deferred but DOMContentLoaded may already have fired by the time
// all imports resolve. Use readyState as a fallback.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
