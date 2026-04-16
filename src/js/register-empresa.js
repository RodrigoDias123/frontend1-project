/**
 * register-empresa.js — Enterprise registration wizard logic.
 *
 * Steps:
 *   1 — Plan selection
 *   2 — Company info
 *   3 — Admin account + submit
 */

import { localFetch as fetch } from './localApi.js';

const SESSION_KEY = 'devtasks_user';

// ── Plan config ───────────────────────────────────────────────────────────────

const PLANS = {
  team: {
    label:    'Team',
    seats:    5,
    maxSeats: 5,
    price:    0,
    priceStr: 'Grátis',
    seatsStr: 'Até 5 membros',
  },
  business: {
    label:    'Business',
    seats:    10,
    maxSeats: 50,
    price:    9,
    priceStr: '€9 / membro / mês',
    seatsStr: 'Até 50 membros',
  },
  enterprise: {
    label:    'Enterprise',
    seats:    50,
    maxSeats: 1000,
    price:    null,
    priceStr: 'Sob consulta',
    seatsStr: 'Ilimitado',
  },
};

const INDUSTRY_LABELS = {
  technology:    'Tecnologia / Software',
  fintech:       'Fintech / Banca',
  healthcare:    'Saúde',
  ecommerce:     'E-commerce / Retail',
  education:     'Educação',
  media:         'Media / Entretenimento',
  manufacturing: 'Indústria / Manufactura',
  consulting:    'Consultoria',
  government:    'Setor Público',
  other:         'Outra',
};

// ── Google OAuth ──────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = '661228220614-f78g5rlstqikchqfj37acdatb3495j0g.apps.googleusercontent.com';

function _openGooglePopup() {
  const redirectUri = 'https://rodrigodias123.github.io/frontend1-project/google-callback.html';
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'token',
    scope:         'openid email profile',
    prompt:        'select_account',
  });

  const popup = window.open(authUrl, 'google-oauth-enterprise', 'width=500,height=600,scrollbars=yes,resizable=yes');
  if (!popup) throw new Error('popup_blocked');

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      window.removeEventListener('message', onMessage);
      fn();
    };
    const onMessage = (e) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === 'google-auth-success') finish(() => resolve(e.data.user));
      if (e.data?.type === 'google-auth-error')   finish(() => reject(new Error(e.data.error)));
    };
    const poll = setInterval(() => {
      if (popup.closed) finish(() => reject(new Error('cancelled')));
    }, 500);
    window.addEventListener('message', onMessage);
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let _currentStep = 1;
let _selectedPlan = 'business';
let _googleData = null; // set when admin uses Google Sign-In

// ── DOM helpers ───────────────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _showError(msg) {
  const el = _el('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('d-none');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _hideError() {
  _el('auth-error')?.classList.add('d-none');
}

function _setLoading(btn, on) {
  btn.disabled = on;
  if (on) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>A processar…';
  } else {
    btn.innerHTML = btn.dataset.orig ?? btn.innerHTML;
  }
}

// ── Step navigation ───────────────────────────────────────────────────────────

function _goTo(step) {
  _hideError();
  // Hide all sections
  ['step-1', 'step-2', 'step-3', 'step-team'].forEach((id) => {
    _el(id)?.classList.add('d-none');
  });
  // Show target
  _el(`step-${step}`)?.classList.remove('d-none');

  // Update sidebar nav (only for numeric steps)
  [1, 2, 3].forEach((n) => {
    const nav = document.querySelector(`[data-step="${n}"]`);
    if (nav) {
      nav.classList.remove('enterprise-step--active', 'enterprise-step--done');
      const active = step === n || step === 'team';
      if (active && n === 1) nav.classList.add('enterprise-step--done');
      if (step === n) nav.classList.add('enterprise-step--active');
      if (typeof step === 'number' && n < step) nav.classList.add('enterprise-step--done');
    }
  });

  _currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Plan selection ────────────────────────────────────────────────────────────

function _initPlanCards() {
  document.querySelectorAll('input[name="plan"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      _selectedPlan = radio.value;
      _updatePlanVisuals();
    });
  });

  // Select "business" by default
  const defRadio = _el('plan-business');
  if (defRadio) { defRadio.checked = true; _selectedPlan = 'business'; }
  _updatePlanVisuals();
}

