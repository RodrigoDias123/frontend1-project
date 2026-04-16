/**
 * markdown.js — Markdown rendering with syntax highlighting.
 * Depends on window.marked (CDN) and window.hljs (CDN, optional).
 */

/**
 * Render markdown text to HTML with optional syntax highlighting.
 * @param {string} text
 * @returns {string} HTML string
 */
export function renderMarkdown(text) {
  if (!text) return '';

  if (!window.marked) {
    return _escHtml(text).replace(/\n/g, '<br>');
  }

  const html = marked.parse(String(text), { breaks: true, gfm: true });

  // Post-process: apply syntax highlighting via hljs.highlightElement
  if (window.hljs) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
    return temp.innerHTML;
  }

  return html;
}

/**
 * Strip markdown syntax and return plain text (used for card previews).
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
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

function _escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
