/**
 * api.js — HTTP communication layer (json-server on port 3001)
 * All functions throw on non-OK responses so callers can handle errors.
 */

const BASE_URL = '/tasks';

/**
 * Fetch tasks for a specific user.
 * @param {string|number} userId
 * @returns {Promise<Object[]>}
 */
export async function getTasks(userId) {
  const url = userId ? `${BASE_URL}?userId=${encodeURIComponent(userId)}` : BASE_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET /tasks → ${res.status}`);
  return res.json();
}

/**
 * Create a new task.
 * @param {Object} data  Task fields (without id/createdAt)
 * @returns {Promise<Object>}  Created task with server-assigned id
 */
export async function createTask(data) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`POST /tasks → ${res.status}`);
  return res.json();
}

/**
 * Replace a task by id.
 * @param {string|number} id
 * @param {Object}        data  Full task object
 * @returns {Promise<Object>}   Updated task
 */
export async function updateTask(id, data) {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT /tasks/${id} → ${res.status}`);
  return res.json();
}

/**
 * Delete a task by id.
 * @param {string|number} id
 * @returns {Promise<void>}
 */
export async function deleteTask(id) {
  const res = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /tasks/${id} → ${res.status}`);
}