function _updatePlanVisuals() {
  document.querySelectorAll('.plan-card').forEach((card) => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('plan-card--selected', radio?.checked);
  });

  const plan = PLANS[_selectedPlan];
  if (!plan) return;

  // Plan summary sidebar
  const ps = _el('plan-summary');
  if (ps) {
    ps.classList.remove('d-none');
    _el('ps-name').textContent  = plan.label;
    _el('ps-seats').textContent = plan.seatsStr;
    _el('ps-price').textContent = plan.priceStr;
  }

  // Seats row (only for business/enterprise)
  const seatsRow = _el('seats-row');
  if (seatsRow) {
    seatsRow.classList.toggle('d-none', _selectedPlan === 'team');
    if (_selectedPlan !== 'team') {
      _el('company-seats').value = plan.seats;
      _updateSeatsCost();
    }
  }
}

function _initSeatsControl() {
  const input  = _el('company-seats');
  const minus  = _el('btn-seats-minus');
  const plus   = _el('btn-seats-plus');
  if (!input || !minus || !plus) return;

  minus.addEventListener('click', () => {
    const val = parseInt(input.value, 10);
    if (val > 1) input.value = val - 1;
    _updateSeatsCost();
  });

  plus.addEventListener('click', () => {
    const plan = PLANS[_selectedPlan];
    const val  = parseInt(input.value, 10);
    if (val < (plan?.maxSeats ?? 1000)) input.value = val + 1;
    _updateSeatsCost();
  });
}

function _updateSeatsCost() {
  const plan  = PLANS[_selectedPlan];
  const seats = parseInt(_el('company-seats')?.value ?? 1, 10);
  const label = _el('seats-cost-preview');
  if (!label || !plan) return;
  if (plan.price === null) {
    label.innerHTML = `${seats} lugares — valor negociado com a equipa comercial.`;
  } else if (plan.price === 0) {
    label.innerHTML = `Grátis até ${plan.seats} membros.`;
  } else {
    const total = seats * plan.price;
    label.innerHTML = `${seats} lugares × €${plan.price} = <strong>€${total}/mês</strong>`;
  }
}

// ── Password strength ─────────────────────────────────────────────────────────

function _initPasswordStrength() {
  const pw = _el('admin-password');
  if (!pw) return;
  pw.addEventListener('input', () => _checkStrength(pw.value));

  _el('btn-toggle-pw')?.addEventListener('click', () => {
    const isText = pw.type === 'text';
    pw.type = isText ? 'password' : 'text';
    _el('pw-eye').className = isText ? 'bi bi-eye' : 'bi bi-eye-slash';
  });
}

function _checkStrength(pw) {
  const fill  = _el('pw-strength-fill');
  const label = _el('pw-strength-label');
  if (!fill || !label) return;

  let score = 0;
  if (pw.length >= 8)           score++;
  if (pw.length >= 12)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { pct: '0%',   color: '',               text: 'Introduza uma palavra-passe' },
    { pct: '20%',  color: '#f85149',        text: 'Muito fraca' },
    { pct: '40%',  color: '#f85149',        text: 'Fraca' },
    { pct: '60%',  color: '#d29922',        text: 'Razoável' },
    { pct: '80%',  color: '#58a6ff',        text: 'Boa' },
    { pct: '100%', color: '#3fb950',        text: 'Excelente' },
  ];
  const level = levels[Math.min(score, 5)];
  fill.style.width           = level.pct;
  fill.style.backgroundColor = level.color;
  label.textContent          = level.text;
  label.style.color          = level.color || '#8b949e';
}

// ── Validation ────────────────────────────────────────────────────────────────

function _invalidate(el, msg) {
  el.classList.add('is-invalid');
  const fb = el.closest('.col-12, .mb-3, .input-group')?.querySelector('.invalid-feedback');
  if (fb && msg) fb.textContent = msg;
}

