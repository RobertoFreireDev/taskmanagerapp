/*
 * Tasks (#/tasks): regular tasks with an active toggle and a schedule summary.
 * Quick tasks are not listed here; they live only on Home.
 */

import { getState, subscribe, setTaskActive } from '../store.js';
import { describeRecurrence } from '../schedule.js';
import { todayKey } from '../dates.js';
import { h, icon, preserveFocus } from '../ui.js';
import { renderIcon } from '../icons.js';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function mount({ header, main, app }) {
  const sub = h('p', { class: 'header-sub' });
  header.replaceChildren(h('div', { class: 'header-titles' }, h('h1', {}, 'Tasks'), sub));

  const fab = h('a', { href: '#/tasks/new', class: 'fab', 'aria-label': 'New task' }, icon('plus'));
  app.append(fab);

  function render() {
    const today = todayKey();
    const tasks = getState().tasks.filter((t) => t.kind === 'regular').sort(byName);
    const active = tasks.filter((t) => t.active).length;
    sub.textContent = tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} · ${active} active` : 'Recurring tasks';

    preserveFocus(main, () => {
      main.replaceChildren(
        tasks.length
          ? h('ul', { class: 'task-list' }, tasks.map((task) => row(task, today)))
          : h(
              'div',
              { class: 'empty-state' },
              h('span', { class: 'empty-icon', html: renderIcon('task') }),
              h('p', { class: 'empty-title' }, 'No tasks yet'),
              h('p', { class: 'muted' }, 'Tap + to create a recurring task. Quick tasks for today live on Home.'),
            ),
      );
    });
  }

  function row(task, today) {
    return h(
      'li',
      { class: `task-row ${task.active ? '' : 'is-inactive'}` },
      h(
        'a',
        { href: `#/tasks/${encodeURIComponent(task.id)}`, class: 'task-row-main', dataset: { focusKey: `open-${task.id}` } },
        h('span', { class: 'card-icon', html: renderIcon(task.icon) }),
        h(
          'span',
          { class: 'task-row-text' },
          h('span', { class: 'task-row-name' }, task.name),
          h('span', { class: 'task-row-sub' }, task.active ? describeRecurrence(task.recurrence, today) : `Inactive · ${describeRecurrence(task.recurrence, today)}`),
        ),
      ),
      h(
        'label',
        { class: 'switch' },
        h('input', {
          type: 'checkbox',
          role: 'switch',
          checked: task.active,
          'aria-label': `Active: ${task.name}`,
          dataset: { focusKey: `active-${task.id}` },
          onchange: (e) => setTaskActive(task.id, e.target.checked),
        }),
        h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
      ),
    );
  }

  render();
  const unsubscribe = subscribe(render);

  return {
    unmount() {
      unsubscribe();
      fab.remove();
    },
    refresh: render,
  };
}
