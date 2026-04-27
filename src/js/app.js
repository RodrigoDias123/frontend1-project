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

import { localFetch as fetch } from './localApi.js';
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
      if (!navigator.onLine) _toast('Sem ligação — a trabalhar offline.', 'info');
    }

    // Adiciona tasks de exemplo apenas localmente, se não houver tasks reais
    if (_tasks.length === 0) {
      const exemplos = [
        {
          id: 'exemplo-todo',
          title: 'Feature: Nova funcionalidade',
          description: 'Implemente uma nova funcionalidade no sistema.',
          priority: 'alta',
          status: 'todo',
          labels: ['feature'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        },
        {
          id: 'exemplo-todo2',
          title: 'Onboarding: Primeiros passos',
          description: 'Leia o guia rápido para começar a usar o Dev Tasks.',
          priority: 'media',
          status: 'todo',
          labels: ['onboarding'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        },
        {
          id: 'exemplo-progress',
          title: 'Bug: Corrigir erro de login',
          description: 'Usuários não conseguem acessar com senha incorreta.',
          priority: 'media',
          status: 'progress',
          labels: ['bug'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        },
        {
          id: 'exemplo-progress2',
          title: 'Automação: Backup diário',
          description: 'Verifique se o backup automático está funcionando.',
          priority: 'baixa',
          status: 'progress',
          labels: ['automação'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        },
        {
          id: 'exemplo-done',
          title: 'Melhoria: Atualizar documentação',
          description: 'Documentação do projeto revisada e publicada.',
          priority: 'baixa',
          status: 'done',
          labels: ['melhoria'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        },
        {
          id: 'exemplo-done2',
          title: 'Release: Versão 1.0 publicada',
          description: 'Primeira versão estável disponível para todos os usuários.',
          priority: 'alta',
          status: 'done',
          labels: ['release'],
          userId: _userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          comments: [],
          history: [],
        }
      ];
      _tasks = exemplos;
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

    // 7. Wire export
    initExport(() => _tasks);

    // 8. Pomodoro timer — logs time back to the task
    initPomodoro(_handleTimeLog);
    document.addEventListener('task:pomodoro', (e) => {
      const task = _tasks.find((t) => String(t.id) === String(e.detail.taskId));
      if (task) startPomodoroFor(task);
    });

    // 9. Command palette (Ctrl+K)
    initShortcuts([
      { label: 'Nova Tarefa (A Fazer)', icon: 'bi-plus-lg', shortcut: 'N',
        action: () => document.querySelector('[data-bs-target="#taskModal"][data-column="todo"]')?.click() },
      { label: 'Exportar JSON', icon: 'bi-download',
        action: () => document.getElementById('btn-export-json')?.click() },
      { label: 'Exportar CSV', icon: 'bi-filetype-csv',
        action: () => document.getElementById('btn-export-csv')?.click() },
      { label: 'Estatísticas', icon: 'bi-bar-chart',
        action: () => document.getElementById('btn-toggle-stats')?.click() },
    ]);

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
    if (window.Swal) {
      Swal.fire({
        icon: 'success',
        title: 'Tarefa criada!',
        text: `A tarefa "${created.title}" foi criada com sucesso.`,
        timer: 1800,
        showConfirmButton: false
      });
    }
  } catch (_) {
    // Offline fallback — store locally com id temporário
    const offline = { ...payload, id: `offline-${Date.now()}` };
    _tasks.push(offline);
    saveCache(_tasks);
    addTaskCard(offline);
    updateStats(_tasks);
    addPendingOp({ type: 'create', data: offline });
    if (window.Swal) {
      Swal.fire({
        icon: 'error',
        title: 'Sem ligação',
        text: 'Tarefa guardada localmente.',
        timer: 2200,
        showConfirmButton: false
      });
    }
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


    try {
      const saved = await updateTask(taskId, updated);
      const idx = _tasks.findIndex((t) => String(t.id) === String(taskId));
      if (idx !== -1) _tasks[idx] = saved;
    } catch (_) {
      addPendingOp({ type: 'update', id: taskId, data: updated });
    }
    saveCache(_tasks);
  });
}

// ── Online / Offline ──────────────────────────────────────────────────────────

function _handleOffline() {
  _toast('Ligação perdida — modo offline.', 'info');
}

async function _handleOnline() {
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

  const existing = window.bootstrap.Toast.getInstance(toastEl);
  if (existing) existing.dispose();
  new window.bootstrap.Toast(toastEl, { autohide: true, delay: 3500 }).show();
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

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Session ───────────────────────────────────────────────────────────────

function _initSession() {
  let raw = localStorage.getItem('devtasks_user');
  if (!raw) {
    const def = { id: 'local', name: 'Utilizador', email: 'user@local', role: 'admin' };
    localStorage.setItem('devtasks_user', JSON.stringify(def));
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Modules are deferred but DOMContentLoaded may already have fired by the time
// all imports resolve. Use readyState as a fallback.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
