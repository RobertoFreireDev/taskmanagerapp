/*
 * Checklist form (#/checklists/new, #/checklists/:id/edit). Edits a draft;
 * nothing is stored until Save. Items keep their checked state while edited.
 */

import { getChecklist, createChecklist, updateChecklist, deleteChecklist, newId, NAME_MAX } from '../store.js';
import { h, icon, uid, openSheet, confirmDialog, toast, listEditor } from '../ui.js';
import { DEFAULT_ICON, renderIcon, iconLabel, iconPicker } from '../icons.js';
import { renderNotFound } from './checklists.js';

export function mount({ header, main, params, ctx }) {
  const isNew = params.id == null;
  const existing = isNew ? null : getChecklist(params.id);
  if (!isNew && !existing) return renderNotFound(header, main);

  const draft = {
    icon: existing?.icon ?? DEFAULT_ICON,
    // A new list starts with one empty row; Enter in a row adds the next one.
    items: existing ? existing.items.map((item) => ({ ...item })) : [{ id: newId(), text: '' }],
  };
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };
  const doneHref = isNew ? '#/checklists' : `#/checklists/${encodeURIComponent(existing.id)}`;

  // --- Header -------------------------------------------------------------
  header.replaceChildren(
    h('a', { href: doneHref, class: 'icon-btn header-back', 'aria-label': isNew ? 'Back to checklists' : 'Back to checklist' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, isNew ? 'New checklist' : 'Edit checklist')),
    h('button', { type: 'button', class: 'btn btn-primary header-action', onclick: save }, 'Save'),
  );

  // --- Icon + name ----------------------------------------------------------
  const nameId = uid('name');
  const nameError = h('p', { id: uid('error'), class: 'field-error', hidden: true }, 'Name is required.');
  const nameInput = h('input', {
    id: nameId, class: 'input', type: 'text', maxlength: NAME_MAX, autocomplete: 'off', enterkeyhint: 'done',
    value: existing?.name ?? '', placeholder: 'e.g. Trip to Lisbon', 'aria-describedby': nameError.id,
  });
  nameInput.addEventListener('input', () => {
    if (!nameInput.value.trim()) return;
    nameError.hidden = true;
    nameInput.removeAttribute('aria-invalid');
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

  // --- Layout ---------------------------------------------------------------------
  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'label', for: nameId }, 'Name'),
      h('div', { class: 'name-row' }, iconBtn, nameInput),
      nameError,
    ),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Items'),
      listEditor({ items: draft.items, label: 'Item', placeholder: 'e.g. Passport', addLabel: 'Add item', reorder: true, onChange: markDirty })),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: save }, isNew ? 'Create checklist' : 'Save changes'),
      isNew ? null : h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: remove }, icon('trash'), 'Delete checklist')),
  );
  // Typing anything marks the draft dirty; button-driven edits call markDirty themselves.
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  main.replaceChildren(form);
  if (isNew) nameInput.focus({ preventScroll: true });

  // --- Actions --------------------------------------------------------------------
  function save() {
    const name = nameInput.value.trim();
    if (!name) {
      nameError.hidden = false;
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      nameInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const fields = {
      icon: draft.icon,
      name,
      items: draft.items.map(({ id, text, checked }) => ({ id, text, checked: checked === true })),
    };
    const list = isNew ? createChecklist(fields) : updateChecklist(existing.id, fields);
    dirty = false;
    toast(isNew ? 'Checklist created' : 'Checklist saved');
    ctx.navigate(`#/checklists/${encodeURIComponent(list.id)}`, { replace: true });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete checklist?',
      message: `“${existing.name}” and all of its items will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteChecklist(existing.id);
    dirty = false;
    toast('Checklist deleted');
    ctx.navigate('#/checklists', { replace: true });
  }

  return {
    dirtyMessage: 'You have unsaved changes to this checklist.',
    isDirty: () => dirty,
    discard() {
      dirty = false;
    },
  };
}
