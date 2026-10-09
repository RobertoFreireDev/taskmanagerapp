/*
 * Journal moods: 32 emotions and 8 energy levels. Pure data and markup
 * strings, no DOM, so the store and the tests can import it.
 *
 * Emotions are emoji drawn by the phone's own emoji font: no assets, works
 * offline. Only Unicode 11 or older, with no ZWJ sequences or variation
 * selectors, so older phones never show empty boxes.
 */

import { svg } from './icons.js';

export const MAX_EMOTIONS = 3;

/** Picker order: positive, then neutral, then negative. */
export const EMOTIONS = {
  happy: { label: 'Happy', emoji: '😊' },
  grateful: { label: 'Grateful', emoji: '🙏' },
  calm: { label: 'Calm', emoji: '😌' },
  excited: { label: 'Excited', emoji: '🤩' },
  loved: { label: 'Loved', emoji: '🥰' },
  proud: { label: 'Proud', emoji: '🏆' },
  motivated: { label: 'Motivated', emoji: '💪' },
  confident: { label: 'Confident', emoji: '😎' },
  relaxed: { label: 'Relaxed', emoji: '🧘' },
  hopeful: { label: 'Hopeful', emoji: '🌈' },
  inspired: { label: 'Inspired', emoji: '💡' },
  focused: { label: 'Focused', emoji: '🎯' },

  neutral: { label: 'Neutral', emoji: '😐' },
  surprised: { label: 'Surprised', emoji: '😮' },
  confused: { label: 'Confused', emoji: '😕' },
  thoughtful: { label: 'Thoughtful', emoji: '🤔' },
  bored: { label: 'Bored', emoji: '😑' },

  sad: { label: 'Sad', emoji: '😢' },
  tired: { label: 'Tired', emoji: '😴' },
  anxious: { label: 'Anxious', emoji: '😰' },
  burnout: { label: 'Burned out', emoji: '😵' },
  stressed: { label: 'Stressed', emoji: '😫' },
  angry: { label: 'Angry', emoji: '😠' },
  frustrated: { label: 'Frustrated', emoji: '😤' },
  lonely: { label: 'Lonely', emoji: '😔' },
  overwhelmed: { label: 'Overwhelmed', emoji: '🤯' },
  scared: { label: 'Scared', emoji: '😨' },
  sick: { label: 'Sick', emoji: '🤒' },
  disappointed: { label: 'Disappointed', emoji: '😞' },
  guilty: { label: 'Guilty', emoji: '😬' },
  insecure: { label: 'Insecure', emoji: '🥺' },
  hurt: { label: 'Hurt', emoji: '💔' },
};

/** Energy in percent: eight even steps from empty to full. */
export const ENERGY_LEVELS = [0, 14, 29, 43, 57, 71, 86, 100];

export function isEmotionKey(key) {
  return typeof key === 'string' && Object.hasOwn(EMOTIONS, key);
}

export function isEnergyLevel(value) {
  return ENERGY_LEVELS.includes(value);
}

export function emotionLabel(key) {
  return isEmotionKey(key) ? EMOTIONS[key].label : '';
}

export function emotionEmoji(key) {
  return isEmotionKey(key) ? EMOTIONS[key].emoji : '';
}

export function energyLabel(level) {
  return `${level}%`;
}

/** Color family for a level: danger, warning, accent or success. */
export function energyTone(level) {
  const step = Math.max(0, ENERGY_LEVELS.indexOf(level));
  if (step <= 1) return 'danger';
  if (step <= 3) return 'warning';
  if (step <= 5) return 'accent';
  return 'success';
}

/** A battery whose charge shows the level: one bar per step, none when empty. */
export function renderEnergy(level) {
  const step = Math.max(0, ENERGY_LEVELS.indexOf(level));
  const width = Math.round((12 * step * 100) / (ENERGY_LEVELS.length - 1)) / 100;
  const charge = step ? `<rect x="4.5" y="9.5" width="${width}" height="5" rx="0.5" fill="currentColor" stroke="none"/>` : '';
  return svg(`<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/>${charge}`);
}
