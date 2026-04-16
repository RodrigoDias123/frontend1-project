/**
 * org-users.js — Organisation user management for enterprise admins.
 *
 * Only active when session.role === 'admin' && session.organizationId is set.
 * Renders a modal with:
 *   - List of all users in the organisation
 *   - Form to invite/create a new member (name, email, password, role)
 *   - Remove member button (cannot remove self)
 */

import { localFetch as fetch } from './localApi.js';

const SESSION_KEY = 'devtasks_user';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); }
  catch { return null; }
}

function _isAdmin() {
  const s = _session();
  return s?.role === 'admin' && !!s?.organizationId;
}

// ── Render ────────────────────────────────────────────────────────────────────

async function _loadAndRender() {
  const session = _session();
  if (!session?.organizationId) return;

  const listEl   = _el('org-user-list');
  const countEl  = _el('org-user-count');
  const errorEl  = _el('org-users-error');
  if (!listEl) return;

  listEl.innerHTML = '<div class="text-muted small text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>A carregar…</div>';
  errorEl?.classList.add('d-none');

  try {
    const res   = await fetch(`/users?organizationId=${session.organizationId}`);
    if (!res.ok) throw new Error('Erro no servidor');
    const users = await res.json();

    if (countEl) countEl.textContent = users.length;

    if (users.length === 0) {
      listEl.innerHTML = '<p class="text-muted small text-center py-3 mb-0">Sem membros na organização.</p>';
      return;
    }

    listEl.innerHTML = users.map((u) => {
      const isSelf   = u.id === session.id;
      const roleClass = u.role === 'admin' ? 'text-warning' : 'text-muted';
      const roleIcon  = u.role === 'admin' ? 'bi-shield-fill-check' : 'bi-person-fill';
      const roleLabel = u.role === 'admin' ? 'Admin' : 'Membro';
      return `
        <div class="org-user-row" data-uid="${u.id}">
          <div class="org-user-avatar">${(u.name ?? '?')[0].toUpperCase()}</div>
          <div class="org-user-info">
            <div class="org-user-name">${_esc(u.name)} ${isSelf ? '<span class="badge bg-secondary ms-1" style="font-size:.6rem">Você</span>' : ''}</div>
            <div class="org-user-email text-muted small">${_esc(u.email)}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="org-user-role ${roleClass}">
              <i class="bi ${roleIcon} me-1"></i>${roleLabel}
            </span>
            ${!isSelf ? `<button class="btn btn-sm btn-outline-danger org-btn-remove" data-uid="${u.id}" data-name="${_esc(u.name)}" title="Remover membro">
              <i class="bi bi-person-x-fill"></i>
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    // Remove buttons
    listEl.querySelectorAll('.org-btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => _removeUser(btn.dataset.uid, btn.dataset.name, session));
    });

  } catch (err) {
    listEl.innerHTML = '';
    if (errorEl) {
      errorEl.textContent = err.message ?? 'Erro ao carregar membros.';
      errorEl.classList.remove('d-none');
    }
  }
}

async function _removeUser(userId, userName, session) {
  if (!confirm(`Remover ${userName} da organização? Esta ação não pode ser desfeita.`)) return;

  try {
    // Disassociate instead of delete (keep the user record, just clear org)
    const res = await fetch(`/users/${userId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ organizationId: null, role: 'user', plan: 'free' }),
    });
    if (!res.ok) throw new Error('Erro ao remover membro.');
    _loadAndRender();
    _showFormError('');
    _showSuccess(`${userName} foi removido da organização.`);
  } catch (err) {
    _showFormError(err.message ?? 'Erro ao remover membro.');
  }
}

// ── Create user form ──────────────────────────────────────────────────────────

function _initCreateForm() {
  const form = _el('org-create-user-form');
  if (!form) return;

  // Password toggle
  _el('org-btn-toggle-pw')?.addEventListener('click', () => {
    const pw  = _el('org-new-password');
    const eye = _el('org-pw-eye');
    if (!pw) return;
    const isText = pw.type === 'text';
    pw.type = isText ? 'password' : 'text';
    if (eye) eye.className = isText ? 'bi bi-eye' : 'bi bi-eye-slash';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    _showFormError('');

    const session = _session();
    if (!session?.organizationId) return;

    const name     = _el('org-new-name').value.trim();
    const email    = _el('org-new-email').value.trim();
    const password = _el('org-new-password').value;
    const role     = _el('org-new-role').value;

    if (!name || !email || !password) {
      _showFormError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (password.length < 6) {
      _showFormError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    const btn = _el('org-btn-create-user');
    _setLoading(btn, true);

    try {
      // Check email uniqueness
      const check = await fetch(`/users?email=${encodeURIComponent(email)}`);
      if (!check.ok) throw new Error('Erro no servidor.');
      const existing = await check.json();
      if (existing.length > 0) {
        _showFormError('Já existe uma conta com este email.');
        _setLoading(btn, false);
        return;
      }

      const res = await fetch('/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          organizationId: session.organizationId,
          plan:           session.plan ?? 'business',
          createdAt:      new Date().toISOString(),
          createdBy:      session.id,
        }),
      });
      if (!res.ok) throw new Error('Erro ao criar utilizador.');

      form.reset();
      _el('org-new-role').value = 'member';
      await _loadAndRender();
      _showSuccess(`${name} foi adicionado à organização com sucesso.`);

    } catch (err) {
      _showFormError(err.message ?? 'Erro inesperado.');
    } finally {
      _setLoading(btn, false);
    }
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _showFormError(msg) {
  const el = _el('org-form-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('d-none', !msg);
}

function _showSuccess(msg) {
  const el = _el('org-form-success');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 4000);
}

function _setLoading(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (on) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>A criar…';
  } else {
    btn.innerHTML = btn.dataset.orig ?? btn.innerHTML;
  }
}

// ── Public init ───────────────────────────────────────────────────────────────

export function initOrgUsers() {
  if (!_isAdmin()) return; // only enterprise admins

  // Show the menu button and its divider
  _el('btn-show-org-users')?.classList.remove('d-none');
  _el('org-users-divider')?.classList.remove('d-none');

  // Wire modal open → load list
  const modalEl = _el('orgUsersModal');
  if (modalEl) {
    modalEl.addEventListener('show.bs.modal', _loadAndRender);
  }

  _initCreateForm();
}
