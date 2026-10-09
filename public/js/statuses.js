/*
 * Habit characters: 6 avatars and 64 statuses. Pure data, no DOM, so the
 * store and the tests can import it.
 *
 * Like the journal emotions, these are emoji drawn by the phone's own emoji
 * font: no assets, works offline. Each is a single code point with default
 * emoji presentation from Unicode 11 or older (no ZWJ sequences, no variation
 * selectors), so older phones never show empty boxes.
 */

export const DEFAULT_AVATAR = 'kid';

/** Picker order. */
export const AVATARS = {
  kid: { label: 'Kid', emoji: '🧒' },
  woman: { label: 'Woman', emoji: '👩' },
  man: { label: 'Man', emoji: '👨' },
  cat: { label: 'Cat', emoji: '🐱' },
  dog: { label: 'Dog', emoji: '🐶' },
  bird: { label: 'Bird', emoji: '🐦' },
};

/** Status groups, in picker order. */
export const STATUS_GROUPS = {
  mood: 'Mood',
  mind: 'Mind',
  body: 'Body',
  energy: 'Energy & sleep',
  food: 'Food & care',
  work: 'Work & study',
  money: 'Money',
  life: 'Life',
};

/** Picker order, eight per group. */
export const STATUSES = {
  happy: { label: 'Happy', emoji: '😊', group: 'mood' },
  normal: { label: 'Normal', emoji: '😐', group: 'mood' },
  sad: { label: 'Sad', emoji: '😢', group: 'mood' },
  calm: { label: 'Calm', emoji: '😌', group: 'mood' },
  excited: { label: 'Excited', emoji: '🤩', group: 'mood' },
  angry: { label: 'Angry', emoji: '😠', group: 'mood' },
  bored: { label: 'Bored', emoji: '😑', group: 'mood' },
  playful: { label: 'Playful', emoji: '🧸', group: 'mood' },

  stressed: { label: 'Stressed', emoji: '😫', group: 'mind' },
  overwhelmed: { label: 'Overwhelmed', emoji: '🤯', group: 'mind' },
  anxious: { label: 'Anxious', emoji: '😰', group: 'mind' },
  confused: { label: 'Confused', emoji: '😕', group: 'mind' },
  lonely: { label: 'Lonely', emoji: '😔', group: 'mind' },
  loved: { label: 'Loved', emoji: '🥰', group: 'mind' },
  grumpy: { label: 'Grumpy', emoji: '😤', group: 'mind' },
  heartbroken: { label: 'Heartbroken', emoji: '💔', group: 'mind' },

  strong: { label: 'Strong', emoji: '💪', group: 'body' },
  weak: { label: 'Weak', emoji: '🥀', group: 'body' },
  fit: { label: 'Fit', emoji: '🏃', group: 'body' },
  lazy: { label: 'Lazy', emoji: '🐌', group: 'body' },
  sick: { label: 'Sick', emoji: '🤒', group: 'body' },
  injured: { label: 'Injured', emoji: '🤕', group: 'body' },
  sore: { label: 'Sore', emoji: '🦵', group: 'body' },
  queasy: { label: 'Queasy', emoji: '🤢', group: 'body' },

  sleepy: { label: 'Sleepy', emoji: '😪', group: 'energy' },
  tired: { label: 'Tired', emoji: '😩', group: 'energy' },
  exhausted: { label: 'Exhausted', emoji: '😵', group: 'energy' },
  rested: { label: 'Rested', emoji: '🛌', group: 'energy' },
  asleep: { label: 'Asleep', emoji: '💤', group: 'energy' },
  energetic: { label: 'Energetic', emoji: '⚡', group: 'energy' },
  charged: { label: 'Charged', emoji: '🔋', group: 'energy' },
  caffeinated: { label: 'Caffeinated', emoji: '☕', group: 'energy' },

  hungry: { label: 'Hungry', emoji: '🤤', group: 'food' },
  fed: { label: 'Well fed', emoji: '😋', group: 'food' },
  thirsty: { label: 'Thirsty', emoji: '🌵', group: 'food' },
  hydrated: { label: 'Hydrated', emoji: '💧', group: 'food' },
  junkFood: { label: 'Junk food', emoji: '🍔', group: 'food' },
  eatingWell: { label: 'Eating well', emoji: '🥗', group: 'food' },
  healthy: { label: 'Healthy', emoji: '🍎', group: 'food' },
  clean: { label: 'Clean', emoji: '🧼', group: 'food' },

  busy: { label: 'Busy', emoji: '🐝', group: 'work' },
  free: { label: 'Free', emoji: '🎈', group: 'work' },
  productive: { label: 'Productive', emoji: '✅', group: 'work' },
  procrastinating: { label: 'Putting off', emoji: '⏳', group: 'work' }, // "Procrastinating" won't fit the picker at 360 px
  focused: { label: 'Focused', emoji: '🎯', group: 'work' },
  studying: { label: 'Studying', emoji: '📚', group: 'work' },
  smart: { label: 'Smart', emoji: '🧠', group: 'work' },
  creative: { label: 'Creative', emoji: '🎨', group: 'work' },

  rich: { label: 'Rich', emoji: '💰', group: 'money' },
  poor: { label: 'Poor', emoji: '💸', group: 'money' },
  saving: { label: 'Saving', emoji: '🐷', group: 'money' },
  inDebt: { label: 'In debt', emoji: '📉', group: 'money' },
  investing: { label: 'Investing', emoji: '📈', group: 'money' },
  generous: { label: 'Generous', emoji: '🎁', group: 'money' },
  billsPaid: { label: 'Bills paid', emoji: '💳', group: 'money' },
  budgeting: { label: 'Budgeting', emoji: '🧾', group: 'money' },

  motivated: { label: 'Motivated', emoji: '🔥', group: 'life' },
  confident: { label: 'Confident', emoji: '😎', group: 'life' },
  proud: { label: 'Proud', emoji: '🏆', group: 'life' },
  inspired: { label: 'Inspired', emoji: '💡', group: 'life' },
  grateful: { label: 'Grateful', emoji: '🙏', group: 'life' },
  relaxed: { label: 'Relaxed', emoji: '🧘', group: 'life' },
  social: { label: 'Social', emoji: '🎉', group: 'life' },
  lucky: { label: 'Lucky', emoji: '🍀', group: 'life' },
};

export function isAvatarKey(key) {
  return typeof key === 'string' && Object.hasOwn(AVATARS, key);
}

export function isStatusKey(key) {
  return typeof key === 'string' && Object.hasOwn(STATUSES, key);
}

export function avatarEmoji(key) {
  return AVATARS[isAvatarKey(key) ? key : DEFAULT_AVATAR].emoji;
}

export function avatarLabel(key) {
  return AVATARS[isAvatarKey(key) ? key : DEFAULT_AVATAR].label;
}

export function statusEmoji(key) {
  return isStatusKey(key) ? STATUSES[key].emoji : '';
}

export function statusLabel(key) {
  return isStatusKey(key) ? STATUSES[key].label : '';
}

/** Statuses split by group, in picker order: [{ key, label, statuses: [key] }]. */
export function statusesByGroup() {
  return Object.entries(STATUS_GROUPS).map(([key, label]) => ({
    key,
    label,
    statuses: Object.keys(STATUSES).filter((s) => STATUSES[s].group === key),
  }));
}
