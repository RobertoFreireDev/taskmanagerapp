/*
 * Task form (#/tasks/new, #/tasks/:id). Edits a draft; nothing is stored
 * until Save. Editing the recurrence never touches past progress.
 */

import { getTask, createTask, updateTask, deleteTask, newId, NAME_MAX, MAX_DAY_IN_MONTH } from '../store.js';
import { RECURRENCE_TYPES, nextOccurrences } from '../schedule.js';
import {
  WEEK_STARTS_ON, WEEKDAY_SHORT, WEEKDAY_LONG, MONTH_LONG, MONTH_SHORT,
  todayKey, isValidKey, parseKey, weekday, daysBetween, formatWithWeekday,
} from '../dates.js';
import { h, icon, uid, openSheet, confirmDialog, toast, listEditor } from '../ui.js';
import { DEFAULT_ICON, renderIcon, iconLabel, iconPicker } from '../icons.js';

const TYPE_LABELS = { once: 'Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const UNITS = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'], yearly: ['year', 'years'] };
const INTERVAL_MAX = 999;
const ORDERED_WEEKDAYS = Array.from({ length: 7 }, (_, i) => (WEEK_STARTS_ON + i) % 7);

export function mount({ header, main, params, ctx }) {
  const isNew = params.id == null;
  const existing = isNew ? null : getTask(params.id);
  if (!isNew && (!existing || existing.kind !== 'regular')) return renderNotFound(header, main);

  let today = todayKey();
  const source = existing ?? {
    icon: DEFAULT_ICON,
    name: '',
    active: true,
    notes: [],
    checklist: [],
    recurrence: { type: 'daily', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: today },
  };
  const draft = {
    icon: source.icon,
    active: source.active,
    notes: source.notes.map((text) => ({ id: newId(), text })),
    checklist: source.checklist.map((item) => ({ ...item })),
    rec: {
      ...source.recurrence,
      weekdays: [...source.recurrence.weekdays],
      monthDays: [...source.recurrence.monthDays],
      yearDays: source.recurrence.yearDays.map((e) => ({ ...e })),
    },
    intervalText: String(source.recurrence.interval),
  };
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  // --- Header -------------------------------------------------------------
  header.replaceChildren(
    h('a', { href: '#/tasks', class: 'icon-btn header-back', 'aria-label': 'Back to tasks' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, isNew ? 'New task' : 'Edit task')),
    h('button', { type: 'button', class: 'btn btn-primary header-action', onclick: save }, 'Save'),
  );

  // --- Icon + name ----------------------------------------------------------
  const nameId = uid('name');
  const nameError = fieldError();
  const nameInput = h('input', {
    id: nameId, class: 'input', type: 'text', maxlength: NAME_MAX, autocomplete: 'off', enterkeyhint: 'done',
    value: existing?.name ?? '', placeholder: 'e.g. Walk the dog', 'aria-describedby': nameError.id,
  });
  nameInput.addEventListener('input', () => {
    if (nameInput.value.trim()) clearError(nameInput, nameError);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.blur();
    }
  });

  const iconBtn = h('button', { type: 'button', class: 'icon-field', onclick: openIconSheet });
  function renderIconButton() {
    iconBtn.innerHTML = renderIcon(draft.icon);
    iconBtn.setAttribute('aria-label', `Icon: ${iconLabel(draft.icon)}. Change icon`);
  }
  renderIconButton();

  function openIconSheet() {
    let sheet;
    const grid = iconPicker({
      selected: draft.icon,
      onPick(key) {
        if (key !== draft.icon) markDirty();
        draft.icon = key;
        renderIconButton();
        sheet.close();
      },
    });
    sheet = openSheet({ title: 'Choose an icon', body: grid, initialFocus: grid.querySelector('[aria-selected="true"]') });
  }

  // --- Active ---------------------------------------------------------------
  const activeInput = h('input', {
    type: 'checkbox', role: 'switch', checked: draft.active, 'aria-label': 'Active',
    onchange: (e) => {
      draft.active = e.target.checked;
      markDirty();
    },
  });

  // --- Recurrence -------------------------------------------------------------
  const typeName = uid('type');
  const typeGroup = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Repeat' },
    RECURRENCE_TYPES.map((type) => {
      const id = uid('type');
      return [
        h('input', {
          type: 'radio', id, name: typeName, value: type, checked: draft.rec.type === type,
          onchange: () => {
            draft.rec.type = type;
            markDirty();
            renderDetails();
            renderPreview();
          },
        }),
        h('label', { for: id }, TYPE_LABELS[type]),
      ];
    }),
  );

  const details = h('div', { class: 'recurrence-details' });
  const hint = h('div', { class: 'hint', hidden: true });
  let intervalInput = null;
  let intervalError = null;

  function renderDetails() {
    const { type } = draft.rec;
    intervalInput = intervalError = null;
    const parts = [];
    if (type !== 'once') parts.push(intervalField());
    if (type === 'weekly') parts.push(weekdayField());
    if (type === 'monthly') parts.push(monthDayField());
    if (type === 'yearly') parts.push(yearDayField());
    details.replaceChildren(...parts, hint);
    renderHint();
  }

  function intervalValue() {
    const text = draft.intervalText.trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= 1 && n <= INTERVAL_MAX ? n : null;
  }

  function intervalField() {
    const id = uid('interval');
    intervalError = fieldError();
    intervalInput = h('input', {
      id, class: 'input stepper-input', type: 'number', inputmode: 'numeric', pattern: '[0-9]*', min: '1', max: String(INTERVAL_MAX), step: '1',
      value: draft.intervalText, 'aria-describedby': intervalError.id,
    });
    const unit = h('span', { class: 'stepper-unit' });
    const updateUnit = () => {
      const [one, many] = UNITS[draft.rec.type];
      unit.textContent = intervalValue() === 1 ? one : many;
    };
    const setText = (text) => {
      draft.intervalText = text;
      markDirty();
      updateUnit();
      if (intervalValue() !== null) clearError(intervalInput, intervalError);
      renderPreview();
    };
    intervalInput.addEventListener('input', () => setText(intervalInput.value));
    const stepBy = (delta) => {
      const n = Math.min(INTERVAL_MAX, Math.max(1, (intervalValue() ?? 1) + delta));
      intervalInput.value = String(n);
      setText(String(n));
    };
    updateUnit();
    return h(
      'div',
      { class: 'field' },
      h('label', { class: 'label', for: id }, 'Repeats every'),
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn stepper-btn', 'aria-label': 'Decrease', onclick: () => stepBy(-1) }, icon('minus')),
        intervalInput,
        h('button', { type: 'button', class: 'icon-btn stepper-btn', 'aria-label': 'Increase', onclick: () => stepBy(1) }, icon('plus')),
        unit,
      ),
      intervalError,
    );
  }

  function toggleIn(list, value, on) {
    const i = list.indexOf(value);
    if (on && i < 0) list.push(value);
    if (!on && i >= 0) list.splice(i, 1);
    list.sort((a, b) => a - b);
  }

  function weekdayField() {
    return h(
      'fieldset',
      { class: 'field' },
      h('legend', { class: 'label' }, 'On'),
      h('div', { class: 'chip-grid' }, ORDERED_WEEKDAYS.map((d) => chip(d, [h('span', { 'aria-hidden': 'true' }, WEEKDAY_SHORT[d]), h('span', { class: 'visually-hidden' }, WEEKDAY_LONG[d])], draft.rec.weekdays))),
    );
  }

  function monthDayField() {
    return h(
      'fieldset',
      { class: 'field' },
      h('legend', { class: 'label' }, 'On days'),
      h('div', { class: 'chip-grid day-grid' }, Array.from({ length: 31 }, (_, i) => chip(i + 1, String(i + 1), draft.rec.monthDays))),
    );
  }

  function chip(value, content, list) {
    const id = uid('chip');
    return h(
      'span',
      { class: 'chip' },
      h('input', {
        type: 'checkbox', id, checked: list.includes(value),
        onchange: (e) => {
          toggleIn(list, value, e.target.checked);
          markDirty();
          renderHint();
          renderPreview();
        },
      }),
      h('label', { for: id }, content),
    );
  }

  function yearDayField() {
    const list = h('ul', { class: 'year-days' });
    const addBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-add' }, icon('plus'), 'Add date');

    const renderRows = (focusIndex) => {
      list.replaceChildren(...draft.rec.yearDays.map(yearRow));
      if (focusIndex != null) list.children[focusIndex]?.querySelector('select')?.focus();
    };
    const changed = () => {
      markDirty();
      renderHint();
      renderPreview();
    };

    function yearRow(entry, i) {
      const n = i + 1;
      const daySelect = h('select', { class: 'input select', 'aria-label': `Day of date ${n}` });
      const fillDays = () => {
        const max = MAX_DAY_IN_MONTH[entry.month - 1];
        if (entry.day > max) entry.day = max;
        daySelect.replaceChildren(...Array.from({ length: max }, (_, d) => h('option', { value: String(d + 1) }, String(d + 1))));
        daySelect.value = String(entry.day);
      };
      const monthSelect = h(
        'select',
        {
          class: 'input select', 'aria-label': `Month of date ${n}`, value: String(entry.month),
          onchange: (e) => {
            entry.month = Number(e.target.value);
            fillDays();
            changed();
          },
        },
        MONTH_LONG.map((name, m) => h('option', { value: String(m + 1) }, name)),
      );
      daySelect.addEventListener('change', () => {
        entry.day = Number(daySelect.value);
        changed();
      });
      fillDays();
      const remove = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Remove date ${n}`,
        onclick: () => {
          draft.rec.yearDays.splice(i, 1);
          renderRows(draft.rec.yearDays.length ? Math.min(i, draft.rec.yearDays.length - 1) : null);
          if (!draft.rec.yearDays.length) addBtn.focus();
          changed();
        },
      }, icon('close'));
      return h('li', { class: 'year-day-row' }, monthSelect, daySelect, remove);
    }

    addBtn.addEventListener('click', () => {
      const base = isValidKey(draft.rec.startDate) ? parseKey(draft.rec.startDate) : parseKey(today);
      draft.rec.yearDays.push({ month: base.month, day: base.day });
      renderRows(draft.rec.yearDays.length - 1);
      changed();
    });

    renderRows();
    return h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'On dates'), list, addBtn);
  }

  /** Explains what an empty day selection means, and month-end rules. */
  function renderHint() {
    const { type, startDate, weekdays, monthDays, yearDays } = draft.rec;
    const lines = [];
    const start = isValidKey(startDate) ? parseKey(startDate) : null;
    if (type === 'weekly' && !weekdays.length) {
      lines.push(start ? `No day picked: repeats on ${WEEKDAY_LONG[weekday(startDate)]}, the start date’s weekday.` : 'No day picked: repeats on the start date’s weekday.');
    }
    if (type === 'monthly') {
      if (!monthDays.length) lines.push(start ? `No day picked: repeats on day ${start.day}, from the start date.` : 'No day picked: repeats on the start date’s day.');
      if ((monthDays.length ? Math.max(...monthDays) : start?.day ?? 0) > 28) lines.push('In shorter months, days past the end fall on the last day.');
    }
    if (type === 'yearly') {
      if (!yearDays.length) lines.push(start ? `No date added: repeats every ${MONTH_SHORT[start.month - 1]} ${start.day}, from the start date.` : 'No date added: repeats on the start date.');
      const hasLeapDay = yearDays.length ? yearDays.some((e) => e.month === 2 && e.day === 29) : start?.month === 2 && start?.day === 29;
      if (hasLeapDay) lines.push('Feb 29 falls on Feb 28 in non-leap years.');
    }
    hint.replaceChildren(...lines.map((line) => h('p', {}, line)));
    hint.hidden = !lines.length;
  }

  // --- Start date -------------------------------------------------------------
  const startId = uid('start');
  const startError = fieldError();
  const startInput = h('input', {
    id: startId, class: 'input', type: 'date', required: true, value: draft.rec.startDate, 'aria-describedby': startError.id,
  });
  const onStartChange = () => {
    if (startInput.value === draft.rec.startDate) return;
    draft.rec.startDate = startInput.value;
    markDirty();
    if (isValidKey(startInput.value)) clearError(startInput, startError);
    renderHint();
    renderPreview();
  };
  startInput.addEventListener('input', onStartChange);
  startInput.addEventListener('change', onStartChange);

  // --- Preview ------------------------------------------------------------------
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });

  function renderPreview() {
    const rec = draft.rec;
    const interval = rec.type === 'once' ? 1 : intervalValue();
    let content;
    if (!isValidKey(rec.startDate)) content = h('p', { class: 'muted' }, 'Pick a start date to see upcoming dates.');
    else if (interval === null) content = h('p', { class: 'muted' }, `Enter a number from 1 to ${INTERVAL_MAX}.`);
    else {
      const dates = nextOccurrences({ recurrence: { ...rec, interval } }, today, 5);
      content = dates.length
        ? h('ol', { class: 'preview-list' }, dates.map((d) => h('li', {}, h('span', {}, formatWithWeekday(d)), relative(d))))
        : h('p', { class: 'muted' }, 'This date has passed. Until it is completed, the task shows as pending on Home.');
    }
    preview.replaceChildren(content);
  }

  function relative(date) {
    const n = daysBetween(today, date);
    const text = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`;
    return h('span', { class: `preview-rel ${n === 0 ? 'is-today' : ''}` }, text);
  }

  // --- Layout ---------------------------------------------------------------------
  const form = h(
    'form',
    { class: 'form task-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'label', for: nameId }, 'Name'),
      h('div', { class: 'name-row' }, iconBtn, nameInput),
      nameError,
    ),
    h(
      'div',
      { class: 'field switch-field' },
      h('div', {}, h('span', { class: 'switch-title' }, 'Active'), h('p', { class: 'muted' }, 'Inactive tasks never show on Home.')),
      h('label', { class: 'switch' }, activeInput, h('span', { class: 'switch-track', 'aria-hidden': 'true' })),
    ),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Notes'),
      listEditor({ items: draft.notes, label: 'Note', placeholder: 'Write a note', addLabel: 'Add note', reorder: true, multiline: true, onChange: markDirty })),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Checklist'),
      listEditor({ items: draft.checklist, label: 'Item', placeholder: 'Checklist item', addLabel: 'Add item', reorder: true, onChange: markDirty })),
    h('div', { class: 'form-section' }, h('h2', { class: 'form-section-title' }, 'Schedule')),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Repeat'), typeGroup),
    details,
    h('div', { class: 'field' }, h('label', { class: 'label', for: startId }, 'Starts on'), startInput, startError),
    h('div', { class: 'field' }, h('h3', { class: 'label' }, 'Next 5 occurrences'), preview),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: save }, isNew ? 'Create task' : 'Save changes'),
      isNew ? null : h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: remove }, icon('trash'), 'Delete task')),
  );
  // Typing or toggling anything marks the draft dirty; button-driven edits call markDirty themselves.
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  main.replaceChildren(form);
  renderDetails();
  renderPreview();
  if (isNew) nameInput.focus({ preventScroll: true });

  // --- Actions --------------------------------------------------------------------
  function save() {
    const name = nameInput.value.trim();
    const interval = draft.rec.type === 'once' ? 1 : intervalValue();
    const invalid = [];
    if (!name) invalid.push(showError(nameInput, nameError, 'Name is required.'));
    if (interval === null && intervalInput) invalid.push(showError(intervalInput, intervalError, `Enter a whole number from 1 to ${INTERVAL_MAX}.`));
    if (!isValidKey(draft.rec.startDate)) invalid.push(showError(startInput, startError, 'Start date is required.'));
    if (invalid.length) {
      invalid[0].focus();
      invalid[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const { type, weekdays, monthDays, yearDays, startDate } = draft.rec;
    const fields = {
      icon: draft.icon,
      name,
      active: draft.active,
      notes: draft.notes.map((n) => n.text),
      checklist: draft.checklist.map(({ id, text }) => ({ id, text })),
      recurrence: {
        type,
        interval,
        weekdays: type === 'weekly' ? [...weekdays] : [],
        monthDays: type === 'monthly' ? [...monthDays] : [],
        yearDays: type === 'yearly' ? yearDays.map((e) => ({ ...e })) : [],
        startDate,
      },
    };
    if (isNew) createTask({ ...fields, kind: 'regular' });
    else updateTask(existing.id, fields);
    dirty = false;
    toast(isNew ? 'Task created' : 'Task saved');
    ctx.navigate('#/tasks', { replace: true });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete task?',
      message: `“${existing.name}” and all of its progress will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteTask(existing.id);
    dirty = false;
    toast('Task deleted');
    ctx.navigate('#/tasks', { replace: true });
  }

  return {
    isDirty: () => dirty,
    discard() {
      dirty = false;
    },
    refresh() {
      today = todayKey();
      renderPreview();
    },
  };
}

function fieldError() {
  return h('p', { id: uid('error'), class: 'field-error', hidden: true });
}

function showError(input, el, message) {
  el.textContent = message;
  el.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  return input;
}

function clearError(input, el) {
  el.hidden = true;
  input.removeAttribute('aria-invalid');
}

function renderNotFound(header, main) {
  header.replaceChildren(
    h('a', { href: '#/tasks', class: 'icon-btn header-back', 'aria-label': 'Back to tasks' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, 'Task not found')),
  );
  main.replaceChildren(
    h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'This task no longer exists.'),
      h('a', { class: 'btn', href: '#/tasks' }, 'Back to tasks')),
  );
  return {};
}
