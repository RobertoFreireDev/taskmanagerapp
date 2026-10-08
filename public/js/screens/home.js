/*
 * Home (#/home): today's TO DO, Pending and Done sections, plus quick tasks.
 */

import {
  getState, subscribe, createTask, deleteTask, completeOccurrence, undoOccurrence, setChecklistItem, NAME_MAX,
} from '../store.js';
import { homeSections, checklistProgress } from '../schedule.js';
import { todayKey, formatLong, formatShort } from '../dates.js';
import { h, icon, uid, openSheet, confirmDialog, toast, listEditor, preserveFocus } from '../ui.js';
import { renderIcon } from '../icons.js';

const SECTIONS = [
  { key: 'todo', title: 'To do', empty: 'Nothing due today.' },
  { key: 'pending', title: 'Pending', empty: 'Nothing pending.' },
  { key: 'done', title: 'Done', empty: 'Nothing completed yet today.' },
];

// UI state that survives re-renders and navigation within a session.
const expanded = new Set();
const collapsed = new Set();

export function mount({ header, main }) {
  let today = todayKey();

  function renderHeader() {
    header.replaceChildren(
      h('div', { class: 'header-titles' }, h('h1', {}, 'Today'), h('p', { class: 'header-sub' }, formatLong(today, today))),
      h('button', { type: 'button', class: 'btn btn-tint header-action', onclick: openQuickTaskSheet }, icon('plus'), 'Quick task'),
    );
  }

  function render() {
    const state = getState();
    const sections = homeSections(state, today);
    preserveFocus(main, () => {
      main.replaceChildren(...SECTIONS.map((def) => renderSection(def, sections[def.key], state)));
    });
  }

  function renderSection(def, items, state) {
    const bodyId = `section-${def.key}`;
    const isCollapsed = collapsed.has(def.key);
    const toggle = h(
      'button',
      { type: 'button', class: 'section-toggle', 'aria-expanded': String(!isCollapsed), 'aria-controls': bodyId, dataset: { focusKey: bodyId } },
      h('span', { class: 'section-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'section-title' }, def.title),
      h('span', { class: 'section-count' }, String(items.length)),
      icon('chevronDown', 'icon chevron'),
    );
    const body = h(
      'div',
      { class: 'section-body', id: bodyId, hidden: isCollapsed },
      items.length
        ? h('ul', { class: 'card-list' }, items.map((item) => h('li', {}, renderCard(item, def.key, state))))
        : h('p', { class: 'empty-line' }, def.empty),
    );
    toggle.addEventListener('click', () => {
      const nowCollapsed = !collapsed.has(def.key);
      if (nowCollapsed) collapsed.add(def.key);
      else collapsed.delete(def.key);
      toggle.setAttribute('aria-expanded', String(!nowCollapsed));
      body.hidden = nowCollapsed;
    });
    return h('section', { class: `home-section is-${def.key}` }, h('h2', { class: 'section-heading' }, toggle), body);
  }

  function renderCard({ task, date }, section, state) {
    const occurrence = state.progress[task.id]?.[date];
    const progress = checklistProgress(task, occurrence);
    const isOpen = expanded.has(task.id);
    const bodyId = uid('card');
    const focusKey = `card-${task.id}`;

    const meta = [];
    if (section === 'pending') meta.push(h('span', { class: 'meta-since' }, `since ${formatShort(date, today)}`));
    if (task.kind === 'quick') meta.push(h('span', { class: 'badge' }, 'Quick'));
    if (progress.total) {
      meta.push(
        h('span', { class: 'meta-progress' }, icon('check', 'icon icon-xs'),
          h('span', { 'aria-hidden': 'true' }, `${progress.done}/${progress.total}`),
          h('span', { class: 'visually-hidden' }, `${progress.done} of ${progress.total} checklist items done`)),
      );
    }

    const head = h(
      'button',
      { type: 'button', class: 'card-head', 'aria-expanded': String(isOpen), 'aria-controls': bodyId, dataset: { focusKey } },
      h('span', { class: 'card-icon', html: renderIcon(task.icon) }),
      h('span', { class: 'card-text' }, h('span', { class: 'card-name' }, task.name), meta.length ? h('span', { class: 'card-meta' }, meta) : null),
      icon('chevronDown', 'icon chevron'),
    );

    const body = h(
      'div',
      { class: 'card-body', id: bodyId, hidden: !isOpen },
      task.notes.length ? h('div', { class: 'card-notes' }, task.notes.map((note) => h('p', {}, note))) : null,
      progress.total ? h('ul', { class: 'checklist' }, task.checklist.map((item) => checklistRow(task, date, item, occurrence))) : null,
      !task.notes.length && !progress.total ? h('p', { class: 'muted' }, 'No notes or checklist.') : null,
      h('div', { class: 'card-actions' }, actions(task, date, section, focusKey)),
    );

    head.addEventListener('click', () => {
      const open = !expanded.has(task.id);
      if (open) expanded.add(task.id);
      else expanded.delete(task.id);
      head.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    });

    return h('article', { class: 'card' }, head, body);
  }

  function checklistRow(task, date, item, occurrence) {
    // The whole row is the label, so the touch target spans the card width.
    return h(
      'li',
      {},
      h(
        'label',
        { class: 'check-row' },
        h('input', {
          type: 'checkbox',
          class: 'checkbox',
          checked: occurrence?.checklist?.[item.id] === true,
          dataset: { focusKey: `check-${task.id}-${item.id}` },
          onchange: (e) => setChecklistItem(task.id, date, item.id, e.target.checked),
        }),
        h('span', { class: 'check-text' }, item.text),
      ),
    );
  }

  function actions(task, date, section, focusKey) {
    if (task.kind === 'quick') {
      return h('button', { type: 'button', class: 'btn btn-danger', dataset: { focusKey }, onclick: () => removeQuickTask(task) }, icon('trash'), 'Delete');
    }
    const edit = h('a', { class: 'btn btn-ghost', href: `#/tasks/${encodeURIComponent(task.id)}` }, icon('edit'), 'Edit');
    if (section === 'done') {
      return [edit, h('button', { type: 'button', class: 'btn', dataset: { focusKey }, onclick: () => undoOccurrence(task.id, date) }, icon('undo'), 'Undo')];
    }
    return [
      edit,
      h('button', {
        type: 'button',
        class: 'btn btn-success',
        dataset: { focusKey },
        onclick: () => {
          completeOccurrence(task.id, date);
          toast(`“${task.name}” done`, { actionLabel: 'Undo', onAction: () => undoOccurrence(task.id, date) });
        },
      }, icon('check'), 'Complete'),
    ];
  }

  async function removeQuickTask(task) {
    const ok = await confirmDialog({
      title: 'Delete quick task?',
      message: `“${task.name}” and its checklist progress will be removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    expanded.delete(task.id);
    deleteTask(task.id);
    toast('Quick task deleted');
  }

  renderHeader();
  render();
  const unsubscribe = subscribe(render);

  return {
    unmount: unsubscribe,
    refresh() {
      today = todayKey();
      renderHeader();
      render();
    },
  };
}

function openQuickTaskSheet() {
  const notes = [];
  const checklist = [];
  const formId = uid('quick-form');
  const nameId = uid('quick-name');
  const errorId = uid('quick-name-error');

  const nameInput = h('input', {
    id: nameId, class: 'input', type: 'text', maxlength: NAME_MAX, autocomplete: 'off', enterkeyhint: 'done', 'aria-describedby': errorId,
  });
  const nameError = h('p', { id: errorId, class: 'field-error', hidden: true }, 'Name is required.');
  nameInput.addEventListener('input', () => {
    if (!nameInput.value.trim()) return;
    nameError.hidden = true;
    nameInput.removeAttribute('aria-invalid');
  });

  const form = h(
    'form',
    { id: formId, class: 'form', novalidate: true },
    h('div', { class: 'field' }, h('label', { class: 'label', for: nameId }, 'Name'), nameInput, nameError),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Notes'),
      listEditor({ items: notes, label: 'Note', placeholder: 'Write a note', addLabel: 'Add note', multiline: true })),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Checklist'),
      listEditor({ items: checklist, label: 'Item', placeholder: 'Checklist item', addLabel: 'Add item' })),
  );
  const saveBtn = h('button', { type: 'submit', form: formId, class: 'btn btn-primary btn-block' }, 'Add quick task');

  const sheet = openSheet({ title: 'Quick task', body: form, footer: saveBtn, initialFocus: nameInput });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameError.hidden = false;
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      return;
    }
    createTask({
      kind: 'quick',
      active: true,
      icon: 'task',
      name,
      notes: notes.map((n) => n.text),
      checklist: checklist.map(({ id, text }) => ({ id, text })),
      recurrence: { type: 'once', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: todayKey() },
    });
    sheet.close();
    toast('Quick task added');
  });
}
