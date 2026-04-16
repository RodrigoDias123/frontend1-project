/**
 * automations.js — Client-side rule engine.
 *
 * Rules are stored in localStorage. Each rule has:
 *   { id, name, trigger: { event, conditions[] }, action: { type, params } }
 *
 * Triggers: status_changed | task_created | task_overdue
 * Actions:  move_to | add_label | show_toast
 * Conditions: { field: 'newStatus'|'priority'|'status', op: 'eq'|'neq', value }
 */

const STORE_KEY = 'devtasks_rules';

export function getRules() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); }
  catch { return []; }
}

function _save(rules) {
  localStorage.setItem(STORE_KEY, JSON.stringify(rules));
}

export function saveRule(rule) {
  const rules = getRules();
  if (rule.id) {
    const i = rules.findIndex((r) => r.id === rule.id);
    if (i >= 0) rules[i] = rule;
    else rules.push(rule);
  } else {
    rules.push({ ...rule, id: crypto.randomUUID() });
  }
  _save(rules);
  return getRules();
}

export function deleteRule(id) {
  _save(getRules().filter((r) => r.id !== id));
  return getRules();
}

/**
 * Evaluate rules matching an event and return the list of actions.
 * @param {'status_changed'|'task_created'|'task_overdue'} event
 * @param {Object} task
 * @param {Object} [ctx]  e.g. { newStatus, oldStatus }
 * @returns {{ type: string, params: Object, task: Object, ruleName: string }[]}
 */
export function evalRules(event, task, ctx = {}) {
  return getRules()
    .filter((r) => r.trigger.event === event && _match(r.trigger.conditions, task, ctx))
    .map((r) => ({ ...r.action, task, ruleName: r.name }));
}

function _match(conditions, task, ctx) {
  if (!conditions?.length) return true;
  return conditions.every((c) => {
    const val = c.field === 'newStatus' ? ctx.newStatus
              : c.field === 'oldStatus' ? ctx.oldStatus
              : task[c.field];
    return c.op === 'eq' ? val === c.value : val !== c.value;
  });
}

// ── Automations UI ────────────────────────────────────────────────────────────

export function initAutomationsUI(onUpdate) {
  const addBtn = document.getElementById('btn-add-rule');
  const listEl = document.getElementById('rules-list');
  if (!listEl) return;

  _renderList(listEl, onUpdate);

  addBtn?.addEventListener('click', () => {
    const name   = document.getElementById('rule-name').value.trim();
    const evt    = document.getElementById('rule-trigger').value;
    const cf     = document.getElementById('rule-cond-field').value;
    const co     = document.getElementById('rule-cond-op').value;
    const cv     = document.getElementById('rule-cond-val').value.trim();
    const atype  = document.getElementById('rule-action-type').value;
    const aparam = document.getElementById('rule-action-param').value.trim();

    if (!name || !evt || !atype) return;

    saveRule({
      name,
      trigger: { event: evt, conditions: cf && cv ? [{ field: cf, op: co, value: cv }] : [] },
      action:  { type: atype, params: { value: aparam } },
    });

    ['rule-name', 'rule-cond-val', 'rule-action-param'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = '';
    });

    _renderList(listEl, onUpdate);
    if (onUpdate) onUpdate();
  });
}

function _renderList(el, onUpdate) {
  const rules = getRules();
  el.innerHTML = rules.length === 0
    ? '<p class="text-muted small text-center py-3 mb-0">Sem regras definidas.</p>'
    : rules.map((r) => `
      <div class="rule-item d-flex align-items-start justify-content-between gap-2 py-2 border-bottom border-secondary-subtle">
        <div class="flex-grow-1" style="min-width:0">
          <div class="fw-semibold small text-truncate">${_esc(r.name)}</div>
          <div class="text-muted mt-1" style="font-size:.72rem">
            <span class="badge bg-secondary-subtle text-secondary me-1">${_esc(r.trigger.event)}</span>
            → <span class="badge bg-primary-subtle text-primary">${_esc(r.action.type)}${r.action.params?.value ? ': ' + _esc(r.action.params.value) : ''}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-outline-danger py-0 px-1 flex-shrink-0 rule-del" data-id="${_esc(r.id)}" aria-label="Eliminar regra">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>
    `).join('');

  el.querySelectorAll('.rule-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteRule(btn.dataset.id);
      _renderList(el, onUpdate);
      if (onUpdate) onUpdate();
    });
  });
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
