/**
 * post-mortem.js — Automatic documentation when a task is completed.
 *
 * Generates a structured Markdown post-mortem template based on task data.
 * The user can edit and copy the result.
 */

let _getTasksFn = null;

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _fmtTime(secs) {
  if (!secs) return '_Não registado_';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire post-mortem UI.
 * @param {() => Object[]} getTasksFn
 */
export function initPostMortem(getTasksFn) {
  _getTasksFn = getTasksFn;

  document.getElementById('btn-show-postmortem')?.addEventListener('click', () => {
    _populateSelector();
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById('postMortemModal')).show();
  });

  document.getElementById('postMortemModal')?.addEventListener('show.bs.modal', _populateSelector);
  document.getElementById('pm-task-select')?.addEventListener('change', _generatePostMortem);
  document.getElementById('btn-copy-postmortem')?.addEventListener('click', _copyPostMortem);
}

/**
 * Pre-select a task in the post-mortem modal and open it.
 * Called from app.js when a task is moved to "done".
 * @param {Object} task
 */
export function promptPostMortem(task) {
  const sel = document.getElementById('pm-task-select');
  if (sel) sel.dataset.preselect = String(task.id);
}

// ── Private ───────────────────────────────────────────────────────────────────

function _populateSelector() {
  const sel   = document.getElementById('pm-task-select');
  if (!sel || !_getTasksFn) return;
  const tasks      = _getTasksFn();
  const doneTasks  = tasks.filter((t) => t.status === 'done');
  const preselect  = sel.dataset.preselect ?? '';

  sel.innerHTML =
    '<option value="">— Selecionar tarefa concluída —</option>' +
    doneTasks
      .map((t) => `<option value="${t.id}" ${String(t.id) === preselect ? 'selected' : ''}>[#${t.id}] ${_esc(t.title)}</option>`)
      .join('');

  if (preselect) {
    delete sel.dataset.preselect;
    _generatePostMortem();
  }
}

function _generatePostMortem() {
  const sel    = document.getElementById('pm-task-select');
  const output = document.getElementById('pm-output');
  if (!sel?.value || !output) return;

  const task = (_getTasksFn?.() ?? []).find((t) => String(t.id) === sel.value);
  if (!task) return;

  const priority  = { alta: '🔴 Alta', media: '🟡 Média', baixa: '🟢 Baixa' }[task.priority] ?? task.priority;
  const labels    = (task.labels ?? []).join(', ') || '_Nenhuma_';
  const timeStr   = _fmtTime(task.totalSeconds ?? 0);
  const estimated = task.estimatedHours ? `**Estimativa inicial:** ${task.estimatedHours}h  \n` : '';
  const storyPts  = task.storyPoints    ? `**Story Points:** ${task.storyPoints}  \n`           : '';
  const createdAt = task.createdAt
    ? new Date(task.createdAt).toLocaleDateString('pt-PT')
    : '—';

  output.value = `# Post-mortem: ${task.title}

**Data de conclusão:** ${new Date().toLocaleDateString('pt-PT')}  
**Data de criação:** ${createdAt}  
**Tarefa:** #${task.id}  
**Prioridade:** ${priority}  
**Labels:** ${labels}  
**Tempo investido:** ${timeStr}  
${estimated}${storyPts}
---

## 📋 Descrição original

${task.description || '_Sem descrição._'}

---

## 🎯 O que foi feito

_Descreve de forma técnica o que foi implementado ou corrigido._

---

## 🧩 Decisões técnicas

_Explica as decisões de arquitetura, tecnologias escolhidas e trade-offs._

---

## 🐞 Problemas encontrados

_Lista os principais obstáculos e como foram ultrapassados._

---

## 📚 Lições aprendidas

_O que aprendeste? O que farias de diferente numa próxima vez?_

---

## 🔗 Referências

_Links para PRs, commits relevantes, documentação, Figma, etc._

---

*Post-mortem gerado automaticamente pelo Dev Tasks — #${task.id}*
`;
}

async function _copyPostMortem() {
  const val = document.getElementById('pm-output')?.value ?? '';
  if (!val) return;
  const btn = document.getElementById('btn-copy-postmortem');
  try {
    await navigator.clipboard.writeText(val);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check2 me-1" aria-hidden="true"></i>Copiado!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }
}
