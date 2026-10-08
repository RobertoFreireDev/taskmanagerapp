/*
 * Checklist (#/checklists/:id): tick items off to double-check nothing is
 * missing. There are no dates and no Complete button; "Uncheck all" makes
 * the list ready to use again.
 */

import { getChecklist, subscribe, setListItemsChecked } from '../store.js';
import { h, icon, toast, preserveFocus } from '../ui.js';
import { renderNotFound } from './checklists.js';

export function mount({ header, main, params }) {
  if (!getChecklist(params.id)) return renderNotFound(header, main);
  const editHref = `#/checklists/${encodeURIComponent(params.id)}/edit`;

  const title = h('h1', {});
  header.replaceChildren(
    h('a', { href: '#/checklists', class: 'icon-btn header-back', 'aria-label': 'Back to checklists' }, icon('back')),
    h('div', { class: 'header-titles' }, title),
    h('a', { href: editHref, class: 'btn btn-tint header-action' }, icon('edit'), 'Edit'),
  );

  // Built once and updated in place, so focus and the progress animation survive re-renders.
  const progressText = h('p', { class: 'list-progress-text' });
  const progressFill = h('div', { class: 'progress-bar-fill' });
  const uncheckBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: uncheckAll }, icon('undo'), 'Uncheck all');
  const toolbar = h(
    'div',
    { class: 'list-progress' },
    h('div', { class: 'list-progress-info' }, progressText, h('div', { class: 'progress-bar', 'aria-hidden': 'true' }, progressFill)),
    uncheckBtn,
  );
  const items = h('ul', { class: 'list-items' });
  const empty = h(
    'div',
    { class: 'empty-state' },
    h('p', { class: 'empty-title' }, 'No items yet'),
    h('p', { class: 'muted' }, 'Add the things you don’t want to forget.'),
    h('a', { class: 'btn', href: editHref }, icon('plus'), 'Add items'),
  );

  let unsubscribe = () => {};

  function render() {
    const list = getChecklist(params.id);
    if (!list) {
      unsubscribe();
      renderNotFound(header, main);
      return;
    }
    title.textContent = list.name;

    const total = list.items.length;
    if (!total) {
      if (empty.parentNode !== main) main.replaceChildren(empty);
      return;
    }
    if (toolbar.parentNode !== main) main.replaceChildren(toolbar, items);

    const done = list.items.filter((item) => item.checked).length;
    toolbar.classList.toggle('is-complete', done === total);
    progressText.textContent = done === total ? `All ${total} checked` : `${done} of ${total} checked`;
    progressFill.style.width = `${(done / total) * 100}%`;
    uncheckBtn.disabled = done === 0;

    preserveFocus(items, () => items.replaceChildren(...list.items.map((item) => row(list, item))));
  }

  function row(list, item) {
    // The whole row is the label, so the touch target spans the list width.
    return h(
      'li',
      {},
      h(
        'label',
        { class: 'check-row' },
        h('input', {
          type: 'checkbox',
          class: 'checkbox',
          checked: item.checked,
          dataset: { focusKey: `item-${item.id}` },
          onchange: (e) => setListItemsChecked(list.id, [item.id], e.target.checked),
        }),
        h('span', { class: 'check-text' }, item.text),
      ),
    );
  }

  function uncheckAll() {
    const list = getChecklist(params.id);
    const checked = list?.items.filter((item) => item.checked).map((item) => item.id) ?? [];
    if (!checked.length) return;
    setListItemsChecked(list.id, checked, false);
    toast('All items unchecked', { actionLabel: 'Undo', onAction: () => setListItemsChecked(list.id, checked, true) });
  }

  render();
  unsubscribe = subscribe(render);

  return {
    unmount: () => unsubscribe(),
  };
}