function _clearValid(el) {
  el.classList.remove('is-invalid', 'is-valid');
}

function _validateCompanyForm() {
  let ok = true;
  const fields = [
    { el: _el('company-name'),          msg: null },
    { el: _el('company-size'),          msg: null },
    { el: _el('company-industry'),      msg: null },
    { el: _el('company-country'),       msg: null },
    { el: _el('company-billing-email'), msg: null },
  ];
  fields.forEach(({ el, msg }) => {
    _clearValid(el);
    if (!el.value.trim() || !el.checkValidity()) { _invalidate(el, msg); ok = false; }
  });
  // NIF format (if provided)
  const nif = _el('company-nif');
  if (nif.value.trim() && !nif.checkValidity()) {
    _invalidate(nif, 'Formato inválido (ex: PT123456789).');
    ok = false;
  }
  return ok;
}

function _validateAdminForm() {
  let ok = true;
  const name    = _el('admin-name');
  const email   = _el('admin-email');
  const pw      = _el('admin-password');
  const pwConf  = _el('admin-password-confirm');
  const terms   = _el('accept-terms');

  [name, email, pw, pwConf].forEach((el) => _clearValid(el));

  if (!name.value.trim() || name.value.trim().length < 2) { _invalidate(name, null); ok = false; }
  if (!email.value.trim() || !email.checkValidity()) { _invalidate(email, null); ok = false; }
  if (!_googleData) {
    if (pw.value.length < 8) { _invalidate(pw, 'Mínimo 8 caracteres.'); ok = false; }
    if (pw.value !== pwConf.value) {
      _invalidate(pwConf, 'As palavras-passe não coincidem.');
      ok = false;
    }
  }
  if (!terms.checked) {
    terms.classList.add('is-invalid');
    _showError('Deve aceitar os Termos de Serviço para continuar.');
    ok = false;
  }

  return ok;
}

// ── Summary update ────────────────────────────────────────────────────────────

function _updateSummary() {
  const plan = PLANS[_selectedPlan];
  _el('es-plan').textContent     = plan?.label ?? '—';
  _el('es-company').textContent  = _el('company-name')?.value?.trim() ?? '—';
  _el('es-industry').textContent = INDUSTRY_LABELS[_el('company-industry')?.value] ?? '—';
  _el('es-size').textContent     = _el('company-size')?.value ?? '—';

  const seatsRow = _el('es-seats-row');
  if (_selectedPlan === 'team') {
    if (seatsRow) seatsRow.classList.add('d-none');
  } else {
    if (seatsRow) seatsRow.classList.remove('d-none');
    _el('es-seats').textContent = _el('company-seats')?.value ?? '—';
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function _submitEnterprise() {
  const btn = _el('btn-register-enterprise');
  _setLoading(btn, true);
  _hideError();

  try {
    const adminEmail = _el('admin-email').value.trim();
    const adminName  = _el('admin-name').value.trim();
    const password   = _el('admin-password').value;

    // Check if email already exists
    const checkRes = await fetch(`/users?email=${encodeURIComponent(adminEmail)}`);
    if (!checkRes.ok) throw new Error('Erro no servidor.');
    const existing = await checkRes.json();
    if (existing.length > 0) {
      _showError('Já existe uma conta com este email. Faça login ou use outro email.');
      _setLoading(btn, false);
      return;
    }

    // If Google → use Google name/email (may differ if user edited after OAuth)
    const googleId = _googleData?.sub ?? null;
    const picture  = _googleData?.picture ?? null;

    // Build org payload
    const seats       = parseInt(_el('company-seats')?.value ?? PLANS[_selectedPlan].seats, 10);
    const orgPayload  = {
      name:         _el('company-name').value.trim(),
      billingEmail: _el('company-billing-email').value.trim(),
      nif:          _el('company-nif').value.trim() || null,
      industry:     _el('company-industry').value,
      size:         _el('company-size').value,
      country:      _el('company-country').value,
      website:      _el('company-website').value.trim() || null,
      phone:        _el('company-phone').value.trim() || null,
      githubOrg:    _el('company-github-org').value.trim() || null,
      plan:         _selectedPlan,
      seats:        _selectedPlan === 'team' ? PLANS.team.seats : seats,
      createdAt:    new Date().toISOString(),
    };

    // POST to /organizations
    const orgRes = await fetch('/organizations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(orgPayload),
    });
    if (!orgRes.ok) throw new Error('Erro ao criar organização. Tente novamente.');
    const org   = await orgRes.json();
    const orgId = org.id;

    // Create admin user
    const userPayload = {
      name:           adminName,
      email:          adminEmail,
      password:       _googleData ? null : password,
      googleId,
      picture,
      role:           'admin',
      jobTitle:       _el('admin-role')?.value || null,
      organizationId: orgId,
      plan:           _selectedPlan,
      marketing:      _el('accept-marketing')?.checked ?? false,
      createdAt:      new Date().toISOString(),
    };

    const userRes = await fetch('/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(userPayload),
    });
    if (!userRes.ok) throw new Error('Erro ao criar conta de administrador.');
    const user = await userRes.json();

    // Store session
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id:             user.id,
      name:           user.name,
      email:          user.email,
      role:           'admin',
      plan:           _selectedPlan,
      organizationId: orgId,
    }));

    // Show success
    _el('step-3').classList.add('d-none');
    _el('step-success').classList.remove('d-none');
    _el('success-company-name').textContent = orgPayload.name;

    // Auto-redirect to enterprise app after 3 seconds
    setTimeout(() => { location.href = 'app-enterprise.html'; }, 3000);

  } catch (err) {
    _showError(err?.message ?? 'Ocorreu um erro inesperado. Tente novamente.');
  } finally {
    _setLoading(btn, false);
  }
}

