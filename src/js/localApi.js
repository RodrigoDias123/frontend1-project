/**
 * localApi.js — localStorage-backed REST API (replaces json-server for GitHub Pages).
 *
 * Mimics json-server URL conventions:
 *   GET    /resource           → return all records
 *   GET    /resource?k=v      → filter by query params
 *   GET    /resource/:id      → return one record
 *   POST   /resource          → create (auto-increment id)
 *   PUT    /resource/:id      → full replace
 *   PATCH  /resource/:id      → partial update
 *   DELETE /resource/:id      → remove
 */

const DB_PREFIX = 'devtasks_db_';

function getStore(name) {
  try {
    const raw = localStorage.getItem(`${DB_PREFIX}${name}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function setStore(name, data) {
  try {
    localStorage.setItem(`${DB_PREFIX}${name}`, JSON.stringify(data));
  } catch (_) { /* quota exceeded — ignore */ }
}

function nextId(records) {
  if (records.length === 0) return 1;
  return Math.max(...records.map((r) => Number(r.id) || 0)) + 1;
}

/** Parse a json-server style URL into { resource, id, params }. */
function parseUrl(url) {
  const [pathPart, queryPart] = url.split('?');
  const segments = pathPart.replace(/^\//, '').split('/');
  const resource = segments[0];
  const id = segments[1] || null;
  const params = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const k = decodeURIComponent(pair.slice(0, eqIdx));
      const v = decodeURIComponent(pair.slice(eqIdx + 1));
      params[k] = v;
    }
  }
  return { resource, id, params };
}

function makeResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

/**
 * Drop-in replacement for fetch() against json-server-style endpoints.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ok:boolean, status:number, json:()=>Promise<any>}>}
 */
export function localFetch(url, options = {}) {
  const { resource, id, params } = parseUrl(url);
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;

  let records = getStore(resource);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    if (id) {
      const item = records.find((r) => String(r.id) === String(id));
      return item ? makeResponse(item) : makeResponse(null, 404);
    }
    let result = records;
    for (const [k, v] of Object.entries(params)) {
      result = result.filter((r) => String(r[k]) === String(v));
    }
    return makeResponse(result);
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const newItem = { id: nextId(records), ...body };
    records.push(newItem);
    setStore(resource, records);
    return makeResponse(newItem, 201);
  }

  // ── PUT / PATCH ──────────────────────────────────────────────────────────
  if (method === 'PUT' || method === 'PATCH') {
    const idx = records.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) {
      // json-server creates resource on PUT if not found (upsert)
      const newItem = { id: Number(id) || nextId(records), ...body };
      records.push(newItem);
      setStore(resource, records);
      return makeResponse(newItem, 201);
    }
    records[idx] = method === 'PUT'
      ? { id: records[idx].id, ...body }
      : { ...records[idx], ...body };
    setStore(resource, records[idx]);
    setStore(resource, records);
    return makeResponse(records[idx]);
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    const before = records.length;
    records = records.filter((r) => String(r.id) !== String(id));
    setStore(resource, records);
    return before > records.length
      ? makeResponse({})
      : makeResponse(null, 404);
  }

  return makeResponse(null, 405);
}
