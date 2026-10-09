/*
 * Habits (#/habits): characters that level up from the tasks attached to them.
 * Also exports characterCard(), which Home shows above To do.
 */

import { getState, subscribe } from '../store.js';
import { characterSummary } from '../habits.js';
import { todayKey } from '../dates.js';
import { avatarEmoji, statusEmoji, statusLabel } from '../statuses.js';
import { h, icon, preserveFocus } from '../ui.js';
import { uiIcon } from '../icons.js';

export const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** The avatar emoji in a ring colored by mood, with the mood's emoji as a badge. */
export function avatar(character, mood, { large = false } = {}) {
  return h(
    'span',
    { class: `avatar mood-${mood} ${large ? 'avatar-lg' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'emoji' }, avatarEmoji(character.avatar)),
    h('span', { class: 'mood-badge emoji' }, statusEmoji(mood)),
  );
}

/** An XP bar filled to how far the character is into its current level. */
export function xpBar(summary) {
  const fill = h('span', { class: 'progress-bar-fill' });
  fill.style.width = `${Math.min(100, (summary.into / summary.needed) * 100)}%`;
  return h('span', { class: 'progress-bar xp-bar', 'aria-hidden': 'true' }, fill);
}

/** "0 missed in the last 7 days", or "1 missed yesterday" for a one-day mood. */
export function describeMissed(summary) {
  const n = summary.missed;
  const when = summary.periodDays === 1 ? 'yesterday' : `in the last ${summary.periodDays} days`;
  return `${n} missed ${when}`;
}

/** A tappable card: avatar and mood, name, level, statuses and XP bar. */
export function characterCard(character, summary) {
  const { level, into, needed, mood, statuses } = summary;
  const names = statuses.map(statusLabel);
  const label =
    `${character.name}, level ${level}, ${statusLabel(mood).toLowerCase()}. ${into} of ${needed} XP to level ${level + 1}.` +
    (names.length ? ` Status: ${names.join(', ')}.` : '');
  return h(
    'a',
    { href: `#/habits/${encodeURIComponent(character.id)}`, class: 'character-card', 'aria-label': label, dataset: { focusKey: `character-${character.id}` } },
    avatar(character, mood),
    h(
      'span',
      { class: 'character-main', 'aria-hidden': 'true' },
      h('span', { class: 'character-top' },
        h('span', { class: 'character-name' }, character.name),
        h('span', { class: 'level-badge' }, `Lv ${level}`)),
      statuses.length ? h('span', { class: 'status-row' }, statuses.map((key) => h('span', { class: 'emoji' }, statusEmoji(key)))) : null,
      h('span', { class: 'xp-row' }, xpBar(summary), h('span', { class: 'xp-text' }, `${into}/${needed} XP`)),
    ),
  );
}

/** Character cards sorted by name, as a list. */
export function characterList(state, today) {
  return h(
    'ul',
    { class: 'card-list' },
    [...state.characters].sort(byName).map((c) => h('li', {}, characterCard(c, characterSummary(state, c, today)))),
  );
}

export function mount({ header, main, app }) {
  const sub = h('p', { class: 'header-sub' });
  header.replaceChildren(h('div', { class: 'header-titles' }, h('h1', {}, 'Habits'), sub));

  const fab = h('a', { href: '#/habits/new', class: 'fab', 'aria-label': 'New character' }, icon('plus'));
  app.append(fab);

  function render() {
    const state = getState();
    const n = state.characters.length;
    sub.textContent = n ? `${n} ${n === 1 ? 'character' : 'characters'}` : 'Level up with your tasks';

    preserveFocus(main, () => {
      main.replaceChildren(
        n
          ? characterList(state, todayKey())
          : h(
              'div',
              { class: 'empty-state' },
              h('span', { class: 'empty-icon', html: uiIcon('trophy') }),
              h('p', { class: 'empty-title' }, 'No characters yet'),
              h('p', { class: 'muted' }, 'Tap + to create a character, then attach tasks to it. Completing them earns XP; missing them costs XP.'),
            ),
      );
    });
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

/** Shown when a link points at a character that no longer exists. */
export function renderNotFound(header, main) {
  header.replaceChildren(
    h('a', { href: '#/habits', class: 'icon-btn header-back', 'aria-label': 'Back to habits' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, 'Character not found')),
  );
  main.replaceChildren(
    h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'This character no longer exists.'),
      h('a', { class: 'btn', href: '#/habits' }, 'Back to habits')),
  );
  return {};
}
