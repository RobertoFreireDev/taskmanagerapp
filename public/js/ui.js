/*
 * Small DOM helpers: element builder, bottom sheets, confirm dialog, toasts,
 * and the editable list used for notes and checklists.
 */

import { uiIcon } from './icons.js';
import { newId, TEXT_MAX } from './store.js';

/**
 * Element builder. Props: `class`, `dataset`, `html` (trusted markup only:
 * our own SVG icons), `on<event>` handlers, `value`/`checked` as properties,
 * booleans as present/absent attributes, anything else as an attribute.
 * Children may be nodes, strings, arrays, or null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (key === 'class') el.className = v;
    else if (key === 'dataset') Object.assign(el.dataset, v);
    else if (key === 'html') el.innerHTML = v;
    else if (key === 'value') value = v;
    else if (key === 'checked') el.checked = Boolean(v);
    else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
    else el.setAttribute(key, v === true ? '' : v);
  }
  el.append(...flatten(children));
  if (value !== undefined) el.value = value; // after children so <select> options exist
  return el;
}

function flatten(children) {
  const out = [];
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) out.push(...flatten(c));
    else out.push(c instanceof Node ? c : String(c));
  }
  return out;
}

/** A UI glyph as an element. */
export function icon(name, className = 'icon') {
  return h('span', { class: className, 'aria-hidden': 'true', html: uiIcon(name) });
}

let uidCounter = 0;
export const uid = (prefix = 'id') => `${prefix}-${++uidCounter}`;

/**
 * Re-renders while keeping keyboard focus on the element with the same
 * data-focus-key, so re-rendering lists doesn't throw focus away.
 */
