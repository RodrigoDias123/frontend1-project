/**
 * export.js — JSON and CSV export for tasks.
 *
 * Exports:
 *   initExport(getTasksFn)  — bind export buttons to task getter function
 *   exportJSON(tasks)       — trigger JSON file download
 *   exportCSV(tasks)        — trigger CSV file download
 */

/**
 * Bind the export buttons.
 * @param {() => Object[]} getTasksFn
 */
export function initExport(getTasksFn) {
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    exportJSON(getTasksFn());
  });
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    exportCSV(getTasksFn());
  });
}

export function exportJSON(tasks) {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  _download(blob, `devtasks-${_dateStamp()}.json`);
}

export function exportCSV(tasks) {
  const cols = ['id', 'title', 'status', 'priority', 'dueDate', 'labels', 'totalSeconds', 'createdAt'];
  const header = cols.join(',');
  const rows = tasks.map((t) =>
    cols.map((col) => {
      let v = '';
      if (col === 'labels') v = (t.labels ?? []).join(';');
      else v = t[col] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  _download(blob, `devtasks-${_dateStamp()}.csv`);
}

function _download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
