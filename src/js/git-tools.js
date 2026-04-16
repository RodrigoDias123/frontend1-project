/**
 * git-tools.js — Git Integration Panel
 *
 * Features:
 *  - Branch name generation from task (feature/slug, fix/slug, hotfix/slug, refactor/slug)
 *  - PR description template based on task data
 *  - Commit message parser: detects #id and suggests task status update
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function _slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateBranchName(task) {
  const labels = task.labels ?? [];
  const prefix =
    task.priority === 'alta'            ? 'hotfix'   :
    labels.includes('bug')              ? 'fix'      :
    labels.includes('tech-debt')        ? 'refactor' :
    labels.includes('docs')             ? 'docs'     : 'feature';
  return `${prefix}/${_slugify(task.title)}`;
}

export function generatePRTemplate(task) {
  const branch     = generateBranchName(task);
  const priority   = { alta: '🔴 Alta', media: '🟡 Média', baixa: '🟢 Baixa' }[task.priority] ?? task.priority;
  const labels     = (task.labels ?? []).join(', ') || '—';
  const storyPts   = task.storyPoints ? `**Story Points:** ${task.storyPoints}  ` : '';
  const estimated  = task.estimatedHours ? `**Estimativa:** ${task.estimatedHours}h  ` : '';

  return `## ${task.title}

### 📋 Descrição
${task.description || '_Sem descrição disponível._'}

### 🔗 Referências
- **Tarefa:** #${task.id} — ${task.title}
- **Branch:** \`${branch}\`
- **Prioridade:** ${priority}
- **Labels:** ${labels}
${storyPts}${estimated}

### ✅ Checklist
- [ ] Código testado localmente
- [ ] Sem conflitos com a branch principal
- [ ] Documentação atualizada (se aplicável)
- [ ] Revisão de código solicitada

### 🧪 Como testar

_Descreve os passos para testar esta alteração._

1. 
2. 
3. 

### 📸 Screenshots

_Anexa capturas de ecrã se aplicável._

---
*Gerado automaticamente por Dev Tasks #${task.id}*
`;
}

/** Parse a commit message and return the first detected task id (string). */
export function parseCommitForTaskId(commitMsg) {
  const match = String(commitMsg).match(/#(\d+)/);
  return match ? match[1] : null;
}

/** Suggest a task status based on commit message keywords. */
export function suggestStatusFromCommit(commitMsg) {
  const lower = String(commitMsg).toLowerCase();
  if (/\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?|done|finish(?:ed)?|complet(?:ed)?|merge[sd]?)\b/.test(lower)) return 'done';
  return 'doing';
}

// ── State ─────────────────────────────────────────────────────────────────────

let _getTasksFn   = null;
let _onUpdateTask = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {() => Object[]} getTasksFn
 * @param {(taskId: string, data: Object) => void} onUpdateTask
 */
export function initGitTools(getTasksFn, onUpdateTask) {
  _getTasksFn   = getTasksFn;
  _onUpdateTask = onUpdateTask;

  document.getElementById('btn-show-git-tools')?.addEventListener('click', () => {
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('gitToolsModal')).show();
  });

  document.getElementById('gitToolsModal')?.addEventListener('show.bs.modal', _populate);
  document.getElementById('git-task-select')?.addEventListener('change', _onTaskChange);
  document.getElementById('btn-copy-branch')?.addEventListener('click', () => _copy('git-branch-output', 'git-branch-feedback'));
  document.getElementById('btn-copy-pr')?.addEventListener('click', () => _copy('git-pr-output', 'git-pr-feedback'));
  document.getElementById('btn-parse-commit')?.addEventListener('click', _parseCommit);
  document.getElementById('btn-apply-commit-status')?.addEventListener('click', _applyCommitStatus);
}

// ── Private ───────────────────────────────────────────────────────────────────

function _populate() {
  const tasks = _getTasksFn?.() ?? [];
  const sel   = document.getElementById('git-task-select');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">— Selecionar tarefa —</option>' +
    tasks.map((t) => `<option value="${t.id}">[#${t.id}] ${_esc(t.title)}</option>`).join('');
  _clearOutputs();
}

function _clearOutputs() {
  const b = document.getElementById('git-branch-output');
  const p = document.getElementById('git-pr-output');
  if (b) b.value = '';
  if (p) p.value = '';
}

function _onTaskChange() {
  const task = _selectedTask();
  if (!task) { _clearOutputs(); return; }
  const b = document.getElementById('git-branch-output');
  const p = document.getElementById('git-pr-output');
  if (b) b.value = generateBranchName(task);
  if (p) p.value = generatePRTemplate(task);
}

function _selectedTask() {
  const sel = document.getElementById('git-task-select');
  if (!sel?.value) return null;
  return (_getTasksFn?.() ?? []).find((t) => String(t.id) === sel.value) ?? null;
}

async function _copy(inputId, feedbackId) {
  const val = document.getElementById(inputId)?.value?.trim();
  if (!val) return;
  try {
    await navigator.clipboard.writeText(val);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const el = document.getElementById(feedbackId);
  if (el) {
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 2000);
  }
}

function _parseCommit() {
  const msg      = document.getElementById('git-commit-input')?.value?.trim() ?? '';
  const resultEl = document.getElementById('git-commit-result');
  const applyBtn = document.getElementById('btn-apply-commit-status');
  if (!resultEl || !applyBtn) return;

  if (!msg) {
    resultEl.innerHTML = '<span class="text-muted small">Introduza uma mensagem de commit.</span>';
    applyBtn.hidden = true;
    return;
  }

  const taskId   = parseCommitForTaskId(msg);
  const tasks    = _getTasksFn?.() ?? [];
  const task     = taskId ? tasks.find((t) => String(t.id) === taskId) : null;
  const newStatus = suggestStatusFromCommit(msg);
  const statusLabel = { todo: 'To Do', doing: 'Doing', done: 'Done' }[newStatus];

  if (!task) {
    resultEl.innerHTML = `<span class="text-warning small">Nenhuma tarefa encontrada com #id na mensagem. Use o formato <code>fix: #123 descrição</code>.</span>`;
    applyBtn.hidden = true;
    return;
  }

  resultEl.innerHTML = `
    <div class="small border border-secondary-subtle rounded p-2">
      <div class="mb-1"><strong>Tarefa detetada:</strong> #${task.id} — ${_esc(task.title)}</div>
      <div><strong>Estado sugerido:</strong> <span class="badge bg-primary">${statusLabel}</span></div>
    </div>`;
  applyBtn.hidden = false;
  applyBtn.dataset.taskId = task.id;
  applyBtn.dataset.status = newStatus;
}

function _applyCommitStatus() {
  const btn = document.getElementById('btn-apply-commit-status');
  if (!btn || !_onUpdateTask) return;
  const taskId = btn.dataset.taskId;
  const status = btn.dataset.status;
  const tasks  = _getTasksFn?.() ?? [];
  const task   = tasks.find((t) => String(t.id) === taskId);
  if (!task) return;
  _onUpdateTask(taskId, { ...task, status });
  const resultEl = document.getElementById('git-commit-result');
  if (resultEl) {
    resultEl.innerHTML += `<div class="text-success small mt-1">✓ Tarefa movida para <strong>${status}</strong>!</div>`;
  }
  btn.hidden = true;
}
