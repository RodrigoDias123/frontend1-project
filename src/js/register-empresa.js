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

// ── State ─────────────────────────────────────────────────────────────────────

let _currentStep = 1;
let _selectedPlan = 'business';

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
  [1, 2, 3].forEach((n) => {
    const sec  = _el(`step-${n}`);
    const nav  = document.querySelector(`[data-step="${n}"]`);
    if (sec) sec.classList.toggle('d-none', n !== step);
    if (nav) {
      nav.classList.remove('enterprise-step--active', 'enterprise-step--done');
      if (n === step) nav.classList.add('enterprise-step--active');
      if (n < step)  nav.classList.add('enterprise-step--done');
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
  if (pw.value.length < 8) { _invalidate(pw, 'Mínimo 8 caracteres.'); ok = false; }
  if (pw.value !== pwConf.value) {
    _invalidate(pwConf, 'As palavras-passe não coincidem.');
    ok = false;
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
      password,
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

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function init() {
  _initPlanCards();
  _initSeatsControl();
  _initPasswordStrength();

  // Step 1 → 2
  _el('btn-step1-next')?.addEventListener('click', () => {
    const selected = document.querySelector('input[name="plan"]:checked');
    if (!selected) { _showError('Por favor selecione um plano.'); return; }
    _selectedPlan = selected.value;
    _updatePlanVisuals();
    // Show seats row in step 2 for paid plans
    _el('seats-row')?.classList.toggle('d-none', _selectedPlan === 'team');
    _goTo(2);
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
