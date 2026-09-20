// ==========================================================================
// LexiQuest AI - LocalStorage Manager (storage.js)
// Manages game stats, streaks, guess distribution, and daily state persistence
// ==========================================================================

const STATS_KEY = 'lexiquest_stats';
const SETTINGS_KEY = 'lexiquest_settings';

const DEFAULT_STATS = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0
  }
};

const DEFAULT_SETTINGS = {
  a11yHighContrast: false,
  soundEnabled: true
};

export class StorageManager {
  static getStats() {
    try {
      const data = localStorage.getItem(STATS_KEY);
      if (!data) return { ...DEFAULT_STATS };
      return { ...DEFAULT_STATS, ...JSON.parse(data) };
    } catch (e) {
      console.warn('[Storage] Failed to read stats from localStorage:', e);
      return { ...DEFAULT_STATS };
    }
  }

  static recordGameResult(isWin, attempts) {
    const stats = this.getStats();
    stats.played += 1;

    if (isWin) {
      stats.wins += 1;
      stats.currentStreak += 1;
      if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
      }
      if (attempts >= 1 && attempts <= 6) {
        stats.guessDistribution[attempts] = (stats.guessDistribution[attempts] || 0) + 1;
      }
    } else {
      stats.currentStreak = 0;
    }

    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('[Storage] Failed to save stats:', e);
    }
    return stats;
  }

  static getDailyState(dateStr) {
    try {
      const key = `lexiquest_daily_${dateStr}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  static saveDailyState(dateStr, state) {
    try {
      const key = `lexiquest_daily_${dateStr}`;
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn('[Storage] Failed to save daily state:', e);
    }
  }

  static getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (!data) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  static saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }
}
