/**
 * estimates.js — Smart Estimates & Story Points
 *
 * Features:
 *  - Keyword-based story point suggestion
 *  - Historical accuracy check: warns when current estimate likely underestimates
 *  - Hooks for modal.js to show warnings inline
 */

// ── Story Points ──────────────────────────────────────────────────────────────

const _COMPLEXITY = {
  high: [
    'refactor', 'refactoring', 'migration', 'migrate', 'integração', 'integration',
    'auth', 'oauth', 'jwt', 'database', 'redis', 'distributed', 'websocket',
    'concurrency', 'concorrência', 'cache', 'performance', 'security', 'segurança',
    'algoritmo', 'algorithm', 'arquitetura', 'architecture', 'deploy', 'pipeline',
    'kubernetes', 'docker', 'infraestrutura', 'infrastructure',
  ],
  medium: [
    'api', 'endpoint', 'component', 'componente', 'form', 'formulário', 'modal',
    'chart', 'gráfico', 'hook', 'service', 'serviço', 'test', 'teste', 'upload',
    'download', 'filter', 'filtro', 'search', 'pesquisa', 'pagination', 'paginação',
    'validação', 'validation', 'notificação', 'notification', 'socket',
  ],
  low: [
    'style', 'estilo', 'typo', 'text', 'texto', 'color', 'cor', 'label',
    'button', 'botão', 'icon', 'tooltip', 'fix', 'update', 'atualizar',
    'rename', 'renomear', 'copy', 'copiar', 'move', 'mover',
  ],
};

const _SP = { high: 8, medium: 3, low: 1 };

/**
 * Suggest story points based on title + description text.
 * @param {string} title
 * @param {string} description
 * @returns {{ points: number, level: 'low'|'medium'|'high' }}
 */
export function suggestStoryPoints(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  for (const [level, kws] of Object.entries(_COMPLEXITY)) {
    if (kws.some((kw) => text.includes(kw))) {
      return { points: _SP[level], level };
    }
  }
  return { points: 2, level: 'medium' };
}

// ── Historical Estimate Analysis ──────────────────────────────────────────────

/**
 * Compare estimatedHours against history and warn if likely underestimated.
 * Needs at least 3 completed tasks with both estimatedHours and totalSeconds.
 *
 * @param {number} estimatedHours
 * @param {Object[]} allTasks
 * @returns {{ warn: boolean, adjustedHours: number, avgRatio: number, message: string } | null}
 */
export function analyzeEstimate(estimatedHours, allTasks) {
  if (!estimatedHours || estimatedHours <= 0) return null;

  const withData = allTasks.filter(
    (t) => t.estimatedHours > 0 && t.totalSeconds > 0 && t.status === 'done'
  );
  if (withData.length < 3) return null;

  const ratios  = withData.map((t) => (t.totalSeconds / 3600) / t.estimatedHours);
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  if (avgRatio <= 1.4) return null; // estimates are reasonably accurate

  const adjusted = Math.round(estimatedHours * avgRatio * 10) / 10;
  return {
    warn: true,
    avgRatio:      Math.round(avgRatio * 10) / 10,
    adjustedHours: adjusted,
    message: `Historicamente as tuas tarefas demoram ${Math.round(avgRatio * 10) / 10}× mais do que o estimado. Considera ${adjusted}h em vez de ${estimatedHours}h.`,
  };
}

// ── UI helpers (called from modal.js) ────────────────────────────────────────

/**
 * Update the estimate warning banner in the modal.
 * @param {number} estimatedHours
 * @param {Object[]} allTasks
 */
export function updateEstimateWarning(estimatedHours, allTasks) {
  const warnEl = document.getElementById('estimate-warning');
  if (!warnEl) return;
  const result = analyzeEstimate(estimatedHours, allTasks);
  if (result?.warn) {
    warnEl.textContent = `⚠ ${result.message}`;
    warnEl.classList.remove('d-none');
  } else {
    warnEl.classList.add('d-none');
  }
}

/**
 * Fill the story points input and label with a suggestion.
 * @param {string} title
 * @param {string} description
 */
export function applyStoryPointSuggestion(title, description) {
  const result  = suggestStoryPoints(title, description);
  const labelEl = document.getElementById('story-points-suggestion');
  const input   = document.getElementById('task-story-points');
  if (labelEl) {
    labelEl.textContent = `Sugestão IA: ${result.points} SP (complexidade ${result.level})`;
    labelEl.classList.remove('d-none');
  }
  if (input && !input.value) {
    input.value = String(result.points);
  }
}
