/*
 * Character form (#/habits/new, #/habits/:id/edit): avatar, name, how XP
 * grows per level, and how many misses make the character sad. Edits a
 * draft; nothing is stored until Save. Habits are edited on the character.
 */

import { getCharacter, createCharacter, updateCharacter, deleteCharacter, NAME_MAX } from '../store.js';
import {
  DEFAULT_LEVELING, DEFAULT_MOOD, LEVEL_XP_MAX, MISSED_MAX, MOOD_PERIODS, xpForLevel, xpToReach,
} from '../habits.js';
import { AVATARS, DEFAULT_AVATAR, statusEmoji } from '../statuses.js';
import { h, icon, uid, confirmDialog, toast, stepper, fieldError, showError, clearError } from '../ui.js';
import { renderNotFound } from './habits.js';

const PERIOD_LABELS = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };
const PREVIEW_LEVELS = [2, 3, 4, 5, 10, 20];

export function mount({ header, main, params, ctx }) {
  const isNew = params.id == null;
  const existing = isNew ? null : getCharacter(params.id);
  if (!isNew && !existing) return renderNotFound(header, main);

  const leveling = existing?.leveling ?? DEFAULT_LEVELING;
  const mood = existing?.mood ?? DEFAULT_MOOD;
  const draft = { avatar: existing?.avatar ?? DEFAULT_AVATAR, period: mood.period };
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };
  const backHref = isNew ? '#/habits' : `#/habits/${encodeURIComponent(existing.id)}`;

  // --- Header -------------------------------------------------------------
  header.replaceChildren(
    h('a', { href: backHref, class: 'icon-btn header-back', 'aria-label': isNew ? 'Back to habits' : 'Back to character' }, icon('back')),
    h('div', { class: 'header-titles' }, h('h1', {}, isNew ? 'New character' : 'Edit character')),
    h('button', { type: 'button', class: 'btn btn-primary header-action', onclick: save }, 'Save'),
  );

  // --- Avatar + name ----------------------------------------------------------
  const avatarName = uid('avatar');
  const avatars = h(
    'div',
    { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Avatar' },
    Object.entries(AVATARS).map(([key, { label, emoji }]) => {
      const id = uid('avatar');
      return h(
        'span',
        { class: 'avatar-choice' },
        h('input', {
          type: 'radio', id, name: avatarName, value: key, checked: draft.avatar === key,
          onchange: () => {
            draft.avatar = key;
          },
        }),
        h('label', { for: id }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji), label),
      );
    }),
  );

  const nameId = uid('name');
  const nameError = fieldError();
  const nameInput = h('input', {
    id: nameId, class: 'input', type: 'text', maxlength: NAME_MAX, autocomplete: 'off', enterkeyhint: 'done',
    value: existing?.name ?? '', placeholder: 'e.g. Rex', 'aria-describedby': nameError.id,
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

  // --- Leveling -----------------------------------------------------------------
  const baseError = fieldError();
  const base = numberField({
    label: 'XP to reach level 2', value: leveling.base, min: 1, max: LEVEL_XP_MAX, unit: 'XP', error: baseError, onChange: renderCurve,
  });
  const stepError = fieldError();
  const step = numberField({
    label: 'Extra XP for each level after', value: leveling.step, min: 0, max: LEVEL_XP_MAX, unit: 'XP', error: stepError, onChange: renderCurve,
  });
  const curve = h('div', { class: 'preview', 'aria-live': 'polite' });

  function renderCurve() {
    const b = base.stepper.value();
    const s = step.stepper.value();
    if (b === null || s === null) {
      curve.replaceChildren(h('p', { class: 'muted' }, 'Enter whole numbers to see how levels grow.'));
      return;
    }
    const rule = { base: b, step: s };
    curve.replaceChildren(
      h('ol', { class: 'preview-list' }, PREVIEW_LEVELS.map((level) =>
        h('li', {},
          h('span', {}, `Level ${level}`),
          h('span', { class: 'preview-rel' }, `+${xpForLevel(level - 1, rule)} XP · ${xpToReach(level, rule)} total`)))),
    );
  }

  // --- Mood -----------------------------------------------------------------------
  const periodName = uid('period');
  const periodHint = h('p', { id: uid('hint'), class: 'field-hint' });
  const periods = h(
    'div',
    { class: 'segmented segmented-4', role: 'radiogroup', 'aria-label': 'Count misses over', 'aria-describedby': periodHint.id },
    Object.keys(MOOD_PERIODS).map((period) => {
      const id = uid('period');
      return [
        h('input', {
          type: 'radio', id, name: periodName, value: period, checked: draft.period === period,
          onchange: () => {
            draft.period = period;
            renderMood();
          },
        }),
        h('label', { for: id }, PERIOD_LABELS[period]),
      ];
    }),
  );

  // Both mood fields share one error line, shown below them.
  const moodError = fieldError();
  const happy = numberField({
    label: 'Happy when missed at most', value: mood.happyMax, min: 0, max: MISSED_MAX - 1, unit: 'tasks', describedBy: moodError.id, onChange: renderMood,
  });
  const sad = numberField({
    label: 'Sad when missed at least', value: mood.sadMin, min: 1, max: MISSED_MAX, unit: 'tasks', describedBy: moodError.id, onChange: renderMood,
  });
  const scale = h('div', { class: 'mood-scale', 'aria-live': 'polite' });

  function renderMood() {
    const days = MOOD_PERIODS[draft.period];
    periodHint.textContent = days === 1
      ? 'Counts tasks missed yesterday. Today counts once it’s over.'
      : `Counts tasks missed in the last ${days} days. Today counts once it’s over.`;
    const hi = happy.stepper.value();
    const lo = sad.stepper.value();
    const valid = hi !== null && lo !== null && lo > hi;
    if (valid) {
      clearError(happy.stepper.input, moodError);
      clearError(sad.stepper.input, moodError);
    }
    const range = (from, to) => (from === to ? `${from}` : `${from}–${to}`);
    const item = (key, label, text) =>
      h('div', { class: 'mood-scale-item' }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, statusEmoji(key)), h('strong', {}, label), h('span', {}, text));
    scale.replaceChildren(
      ...(valid
        ? [
            item('happy', 'Happy', `${range(0, hi)} missed`),
            item('normal', 'Normal', lo - hi > 1 ? `${range(hi + 1, lo - 1)} missed` : 'Never'),
            item('sad', 'Sad', `${lo}+ missed`),
          ]
        : [h('p', { class: 'muted' }, 'Sad must need more misses than Happy.')]),
    );
  }

  // --- Layout ---------------------------------------------------------------------
  const form = h(
    'form',
    { class: 'form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Avatar'), avatars),
    h('div', { class: 'field' }, h('label', { class: 'label', for: nameId }, 'Name'), nameInput, nameError),
    h('div', { class: 'form-section' }, h('h2', { class: 'form-section-title' }, 'Leveling')),
    h('p', { class: 'section-hint' }, 'Early levels come quickly; each level after needs a bit more XP than the one before.'),
    base.el,
    step.el,
    h('div', { class: 'field' }, h('h3', { class: 'label' }, 'XP each level needs'), curve),
    h('div', { class: 'form-section' }, h('h2', { class: 'form-section-title' }, 'Mood')),
    h('fieldset', { class: 'field' }, h('legend', { class: 'label' }, 'Count misses over'), periods, periodHint),
    happy.el,
    sad.el,
    moodError,
    h('div', { class: 'field' }, scale),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: save }, isNew ? 'Create character' : 'Save changes'),
      isNew ? null : h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: remove }, icon('trash'), 'Delete character')),
  );
  // Typing anything marks the draft dirty; stepper buttons call markDirty themselves.
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  main.replaceChildren(form);
  renderCurve();
  renderMood();
  if (isNew) nameInput.focus({ preventScroll: true });

  /** A labelled stepper; onChange runs after every edit. With `error`, the field shows and clears its own error line. */
  function numberField({ label, value, min, max, unit, error, describedBy, onChange }) {
    const id = uid('number');
    const field = stepper({
      id, value, min, max, unit, label: label.toLowerCase(), describedBy: describedBy ?? error?.id,
      onChange: (n) => {
        markDirty();
        if (n !== null && error) clearError(field.input, error);
        onChange();
      },
    });
    return { el: h('div', { class: 'field' }, h('label', { class: 'label', for: id }, label), field.el, error), stepper: field };
  }

  // --- Actions --------------------------------------------------------------------
  function save() {
    const name = nameInput.value.trim();
    const b = base.stepper.value();
    const s = step.stepper.value();
    const hi = happy.stepper.value();
    const lo = sad.stepper.value();
    const invalid = [];
    if (!name) invalid.push(showError(nameInput, nameError, 'Name is required.'));
    if (b === null) invalid.push(showError(base.stepper.input, baseError, `Enter a whole number from 1 to ${LEVEL_XP_MAX}.`));
    if (s === null) invalid.push(showError(step.stepper.input, stepError, `Enter a whole number from 0 to ${LEVEL_XP_MAX}.`));
    if (hi === null) invalid.push(showError(happy.stepper.input, moodError, `Enter a whole number from 0 to ${MISSED_MAX - 1}.`));
    else if (lo === null) invalid.push(showError(sad.stepper.input, moodError, `Enter a whole number from 1 to ${MISSED_MAX}.`));
    else if (lo <= hi) invalid.push(showError(sad.stepper.input, moodError, 'Sad must need more misses than Happy.'));
    if (invalid.length) {
      invalid[0].focus();
      invalid[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const fields = {
      avatar: draft.avatar,
      name,
      leveling: { base: b, step: s },
      mood: { period: draft.period, happyMax: hi, sadMin: lo },
    };
    const character = isNew ? createCharacter(fields) : updateCharacter(existing.id, fields);
    dirty = false;
    toast(isNew ? 'Character created' : 'Character saved');
    ctx.navigate(`#/habits/${encodeURIComponent(character.id)}`, { replace: true });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete character?',
      message: `“${existing.name}” and its habits will be deleted. Your tasks are not affected.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteCharacter(existing.id);
    dirty = false;
    toast('Character deleted');
    ctx.navigate('#/habits', { replace: true });
  }

  return {
    dirtyMessage: 'You have unsaved changes to this character.',
    isDirty: () => dirty,
    discard() {
      dirty = false;
    },
  };
}
