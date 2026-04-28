  /**
 * shortcuts.js — Command palette (Ctrl+K) and global keyboard shortcuts.
 *
 * Usage:
 *   initShortcuts([
 *     { label: 'Nova Tarefa', icon: 'bi-plus-lg', shortcut: 'N', action: () => {} },
 *   ]);
 */

let _commands    = [];
let _filterQuery = '';

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * @param {{ label: string, icon: string, shortcut?: string, action: () => void }[]} commands
 */
export function initShortcuts(commands) {
  _commands = commands;

  const palette = document.getElementById('cmd-palette');
  const input   = document.getElementById('cmd-input');
  if (!palette || !input) return;

  document.addEventListener('keydown', (e) => {
    // Ctrl+K / Cmd+K — toggle palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      palette.hidden ? _openPalette() : _closePalette();
      return;
    }

    // Escape — close palette
    if (e.key === 'Escape' && !palette.hidden) {
      _closePalette();
      return;
    }

    // Arrow navigation inside palette
    if (!palette.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _move(1);  return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _move(-1); return; }
      if (e.key === 'Enter')     { e.preventDefault(); _runSelected(); return; }
    }

    // Global single-key shortcuts (only when not focusing a form field)
    if (palette.hidden && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      _matchShortcut(e.key.toUpperCase());
    }
  });

  // Close on backdrop click
  palette.addEventListener('click', (e) => {
    if (e.target === palette) _closePalette();
  });

  // Filter commands on input
  input.addEventListener('input', () => {
    _filterQuery = input.value.toLowerCase();
    _renderList();
  });

  // Wire header button if present
  document.getElementById('btn-cmd-palette')?.addEventListener('click', _openPalette);
}

function _openPalette() {
  const palette = document.getElementById('cmd-palette');
  const input   = document.getElementById('cmd-input');
  palette.hidden = false;
  input.value   = '';
  _filterQuery  = '';
  _renderList();
  requestAnimationFrame(() => input.focus());
}

function _closePalette() {
  document.getElementById('cmd-palette').hidden = true;
}

function _renderList() {
  const list = document.getElementById('cmd-list');
  if (!list) return;

  const visible = _filterQuery
    ? _commands.filter((c) => c.label.toLowerCase().includes(_filterQuery))
    : _commands;

  list.innerHTML = visible.map((c, i) => `
    <li class="cmd-item" data-index="${i}" role="option" tabindex="-1">
      <i class="bi ${c.icon} cmd-icon" aria-hidden="true"></i>
      <span class="cmd-label">${_esc(c.label)}</span>
      ${c.shortcut ? `<kbd class="cmd-kbd">${_esc(c.shortcut)}</kbd>` : ''}
    </li>
  `).join('');

  list.querySelectorAll('.cmd-item').forEach((el) => {
    el.addEventListener('click', () => {
      const cmd = visible[Number(el.dataset.index)];
      if (cmd) { _closePalette(); cmd.action(); }
    });
    el.addEventListener('mouseenter', () => {
      list.querySelector('.cmd-item--active')?.classList.remove('cmd-item--active');
      el.classList.add('cmd-item--active');
    });
  });

  // Highlight first item by default
  list.querySelector('.cmd-item')?.classList.add('cmd-item--active');
}

function _move(dir) {
  const items  = [...document.querySelectorAll('#cmd-list .cmd-item')];
  const active = document.querySelector('#cmd-list .cmd-item--active');
  let idx = active ? items.indexOf(active) + dir : (dir > 0 ? 0 : items.length - 1);
  idx = ((idx % items.length) + items.length) % items.length;
  active?.classList.remove('cmd-item--active');
  items[idx]?.classList.add('cmd-item--active');
  items[idx]?.scrollIntoView({ block: 'nearest' });
}

function _runSelected() {
  document.querySelector('#cmd-list .cmd-item--active')?.click();
}

function _matchShortcut(key) {
  const cmd = _commands.find((c) => c.shortcut?.toUpperCase() === key);
  if (cmd) cmd.action();
}
