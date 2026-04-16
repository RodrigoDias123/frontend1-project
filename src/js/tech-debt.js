/**
 * tech-debt.js — Technical Debt Manager
 *
 * Features:
 *  - Quick-add form for creating tasks tagged with "tech-debt"
 *  - Dashboard listing all tech-debt tasks grouped by status
 *  - Manual TODO/FIXME registry
 */

let _getTasksFn   = null;
let _createTaskFn = null;

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {() => Object[]} getTasksFn
 * @param {(data: Object) => void} createTaskFn  — same signature as _handleSave(null, data)
 */
export function initTechDebt(getTasksFn, createTaskFn) {
  _getTasksFn   = getTasksFn;
  _createTaskFn = createTaskFn;

  document.getElementById('btn-show-tech-debt')?.addEventListener('click', () => {
    _renderDebtList();
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('techDebtModal')).show();
  });

  document.getElementById('techDebtModal')?.addEventListener('show.bs.modal', _renderDebtList);
  document.getElementById('btn-add-debt')?.addEventListener('click', _addDebtTask);

  // Allow Enter in the title field to submit
  document.getElementById('debt-title')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _addDebtTask(); }
  });
}

/**
 * Refresh the debt list (called from app.js after task updates).
 */
export function refreshDebtList() {
  const modal = document.getElementById('techDebtModal');
  if (modal?.classList.contains('show')) _renderDebtList();
}

// ── Private ───────────────────────────────────────────────────────────────────

function _addDebtTask() {
  const titleEl = document.getElementById('debt-title');
  const typeEl  = document.getElementById('debt-type');
  const errorEl = document.getElementById('debt-error');
  const title   = titleEl?.value?.trim() ?? '';

  if (!title || title.length < 3) {
    if (errorEl) { errorEl.textContent = 'O título deve ter pelo menos 3 caracteres.'; errorEl.classList.remove('d-none'); }
    return;
  }
  if (errorEl) errorEl.classList.add('d-none');

  const type   = typeEl?.value ?? 'refactoring';
  const today  = new Date();
  const dueDate = new Date(today.getTime() + 30 * 86_400_000) // 30 days from now
    .toISOString().slice(0, 10);

  const data = {
    title,
    description: `**Tipo de débito técnico:** ${type}`,
    priority:    'baixa',
    dueDate,
    status:      'todo',
    labels:      ['tech-debt', type],
    blockedBy:   [],
  };

  _createTaskFn(null, data);

  // Reset form
  if (titleEl) titleEl.value = '';
  if (typeEl)  typeEl.value  = 'refactoring';

  // Re-render list after a short delay (to let app.js process the creation)
  setTimeout(_renderDebtList, 400);
}

function _renderDebtList() {
  const container = document.getElementById('debt-list');
  if (!container || !_getTasksFn) return;

  const allTasks  = _getTasksFn();
  const debtTasks = allTasks.filter(
    (t) => (t.labels ?? []).includes('tech-debt') || (t.labels ?? []).includes('TODO') || (t.labels ?? []).includes('FIXME')
  );

  if (!debtTasks.length) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted small">
        <i class="bi bi-bug display-6 d-block mb-2 opacity-25"></i>
        Nenhum débito técnico registado.
      </div>`;
    return;
  }

  const byStatus = {
    todo:  debtTasks.filter((t) => t.status === 'todo'),
    doing: debtTasks.filter((t) => t.status === 'doing'),
    done:  debtTasks.filter((t) => t.status === 'done'),
  };

  const statusLabel = { todo: 'To Do', doing: 'Em progresso', done: 'Resolvido' };
  const statusColor = { todo: 'text-secondary', doing: 'text-warning', done: 'text-success' };

  container.innerHTML = Object.entries(byStatus)
    .filter(([, tasks]) => tasks.length > 0)
    .map(([status, tasks]) => `
      <div class="mb-3">
        <h6 class="small fw-semibold ${statusColor[status]} mb-2">
          ${statusLabel[status]} (${tasks.length})
        </h6>
        <div class="list-group list-group-flush">
          ${tasks.map((t) => {
            const extraLabels = (t.labels ?? []).filter((l) => l !== 'tech-debt').join(', ');
            return `
            <div class="list-group-item list-group-item-action py-2 px-2 border border-secondary-subtle rounded mb-1" style="background:#161b22;">
              <div class="d-flex align-items-start gap-2">
                <div class="flex-grow-1 min-w-0">
                  <div class="small fw-semibold text-truncate">#${t.id} — ${_esc(t.title)}</div>
                  ${extraLabels ? `<div class="text-muted" style="font-size:.68rem">${_esc(extraLabels)}</div>` : ''}
                </div>
                <span class="badge bg-secondary-subtle text-secondary flex-shrink-0" style="font-size:.6rem">${t.priority}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`)
    .join('');
}
