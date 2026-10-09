/*
 * Journal (#/journal, #/journal/YYYY-MM): one month at a time, as a calendar
 * and a list of that month's entries, newest first. Tapping a day opens it.
 */

import { getState, subscribe } from '../store.js';
import { emotionLabel, emotionEmoji, energyLabel, energyTone, renderEnergy } from '../moods.js';
import {
  todayKey, parseKey, parseMonthKey, monthKey, shiftMonth, compareMonths, monthGrid,
  formatLong, formatMonthYear, WEEKDAY_SHORT, WEEK_STARTS_ON, MONTH_SHORT,
} from '../dates.js';
import { h, icon, openSheet } from '../ui.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function mount({ header, main, params }) {
  let today = todayKey();
  const thisMonth = () => {
    const { year, month } = parseKey(today);
    return { year, month };
  };
  /** Never later than the current month. */
  const clamp = (m) => (compareMonths(m, thisMonth()) < 0 ? thisMonth() : m);

  let shown = clamp(parseMonthKey(params.month) ?? thisMonth());

  // --- Header -------------------------------------------------------------
  const sub = h('p', { class: 'header-sub' });
  const todayBtn = h('button', { type: 'button', class: 'btn btn-tint header-action', onclick: () => show(thisMonth()) }, 'Today');
  header.replaceChildren(h('div', { class: 'header-titles' }, h('h1', {}, 'Journal'), sub), todayBtn);

  // --- Pager ----------------------------------------------------------------
  const prevBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => show(shiftMonth(shown.year, shown.month, -1)),
  }, icon('chevronLeft'));
  const nextBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Next month', onclick: () => show(shiftMonth(shown.year, shown.month, 1)),
  }, icon('chevronRight'));
  const titleText = h('span', {});
  const titleBtn = h('button', { type: 'button', class: 'month-title', 'aria-haspopup': 'dialog', onclick: openPicker },
    titleText, icon('chevronDown'));
  const pager = h('div', { class: 'month-pager' }, prevBtn, titleBtn, nextBtn);

  const calendar = h('div', { class: 'calendar' });
  const listHeading = h('h2', { class: 'journal-list-heading' });
  const list = h('ul', { class: 'journal-entries' });
  main.replaceChildren(pager, calendar, listHeading, list);

  /** Switches month in place; the URL follows without adding history entries. */
  function show(m) {
    shown = clamp(m);
    history.replaceState(null, '', `#/journal/${monthKey(shown.year, shown.month)}`);
    render();
  }

  function render() {
    const { journal } = getState();
    const isCurrent = compareMonths(shown, thisMonth()) === 0;
    const total = Object.keys(journal).length;
    sub.textContent = total ? plural(total, 'entry', 'entries') : 'A few lines a day';
    todayBtn.hidden = isCurrent;
    nextBtn.disabled = isCurrent;
    const title = formatMonthYear(shown.year, shown.month);
    titleText.textContent = title;
    titleBtn.setAttribute('aria-label', `${title}. Choose month`);

    const dates = Object.keys(journal)
      .filter((key) => compareMonths(shown, parseKey(key)) === 0)
      .sort()
      .reverse();

    calendar.setAttribute('aria-label', title);
    calendar.replaceChildren(
      h('div', { class: 'cal-row cal-head', 'aria-hidden': 'true' },
        WEEKDAY_SHORT.map((_, i) => h('span', {}, WEEKDAY_SHORT[(WEEK_STARTS_ON + i) % 7]))),
      ...monthGrid(shown.year, shown.month).map((week) => h('div', { class: 'cal-row' }, week.map((key) => dayCell(key, journal)))),
    );

    listHeading.replaceChildren(
      h('span', {}, 'Entries'),
      h('span', { class: 'section-count' }, String(dates.length)),
    );
    list.replaceChildren(
      ...(dates.length
        ? dates.map((key) => entryRow(key, journal[key]))
        : [h('li', { class: 'empty-line' }, `No entries in ${title}.`)]),
    );
  }

  function dayCell(key, journal) {
    if (!key) return h('span', { class: 'cal-cell' });
    const entry = journal[key];
    const { day } = parseKey(key);
    const classes = ['cal-cell', 'cal-day'];
    if (key === today) classes.push('is-today');
    if (entry) classes.push('has-entry');
    if (key > today) {
      classes.push('is-future');
      return h('span', { class: classes.join(' ') }, h('span', { class: 'cal-num' }, String(day)));
    }
    let mark = null;
    let label = formatLong(key, today);
    if (entry?.emotions.length) {
      mark = h('span', { class: 'cal-mark emoji', 'aria-hidden': 'true' }, emotionEmoji(entry.emotions[0]));
      label += `: ${entry.emotions.map(emotionLabel).join(', ')}`;
    } else if (entry) {
      mark = h('span', { class: 'cal-mark cal-dot', 'aria-hidden': 'true' });
      label += ': entry written';
    }
    return h('a', { href: `#/journal/${key}`, class: classes.join(' '), 'aria-label': label, 'aria-current': key === today ? 'date' : null },
      h('span', { class: 'cal-num', 'aria-hidden': 'true' }, String(day)),
      mark);
  }

  function entryRow(key, entry) {
    const meta = [];
    for (const emotion of entry.emotions) {
      meta.push(h('span', { class: 'entry-emotion' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, emotionEmoji(emotion)), emotionLabel(emotion)));
    }
    if (entry.energy !== null) {
      meta.push(
        h('span', { class: 'entry-energy' },
          h('span', { class: `energy-icon tone-${energyTone(entry.energy)}`, 'aria-hidden': 'true', html: renderEnergy(entry.energy) }),
          h('span', { class: 'visually-hidden' }, 'Energy '),
          energyLabel(entry.energy)),
      );
    }
    return h(
      'li',
      {},
      h(
        'a',
        { href: `#/journal/${key}`, class: 'entry-card' },
        h('span', { class: 'entry-date' }, formatLong(key, today)),
        meta.length ? h('span', { class: 'entry-meta' }, meta) : null,
        entry.text ? h('span', { class: 'entry-text' }, entry.text) : null,
      ),
    );
  }

  // --- Month / year picker -----------------------------------------------------
  function openPicker() {
    let year = shown.year;
    const yearLabel = h('span', { class: 'picker-year', 'aria-live': 'polite' });
    const prevYear = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous year', onclick: () => setYear(year - 1) }, icon('chevronLeft'));
    const nextYear = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next year', onclick: () => setYear(year + 1) }, icon('chevronRight'));
    const grid = h('div', { class: 'month-grid' });
    let sheet;

    function setYear(y) {
      year = y;
      renderPicker();
    }

    function renderPicker() {
      const current = thisMonth();
      const withEntries = new Set(
        Object.keys(getState().journal).map((key) => {
          const { year: y, month } = parseKey(key);
          return monthKey(y, month);
        }),
      );
      yearLabel.textContent = String(year);
      nextYear.disabled = year >= current.year;
      grid.replaceChildren(
        ...MONTH_SHORT.map((name, i) => {
          const m = { year, month: i + 1 };
          const has = withEntries.has(monthKey(year, i + 1));
          return h('button', {
            type: 'button',
            class: 'month-option',
            disabled: compareMonths(m, current) < 0,
            'aria-current': compareMonths(m, shown) === 0 ? 'true' : null,
            'aria-label': formatMonthYear(year, i + 1) + (has ? ', has entries' : ''),
            onclick: () => {
              sheet.close();
              show(m);
            },
          }, name, has ? h('span', { class: 'month-dot', 'aria-hidden': 'true' }) : null);
        }),
      );
    }

    renderPicker();
    sheet = openSheet({
      title: 'Go to month',
      body: [h('div', { class: 'year-stepper' }, prevYear, yearLabel, nextYear), grid],
      initialFocus: grid.querySelector('[aria-current="true"]'),
    });
  }

  render();
  const unsubscribe = subscribe(render);

  return {
    unmount: unsubscribe,
    refresh() {
      today = todayKey();
      render();
    },
  };
}
