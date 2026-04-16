/**
 * pomodoro.js — Integrated Pomodoro timer with task time tracking.
 *
 * Exports:
 *   initPomodoro(onTimeLog)   — wire floating widget; onTimeLog(taskId, seconds)
 *   startPomodoroFor(task)    — open widget and start a session for a task
 */

const FOCUS_SECS = 25 * 60;
const BREAK_SECS =  5 * 60;

let _timer        = null;
let _remaining    = FOCUS_SECS;
let _running      = false;
let _isBreak      = false;
let _taskId       = null;
let _sessionStart = null;
let _onTimeLog    = null;

function _el(id) { return document.getElementById(id); }

export function initPomodoro(onTimeLog) {
  _onTimeLog = onTimeLog;
  _el('pomo-play')?.addEventListener('click',  () => (_running ? _pause() : _start()));
  _el('pomo-reset')?.addEventListener('click', _reset);
  _el('pomo-close')?.addEventListener('click', () => {
    _pause();
    _el('pomo-widget').hidden = true;
  });
  _render();
}

export function startPomodoroFor(task) {
  _taskId = task.id;
  const nameEl = _el('pomo-task-name');
  if (nameEl) nameEl.textContent = task.title;
  const widget = _el('pomo-widget');
  if (widget) widget.hidden = false;
  _reset();
  _start();
}

function _start() {
  if (_running) return;
  _running      = true;
  _sessionStart = Date.now();
  const btn = _el('pomo-play');
  if (btn) { btn.innerHTML = '<i class="bi bi-pause-fill"></i>'; btn.title = 'Pausar'; }
  _timer = setInterval(_tick, 1000);
}

function _pause() {
  if (!_running) return;
  _running = false;
  _logTime();
  _sessionStart = null;
  clearInterval(_timer);
  const btn = _el('pomo-play');
  if (btn) { btn.innerHTML = '<i class="bi bi-play-fill"></i>'; btn.title = 'Iniciar'; }
}

function _reset() {
  _pause();
  _isBreak   = false;
  _remaining = FOCUS_SECS;
  const lbl = _el('pomo-label');
  if (lbl) lbl.textContent = 'Foco';
  _render();
}

function _tick() {
  _remaining--;
  _render();
  if (_remaining <= 0) {
    _logTime();
    _isBreak   = !_isBreak;
    _remaining = _isBreak ? BREAK_SECS : FOCUS_SECS;
    const lbl = _el('pomo-label');
    if (lbl) lbl.textContent = _isBreak ? 'Pausa' : 'Foco';
    _sessionStart = Date.now();
    _playChime();
  }
}

function _logTime() {
  if (!_taskId || !_sessionStart || _isBreak) return;
  const seconds = Math.round((Date.now() - _sessionStart) / 1000);
  if (seconds > 5 && _onTimeLog) _onTimeLog(_taskId, seconds);
  _sessionStart = null;
}

function _render() {
  const m = String(Math.floor(_remaining / 60)).padStart(2, '0');
  const s = String(_remaining % 60).padStart(2, '0');
  const timeEl = _el('pomo-time');
  if (timeEl) timeEl.textContent = `${m}:${s}`;

  const total = _isBreak ? BREAK_SECS : FOCUS_SECS;
  const pct   = 1 - _remaining / total;
  const circ  = 2 * Math.PI * 36; // r=36
  const ring  = _el('pomo-ring');
  if (ring) {
    ring.style.strokeDasharray  = circ;
    ring.style.strokeDashoffset = circ * (1 - pct);
  }
}

function _playChime() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  } catch { /* AudioContext not supported */ }
}
