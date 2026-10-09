/*
 * Journal day (#/journal/YYYY-MM-DD): write, edit or delete one day's entry.
 * Also exports journalEditor(), which Home uses for today's entry.
 */

import { subscribe, getJournalEntry, updateJournalEntry, deleteJournalEntry, JOURNAL_TEXT_MAX } from '../store.js';
import {
  EMOTIONS, MAX_EMOTIONS, ENERGY_LEVELS, emotionLabel, emotionEmoji, energyLabel, energyTone, renderEnergy,
} from '../moods.js';
import { todayKey, isValidKey, parseKey, monthKey, addDays, daysBetween, formatLong, formatWithWeekday } from '../dates.js';
import { h, icon, openSheet, confirmDialog, toast, autoGrow } from '../ui.js';

const SAVE_DELAY = 600;

/**
 * Feelings, energy and free text for one day. Picks save at once; text saves
 * shortly after typing stops, on blur, and when the app is hidden.
 * Returns { el, update, flush, destroy }: call update() after store changes
 * and destroy() when the editor goes away.
 */
export function journalEditor(date) {
  const feelingsBtn = h('button', { type: 'button', class: 'mood-btn mood-btn-feelings', onclick: openFeelings });
  const energyBtn = h('button', { type: 'button', class: 'mood-btn', onclick: openEnergy });
  const textarea = h('textarea', {
    class: 'input journal-text', rows: '4', maxlength: JOURNAL_TEXT_MAX, placeholder: 'How was your day?', 'aria-label': 'Journal entry',
  });
  textarea.value = getJournalEntry(date)?.text ?? '';
  const status = h('p', { class: 'journal-status', role: 'status' });

  // --- Text: autosave -------------------------------------------------------
  let timer = null;
  let pending = false;

  function save() {
    clearTimeout(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    updateJournalEntry(date, { text: textarea.value });
    status.textContent = 'Saved';
  }

  textarea.addEventListener('input', () => {
    pending = true;
    status.textContent = '';
    autoGrow(textarea);
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  });
  textarea.addEventListener('blur', save);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', save);

  // --- Feelings and energy buttons -----------------------------------------------
  function renderButtons() {
    const entry = getJournalEntry(date);
    const emotions = entry?.emotions ?? [];
    const energy = entry?.energy ?? null;

    const names = emotions.map(emotionLabel).join(', ');
    feelingsBtn.setAttribute('aria-label', emotions.length ? `Feelings: ${names}. Change` : 'Add feelings');
    feelingsBtn.replaceChildren(
      h('span', { class: 'mood-btn-label' }, 'Feelings'),
      ...(emotions.length
        ? [
            h('span', { class: 'mood-btn-main' }, emotions.map((key) => h('span', { class: 'emoji' }, emotionEmoji(key)))),
            h('span', { class: 'mood-btn-sub' }, names),
          ]
        : [h('span', { class: 'mood-btn-main is-empty' }, icon('plus'), 'Add')]),
    );

    energyBtn.setAttribute('aria-label', energy === null ? 'Set energy' : `Energy: ${energyLabel(energy)}. Change`);
    energyBtn.replaceChildren(
      h('span', { class: 'mood-btn-label' }, 'Energy'),
      energy === null
        ? h('span', { class: 'mood-btn-main is-empty' }, icon('plus'), 'Set')
        : h('span', { class: 'mood-btn-main' },
            h('span', { class: `energy-icon tone-${energyTone(energy)}`, html: renderEnergy(energy) }),
            energyLabel(energy)),
    );
  }

  function openFeelings() {
    const count = h('p', { class: 'sheet-hint' });
    const buttons = Object.entries(EMOTIONS).map(([key, { label, emoji }]) =>
      h('button', { type: 'button', class: 'emotion-option', dataset: { emotion: key }, onclick: () => toggle(key) },
        h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji),
        h('span', { class: 'emotion-name' }, label)),
    );
    const grid = h('div', { class: 'emotion-grid', role: 'group', 'aria-label': 'Emotions' }, buttons);

    function sync() {
      const chosen = getJournalEntry(date)?.emotions ?? [];
      const full = chosen.length >= MAX_EMOTIONS;
      count.textContent = `Choose up to ${MAX_EMOTIONS} · ${chosen.length} selected`;
      for (const btn of buttons) {
        const on = chosen.includes(btn.dataset.emotion);
        btn.setAttribute('aria-pressed', String(on));
        btn.disabled = full && !on;
      }
    }

    function toggle(key) {
      const chosen = getJournalEntry(date)?.emotions ?? [];
      const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
      if (next.length > MAX_EMOTIONS) return;
      updateJournalEntry(date, { emotions: next });
      sync();
    }

    sync();
    const done = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Done');
    const sheet = openSheet({ title: 'How do you feel?', body: [count, grid], footer: done, initialFocus: buttons[0] });
    done.addEventListener('click', () => sheet.close());
  }

  function openEnergy() {
    const current = getJournalEntry(date)?.energy ?? null;
    let sheet;
    const pick = (level) => {
      updateJournalEntry(date, { energy: level });
      sheet.close();
    };
    const grid = h(
      'div',
      { class: 'energy-grid', role: 'group', 'aria-label': 'Energy levels' },
      ENERGY_LEVELS.map((level) =>
        h('button', { type: 'button', class: 'energy-option', 'aria-pressed': String(level === current), onclick: () => pick(level) },
          h('span', { class: `energy-icon tone-${energyTone(level)}`, html: renderEnergy(level) }),
          energyLabel(level)),
      ),
    );
    const clear = current === null ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => pick(null) }, 'Clear energy');
    sheet = openSheet({ title: 'Energy level', body: grid, footer: clear, initialFocus: grid.querySelector('[aria-pressed="true"]') });
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Syncs with the store. Never touches the text while it is being edited. */
  function update() {
    renderButtons();
    if (document.activeElement === textarea || pending) return;
    const text = getJournalEntry(date)?.text ?? '';
    if (textarea.value !== text) textarea.value = text;
    autoGrow(textarea);
  }

  function destroy() {
    save();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', save);
  }

  const el = h('div', { class: 'journal-editor' }, h('div', { class: 'mood-row' }, feelingsBtn, energyBtn), textarea, status);
  renderButtons();
  requestAnimationFrame(() => autoGrow(textarea));
  return { el, update, flush: save, destroy };
}

