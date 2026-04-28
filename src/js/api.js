import { localFetch as localDbFetch } from './localApi.js';

/**
 * api.js — Data layer for MockAPI resources.
 * All functions throw on non-OK responses so callers can handle errors.
 */

const API_ROOT = 'https://69f0f801c1533dbedc9dfea4.mockapi.io';
const BASE_URL = `${API_ROOT}/tasks`;
const USERS_BASE_CANDIDATES = [
  `${API_ROOT}/users`,
  `${API_ROOT}/tasks/users`,
  `${API_ROOT}/api/v1/users`,
  `${API_ROOT}/api/users`,
];

const fetchApi = (...args) => fetch(...args);

function _normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function _trim(value) {
  return String(value ?? '').trim();
}

async function _assertOk(res, label) {
  if (!res.ok) throw new Error(`${label} → ${res.status}`);
}

async function _fetchUsersEndpoint(path = '', options) {
  for (const base of USERS_BASE_CANDIDATES) {
    try {
      const res = await fetchApi(`${base}${path}`, options);
      if (res.ok) return res;
    } catch (_) {
      // tenta próximo candidato
    }
  }

  // Fallback local para não bloquear auth quando a coleção remota /users
  // não existir ou estiver com validações incompatíveis.
  return localDbFetch(`/users${path}`, options);
}

// USERS API
export async function getUsers() {
  const res = await _fetchUsersEndpoint();
  await _assertOk(res, 'GET /users');
  return res.json();
}

export async function getUserByEmail(email) {
  const normalizedEmail = _normalizeEmail(email);
  if (!normalizedEmail) return null;

  const res = await _fetchUsersEndpoint(`?email=${encodeURIComponent(normalizedEmail)}`);
  await _assertOk(res, 'GET /users?email');
  const users = await res.json();
  return users.find((u) => _normalizeEmail(u.email) === normalizedEmail) ?? null;
}

/**
 * Authenticates a user by email and password against MockAPI.
 * @returns {Promise<Object|null>}
 */
export async function loginUser(email, password) {
  const normalizedEmail = _normalizeEmail(email);
  const rawPassword = String(password ?? '');
  if (!normalizedEmail || !rawPassword) return null;

  const user = await getUserByEmail(normalizedEmail);
  if (!user) return null;
  return String(user.password ?? '') === rawPassword ? user : null;
}

/**
 * Registers a new user in MockAPI with duplicate-email protection.
 */
export async function registerUser(data) {
  const name = _trim(data?.name);
  const email = _normalizeEmail(data?.email);
  const password = String(data?.password ?? '');

  if (!name || !email || !password) {
    throw new Error('invalid_payload');
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    const err = new Error('email_exists');
    err.code = 'email_exists';
    throw err;
  }

  const payload = {
    ...data,
    name,
    email,
    password,
  };

  const res = await _fetchUsersEndpoint('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await _assertOk(res, 'POST /users');
  return res.json();
}

export async function createUser(data) {
  return registerUser(data);
}

export async function updateUser(id, data) {
  const res = await _fetchUsersEndpoint(`/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await _assertOk(res, `PUT /users/${id}`);
  return res.json();
}

export async function deleteUser(id) {
  const res = await _fetchUsersEndpoint(`/${id}`, { method: 'DELETE' });
  await _assertOk(res, `DELETE /users/${id}`);
  return res.json();
}

/**
 * Fetch tasks for a specific user.
 * @param {string|number} userId
 * @returns {Promise<Object[]>}
 */
export async function getTasks(userId) {
  const url = userId ? `${BASE_URL}?userId=${encodeURIComponent(userId)}` : BASE_URL;
  const res = await fetchApi(url);
  await _assertOk(res, 'GET /tasks');
  return res.json();
}

/**
 * Create a new task.
 * @param {Object} data  Task fields (without id/createdAt)
 * @returns {Promise<Object>}  Created task with server-assigned id
 */
export async function createTask(data) {
  const res = await fetchApi(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await _assertOk(res, 'POST /tasks');
  return res.json();
}

/**
 * Replace a task by id.
 * @param {string|number} id
 * @param {Object}        data  Full task object
 * @returns {Promise<Object>}   Updated task
 */
export async function updateTask(id, data) {
  const res = await fetchApi(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await _assertOk(res, `PUT /tasks/${id}`);
  return res.json();
}

/**
 * Delete a task by id.
 * @param {string|number} id
 * @returns {Promise<void>}
 */
export async function deleteTask(id) {
  const res = await fetchApi(`${BASE_URL}/${id}`, { method: 'DELETE' });
  await _assertOk(res, `DELETE /tasks/${id}`);
}
