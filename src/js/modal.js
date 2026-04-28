/**
 * modal.js — Task creation / editing modal.
 *
 * Exports:
 *   initModal(onSave, getTasksFn)  — wire modal; onSave(taskId|null, data); getTasksFn() → tasks[]
 *   openForEdit(task)              — open modal pre-filled for editing
 */

import { renderMarkdown } from './markdown.js';
import { updateEstimateWarning, applyStoryPointSuggestion } from './estimates.js';

let _bsModal    = null;
let _onSave     = null;
let _getTasksFn = null;
/** @type {Object|null} task being edited; null when creating */
let _editTask   = null;

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * @param {(taskId: string|null, data: Object) => void} onSave
 * @param {() => Object[]} getTasksFn
 */
export function initModal(onSave, getTasksFn) {
  _onSave     = onSave;
  _getTasksFn = getTasksFn;

  const el = document.getElementById('taskModal');
  _bsModal  = window.bootstrap.Modal.getOrCreateInstance(el);

  el.addEventListener('show.bs.modal', (e) => {
    const trigger = e.relatedTarget;
    if (trigger && typeof trigger.blur === 'function') trigger.blur();

    if (!e.relatedTarget) return; // programmatic open (openForEdit) — already set up
    _editTask = null;
    _resetForm();
    const col = e.relatedTarget.dataset.column ?? 'todo';
    document.getElementById('task-column').value = col;
    _populateDepSelector(null);
  });

  el.addEventListener('shown.bs.modal', () => {
    const firstInput = document.getElementById('task-title');
    if (firstInput && typeof firstInput.focus === 'function') {
      firstInput.focus();
    }
  });

  el.addEventListener('hide.bs.modal', () => {
    const activeEl = document.activeElement;
    if (activeEl && el.contains(activeEl) && typeof activeEl.blur === 'function') {
      activeEl.blur();
    }
  });

  el.addEventListener('hidden.bs.modal', _resetForm);

  document.getElementById('btn-save-task').addEventListener('click', _handleSubmit);

  // Markdown write / preview toggle
  document.getElementById('md-write-btn')?.addEventListener('click', () => _setMdMode('write'));
  document.getElementById('md-preview-btn')?.addEventListener('click', () => _setMdMode('preview'));

  // Estimates: check warning on hour change
  document.getElementById('task-estimated-hours')?.addEventListener('change', () => {
    const hours   = parseFloat(document.getElementById('task-estimated-hours').value) || 0;
    const tasks   = _getTasksFn?.() ?? [];
    updateEstimateWarning(hours, tasks);
  });

  // Story points suggestion button
  document.getElementById('btn-suggest-sp')?.addEventListener('click', () => {
    const title = document.getElementById('task-title')?.value ?? '';
    const desc  = document.getElementById('task-description')?.value ?? '';
    applyStoryPointSuggestion(title, desc);
  });
}

/**
 * Open the modal pre-filled with an existing task for editing.
 * @param {Object} task
 */
export function openForEdit(task) {
  const activeEl = document.activeElement;
  if (activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur();
  }

  _editTask = task;
  _resetForm();
  _populateDepSelector(task);

  document.getElementById('taskModalLabel').textContent  = 'Editar Tarefa';
  document.getElementById('task-id').value               = task.id;
  document.getElementById('task-title').value            = task.title;
  document.getElementById('task-description').value      = task.description ?? '';
  document.getElementById('task-labels').value           = (task.labels ?? []).join(', ');
  document.getElementById('task-priority').value         = task.priority;
  document.getElementById('task-due-date').value         = task.dueDate ?? '';
  document.getElementById('task-column').value           = task.status;
  document.getElementById('task-status').value           = task.status;
  document.getElementById('status-group').hidden         = false;

  // Links
  const links = task.links ?? {};
  document.getElementById('link-vscode').value    = links.vscode    ?? '';
  document.getElementById('link-figma').value     = links.figma     ?? '';
  document.getElementById('link-swagger').value   = links.swagger   ?? '';
  document.getElementById('link-storybook').value = links.storybook ?? '';
  document.getElementById('link-custom').value    = links.custom    ?? '';

  // Blocked by (multiselect)
  const bbIds = (task.blockedBy ?? []).map(String);
  const select = document.getElementById('task-blocked-by');
  [...(select?.options ?? [])].forEach((opt) => {
    opt.selected = bbIds.includes(opt.value);
  });

  // Time log
  _renderTimeLog(task);

  // Dev tab — estimates
  document.getElementById('task-estimated-hours').value = task.estimatedHours ?? '';
  document.getElementById('task-story-points').value    = task.storyPoints    ?? '';
  document.getElementById('estimate-warning')?.classList.add('d-none');
  document.getElementById('story-points-suggestion')?.classList.add('d-none');

  _bsModal.show();
}

// ── Private ───────────────────────────────────────────────────────────────────

function _resetForm() {
  _editTask = null;
  const form = document.getElementById('task-form');
  form.reset();
  form.querySelectorAll('.is-invalid, .is-valid').forEach((el) => {
    el.classList.remove('is-invalid', 'is-valid');
  });
  document.getElementById('taskModalLabel').textContent = 'Nova Tarefa';
  document.getElementById('task-id').value              = '';
  document.getElementById('status-group').hidden        = true;
  document.getElementById('date-error').textContent     = 'A data é obrigatória e não pode ser no passado.';
  document.getElementById('task-time-log').hidden       = true;

  // Dev tab
  document.getElementById('task-estimated-hours').value = '';
  document.getElementById('task-story-points').value    = '';
  document.getElementById('estimate-warning')?.classList.add('d-none');
  document.getElementById('story-points-suggestion')?.classList.add('d-none');

  // Reset markdown mode to write
  _setMdMode('write');
}