// ---------------------------------------------------------------------------
// Screen

export function mount({ header, main, params, ctx }) {
  const { date } = params;
  let today = todayKey();
  const valid = isValidKey(date);
  const { year, month } = valid ? parseKey(date) : {};
  const monthHref = valid ? `#/journal/${monthKey(year, month)}` : '#/journal';
  const back = h('a', { href: monthHref, class: 'icon-btn header-back', 'aria-label': 'Back to journal' }, icon('back'));

  if (!valid || date > today) {
    header.replaceChildren(back, h('div', { class: 'header-titles' }, h('h1', {}, 'Journal')));
    main.replaceChildren(
      h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, valid ? 'This day hasn’t happened yet.' : 'This date doesn’t exist.'),
        h('a', { class: 'btn', href: monthHref }, 'Back to journal')),
    );
    return {};
  }

  const sub = h('p', { class: 'header-sub' });
  const go = (key) => ctx.navigate(`#/journal/${key}`, { replace: true });
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => go(addDays(date, -1)) }, icon('chevronLeft'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next day', onclick: () => go(addDays(date, 1)) }, icon('chevronRight'));
  header.replaceChildren(
    back,
    h('div', { class: 'header-titles' }, h('h1', {}, formatWithWeekday(date)), sub),
    h('div', { class: 'header-pager' }, prevBtn, nextBtn),
  );

  function renderHeader() {
    const gap = daysBetween(date, today);
    sub.textContent = gap === 0 ? 'Today' : gap === 1 ? 'Yesterday' : `${gap} days ago`;
    nextBtn.disabled = date >= today;
  }

  const editor = journalEditor(date);
  const actions = h('div', { class: 'journal-actions' },
    h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: remove }, icon('trash'), 'Delete entry'));
  main.replaceChildren(h('div', { class: 'journal-day' }, h('div', { class: 'journal-card' }, editor.el), actions));

  function render() {
    editor.update();
    actions.hidden = !getJournalEntry(date);
  }

  async function remove() {
    editor.flush();
    const ok = await confirmDialog({
      title: 'Delete entry?',
      message: `Your journal entry for ${formatLong(date, today)} will be deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteJournalEntry(date);
    toast('Entry deleted');
  }

  renderHeader();
  render();
  const unsubscribe = subscribe(render);

  return {
    unmount() {
      unsubscribe();
      editor.destroy();
    },
    refresh() {
      today = todayKey();
      renderHeader();
    },
  };
}
