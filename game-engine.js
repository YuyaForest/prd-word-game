// ==========================================================================
// LexiQuest AI - Core Game Engine (game-engine.js)
// Pure logic: Two-pass letter evaluation, daily date seed, dictionary check
// ==========================================================================

import { TARGET_WORDS, VALID_WORDS } from './words.js';

export const WORD_LENGTH = 5;
export const MAX_ATTEMPTS = 6;

/**
 * Evaluates a 5-letter guess against the target word using a two-pass algorithm
 * to correctly handle duplicate letters (Wordle standard).
 * 
 * @param {string} guess - The uppercase 5-letter guess
 * @param {string} target - The uppercase 5-letter target word
 * @returns {Array<'correct' | 'present' | 'absent'>} Evaluation for each letter position
 */
export function evaluateGuess(guess, target) {
  if (!guess || !target || guess.length !== WORD_LENGTH || target.length !== WORD_LENGTH) {
    throw new Error(`Both guess and target must be exactly ${WORD_LENGTH} letters.`);
  }

  const result = Array(WORD_LENGTH).fill('absent');
  const targetCounts = {};

  // Count frequencies of each character in target
  for (let i = 0; i < WORD_LENGTH; i++) {
    const char = target[i];
    targetCounts[char] = (targetCounts[char] || 0) + 1;
  }

  // Pass 1: Mark exact matches (correct / green) first
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      targetCounts[guess[i]]--;
    }
  }

  // Pass 2: Mark misplaced matches (present / yellow) from remaining counts
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] !== 'correct' && targetCounts[guess[i]] > 0) {
      result[i] = 'present';
      targetCounts[guess[i]]--;
    }
  }

  return result;
}

/**
 * Checks if a word is valid in the 14,855-word dictionary
 * @param {string} word - The uppercase word to check
 * @returns {boolean}
 */
export function isValidWord(word) {
  if (!word || word.length !== WORD_LENGTH) return false;
  return VALID_WORDS.has(word.toUpperCase());
}

/**
 * Generates a deterministic daily word and puzzle number from a date.
 * @param {Date} [date=new Date()]
 * @returns {{ word: string, puzzleNumber: number, dateStr: string }}
 */
export function getDailyWord(date = new Date()) {
  const dateStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }

  const wordIndex = hash % TARGET_WORDS.length;
  // Calculate puzzle days since epoch reference (e.g. 2026-01-01)
  const baseEpoch = new Date(2026, 0, 1).getTime();
  const dayDiff = Math.max(1, Math.floor((date.getTime() - baseEpoch) / (1000 * 60 * 60 * 24)) + 1);

  return {
    word: TARGET_WORDS[wordIndex],
    puzzleNumber: dayDiff,
    dateStr
  };
}

/**
 * Returns a random target word for unlimited practice mode.
 * @returns {string}
 */
export function getRandomWord() {
  const idx = Math.floor(Math.random() * TARGET_WORDS.length);
  return TARGET_WORDS[idx];
}
