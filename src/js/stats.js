/**
 * stats.js — Statistics panel (counters + Chart.js bar chart).
 *
 * Exports:
 *   initStats()          — wire up the toggle button
 *   updateStats(tasks)   — recalculate and re-render with new task list
 */

/** @type {import('chart.js').Chart|null} */
let _chart = null;

// ── Public ────────────────────────────────────────────────────────────────────

export function initStats() {
  const btn   = document.getElementById('btn-toggle-stats');
  const panel = document.getElementById('stats-panel');

  btn.addEventListener('click', () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    btn.setAttribute('aria-expanded', String(!isOpen));
  });
}

/**
 * Update counters and chart with the current task list.
 * @param {Object[]} tasks
 */
export function updateStats(tasks) {
  _updateCounters(tasks);
  _updateChart(tasks);
}

// ── Private ───────────────────────────────────────────────────────────────────

function _counts(tasks) {
  return {
    todo:  tasks.filter((t) => t.status === 'todo').length,
    doing: tasks.filter((t) => t.status === 'doing').length,
    done:  tasks.filter((t) => t.status === 'done').length,
    alta:  tasks.filter((t) => t.priority === 'alta').length,
    media: tasks.filter((t) => t.priority === 'media').length,
    baixa: tasks.filter((t) => t.priority === 'baixa').length,
  };
}

function _updateCounters(tasks) {
  const c = _counts(tasks);
  document.getElementById('count-todo').textContent  = c.todo;
  document.getElementById('count-doing').textContent = c.doing;
  document.getElementById('count-done').textContent  = c.done;
}

function _updateChart(tasks) {
  const canvas = document.getElementById('stats-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const c = _counts(tasks);

  const labels = ['To Do', 'Doing', 'Done', 'Alta', 'Média', 'Baixa'];
  const values = [c.todo, c.doing, c.done, c.alta, c.media, c.baixa];
  const bgs    = [
    'rgba(88,166,255,.65)',
    'rgba(210,153,34,.65)',
    'rgba(63,185,80,.65)',
    'rgba(248,81,73,.65)',
    'rgba(210,153,34,.45)',
    'rgba(63,185,80,.45)',
  ];
  const borders = ['#58a6ff', '#d29922', '#3fb950', '#f85149', '#d29922', '#3fb950'];

  if (_chart) {
    _chart.data.datasets[0].data            = values;
    _chart.data.datasets[0].backgroundColor = bgs;
    _chart.data.datasets[0].borderColor     = borders;
    _chart.update();
    return;
  }

  _chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Tarefas',
        data:            values,
        backgroundColor: bgs,
        borderColor:     borders,
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#21262d',
          borderColor:     '#30363d',
          borderWidth:     1,
          titleColor:      '#e6edf3',
          bodyColor:       '#8b949e',
        },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(48,54,61,.5)' },
          ticks: { color: '#8b949e', font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#8b949e', font: { size: 10 }, stepSize: 1 },
          grid:  { color: 'rgba(48,54,61,.5)' },
        },
      },
    },
  });
}