export function preserveFocus(container, render) {
  const active = document.activeElement;
  const key = container.contains(active) ? active.closest('[data-focus-key]')?.dataset.focusKey : null;
  render();
  if (key) {
    const target = [...container.querySelectorAll('[data-focus-key]')].find((el) => el.dataset.focusKey === key);
    target?.focus({ preventScroll: true });
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Overlays (sheets and dialogs). While any is open, the app behind is inert.

const overlays = [];

function syncInert() {
  const app = document.getElementById('app');
  if (app) app.inert = overlays.length > 0;
}

function focusables(root) {
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
  );
}

function openOverlay({ panel, onDismiss, initialFocus }) {
  const previousFocus = document.activeElement;
  const backdrop = h('div', { class: 'backdrop' });
  const layer = h('div', { class: 'overlay' }, backdrop, panel);
  let closed = false;

  const entry = {
    close() {
      if (closed) return;
      closed = true;
      overlays.splice(overlays.indexOf(entry), 1);
      syncInert();
      layer.classList.remove('open');
      setTimeout(() => layer.remove(), reducedMotion() ? 0 : 260);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };

  backdrop.addEventListener('click', () => onDismiss());
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDismiss();
    } else if (e.key === 'Tab') {
      const items = focusables(panel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.getElementById('overlay-root').append(layer);
  overlays.push(entry);
  syncInert();
  void layer.offsetHeight; // commit the closed state so the open transition runs
  layer.classList.add('open');
  (initialFocus ?? panel).focus({ preventScroll: true });
  return entry;
}

/** Closes every sheet and dialog (used on navigation). Dialogs resolve as cancelled. */
export function closeAllOverlays() {
  for (const entry of [...overlays].reverse()) entry.dismiss ? entry.dismiss() : entry.close();
}

/**
 * Bottom sheet. Closes on backdrop tap, the Close button, or Escape.
 * Returns { close, panel }.
 */
export function openSheet({ title, body, footer, onClose, initialFocus, className = '' }) {
  const titleId = uid('sheet-title');
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('close'));
  const panel = h(
    'div',
    { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-header' }, h('h2', { id: titleId }, title), closeBtn),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-footer' }, footer) : null,
  );
  let entry;
  const close = () => {
    if (!entry) return;
    entry.close();
    entry = null;
    onClose?.();
  };
  closeBtn.addEventListener('click', close);
  entry = openOverlay({ panel, onDismiss: close, initialFocus });
  entry.dismiss = close;
  return { close, panel };
}

/**
 * Modal confirmation. Resolves true on confirm, false on cancel/dismiss.
 * `message` may be a string, a node, or an array of either (one paragraph each).
 */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const titleId = uid('dialog-title');
    const bodyId = uid('dialog-body');
    const paragraphs = (Array.isArray(message) ? message : [message]).filter(Boolean);
    const cancelBtn = h('button', { type: 'button', class: 'btn' }, cancelLabel);
    const confirmBtn = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}` }, confirmLabel);
    const panel = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': bodyId, tabindex: '-1' },
      h('h2', { id: titleId }, title),
      h('div', { id: bodyId, class: 'dialog-body' }, paragraphs.map((p) => (p instanceof Node ? p : h('p', {}, p)))),
      h('div', { class: 'dialog-actions' }, cancelBtn, confirmBtn),
    );
    let entry;
    const finish = (result) => {
      if (!entry) return;
      entry.close();
      entry = null;
      resolve(result);
    };
    cancelBtn.addEventListener('click', () => finish(false));
    confirmBtn.addEventListener('click', () => finish(true));
    entry = openOverlay({ panel, onDismiss: () => finish(false), initialFocus: danger ? cancelBtn : confirmBtn });
    entry.dismiss = () => finish(false);
  });
}

// ---------------------------------------------------------------------------
// Toasts. Short-lived toasts replace each other; persistent ones (duration 0)
// stay until acted on or dismissed.

export function toast(message, { actionLabel, onAction, duration = 3500, variant = '' } = {}) {
  const root = document.getElementById('toast-root');
  const persistent = !duration;
  if (!persistent) root.querySelectorAll('.toast:not([data-persistent])').forEach((el) => el.remove());

  let timer;
  const el = h(
    'div',
    { class: `toast ${variant ? `toast-${variant}` : ''}`, dataset: persistent ? { persistent: '' } : undefined },
    h('span', { class: 'toast-msg' }, message),
    actionLabel
      ? h('button', { type: 'button', class: 'toast-action', onclick: () => { dismiss(); onAction?.(); } }, actionLabel)
      : null,
    persistent
      ? h('button', { type: 'button', class: 'icon-btn toast-close', 'aria-label': 'Dismiss', onclick: () => dismiss() }, icon('close'))
      : null,
  );
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 200);
  }
  root.append(el);
  void el.offsetHeight;
  el.classList.add('show');
  if (!persistent) timer = setTimeout(dismiss, duration);
  return { dismiss };
}

// ---------------------------------------------------------------------------
// Editable list of { id, text } rows (notes and checklist items). Mutates
// `items` in place and calls onChange after every edit.

export function listEditor({ items, label, placeholder = '', addLabel, reorder = false, multiline = false, onChange }) {
  const rows = h('ol', { class: 'list-editor-rows' });
  const addBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-add' }, icon('plus'), addLabel);
  const root = h('div', { class: 'list-editor' }, rows, addBtn);
  const changed = () => onChange?.();

  function render(focusIndex, focusSelector = '.list-editor-input') {
    rows.replaceChildren(...items.map(row));
    rows.querySelectorAll('textarea').forEach((ta) => requestAnimationFrame(() => autoGrow(ta)));
    if (focusIndex != null) {
      const li = rows.children[focusIndex];
      const target = li?.querySelector(`${focusSelector}:not([disabled])`) ?? li?.querySelector('.list-editor-input');
      (target ?? addBtn).focus();
    }
  }

  function row(item, i) {
    const n = i + 1;
    const input = multiline
      ? h('textarea', { class: 'input list-editor-input', rows: '1', maxlength: TEXT_MAX, placeholder, 'aria-label': `${label} ${n}` })
      : h('input', {
          class: 'input list-editor-input', type: 'text', maxlength: TEXT_MAX, placeholder, enterkeyhint: 'next', 'aria-label': `${label} ${n}`,
        });
    input.value = item.text;
    input.addEventListener('input', () => {
      item.text = input.value;
      if (multiline) autoGrow(input);
      changed();
    });
    if (!multiline) {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        items.splice(i + 1, 0, { id: newId(), text: '' });
        render(i + 1);
        changed();
      });
    }
    const controls = [];
    if (reorder) {
      controls.push(
        h('button', {
          type: 'button', class: 'icon-btn move-up', 'aria-label': `Move ${label.toLowerCase()} ${n} up`, disabled: i === 0, onclick: () => move(i, -1),
        }, icon('chevronUp')),
        h('button', {
          type: 'button', class: 'icon-btn move-down', 'aria-label': `Move ${label.toLowerCase()} ${n} down`, disabled: i === items.length - 1, onclick: () => move(i, 1),
        }, icon('chevronDown')),
      );
    }
    controls.push(
      h('button', { type: 'button', class: 'icon-btn remove', 'aria-label': `Remove ${label.toLowerCase()} ${n}`, onclick: () => remove(i) }, icon('close')),
    );
    return h('li', { class: `list-editor-row ${reorder ? 'has-reorder' : ''}` }, input, ...controls);
  }

  function move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    render(j, delta < 0 ? '.move-up' : '.move-down');
    changed();
  }

  function remove(i) {
    items.splice(i, 1);
    render(items.length ? Math.min(i, items.length - 1) : null);
    if (!items.length) addBtn.focus();
    changed();
  }

  addBtn.addEventListener('click', () => {
    items.push({ id: newId(), text: '' });
    render(items.length - 1);
    changed();
  });

  render();
  return root;
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

// ---------------------------------------------------------------------------
// On-screen keyboard: mobile browsers shrink only the visual viewport, so
// expose its size to CSS to keep bottom sheets above the keyboard.

export function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const covered = Math.max(0, root.clientHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb', `${Math.round(covered)}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
