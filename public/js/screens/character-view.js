/*
 * Character (#/habits/:id): level, XP, mood and statuses, plus the tasks
 * attached as habits. Tap a habit to edit it; + attaches another task.
 */

import { getState, getCharacter, subscribe } from '../store.js';
import { characterSummary } from '../habits.js';
import { todayKey, formatShort, addDays } from '../dates.js';
import { statusEmoji, statusLabel } from '../statuses.js';
import { h, icon, preserveFocus } from '../ui.js';
import { renderIcon } from '../icons.js';
import { avatar, xpBar, describeMissed, renderNotFound } from './habits.js';

export function mount({ header, main, app, params }) {
  if (!getCharacter(params.id)) return renderNotFound(header, main);
  const base = `#/habits/${encodeURIComponent(params.id)}`;

  const title = h('h1', {});
  header.replaceChildren(
    h('a', { href: '#/habits', class: 'icon-btn header-back', 'aria-label': 'Back to habits' }, icon('back')),
    h('div', { class: 'header-titles' }, title),
    h('a', { href: `${base}/edit`, class: 'btn btn-tint header-action' }, icon('edit'), 'Edit'),
  );

  const fab = h('a', { href: `${base}/tasks/new`, class: 'fab', 'aria-label': 'Attach a task' }, icon('plus'));
  app.append(fab);

  let unsubscribe = () => {};

  function render() {
    const character = getCharacter(params.id);
    if (!character) {
      unsubscribe();
      fab.remove();
      renderNotFound(header, main);
      return;
    }
    const state = getState();
    const today = todayKey();
    const s = characterSummary(state, character, today);
    title.textContent = character.name;

    const attachable = state.tasks.filter((t) => t.kind === 'regular' && !character.habits.some((x) => x.taskId === t.id));
    fab.hidden = !attachable.length;

    preserveFocus(main, () => {
      main.replaceChildren(
        h('div', { class: 'character-view' }, hero(character, s), habitsSection(s, attachable, state, today)),
      );
    });
  }

  function hero(character, s) {
    const toNext = s.needed - s.into;
    return h(
      'section',
      { class: 'character-hero', 'aria-label': 'Progress' },
      h(
        'div',
        { class: 'hero-top' },
        avatar(character, s.mood, { large: true }),
        h(
          'div',
          { class: 'hero-text' },
          h('p', { class: 'hero-level' }, `Level ${s.level}`, h('span', { class: 'hero-total' }, `${s.xp} XP`)),
          xpBar(s),
          h('p', { class: 'hero-xp' }, `${s.into} / ${s.needed} XP · ${toNext} to level ${s.level + 1}`),
        ),
      ),
      h(
        'p',
        { class: `mood-line mood-${s.mood}` },
        h('span', { class: 'emoji', 'aria-hidden': 'true' }, statusEmoji(s.mood)),
        h('strong', {}, statusLabel(s.mood)),
        h('span', { class: 'muted' }, `· ${describeMissed(s)}`),
      ),
      s.statuses.length
        ? h(
            'ul',
            { class: 'status-chips', 'aria-label': 'Status' },
            s.statuses.map((key) =>
              h('li', { class: 'status-chip' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, statusEmoji(key)), statusLabel(key))),
          )
        : null,
    );
  }

  function habitsSection(s, attachable, state, today) {
    const heading = h(
      'h2',
      { class: 'icon-group-heading' },
      h('span', {}, 'Habits'),
      h('span', { class: 'section-count' }, String(s.habits.length)),
    );
    const rows = s.habits.length
      ? h('ul', { class: 'task-list' }, s.habits.map((item) => habitRow(item, today)))
      : h('p', { class: 'empty-line habit-empty' }, 'No tasks attached yet.');

    let hint = null;
    const regular = state.tasks.some((t) => t.kind === 'regular');
    if (!regular) {
      hint = h('div', { class: 'habit-hint' },
        h('p', { class: 'muted' }, 'Habits come from your tasks. Create a task first, then attach it here.'),
        h('a', { class: 'btn', href: '#/tasks/new' }, icon('plus'), 'New task'));
    } else if (!attachable.length) {
      hint = h('p', { class: 'muted habit-hint' }, 'Every task is attached to this character.');
    } else if (!s.habits.length) {
      hint = h('p', { class: 'muted habit-hint' }, 'Tap + to attach a task and choose the XP and status it gives.');
    }
    return h('section', { class: 'habit-section' }, heading, rows, hint);
  }

  function habitRow({ habit, task, last }, today) {
    const xpPart = (sign, outcome) => [
      h('span', {}, `${sign}${outcome.xp} XP`),
      outcome.status ? h('span', { class: 'emoji', title: statusLabel(outcome.status) }, ` ${statusEmoji(outcome.status)}`) : null,
    ];
    const label = [
      task.name,
      `completed: plus ${habit.done.xp} XP${habit.done.status ? `, ${statusLabel(habit.done.status)}` : ''}`,
      `missed: minus ${habit.missed.xp} XP${habit.missed.status ? `, ${statusLabel(habit.missed.status)}` : ''}`,
      describeLast(task, last, today),
    ].join('. ');
    return h(
      'li',
      { class: `task-row habit-row ${task.active ? '' : 'is-inactive'}` },
      h(
        'a',
        {
          href: `#/habits/${encodeURIComponent(params.id)}/tasks/${encodeURIComponent(habit.id)}`,
          class: 'task-row-main', 'aria-label': label, dataset: { focusKey: `habit-${habit.id}` },
        },
        h('span', { class: 'card-icon', html: renderIcon(task.icon) }),
        h(
          'span',
          { class: 'task-row-text', 'aria-hidden': 'true' },
          h('span', { class: 'task-row-name' }, task.name),
          h('span', { class: 'task-row-sub' }, xpPart('+', habit.done), h('span', {}, ' · '), xpPart('−', habit.missed)),
        ),
        outcomeBadge(task, last, today),
      ),
    );
  }

  render();
  unsubscribe = subscribe(render);

  return {
    unmount() {
      unsubscribe();
      fab.remove();
    },
    refresh: render,
  };
}

function relativeDay(date, today) {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  return formatShort(date, today);
}

function describeLast(task, last, today) {
  if (!task.active) return 'Paused: the task is inactive';
  if (!last) return 'No results yet';
  return `${last.outcome === 'done' ? 'Done' : 'Missed'} ${relativeDay(last.date, today)}`;
}

function outcomeBadge(task, last, today) {
  if (!task.active) return h('span', { class: 'outcome', 'aria-hidden': 'true' }, 'Paused');
  if (!last) return h('span', { class: 'outcome', 'aria-hidden': 'true' }, 'New');
  const done = last.outcome === 'done';
  return h(
    'span',
    { class: `outcome ${done ? 'outcome-done' : 'outcome-missed'}`, 'aria-hidden': 'true' },
    `${done ? 'Done' : 'Missed'} ${relativeDay(last.date, today)}`,
  );
}
