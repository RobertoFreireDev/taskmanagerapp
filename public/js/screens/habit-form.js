/*
 * Habit form (#/habits/:id/tasks/new, #/habits/:id/tasks/:habitId): attach an
 * existing task to a character and choose what completing or missing it does.
 * Tasks themselves are created and edited in Tasks, never here.
 */

import { getState, getCharacter, getTask, saveHabit, deleteHabit } from '../store.js';
import { DEFAULT_HABIT, HABIT_XP_MAX } from '../habits.js';
import { describeRecurrence } from '../schedule.js';
import { todayKey, isValidKey } from '../dates.js';
import { STATUSES, statusesByGroup, statusEmoji, statusLabel } from '../statuses.js';
import {
  h, icon, uid, openSheet, confirmDialog, toast, stepper, fieldError, showError, clearError,
} from '../ui.js';
import { renderIcon } from '../icons.js';
import { byName, renderNotFound } from './habits.js';

export function mount({ header, main, params, ctx }) {
  const character = getCharacter(params.id);
  if (!character) return renderNotFound(header, main);
  const isNew = params.habitId == null;
  const existing = isNew ? null : character.habits.find((x) => x.id === params.habitId) ?? null;
  const backHref = `#/habits/${encodeURIComponent(character.id)}`;
  if (!isNew && !existing) return renderHabitNotFound(header, main, backHref);

  const today = todayKey();
  const source = existing ?? DEFAULT_HABIT;
  const draft = {
    taskId: existing?.taskId ?? null,
    since: existing?.since ?? today,
    done: { ...source.done },
    missed: { ...source.missed },
  };
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  // --- Header -------------------------------------------------------------
  header.replaceChildren(
    h('a', { href: backHref, class: 'icon-btn header-back', 'aria-label': `Back to ${character.name}` }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, isNew ? 'Attach task' : 'Edit habit'), h('p', { class: 'header-sub' }, character.name)),
    h('button', { type: 'button', class: 'btn btn-primary header-action', onclick: save }, 'Save'),
  );

  // --- Task -------------------------------------------------------------------
  const taskError = fieldError();
  const taskBtn = h('button', { type: 'button', class: 'picker-field', 'aria-describedby': taskError.id, onclick: openTaskSheet });

  function renderTaskButton() {
    const task = draft.taskId ? getTask(draft.taskId) : null;
    taskBtn.setAttribute('aria-label', task ? `Task: ${task.name}. Change task` : 'Choose a task');
    taskBtn.replaceChildren(
      task ? h('span', { class: 'card-icon', html: renderIcon(task.icon) }) : h('span', { class: 'card-icon' }, icon('plus')),
      h(
        'span',
        { class: 'task-row-text' },
        h('span', { class: 'task-row-name' }, task ? task.name : 'Choose a task'),
        h('span', { class: 'task-row-sub' }, task ? taskSummary(task, today) : 'Pick one of your tasks'),
      ),
      icon('chevronRight', 'icon chevron-end'),
    );
  }

  /** Regular tasks this character can use: not attached yet, or the one this habit already has. */
  function candidates() {
    const others = new Set((getCharacter(character.id)?.habits ?? []).filter((x) => x.id !== existing?.id).map((x) => x.taskId));
    return getState().tasks.filter((t) => t.kind === 'regular' && !others.has(t.id)).sort(byName);
  }

  function openTaskSheet() {
    let sheet;
    const tasks = candidates();
    const pick = (task) => {
      if (task.id !== draft.taskId) markDirty();
      draft.taskId = task.id;
      clearError(taskBtn, taskError);
      renderTaskButton();
      sheet.close();
    };
    const body = tasks.length
      ? h(
          'ul',
          { class: 'pick-list' },
          tasks.map((task) =>
            h('li', {},
              h('button', { type: 'button', class: 'pick-option', 'aria-pressed': String(task.id === draft.taskId), onclick: () => pick(task) },
                h('span', { class: 'card-icon', html: renderIcon(task.icon) }),
                h('span', { class: 'task-row-text' },
                  h('span', { class: 'task-row-name' }, task.name),
                  h('span', { class: 'task-row-sub' }, taskSummary(task, today)))))),
        )
      : h('div', { class: 'empty-state' },
          h('p', { class: 'empty-title' }, getState().tasks.some((t) => t.kind === 'regular') ? 'Every task is attached' : 'No tasks yet'),
          h('p', { class: 'muted' }, 'Habits use your recurring tasks. Create one in Tasks, then attach it here.'),
          h('a', { class: 'btn', href: '#/tasks/new' }, icon('plus'), 'New task'));
    sheet = openSheet({
      title: 'Choose a task',
      body,
      initialFocus: body.querySelector('[aria-pressed="true"]') ?? body.querySelector('button, a'),
    });
  }

  // --- Counts from --------------------------------------------------------------
  const sinceId = uid('since');
  const sinceError = fieldError();
  const sinceInput = h('input', {
    id: sinceId, class: 'input', type: 'date', required: true, value: draft.since, 'aria-describedby': sinceError.id,
  });
  const onSinceChange = () => {
    if (sinceInput.value === draft.since) return;
    draft.since = sinceInput.value;
    markDirty();
    if (isValidKey(draft.since)) clearError(sinceInput, sinceError);
  };
  sinceInput.addEventListener('input', onSinceChange);
  sinceInput.addEventListener('change', onSinceChange);

  // --- Outcomes -----------------------------------------------------------------
  const done = outcomeFields('done', {
    title: 'When completed', xpLabel: 'XP gained', sheetTitle: 'Status when completed',
    help: 'Shown on the character until the task’s next result.',
  });
  const missed = outcomeFields('missed', {
    title: 'When missed', xpLabel: 'XP lost', sheetTitle: 'Status when missed',
    help: 'Tap Not done on Home to count it at once. A due day that ends without the task completed counts too.',
  });

  function outcomeFields(key, { title, xpLabel, sheetTitle, help }) {
    const xpId = uid('xp');
    const xpError = fieldError();
    const xp = stepper({
      id: xpId, value: draft[key].xp, min: 0, max: HABIT_XP_MAX, unit: 'XP', label: xpLabel.toLowerCase(), describedBy: xpError.id,
      onChange: (n) => {
        markDirty();
        if (n !== null) clearError(xp.input, xpError);
      },
    });

    const statusBtn = h('button', { type: 'button', class: 'picker-field', onclick: openStatusSheet });
    function renderStatus() {
      const status = draft[key].status;
      statusBtn.setAttribute('aria-label', status ? `${sheetTitle}: ${statusLabel(status)}. Change` : `${sheetTitle}: none. Choose`);
      statusBtn.replaceChildren(
        h('span', { class: 'picker-emoji' }, status ? h('span', { class: 'emoji', 'aria-hidden': 'true' }, statusEmoji(status)) : icon('plus')),
        h('span', { class: 'task-row-text' },
          h('span', { class: 'task-row-name' }, status ? statusLabel(status) : 'No status'),
          h('span', { class: 'task-row-sub' }, status ? 'Tap to change' : 'Tap to choose one')),
        icon('chevronRight', 'icon chevron-end'),
      );
    }

    function openStatusSheet() {
      let sheet;
      const choose = (status) => {
        if (status !== draft[key].status) markDirty();
        draft[key].status = status;
        renderStatus();
        sheet.close();
      };
      const groups = statusesByGroup().map((group) =>
        h('section', { class: 'status-group' },
          h('h3', { class: 'status-group-title' }, group.label),
          h('div', { class: 'emotion-grid', role: 'group', 'aria-label': group.label },
            group.statuses.map((s) =>
              h('button', { type: 'button', class: 'emotion-option', 'aria-pressed': String(s === draft[key].status), onclick: () => choose(s) },
                h('span', { class: 'emoji', 'aria-hidden': 'true' }, STATUSES[s].emoji),
                h('span', { class: 'emotion-name' }, STATUSES[s].label))))));
      const none = h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => choose(null) }, 'No status');
      const body = h('div', {}, groups);
      sheet = openSheet({
        title: sheetTitle,
        body,
        footer: none,
        initialFocus: body.querySelector('[aria-pressed="true"]') ?? body.querySelector('button'),
      });
    }

    renderStatus();
    const titleId = uid('outcome');
    const el = h(
      'section',
      { 'aria-labelledby': titleId },
      h('h2', { id: titleId, class: 'form-section-title' }, title),
      h('div', { class: 'field' }, h('label', { class: 'label', for: xpId }, xpLabel), xp.el, xpError),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Status'), statusBtn, h('p', { class: 'field-hint' }, help)),
    );
    return { el, xp, xpError };
  }

  // --- Layout ---------------------------------------------------------------------
  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Task'), taskBtn, taskError),
    h('div', { class: 'field' },
      h('label', { class: 'label', for: sinceId }, 'Counts from'),
      sinceInput,
      sinceError,
      h('p', { class: 'field-hint' }, 'Results before this day don’t count.')),
    done.el,
    missed.el,
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: save }, isNew ? 'Attach task' : 'Save changes'),
      isNew ? null : h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: remove }, icon('trash'), 'Detach task')),
  );
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  renderTaskButton();
  main.replaceChildren(form);

  // --- Actions --------------------------------------------------------------------
  function save() {
    const doneXp = done.xp.value();
    const missedXp = missed.xp.value();
    const invalid = [];
    if (!draft.taskId || !getTask(draft.taskId)) invalid.push(showError(taskBtn, taskError, 'Choose a task.'));
    if (!isValidKey(draft.since)) invalid.push(showError(sinceInput, sinceError, 'Pick a date.'));
    if (doneXp === null) invalid.push(showError(done.xp.input, done.xpError, `Enter a whole number from 0 to ${HABIT_XP_MAX}.`));
    if (missedXp === null) invalid.push(showError(missed.xp.input, missed.xpError, `Enter a whole number from 0 to ${HABIT_XP_MAX}.`));
    if (invalid.length) {
      invalid[0].focus();
      invalid[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const habit = saveHabit(character.id, existing?.id ?? null, {
      taskId: draft.taskId,
      since: draft.since,
      done: { xp: doneXp, status: draft.done.status },
      missed: { xp: missedXp, status: draft.missed.status },
    });
    if (!habit) {
      toast('This task is already attached to this character.', { variant: 'danger' });
      return;
    }
    dirty = false;
    toast(isNew ? 'Task attached' : 'Habit saved');
    ctx.navigate(backHref, { replace: true });
  }

  async function remove() {
    const task = getTask(existing.taskId);
    const ok = await confirmDialog({
      title: 'Detach task?',
      message: `“${task?.name ?? 'This task'}” will no longer give ${character.name} XP or a status. The XP it earned or lost is removed. The task itself is kept.`,
      confirmLabel: 'Detach',
      danger: true,
    });
    if (!ok) return;
    deleteHabit(character.id, existing.id);
    dirty = false;
    toast('Task detached');
    ctx.navigate(backHref, { replace: true });
  }

  return {
    dirtyMessage: 'You have unsaved changes to this habit.',
    isDirty: () => dirty,
    discard() {
      dirty = false;
    },
  };
}

/** "Daily", "Inactive · Weekly · Mon" or "Once · Oct 20". */
function taskSummary(task, today) {
  const text = describeRecurrence(task.recurrence, today);
  return task.active ? text : `Inactive · ${text}`;
}

function renderHabitNotFound(header, main, backHref) {
  header.replaceChildren(
    h('a', { href: backHref, class: 'icon-btn header-back', 'aria-label': 'Back to character' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, 'Habit not found')),
  );
  main.replaceChildren(
    h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'This habit no longer exists.'),
      h('a', { class: 'btn', href: backHref }, 'Back to character')),
  );
  return {};
}