function _setMdMode(mode) {
  const textarea = document.getElementById('task-description');
  const preview  = document.getElementById('md-preview-pane');
  const writeBtn = document.getElementById('md-write-btn');
  const prevBtn  = document.getElementById('md-preview-btn');

  if (mode === 'preview') {
    preview.innerHTML = renderMarkdown(textarea.value) || '<p class="text-muted fst-italic small">Sem conteúdo.</p>';
    preview.hidden    = false;
    textarea.hidden   = true;
    writeBtn?.classList.remove('active');
    prevBtn?.classList.add('active');
  } else {
    preview.hidden  = true;
    textarea.hidden = false;
    writeBtn?.classList.add('active');
    prevBtn?.classList.remove('active');
  }
}

function _populateDepSelector(currentTask) {
  const select = document.getElementById('task-blocked-by');
  if (!select || !_getTasksFn) return;
  const tasks  = _getTasksFn();
  const selfId = currentTask ? String(currentTask.id) : null;
  select.innerHTML = tasks
    .filter((t) => String(t.id) !== selfId)
    .map((t) => `<option value="${t.id}">${_esc(t.title)} [${t.status}]</option>`)
    .join('');
}

function _renderTimeLog(task) {
  const container = document.getElementById('task-time-log');
  const content   = document.getElementById('time-log-content');
  if (!container || !content) return;
  const log = task.timeLog ?? [];
  if (!log.length && !task.totalSeconds) { container.hidden = true; return; }
  container.hidden = false;
  const total = task.totalSeconds ?? log.reduce((s, e) => s + e.seconds, 0);
  content.innerHTML = `
    <div class="mb-2">Total acumulado: <strong>${_fmtTime(total)}</strong></div>
    <ul class="list-unstyled mb-0" style="font-size:.75rem">
      ${log.slice(-5).reverse().map((e) =>
        `<li class="text-muted">📅 ${e.date} &mdash; ${_fmtTime(e.seconds)}</li>`
      ).join('')}
    </ul>`;
}

function _fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function _validate() {
  const titleEl    = document.getElementById('task-title');
  const priorityEl = document.getElementById('task-priority');
  const dateEl     = document.getElementById('task-due-date');
  let valid = true;

  const titleVal = titleEl.value.trim();
  if (!titleVal || titleVal.length < 3) {
    _setFieldInvalid(titleEl, true); valid = false;
  } else {
    _setFieldInvalid(titleEl, false);
  }

  if (!priorityEl.value) {
    _setFieldInvalid(priorityEl, true); valid = false;
  } else {
    _setFieldInvalid(priorityEl, false);
  }

  if (!dateEl.value) {
    _setFieldInvalid(dateEl, true);
    document.getElementById('date-error').textContent = 'A data é obrigatória.';
    valid = false;
  } else {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const selected = new Date(dateEl.value + 'T00:00:00');
    if (!_editTask && selected < today) {
      _setFieldInvalid(dateEl, true);
      document.getElementById('date-error').textContent = 'A data não pode ser no passado.';
      valid = false;
    } else {
      _setFieldInvalid(dateEl, false);
    }
  }

  return valid;
}

function _setFieldInvalid(el, invalid) {
  el.classList.toggle('is-invalid', invalid);
  el.classList.toggle('is-valid',   !invalid);
}

function _handleSubmit(e) {
  if (e) e.preventDefault();
  if (!_validate()) return;

  const taskId      = document.getElementById('task-id').value || null;
  const statusGroup = document.getElementById('status-group');

  // Labels
  const labelsRaw = document.getElementById('task-labels').value;
  const labels = labelsRaw.split(',').map((l) => l.trim()).filter(Boolean);

  // Links (omit empty values)
  const rawLinks = {
    vscode:    document.getElementById('link-vscode').value.trim(),
    figma:     document.getElementById('link-figma').value.trim(),
    swagger:   document.getElementById('link-swagger').value.trim(),
    storybook: document.getElementById('link-storybook').value.trim(),
    custom:    document.getElementById('link-custom').value.trim(),
  };
  const links = Object.fromEntries(Object.entries(rawLinks).filter(([, v]) => v));

  // Blocked by
  const depSelect = document.getElementById('task-blocked-by');
  const blockedBy = [...(depSelect?.selectedOptions ?? [])].map((o) => Number(o.value));

  const data = {
    title:          document.getElementById('task-title').value.trim(),
    description:    document.getElementById('task-description').value.trim(),
    priority:       document.getElementById('task-priority').value,
    dueDate:        document.getElementById('task-due-date').value,
    status:         statusGroup.hidden
      ? document.getElementById('task-column').value
      : document.getElementById('task-status').value,
    labels,
    links:          Object.keys(links).length ? links : undefined,
    blockedBy,
    estimatedHours: parseFloat(document.getElementById('task-estimated-hours').value) || undefined,
    storyPoints:    parseInt(document.getElementById('task-story-points').value, 10)  || undefined,
  };

  if (_onSave) _onSave(taskId, data);
  _bsModal.hide();
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
