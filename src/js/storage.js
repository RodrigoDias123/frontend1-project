/**
 * storage.js — LocalStorage persistence layer
 * Used as offline fallback and for queuing pending operations.
 */

const CACHE_KEY   = 'devtasks_cache';
const PENDING_KEY = 'devtasks_pending';

// ── Task cache ────────────────────────────────────────────────────────────────

/** Persist the full tasks array. */
export function saveCache(tasks) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(tasks)); } catch (_) { /* quota exceeded */ }
}

/** Load the cached tasks array (returns [] on error / empty). */
export function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

/** Upsert a single task in the cache. */
export function updateCacheItem(task) {
  const tasks = getCache();
  const idx = tasks.findIndex((t) => String(t.id) === String(task.id));
  if (idx !== -1) tasks[idx] = task; else tasks.push(task);
  saveCache(tasks);
}

/** Remove a single task from the cache. */
export function removeCacheItem(taskId) {
  saveCache(getCache().filter((t) => String(t.id) !== String(taskId)));
}

// ── Pending operations (offline sync queue) ───────────────────────────────────

/**
 * Append an operation to the pending queue.
 * @param {{ type: 'create'|'update'|'delete', id?: string|number, data?: Object }} op
 */
export function addPendingOp(op) {
  const ops = getPendingOps();
  ops.push(op);
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(ops)); } catch (_) { /* quota */ }
}

/** Return all queued pending operations ([] if none). */
export function getPendingOps() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

/** Clear the pending operations queue after a successful sync. */
export function clearPendingOps() {
  try { localStorage.removeItem(PENDING_KEY); } catch (_) { /* ignore */ }
}
