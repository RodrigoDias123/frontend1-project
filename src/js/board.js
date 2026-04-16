/**
 * board.js — Kanban board rendering and SortableJS drag-and-drop.
 *
 * Dispatches:
 *   board:task-moved  — { taskId, newStatus }  when a card is dragged to another column
 */

const COLUMNS = /** @type {const} */ (['todo', 'doing', 'done']);

/** Full task list, kept in sync to compute blocked state. */
let _allTasks = [];

// ── DOM helpers ───────────────────────────────────────────────────────────────

function listEl(col) { return document.getElementById(`list-${col}`); }
function badgeEl(col) { return document.getElementById(`badge-${col}`); }

// ── Card factory ──────────────────────────────────────────────────────────────

function _isBlocked(task) {
  if (!task.blockedBy?.length) return false;
  return task.blockedBy.some((id) => {
    const dep = _allTasks.find((t) => String(t.id) === String(id));
    return dep && dep.status !== 'done';
  });
}

function createCard(task) {
  const card = document.createElement('task-card');
  card.setAttribute('task-id',       String(task.id));
  card.setAttribute('title',         task.title);
  card.setAttribute('priority',      task.priority);
  card.setAttribute('due-date',      task.dueDate ?? '');
  card.setAttribute('description',   task.description ?? '');
  card.setAttribute('status',        task.status);
  card.setAttribute('labels',        JSON.stringify(task.labels ?? []));
  card.setAttribute('links',         JSON.stringify(task.links ?? {}));
  card.setAttribute('total-seconds', String(task.totalSeconds ?? 0));
  card.setAttribute('blocked',       String(_isBlocked(task)));
  card.setAttribute('role',          'listitem');
  return card;
}

// ── Empty-state placeholders ──────────────────────────────────────────────────

function makeEmptyEl() {
  const div = document.createElement('div');
  div.className = 'kanban-empty';
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = `
    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
    <span>Sem tarefas</span>`;
  return div;
}

function refreshEmptyStates() {
  COLUMNS.forEach((col) => {
    const list  = listEl(col);
    const empty = list.querySelector('.kanban-empty');
    const cards = list.querySelector('task-card');
    if (!cards && !empty) list.appendChild(makeEmptyEl());
    if (cards && empty)   empty.remove();
  });
}

// ── Badge counters ────────────────────────────────────────────────────────────

export function updateColumnBadges() {
  COLUMNS.forEach((col) => {
    const count = listEl(col).querySelectorAll('task-card').length;
    const b = badgeEl(col);
    if (b) b.textContent = String(count);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the entire board from a tasks array.
 * @param {Object[]} tasks
 */
export function initBoard(tasks) {
  _allTasks = [...tasks];
  COLUMNS.forEach((col) => { listEl(col).innerHTML = ''; });

  tasks.forEach((task) => {
    const target = listEl(task.status) ?? listEl('todo');
    target.appendChild(createCard(task));
  });

  refreshEmptyStates();
  updateColumnBadges();
  _initSortable();
}

/**
 * Append a newly created task card to its column.
 * @param {Object} task
 */
export function addTaskCard(task) {
  const existing = _allTasks.findIndex((t) => String(t.id) === String(task.id));
  if (existing >= 0) _allTasks[existing] = task;
  else _allTasks.push(task);

  const target = listEl(task.status) ?? listEl('todo');
  target.appendChild(createCard(task));
  refreshEmptyStates();
  updateColumnBadges();
}

/**
 * Remove a card from the board by task id.
 * @param {string|number} taskId
 */
export function removeTaskCard(taskId) {
  _allTasks = _allTasks.filter((t) => String(t.id) !== String(taskId));
  const card = document.querySelector(`task-card[task-id="${taskId}"]`);
  if (card) card.remove();
  refreshEmptyStates();
  updateColumnBadges();
}

/**
 * Update an existing card's attributes (and move it if status changed).
 * @param {Object} task
 */
export function updateTaskCard(task) {
  const idx = _allTasks.findIndex((t) => String(t.id) === String(task.id));
  if (idx >= 0) _allTasks[idx] = task;
  else _allTasks.push(task);

  let card = document.querySelector(`task-card[task-id="${task.id}"]`);

  if (!card) {
    addTaskCard(task);
    return;
  }

  card.setAttribute('title',         task.title);
  card.setAttribute('priority',      task.priority);
  card.setAttribute('due-date',      task.dueDate ?? '');
  card.setAttribute('description',   task.description ?? '');
  card.setAttribute('labels',        JSON.stringify(task.labels ?? []));
  card.setAttribute('links',         JSON.stringify(task.links ?? {}));
  card.setAttribute('total-seconds', String(task.totalSeconds ?? 0));
  card.setAttribute('blocked',       String(_isBlocked(task)));

  const targetList = listEl(task.status) ?? listEl('todo');
  if (card.parentElement !== targetList) {
    targetList.appendChild(card);
    card.setAttribute('status', task.status);
  }

  refreshEmptyStates();
  updateColumnBadges();
}

// ── SortableJS ────────────────────────────────────────────────────────────────

function _initSortable() {
  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS not loaded — drag & drop disabled.');
    return;
  }

  COLUMNS.forEach((col) => {
    Sortable.create(listEl(col), {
      group:       'kanban',
      animation:   150,
      ghostClass:  'sortable-ghost',
      dragClass:   'sortable-drag',
      draggable:   'task-card',
      onEnd(evt) {
        if (evt.from === evt.to) return;

        const card      = evt.item;
        const newStatus = evt.to.dataset.column;
        const taskId    = card.getAttribute('task-id');

        card.setAttribute('status', newStatus);
        refreshEmptyStates();
        updateColumnBadges();

        document.dispatchEvent(
          new CustomEvent('board:task-moved', {
            detail: { taskId, newStatus },
          })
        );
      },
    });
  });
}

