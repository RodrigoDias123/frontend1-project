/**
 * auth.js — Registration, login, and session management.
 *
 * Uses localStorage via localApi (GitHub Pages compatible).
 * Stores session in localStorage (key: devtasks_user) — persists across browser restarts.
 */

import { localFetch as fetch } from './localApi.js';

const BASE = '/users';
const SESSION_KEY = 'devtasks_user';

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('d-none');
}

function hideError() {
  document.getElementById('auth-error').classList.add('d-none');
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>A processar…';
  } else {
    btn.innerHTML = btn.dataset.origHtml;
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

function _initLoginModeToggle() {
  const btnSolo       = document.getElementById('btn-mode-solo');
  const btnEnterprise = document.getElementById('btn-mode-enterprise');
  const modeInput     = document.getElementById('login-mode');
  const title         = document.getElementById('login-title');
  const subtitle      = document.getElementById('login-subtitle');
  const footerSolo    = document.getElementById('login-footer-solo');
  const footerEnt     = document.getElementById('login-footer-enterprise');
  if (!btnSolo || !btnEnterprise) return;

  function setMode(mode) {
    modeInput.value = mode;
    const isEnt = mode === 'enterprise';
    btnSolo.classList.toggle('login-mode-btn--active', !isEnt);
    btnSolo.setAttribute('aria-pressed', String(!isEnt));
    btnEnterprise.classList.toggle('login-mode-btn--active', isEnt);
    btnEnterprise.setAttribute('aria-pressed', String(isEnt));
    if (title)    title.textContent    = isEnt ? 'Acesso Empresarial' : 'Bem-vindo de volta';
    if (subtitle) subtitle.textContent = isEnt
      ? 'Entre com as credenciais da sua conta organizacional.'
      : 'Introduza os seus dados para entrar.';
    if (footerSolo) footerSolo.classList.toggle('d-none', isEnt);
    if (footerEnt)  footerEnt.classList.toggle('d-none', !isEnt);
  }

  btnSolo.addEventListener('click',       () => setMode('solo'));
  btnEnterprise.addEventListener('click', () => setMode('enterprise'));
}

function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  _initLoginModeToggle();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const mode     = document.getElementById('login-mode')?.value ?? 'solo';

    if (!email || !password) {
      showError('Preencha todos os campos.');
      return;
    }

    const btn = document.getElementById('btn-login');
    setLoading(btn, true);

    try {
      const res = await fetch(`${BASE}?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error('Erro no servidor');

      const users = await res.json();
      const user = users.find((u) => u.password === password);

      if (!user) {
        showError('Email ou palavra-passe incorretos.');
        setLoading(btn, false);
        return;
      }

      // Mode validation
      if (mode === 'enterprise' && !user.organizationId) {
        showError('Esta conta não está associada a nenhuma organização. Use o acesso Pessoal ou registe uma conta empresarial.');
        setLoading(btn, false);
        return;
      }
      if (mode === 'solo' && user.organizationId) {
        showError('Esta é uma conta empresarial. Por favor use o modo Empresarial para entrar.');
        setLoading(btn, false);
        return;
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id:             user.id,
        name:           user.name,
        email:          user.email,
        role:           user.role ?? 'user',
        plan:           user.plan ?? 'free',
        organizationId: user.organizationId ?? null,
      }));
      window.location.href = user.organizationId ? 'app-enterprise.html' : 'app.html';
    } catch {
      showError('Não foi possível ligar ao servidor. Tente novamente.');
      setLoading(btn, false);
    }
  });
}

// ── Register ──────────────────────────────────────────────────────────────────

function initRegister() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!name || !email || !password || !confirm) {
      showError('Preencha todos os campos.');
      return;
    }

    if (password.length < 6) {
      showError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirm) {
      showError('As palavras-passe não coincidem.');
      return;
    }

    const btn = document.getElementById('btn-register');
    setLoading(btn, true);

    try {
      // Check if email already exists
      const check = await fetch(`${BASE}?email=${encodeURIComponent(email)}`);
      if (!check.ok) throw new Error('Erro no servidor');

      const existing = await check.json();
      if (existing.length > 0) {
        showError('Já existe uma conta com este email.');
        setLoading(btn, false);
        return;
      }

      // Create user
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) throw new Error('Erro ao criar conta');

      const user = await res.json();

      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, name: user.name, email: user.email }));
      window.location.href = 'app.html';
    } catch {
      showError('Não foi possível ligar ao servidor. Tente novamente.');
      setLoading(btn, false);
    }
  });
}

// ── Google OAuth (popup flow — sem GIS library) ───────────────────────────────

const GOOGLE_CLIENT_ID = '661228220614-f78g5rlstqikchqfj37acdatb3495j0g.apps.googleusercontent.com';

function _signInWithGoogle() {
  const redirectUri = new URL('google-callback.html', location.href).href;
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'token',
    scope:         'openid email profile',
    prompt:        'select_account',
  });

  const popup = window.open(authUrl, 'google-oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');

  if (!popup) {
    throw new Error('popup_blocked');
  }

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

async function _processGoogleUser({ sub: googleId, email, name, picture }) {
  const mode = document.getElementById('login-mode')?.value ?? 'solo';
  const isRegisterPage = !!document.getElementById('btn-google-register');

  let users = await fetch(`/users?googleId=${encodeURIComponent(googleId)}`).then(r => r.json()).catch(() => []);
  let user = users[0];

  if (!user) {
    users = await fetch(`/users?email=${encodeURIComponent(email)}`).then(r => r.json()).catch(() => []);
    user = users[0];
  }

  if (!user) {
    if (mode === 'enterprise' && !isRegisterPage) {
      showError('Não existe conta empresarial associada a este email Google. Registe uma organização primeiro.');
      return;
    }
    const res = await fetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, googleId, picture, role: 'user', plan: 'free' }),
    });
    if (!res.ok) { showError('Erro ao criar conta Google. Tente novamente.'); return; }
    user = await res.json();
  } else if (isRegisterPage) {
    showError('Já existe uma conta com este email Google. Use a página de login.');
    return;
  } else {
    if (!user.googleId) {
      await fetch(`/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, googleId, picture }),
      });
    }
    if (mode === 'enterprise' && !user.organizationId) {
      showError('Esta conta Google não está associada a nenhuma organização. Use o acesso Pessoal.');
      return;
    }
    if (mode === 'solo' && user.organizationId) {
      showError('Esta é uma conta empresarial. Por favor use o modo Empresarial para entrar.');
      return;
    }
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:             user.id,
    name:           user.name,
    email:          user.email,
    picture:        user.picture ?? picture,
    role:           user.role ?? 'user',
    plan:           user.plan ?? 'free',
    organizationId: user.organizationId ?? null,
  }));

  window.location.href = user.organizationId ? 'app-enterprise.html' : 'app.html';
}

function initGoogle() {
  const trigger = document.getElementById('btn-google-login')
               || document.getElementById('btn-google-register');
  if (!trigger) return;

  trigger.addEventListener('click', async () => {
    try {
      const googleUser = await _signInWithGoogle();
      await _processGoogleUser(googleUser);
    } catch (err) {
      if (err.message === 'popup_blocked') {
        showError('Popup bloqueado. Permita popups para este site e tente novamente.');
      } else if (err.message !== 'cancelled') {
        showError('Erro ao autenticar com Google. Tente novamente.');
      }
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

initLogin();
initRegister();
initGoogle();