// ── Team fast-track submit ────────────────────────────────────────────────────

async function _submitTeam() {
  const btn = _el('btn-register-team');
  _setLoading(btn, true);
  _hideError();

  const companyName = _el('team-company-name')?.value.trim();
  const adminName   = _el('team-admin-name')?.value.trim()  ?? (_googleData?.name  ?? '');
  const adminEmail  = _el('team-admin-email')?.value.trim() ?? (_googleData?.email ?? '');
  const password    = _el('team-admin-password')?.value     ?? '';
  const terms       = _el('team-accept-terms');

  // Validation
  let ok = true;
  const nameEl = _el('team-company-name');
  const aNameEl = _el('team-admin-name');
  const aEmailEl = _el('team-admin-email');
  const aPwEl = _el('team-admin-password');

  [nameEl, aNameEl, aEmailEl].forEach(el => el?.classList.remove('is-invalid'));
  if (!companyName || companyName.length < 2) { nameEl?.classList.add('is-invalid'); ok = false; }
  if (!adminName || adminName.length < 2)     { aNameEl?.classList.add('is-invalid'); ok = false; }
  if (!adminEmail || !aEmailEl?.checkValidity()) { aEmailEl?.classList.add('is-invalid'); ok = false; }
  if (!_googleData) {
    aPwEl?.classList.remove('is-invalid');
    if (password.length < 6) { aPwEl?.classList.add('is-invalid'); ok = false; }
  }
  if (!terms?.checked) {
    terms?.classList.add('is-invalid');
    _showError('Deve aceitar os Termos de Serviço para continuar.');
    ok = false;
  }
  if (!ok) { _setLoading(btn, false); return; }

  try {
    // Check email not already taken
    const checkRes = await fetch(`/users?email=${encodeURIComponent(adminEmail)}`);
    if (!checkRes.ok) throw new Error('Erro no servidor.');
    const existing = await checkRes.json();
    if (existing.length > 0) {
      _showError('Já existe uma conta com este email. Faça login ou use outro email.');
      _setLoading(btn, false);
      return;
    }

    // Create organization
    const orgRes = await fetch('/organizations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:      companyName,
        plan:      'team',
        seats:     5,
        createdAt: new Date().toISOString(),
      }),
    });
    if (!orgRes.ok) throw new Error('Erro ao criar organização.');
    const org = await orgRes.json();

    // Create admin user
    const userRes = await fetch('/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:           adminName,
        email:          adminEmail,
        password:       _googleData ? null : password,
        googleId:       _googleData?.sub    ?? null,
        picture:        _googleData?.picture ?? null,
        role:           'admin',
        plan:           'team',
        organizationId: org.id,
        createdAt:      new Date().toISOString(),
      }),
    });
    if (!userRes.ok) throw new Error('Erro ao criar conta.');
    const user = await userRes.json();

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id, name: user.name, email: user.email,
      role: 'admin', plan: 'team', organizationId: org.id,
    }));

    _el('step-team').classList.add('d-none');
    _el('step-success').classList.remove('d-none');
    _el('success-company-name').textContent = companyName;
    setTimeout(() => { location.href = 'app-enterprise.html'; }, 3000);

  } catch (err) {
    _showError(err?.message ?? 'Ocorreu um erro inesperado. Tente novamente.');
  } finally {
    _setLoading(btn, false);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init() {
  _initPlanCards();
  _initSeatsControl();
  _initPasswordStrength();

  // Step 1 → route by plan
  _el('btn-step1-next')?.addEventListener('click', () => {
    const selected = document.querySelector('input[name="plan"]:checked');
    if (!selected) { _showError('Por favor selecione um plano.'); return; }
    _selectedPlan = selected.value;
    _updatePlanVisuals();
    if (_selectedPlan === 'team') {
      // Fast-track: skip all the company details
      _googleData = null;
      _el('google-enterprise-badge')?.classList.add('d-none');
      _el('btn-google-enterprise')?.classList.remove('d-none');
      _el('team-pw-section')?.classList.remove('d-none');
      _el('team-company-name').value = '';
      _el('team-admin-name').value   = '';
      _el('team-admin-email').value  = '';
      _el('team-admin-password').value = '';
      _goTo('team');
    } else {
      _el('seats-row')?.classList.toggle('d-none', false);
      _goTo(2);
    }
  });

  // Team fast-track → back
  _el('btn-team-back')?.addEventListener('click', () => _goTo(1));

  // Team fast-track → Google
  _el('btn-google-enterprise')?.addEventListener('click', async () => {
    const btn = _el('btn-google-enterprise');
    try {
      btn.disabled = true;
      btn.textContent = 'A autenticar…';

      const googleUser = await _openGooglePopup();
      _googleData = googleUser;

      const nameEl  = _el('team-admin-name');
      const emailEl = _el('team-admin-email');
      if (nameEl  && !nameEl.value)  nameEl.value  = googleUser.name  ?? '';
      if (emailEl && !emailEl.value) emailEl.value = googleUser.email ?? '';

      _el('team-pw-section')?.classList.add('d-none');
      _el('google-enterprise-name').textContent = googleUser.name ?? googleUser.email;
      _el('google-enterprise-badge')?.classList.remove('d-none');
      btn.classList.add('d-none');
      _hideError();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" style="margin-right:8px;flex-shrink:0"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>Registar com Google';
      if (err.message === 'popup_blocked') {
        _showError('Popup bloqueado. Permita popups para este site e tente novamente.');
      } else if (err.message !== 'cancelled') {
        _showError('Erro ao autenticar com Google. Tente novamente.');
      }
    }
  });

  // Team fast-track → submit
  _el('btn-register-team')?.addEventListener('click', async () => {
    await _submitTeam();
  });

  // Step 2 → 1
  _el('btn-step2-back')?.addEventListener('click', () => _goTo(1));

  // Step 2 → 3
  _el('btn-step2-next')?.addEventListener('click', () => {
    if (!_validateCompanyForm()) {
      _showError('Por favor corrija os erros assinalados.');
      return;
    }
    _updateSummary();
    _goTo(3);
  });

  // Step 3 → 2
  _el('btn-step3-back')?.addEventListener('click', () => _goTo(2));

  // Step 3 → Submit
  _el('btn-register-enterprise')?.addEventListener('click', async () => {
    if (!_validateAdminForm()) return;
    await _submitEnterprise();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
