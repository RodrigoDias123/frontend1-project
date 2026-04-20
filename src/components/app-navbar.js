/**
 * <app-navbar> — Web Component for the application navigation bar.
 *
 * Attributes:
 *   variant        {string}   "app" (default) | "landing"
 *   page-title     {string}   Text shown next to the logo (default: "Dev Tasks")
 *   logo-icon      {string}   Bootstrap Icons class (default: "bi-kanban-fill")
 *   home-href      {string}   Logo link destination (default: "index.html")
 *
 * Slots:
 *   actions        — Buttons / links rendered on the right side of the navbar
 *
 * Examples:
 *   <!-- App variant (used in app.html) -->
 *   <app-navbar variant="app" home-href="index.html">
 *     <div slot="actions">…buttons…</div>
 *   </app-navbar>
 *
 *   <!-- Landing variant (used in index.html) -->
 *   <app-navbar variant="landing" home-href="./index.html">
 *     <div slot="actions">…links…</div>
 *   </app-navbar>
 */

class AppNavbar extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'page-title', 'logo-icon', 'home-href'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback()  { this._render(); }
  attributeChangedCallback() { if (this.shadowRoot.innerHTML) this._render(); }

  // ── Getters ───────────────────────────────────────────────────────────────

  get _variant()   { return this.getAttribute('variant')    ?? 'app'; }
  get _title()     { return this.getAttribute('page-title') ?? 'Dev Tasks'; }
  get _icon()      { return this.getAttribute('logo-icon')  ?? 'bi-kanban-fill'; }
  get _homeHref()  { return this.getAttribute('home-href')  ?? 'index.html'; }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    const isLanding = this._variant === 'landing';

    this.shadowRoot.innerHTML = `
      <style>
        /* ── Design tokens (inherit from document) ────────────────────────── */
        :host {
          display: block;
          --color-surface:  #161b22;
          --color-border:   #30363d;
          --color-text:     #e6edf3;
          --color-accent:   #58a6ff;
          --header-height:  3.5rem;
          --font-stack:     -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                            Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue",
                            sans-serif;
        }

        /* ── Shared ───────────────────────────────────────────────────────── */
        * { box-sizing: border-box; margin: 0; padding: 0; }

        a { text-decoration: none; }

        .brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: var(--color-text);
          font-family: var(--font-stack);
          font-weight: 700;
          transition: color 150ms ease;
        }
        .brand:hover { color: var(--color-accent); }

        .brand-icon {
          font-size: 1.4rem;
          color: var(--color-accent);
          line-height: 1;
        }

        .brand-title {
          font-size: 1.05rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .actions ::slotted(*) {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: nowrap;
        }

        /* ── App variant ──────────────────────────────────────────────────── */
        :host([variant="app"]) nav,
        :host(:not([variant])) nav {
          height: var(--header-height);
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          flex-shrink: 0;
          z-index: 100;
          padding: 0 1.25rem;
          justify-content: space-between;
        }

        :host([variant="app"]) .brand-title,
        :host(:not([variant])) .brand-title {
          font-size: 1.05rem;
        }

        /* ── Landing variant ──────────────────────────────────────────────── */
        :host([variant="landing"]) nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 1000;
          padding: 1rem 1.5rem;
          background: rgba(13, 17, 23, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        :host([variant="landing"]) .brand-title {
          font-size: 1.25rem;
        }

        :host([variant="landing"]) .brand-icon {
          font-size: 1.5rem;
        }

        /* ── Slot passthrough ────────────────────────────────────────────── */
        .actions { display: flex; align-items: center; }
      </style>

      <nav role="banner" part="nav">
        <a href="${this._esc(this._homeHref)}" class="brand" aria-label="${this._esc(this._title)} — Página inicial">
          <span class="brand-icon" aria-hidden="true">
            <i class="${this._esc(this._icon)}"></i>
          </span>
          <span class="brand-title">${this._esc(this._title)}</span>
        </a>
        <div class="actions" part="actions">
          <slot name="actions"></slot>
        </div>
      </nav>
    `;

    // Bootstrap Icons are loaded by the host page — inject a link into shadow root
    // only if it hasn't been added yet.
    if (!this.shadowRoot.querySelector('link[data-bi]')) {
      const bsIcons = document.querySelector('link[href*="bootstrap-icons"]');
      if (bsIcons) {
        const clone = document.createElement('link');
        clone.rel      = 'stylesheet';
        clone.href     = bsIcons.href;
        clone.dataset.bi = '1';
        this.shadowRoot.prepend(clone);
      }
    }
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('app-navbar', AppNavbar);
