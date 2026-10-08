/*
 * Checklists (#/checklists): reusable lists, like a packing list for a trip.
 * They have nothing to do with tasks or dates.
 */

import { getState, subscribe } from '../store.js';
import { h, icon, preserveFocus } from '../ui.js';
import { renderIcon, uiIcon } from '../icons.js';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** "3 of 7 checked", "All 7 checked", "7 items" or "No items". */
export function describeProgress(list) {
  const total = list.items.length;
  const done = list.items.filter((item) => item.checked).length;
  if (!total) return 'No items';
  if (!done) return `${total} ${total === 1 ? 'item' : 'items'}`;
  return done === total ? `All ${total} checked` : `${done} of ${total} checked`;
}

export function mount({ header, main, app }) {
  const sub = h('p', { class: 'header-sub' });
  header.replaceChildren(h('div', { class: 'header-titles' }, h('h1', {}, 'Checklists'), sub));

  const fab = h('a', { href: '#/checklists/new', class: 'fab', 'aria-label': 'New checklist' }, icon('plus'));
  app.append(fab);

  function render() {
    const lists = [...getState().checklists].sort(byName);
    sub.textContent = lists.length ? `${lists.length} ${lists.length === 1 ? 'checklist' : 'checklists'}` : 'Reusable lists';

    preserveFocus(main, () => {
      main.replaceChildren(
        lists.length
          ? h('ul', { class: 'task-list checklist-list' }, lists.map(row))
          : h(
              'div',
              { class: 'empty-state' },
              h('span', { class: 'empty-icon', html: uiIcon('clipboard') }),
              h('p', { class: 'empty-title' }, 'No checklists yet'),
              h('p', { class: 'muted' }, 'Tap + to make a list you can reuse any time, like a packing list for a trip.'),
            ),
      );
    });
  }

  function row(list) {
    return h(
      'li',
      { class: 'task-row' },
      h(
        'a',
        { href: `#/checklists/${encodeURIComponent(list.id)}`, class: 'task-row-main', dataset: { focusKey: `open-${list.id}` } },
        h('span', { class: 'card-icon', html: renderIcon(list.icon) }),
        h(
          'span',
          { class: 'task-row-text' },
          h('span', { class: 'task-row-name' }, list.name),
          h('span', { class: 'task-row-sub' }, describeProgress(list)),
        ),
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

/** Shown when a checklist link points at one that no longer exists. */
export function renderNotFound(header, main) {
  header.replaceChildren(
    h('a', { href: '#/checklists', class: 'icon-btn header-back', 'aria-label': 'Back to checklists' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, 'Checklist not found')),
  );
  main.replaceChildren(
    h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'This checklist no longer exists.'),
      h('a', { class: 'btn', href: '#/checklists' }, 'Back to checklists')),
  );
  return {};
}
