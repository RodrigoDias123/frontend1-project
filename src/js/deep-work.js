/**
 * deep-work.js — Deep Work / Focus Mode
 *
 * Features:
 *  - Fullscreen focus overlay showing the current task and an elapsed timer
 *  - Context snapshot: captures task + notes so you can resume after interruption
 *  - Screen wake-lock to prevent sleep during focus sessions
 */

const SNAPSHOT_KEY = 'devtasks_snapshot';

let _currentTask = null;
let _startTime   = null;
let _dwTimer     = null;

function _el(id) { return document.getElementById(id); }

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire all deep-work UI events.
 * @param {() => Object[]} getTasksFn
 */
export function initDeepWork(getTasksFn) {
  // Open selector modal
  _el('btn-show-deep-work')?.addEventListener('click', () => {
    const tasks = getTasksFn();
    const sel   = _el('dw-task-select');
    if (sel) {
      sel.innerHTML =
        '<option value="">— Selecionar tarefa —</option>' +
        tasks
          .filter((t) => t.status !== 'done')
          .map((t) => `<option value="${t.id}">[#${t.id}] ${_esc(t.title)}</option>`)
          .join('');
    }
    window.bootstrap.Modal.getOrCreateInstance(_el('deepWorkModal')).show();
  });

  // Enter focus mode
  _el('btn-deep-work-enter')?.addEventListener('click', () => {
    const sel  = _el('dw-task-select');
    const task = getTasksFn().find((t) => String(t.id) === sel?.value);
    if (!task) return;
    window.bootstrap.Modal.getInstance(_el('deepWorkModal'))?.hide();
    _enterDeepWork(task);
  });

  // Exit focus mode
  _el('btn-deep-work-exit')?.addEventListener('click', _exitDeepWork);

  // Capture snapshot
  _el('btn-capture-snapshot')?.addEventListener('click', _captureSnapshot);

  // View pending snapshot (badge shown if snapshot exists)
  _el('btn-view-snapshot')?.addEventListener('click', _showSnapshot);

  // Show snapshot badge if one exists
  _checkSnapshotBadge();
}

// ── Private ───────────────────────────────────────────────────────────────────

function _enterDeepWork(task) {
  _currentTask = task;
  _startTime   = Date.now();

  const overlay = _el('deep-work-overlay');
  if (_el('dw-task-title'))   _el('dw-task-title').textContent   = task.title;
  if (_el('dw-task-desc'))    _el('dw-task-desc').textContent    = (task.description ?? '').slice(0, 250);
  if (_el('dw-snapshot-notes')) _el('dw-snapshot-notes').value  = '';
  if (_el('dw-snapshot-feedback')) _el('dw-snapshot-feedback').classList.add('d-none');

  overlay.hidden = false;
  document.body.classList.add('deep-work-active');

  _dwTimer = setInterval(_tick, 1000);
  _tick();

  // Request screen wake-lock (prevents device sleep during focus)
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(() => { /* ignored if denied */ });
  }
}

function _exitDeepWork() {
  clearInterval(_dwTimer);
  _dwTimer     = null;
  _currentTask = null;
  _startTime   = null;

  _el('deep-work-overlay').hidden = true;
  document.body.classList.remove('deep-work-active');
}

function _tick() {
  if (!_startTime) return;
  const elapsed = Math.floor((Date.now() - _startTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const timeEl = _el('dw-elapsed');
  if (timeEl) {
    timeEl.textContent = h > 0
      ? `${_p(h)}:${_p(m)}:${_p(s)}`
      : `${_p(m)}:${_p(s)}`;
  }
}

function _p(n) { return String(n).padStart(2, '0'); }

function _captureSnapshot() {
  if (!_currentTask) return;
  const notes = _el('dw-snapshot-notes')?.value?.trim() ?? '';
  const snap  = {
    taskId:     _currentTask.id,
    taskTitle:  _currentTask.title,
    taskDesc:   _currentTask.description ?? '',
    elapsed:    _startTime ? Math.floor((Date.now() - _startTime) / 1000) : 0,
    notes,
    capturedAt: new Date().toISOString(),
  };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  const fb = _el('dw-snapshot-feedback');
  if (fb) {
    fb.classList.remove('d-none');
    fb.textContent = '✓ Contexto guardado! Podes interromper com segurança.';
  }
  _checkSnapshotBadge();
}

function _showSnapshot() {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return;
  try {
    const snap    = JSON.parse(raw);
    const content = _el('snapshot-content');
    if (!content) return;

    const h = Math.floor(snap.elapsed / 3600);
    const m = Math.floor((snap.elapsed % 3600) / 60);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

    content.innerHTML = `
      <div class="small">
        <div class="mb-2">
          <span class="text-muted">Tarefa</span><br>
          <strong>#${snap.taskId} — ${_esc(snap.taskTitle)}</strong>
        </div>
        <div class="mb-2">
          <span class="text-muted">Tempo de foco antes da interrupção</span><br>
          <strong>${timeStr}</strong>
        </div>
        ${snap.taskDesc ? `
        <div class="mb-2">
          <span class="text-muted">Descrição</span><br>
          <span>${_esc(snap.taskDesc.slice(0, 400))}</span>
        </div>` : ''}
        ${snap.notes ? `
        <div class="mb-2">
          <span class="text-muted">As tuas notas de contexto</span><br>
          <span class="fst-italic">${_esc(snap.notes)}</span>
        </div>` : ''}
        <div class="text-muted" style="font-size:.7rem">
          Capturado em ${new Date(snap.capturedAt).toLocaleString('pt-PT')}
        </div>
      </div>`;

    window.bootstrap.Modal.getOrCreateInstance(_el('snapshotModal')).show();
    localStorage.removeItem(SNAPSHOT_KEY);
    _el('btn-view-snapshot')?.classList.add('d-none');
  } catch { /* ignore corrupt snapshot */ }
}

function _checkSnapshotBadge() {
  const btn = _el('btn-view-snapshot');
  if (!btn) return;
  if (localStorage.getItem(SNAPSHOT_KEY)) {
    btn.classList.remove('d-none');
  } else {
    btn.classList.add('d-none');
  }
}
