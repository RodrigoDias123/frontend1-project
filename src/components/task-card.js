/**
 * <task-card> Web Component
 *
 * Attributes:
 *   task-id        {string}   Unique task id
 *   title          {string}   Task title
 *   priority       {string}   baixa | media | alta
 *   due-date       {string}   YYYY-MM-DD
 *   description    {string}   Optional description (markdown — stripped for preview)
 *   status         {string}   todo | doing | done
 *   labels         {string}   JSON array of label strings
 *   links          {string}   JSON object { vscode, figma, swagger, storybook, custom }
 *   total-seconds  {string}   Total time tracked in seconds
 *   blocked        {string}   'true' if has unresolved blockedBy deps
 *
 * Dispatches (bubbles + composed):
 *   task:edit    — user clicked the edit button
 *   task:delete  — user clicked the delete button
 *   task:pomodoro — user clicked the pomodoro button
 */
class TaskCard extends HTMLElement {
  static get observedAttributes() {
    return ['task-id', 'title', 'priority', 'due-date', 'description',
            'status', 'labels', 'links', 'total-seconds', 'blocked'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) {
      this._render();
      this._bindEvents();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _stripMarkdown(text) {
    if (!text) return '';
    return String(text)
      .replace(/```[\s\S]*?```/g, '[código]')
      .replace(/`[^`]+`/g, '[código]')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, '$1')
      .replace(/^[>-]\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  _priorityLabel(p) {
    return { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p] ?? p;
  }

  _dueDateInfo(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due   = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.ceil((due - today) / 86_400_000);
    const formatted = due.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    if (diffDays < 0)   return { text: `${formatted} · vencida`,      cls: 'due--overdue' };
    if (diffDays === 0) return { text: `${formatted} · hoje`,          cls: 'due--soon' };
    if (diffDays <= 3)  return { text: `${formatted} · ${diffDays}d`,  cls: 'due--soon' };
    return                     { text: `${formatted} · ${diffDays}d`,  cls: '' };
  }

  _fmtTime(secs) {
    if (!secs) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _render() {
    const title        = this.getAttribute('title')         ?? 'Sem título';
    const priority     = this.getAttribute('priority')      ?? 'baixa';
    const dueDate      = this.getAttribute('due-date')      ?? '';
    const description  = this.getAttribute('description')   ?? '';
    const blocked      = this.getAttribute('blocked')       === 'true';
    const totalSeconds = Number(this.getAttribute('total-seconds') ?? 0);

    let labels = [];
    try { labels = JSON.parse(this.getAttribute('labels') ?? '[]'); } catch {}
    let links = {};
    try { links = JSON.parse(this.getAttribute('links') ?? '{}'); } catch {}

    const due         = this._dueDateInfo(dueDate);
    const plainDesc   = this._stripMarkdown(description);
    const timeText    = this._fmtTime(totalSeconds);
    const linkEntries = Object.entries(links).filter(([, v]) => v);

    const LINK_ICONS = {
      vscode:    { icon: '⌨',  title: 'VS Code' },
      figma:     { icon: '✏',  title: 'Figma' },
      swagger:   { icon: '📄', title: 'Swagger/Postman' },
      storybook: { icon: '🎨', title: 'Storybook' },
      custom:    { icon: '🔗', title: 'Link' },
    };

    this.shadowRoot.innerHTML = /* html */`
      <style>
        :host {
          display: block;
          background: #21262d;
          border: 1px solid #30363d;
          border-radius: .625rem;
          padding: .75rem .75rem .65rem 1rem;
          cursor: grab;
          position: relative;
          overflow: hidden;
          transition: box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease;
        }
        :host(:hover)  { border-color: rgba(88,166,255,.35); box-shadow: 0 4px 16px rgba(0,0,0,.35); transform: translateY(-1px); }
        :host(:active) { cursor: grabbing; }

        /* Priority stripe */
        :host::before {
          content: '';
          position: absolute;
          inset-block: 0;
          left: 0;
          width: 3px;
          border-radius: .625rem 0 0 .625rem;
        }
        :host([priority="alta"])::before  { background: #f85149; }
        :host([priority="media"])::before { background: #d29922; }
        :host([priority="baixa"])::before { background: #3fb950; }

        /* Header */
        .card-header { display: flex; align-items: flex-start; gap: .4rem; margin-bottom: .3rem; }
        .card-title  { flex: 1; font-size: .85rem; font-weight: 600; color: #e6edf3; margin: 0; word-break: break-word; line-height: 1.4; }

        .card-actions { display: flex; gap: .15rem; flex-shrink: 0; opacity: 0; transition: opacity 150ms ease; }
        :host(:hover) .card-actions, :host(:focus-within) .card-actions { opacity: 1; }

        .btn-action {
          display: inline-flex; align-items: center; justify-content: center;
          width: 1.5rem; height: 1.5rem; border: none; background: transparent;
          border-radius: .3rem; cursor: pointer; color: #8b949e; padding: 0;
          transition: color 150ms ease, background-color 150ms ease;
        }
        .btn-action:hover { background: #30363d; }
        .btn-action--edit:hover   { color: #58a6ff; }
        .btn-action--delete:hover { color: #f85149; }
        .btn-action--pomo:hover   { color: #d29922; }
        .btn-action:focus-visible { outline: 2px solid #58a6ff; outline-offset: 1px; }

        /* Badges row */
        .card-badges { display: flex; flex-wrap: wrap; gap: .25rem; margin-bottom: .3rem; }

        .badge-blocked {
          display: inline-flex; align-items: center; gap: .15rem;
          font-size: .58rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
          color: #f85149; background: rgba(248,81,73,.12); border: 1px solid rgba(248,81,73,.3);
          border-radius: 2rem; padding: .05rem .38rem;
        }
        .label-tag {
          display: inline-flex; align-items: center;
          padding: .05rem .38rem; border-radius: 2rem;
          font-size: .58rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
          background: rgba(88,166,255,.15); color: #58a6ff; border: 1px solid rgba(88,166,255,.25);
        }

        /* Description */
        .card-description {
          font-size: .74rem; color: #8b949e; margin: 0 0 .4rem;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; line-height: 1.5; word-break: break-word;
        }

        /* Meta row */
        .card-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .3rem; }

        .badge-priority {
          display: inline-flex; align-items: center; gap: .2rem;
          padding: .1rem .38rem; border-radius: .9rem;
          font-size: .6rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
        }
        .badge-priority[data-p="alta"]  { background: rgba(248,81,73,.15);  color: #f85149; }
        .badge-priority[data-p="media"] { background: rgba(210,153,34,.15); color: #d29922; }
        .badge-priority[data-p="baixa"] { background: rgba(63,185,80,.15);  color: #3fb950; }

        .due-date { font-size: .7rem; color: #8b949e; display: inline-flex; align-items: center; gap: .25rem; }
        .due--overdue { color: #f85149; font-weight: 600; }
        .due--soon    { color: #d29922; font-weight: 600; }

        /* Time badge */
        .time-badge { font-size: .68rem; color: #8b949e; display: inline-flex; align-items: center; gap: .2rem; }

        /* Link icons */
        .card-links { display: flex; gap: .25rem; margin-top: .3rem; flex-wrap: wrap; }
        .card-link-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 1.15rem; height: 1.15rem; border-radius: .2rem;
          background: #30363d; font-size: .65rem; text-decoration: none;
          transition: background .12s;
        }
        .card-link-icon:hover { background: #58a6ff; }
      </style>

      <div class="card-header">
        <h3 class="card-title">${this._esc(title)}</h3>
        <div class="card-actions">
          <button class="btn-action btn-action--pomo" aria-label="Pomodoro: ${this._esc(title)}" data-action="pomodoro" title="Iniciar Pomodoro">
            ⏱
          </button>
          <button class="btn-action btn-action--edit" aria-label="Editar: ${this._esc(title)}" data-action="edit">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
            </svg>
          </button>
          <button class="btn-action btn-action--delete" aria-label="Eliminar: ${this._esc(title)}" data-action="delete">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>
        </div>
      </div>

      ${(blocked || labels.length > 0) ? `
      <div class="card-badges">
        ${blocked ? `<span class="badge-blocked">⛔ Bloqueado</span>` : ''}
        ${labels.map((l) => `<span class="label-tag">${this._esc(l)}</span>`).join('')}
      </div>` : ''}

      ${plainDesc ? `<p class="card-description">${this._esc(plainDesc)}</p>` : ''}

      <div class="card-meta">
        <span class="badge-priority" data-p="${this._esc(priority)}">
          ${this._esc(this._priorityLabel(priority))}
        </span>
        ${due ? `<span class="due-date ${this._esc(due.cls)}">${this._esc(due.text)}</span>` : ''}
        ${timeText ? `<span class="time-badge">⏱ ${this._esc(timeText)}</span>` : ''}
      </div>

      ${linkEntries.length > 0 ? `
      <div class="card-links">
        ${linkEntries.map(([key, url]) => {
          const meta = { vscode: '⌨', figma: '✏', swagger: '📄', storybook: '🎨', custom: '🔗' };
          const icon = meta[key] ?? '🔗';
          const name = { vscode: 'VS Code', figma: 'Figma', swagger: 'Swagger', storybook: 'Storybook', custom: 'Link' }[key] ?? key;
          return `<a href="${this._esc(url)}" class="card-link-icon" target="_blank" rel="noopener noreferrer" title="${this._esc(name)}">${icon}</a>`;
        }).join('')}
      </div>` : ''}
    `;
  }

  // ── Events ───────────────────────────────────────────────────────────────

  _bindEvents() {
    this.shadowRoot.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent(
          new CustomEvent(`task:${btn.dataset.action}`, {
            bubbles: true,
            composed: true,
            detail: { taskId: this.getAttribute('task-id') },
          })
        );
      });
    });
  }
}

customElements.define('task-card', TaskCard);
