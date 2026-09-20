// ==========================================================================
// LexiQuest AI - Main Application Controller (app.js)
// Production module connecting UI, Engine, Prompt API, Storage, and Audio
// ==========================================================================

import { evaluateGuess, isValidWord, getDailyWord, getRandomWord, WORD_LENGTH, MAX_ATTEMPTS } from './game-engine.js';
import { PromptApiService } from './prompt-api-service.js';
import { StorageManager } from './storage.js';

class LexiQuestApp {
  constructor() {
    this.gameMode = 'daily'; // 'daily' | 'unlimited'
    this.targetWord = '';
    this.dailyNumber = 1;
    this.dailyDateStr = '';
    this.currentRow = 0;
    this.currentGuess = '';
    this.isGameOver = false;
    this.evaluations = [];
    this.guesses = [];
    this.keyboardState = {};
    this.hintCount = 3;

    this.promptService = new PromptApiService();
    this.audioCtx = null;

    this.initElements();
    this.initAudioContext();
    this.initSettings();
    this.setupNewGame();
    this.bindEvents();
    this.initAI();
  }

  // 1. Element Binding
  initElements() {
    this.gridEl = document.getElementById('grid');
    this.toastEl = document.getElementById('toast-message');
    this.modeLabelEl = document.getElementById('current-mode-label');
    this.aiEngineStatusEl = document.getElementById('ai-engine-label');
    this.hintCounterEl = document.getElementById('hint-counter');

    // Modals
    this.oracleModal = document.getElementById('oracle-modal');
    this.vocabModal = document.getElementById('vocab-modal');
    this.helpModal = document.getElementById('help-modal');
    this.statsModal = document.getElementById('stats-modal');

    // Buttons
    this.btnDaily = document.getElementById('btn-mode-daily');
    this.btnUnlimited = document.getElementById('btn-mode-unlimited');
    this.btnNewWord = document.getElementById('btn-new-word');
    this.btnA11y = document.getElementById('btn-toggle-a11y');
    this.btnOracle = document.getElementById('btn-oracle-hint');
    this.btnVocab = document.getElementById('btn-show-card');
    this.btnStats = document.getElementById('btn-stats');
    this.btnHelp = document.getElementById('btn-help');
    this.btnRestart = document.getElementById('btn-settings');
  }

  // 2. Initialize Settings & a11y
  initSettings() {
    const settings = StorageManager.getSettings();
    if (settings.a11yHighContrast) {
      document.documentElement.setAttribute('data-a11y', 'high-contrast');
      this.btnA11y.setAttribute('aria-pressed', 'true');
    }
  }

  // 3. Setup or Restart Game
  setupNewGame() {
    this.currentRow = 0;
    this.currentGuess = '';
    this.isGameOver = false;
    this.evaluations = [];
    this.guesses = [];
    this.keyboardState = {};
    this.hintCount = 3;
    this.updateHintCounter();

    if (this.gameMode === 'daily') {
      const dailyData = getDailyWord();
      this.targetWord = dailyData.word;
      this.dailyNumber = dailyData.puzzleNumber;
      this.dailyDateStr = dailyData.dateStr;
      this.modeLabelEl.textContent = `Daily #${this.dailyNumber}`;
      if (this.btnDaily) this.btnDaily.innerHTML = `<span class="tab-icon">📅</span> Daily #${this.dailyNumber}`;
      this.btnNewWord.classList.add('hidden');

      // Check if daily was already completed today
      const savedDaily = StorageManager.getDailyState(this.dailyDateStr);
      if (savedDaily && savedDaily.completed) {
        this.restoreCompletedDaily(savedDaily);
        return;
      }
    } else {
      this.targetWord = getRandomWord();
      this.modeLabelEl.textContent = 'Unlimited Mode';
      this.btnNewWord.classList.remove('hidden');
    }

    console.log(`[LexiQuest] Started ${this.gameMode} mode. Secret target ready.`);
    this.renderGrid();
    this.resetKeyboardColors();
  }

  // 4. Render Empty 6x5 Grid
  renderGrid() {
    this.gridEl.innerHTML = '';
    for (let r = 0; r < MAX_ATTEMPTS; r++) {
      const row = document.createElement('div');
      row.className = 'grid-row';
      row.dataset.row = r;
      row.setAttribute('role', 'row');

      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile empty';
        tile.dataset.row = r;
        tile.dataset.col = c;
        tile.setAttribute('role', 'gridcell');
        tile.setAttribute('aria-label', `Row ${r + 1} Letter ${c + 1}: Empty`);

        const letter = document.createElement('span');
        letter.className = 'letter';
        const shape = document.createElement('span');
        shape.className = 'a11y-shape';

        tile.appendChild(letter);
        tile.appendChild(shape);
        row.appendChild(tile);
      }
      this.gridEl.appendChild(row);
    }
  }

  // 5. Restore Saved Daily
  restoreCompletedDaily(savedDaily) {
    this.renderGrid();
    savedDaily.guesses.forEach((guess, r) => {
      const evaluation = evaluateGuess(guess, this.targetWord);
      this.guesses.push(guess);
      this.evaluations.push(evaluation);

      const row = this.gridEl.querySelector(`.grid-row[data-row="${r}"]`);
      const tiles = row.querySelectorAll('.tile');

      tiles.forEach((tile, c) => {
        const letter = guess[c];
        const state = evaluation[c];
        tile.className = `tile state-${state}`;
        tile.querySelector('.letter').textContent = letter;
        tile.querySelector('.a11y-shape').textContent = state === 'correct' ? '●' : (state === 'present' ? '▲' : '✕');
        this.updateKeyboardColor(letter, state);
      });
    });

    this.isGameOver = true;
    this.showToast(`Daily #${this.dailyNumber} already finished! View your result.`);
    setTimeout(() => this.openVocabModal(savedDaily.isWin), 600);
  }

  // 6. Bind Events
  bindEvents() {
    // Physical Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toUpperCase();
      if (/^[A-Z]$/.test(key) || key === 'BACKSPACE' || key === 'ENTER') {
        this.handleKey(key);
      } else if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Virtual Keyboard
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        this.handleKey(key);
      });
    });

    // Game Mode Tabs
    this.btnDaily.addEventListener('click', () => {
      if (this.gameMode !== 'daily') {
        this.gameMode = 'daily';
        this.btnDaily.classList.add('active');
        this.btnDaily.setAttribute('aria-selected', 'true');
        this.btnUnlimited.classList.remove('active');
        this.btnUnlimited.setAttribute('aria-selected', 'false');
        this.setupNewGame();
        this.showToast(`Switched to Daily #${this.dailyNumber}`);
      }
    });

    this.btnUnlimited.addEventListener('click', () => {
      if (this.gameMode !== 'unlimited') {
        this.gameMode = 'unlimited';
        this.btnUnlimited.classList.add('active');
        this.btnUnlimited.setAttribute('aria-selected', 'true');
        this.btnDaily.classList.remove('active');
        this.btnDaily.setAttribute('aria-selected', 'false');
        this.setupNewGame();
        this.showToast('Unlimited Practice Mode: New random word!');
      }
    });

    // New Word Button
    this.btnNewWord.addEventListener('click', () => {
      this.setupNewGame();
      this.showToast('Generated a fresh word! 🎲');
    });

    // Restart Button in Header
    this.btnRestart.addEventListener('click', () => {
      this.setupNewGame();
      this.showToast('Game board reset!');
    });

    // a11y High Contrast Button
    this.btnA11y.addEventListener('click', () => {
      const isHigh = document.documentElement.getAttribute('data-a11y') === 'high-contrast';
      const next = isHigh ? 'normal' : 'high-contrast';
      document.documentElement.setAttribute('data-a11y', next);
      this.btnA11y.setAttribute('aria-pressed', (!isHigh).toString());
      StorageManager.saveSettings({ a11yHighContrast: !isHigh });
      this.showToast(isHigh ? 'a11y: Normal Mode' : 'a11y: High Contrast & Shape Mode (WCAG AAA)');
      this.playTone(520, 'triangle', 0.1);
    });

    // AI Oracle Modal Trigger
    this.btnOracle.addEventListener('click', () => {
      this.openOracleModal();
    });

    // AI Oracle Category Tabs
    document.querySelectorAll('.oracle-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.oracle-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        this.fetchClue(tab.dataset.tab);
      });
    });

    document.getElementById('btn-oracle-next').addEventListener('click', () => {
      const tabs = Array.from(document.querySelectorAll('.oracle-tab'));
      const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
      const nextIdx = (activeIdx + 1) % tabs.length;
      tabs[nextIdx].click();
    });

    // Word Info / Vocab Card
    this.btnVocab.addEventListener('click', () => {
      this.openVocabModal(false);
    });

    // Stats Button
    this.btnStats.addEventListener('click', () => {
      this.openStatsModal();
    });

    // Help Button
    this.btnHelp.addEventListener('click', () => {
      this.helpModal.classList.remove('hidden');
    });

    // Modal Close Buttons
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Share Button
    document.getElementById('btn-share-result').addEventListener('click', () => {
      this.shareGridResults();
    });

    // Audio Pronounce
    document.getElementById('btn-audio-pronounce').addEventListener('click', () => {
      this.pronounceWord(this.targetWord);
    });
  }

  // 7. Input Processing
  handleKey(key) {
    if (this.isGameOver) return;

    if (/^[A-Z]$/.test(key)) {
      if (this.currentGuess.length < WORD_LENGTH) {
        this.currentGuess += key;
        this.updateActiveRow();
        this.playTone(320 + this.currentGuess.length * 35, 'sine', 0.05);
      }
    } else if (key === 'BACKSPACE') {
      if (this.currentGuess.length > 0) {
        this.currentGuess = this.currentGuess.slice(0, -1);
        this.updateActiveRow();
        this.playTone(260, 'sine', 0.05);
      }
    } else if (key === 'ENTER') {
      this.submitGuess();
    }
  }

  // 8. Update Active Typing Row
  updateActiveRow() {
    const row = this.gridEl.querySelector(`.grid-row[data-row="${this.currentRow}"]`);
    if (!row) return;

    const tiles = row.querySelectorAll('.tile');
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = tiles[c];
      const char = this.currentGuess[c] || '';
      tile.querySelector('.letter').textContent = char;

      if (char) {
        tile.className = 'tile filled';
        if (c === this.currentGuess.length - 1) {
          tile.classList.add('current-focus');
        } else {
          tile.classList.remove('current-focus');
        }
        tile.setAttribute('aria-label', `Row ${this.currentRow + 1} Letter ${c + 1}: ${char}`);
      } else {
        tile.className = 'tile empty';
        tile.setAttribute('aria-label', `Row ${this.currentRow + 1} Letter ${c + 1}: Empty`);
      }
    }
  }

  // 9. Submit Guess
  submitGuess() {
    if (this.currentGuess.length < WORD_LENGTH) {
      this.shakeActiveRow();
      this.showToast(`Not enough letters (${WORD_LENGTH} required)`);
      this.playTone(160, 'sawtooth', 0.15);
      return;
    }

    if (!isValidWord(this.currentGuess)) {
      this.shakeActiveRow();
      this.showToast('Not in 14,855-word dictionary!');
      this.playTone(180, 'sawtooth', 0.18);
      return;
    }

    const row = this.gridEl.querySelector(`.grid-row[data-row="${this.currentRow}"]`);
    const tiles = row.querySelectorAll('.tile');
    const guess = this.currentGuess;
    const evaluation = evaluateGuess(guess, this.targetWord);

    this.guesses.push(guess);
    this.evaluations.push(evaluation);

    // Staggered Flip
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        const state = evaluation[i];
        const letter = guess[i];
        tile.className = `tile state-${state} flip`;

        const shape = tile.querySelector('.a11y-shape');
        shape.textContent = state === 'correct' ? '●' : (state === 'present' ? '▲' : '✕');
        tile.setAttribute('aria-label', `Letter ${i + 1}: ${letter}, ${state}`);

        this.updateKeyboardColor(letter, state);

        if (state === 'correct') {
          this.playTone(420 + i * 65, 'triangle', 0.12);
        } else if (state === 'present') {
          this.playTone(340 + i * 45, 'sine', 0.09);
        } else {
          this.playTone(220, 'sine', 0.05);
        }
      }, i * 200);
    });

    const isWin = evaluation.every(s => s === 'correct');
    const isLastRow = this.currentRow >= MAX_ATTEMPTS - 1;

    setTimeout(() => {
      if (isWin) {
        this.isGameOver = true;
        this.handleGameCompletion(true);
      } else if (isLastRow) {
        this.isGameOver = true;
        this.handleGameCompletion(false);
      } else {
        this.currentRow++;
        this.currentGuess = '';
      }
    }, WORD_LENGTH * 200 + 120);
  }

  // 10. Win/Loss Handlers
  handleGameCompletion(isWin) {
    if (this.gameMode === 'daily') {
      StorageManager.saveDailyState(this.dailyDateStr, {
        completed: true,
        isWin,
        guesses: this.guesses
      });
    }

    StorageManager.recordGameResult(isWin, this.guesses.length);

    if (isWin) {
      this.showToast('🎉 SPLENDID! You found the word!');
      this.playFanfare();
      setTimeout(() => this.openVocabModal(true), 1100);
    } else {
      this.showToast(`Game Over! The word was ${this.targetWord}`);
      this.playTone(160, 'sawtooth', 0.4);
      setTimeout(() => this.openVocabModal(false), 1300);
    }
  }

  // 11. Virtual Keyboard State
  updateKeyboardColor(letter, newState) {
    const key = document.querySelector(`.key-btn[data-key="${letter}"]`);
    if (!key) return;

    const current = this.keyboardState[letter];
    if (current === 'correct') return;
    if (current === 'present' && newState === 'absent') return;

    this.keyboardState[letter] = newState;
    key.classList.remove('state-correct', 'state-present', 'state-absent');
    key.classList.add(`state-${newState}`);
  }

  resetKeyboardColors() {
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.classList.remove('state-correct', 'state-present', 'state-absent');
    });
  }

  // 12. AI Prompt Service Integration
  async initAI() {
    await this.promptService.init();
    this.aiEngineStatusEl.innerHTML = this.promptService.statusText;
    const modelTag = document.getElementById('meta-model-tag');
    if (modelTag) {
      modelTag.textContent = this.promptService.isAvailable ? 'Model: Chrome Gemini Nano (Prompt API)' : 'Engine: 14,855-Word Algorithmic Fallback';
    }
  }

  openOracleModal() {
    this.oracleModal.classList.remove('hidden');
    this.btnOracle.setAttribute('aria-expanded', 'true');
    const activeTab = document.querySelector('.oracle-tab.active');
    this.fetchClue(activeTab ? activeTab.dataset.tab : 'riddle');
  }

  async fetchClue(category) {
    const quoteBox = document.getElementById('hint-quote-text');
    const transBox = document.getElementById('hint-translation-text');
    const transTag = document.getElementById('meta-trans-tag');

    quoteBox.textContent = 'Generating on-device clue with Chrome Built-in AI...';
    if (transBox) transBox.textContent = '日本語に翻訳中...';

    // 1. Fetch English Clue via Prompt API
    const result = await this.promptService.getHint(category, this.targetWord);
    quoteBox.textContent = result.clue;
    this.playTone(560, 'sine', 0.08);

    // 2. Fetch Japanese Translation via Translator API / Prompt API
    if (transBox) {
      const transResult = await this.promptService.translateToJapanese(result.clue);
      transBox.textContent = transResult.jaText;
      if (transTag) transTag.textContent = `Translator: ${transResult.engine}`;
    }

    if (this.hintCount > 0) {
      this.hintCount--;
      this.updateHintCounter();
    }
  }

  updateHintCounter() {
    if (this.hintCounterEl) {
      this.hintCounterEl.textContent = `${this.hintCount} left`;
    }
  }

  // 13. Post-Game Vocab Card
  async openVocabModal(isWin = true) {
    this.vocabModal.classList.remove('hidden');
    const titleEl = document.getElementById('vocab-title');
    const verdictEl = document.getElementById('game-verdict-label');
    const emojiEl = document.getElementById('game-status-emoji');

    titleEl.textContent = this.targetWord;
    if (isWin) {
      verdictEl.textContent = `SPLENDID! (${this.guesses.length}/${MAX_ATTEMPTS})`;
      verdictEl.style.color = 'var(--color-correct)';
      emojiEl.textContent = '🎉';
    } else {
      verdictEl.textContent = `NICE EFFORT!`;
      verdictEl.style.color = 'var(--color-present)';
      emojiEl.textContent = '💡';
    }

    const vocabData = await this.promptService.getVocabCard(this.targetWord);
    document.getElementById('vocab-phonetic').textContent = vocabData.phonetic;
    document.getElementById('vocab-pos').textContent = vocabData.pos;
    document.getElementById('vocab-definition').textContent = vocabData.definition;
    document.getElementById('vocab-example').innerHTML = `"${vocabData.example}"`;
    document.getElementById('vocab-trivia').textContent = vocabData.trivia;

    this.renderShareGrid();
  }

  renderShareGrid() {
    const container = document.getElementById('share-grid-text');
    container.innerHTML = '';
    this.evaluations.forEach(row => {
      const line = row.map(s => s === 'correct' ? '🟩' : (s === 'present' ? '🟨' : '⬛')).join('');
      const div = document.createElement('div');
      div.textContent = line;
      container.appendChild(div);
    });
  }

  shareGridResults() {
    const lines = this.evaluations.map(row => {
      return row.map(s => s === 'correct' ? '🟩' : (s === 'present' ? '🟨' : '⬛')).join('');
    });
    const header = `LexiQuest AI (${this.gameMode === 'daily' ? `Daily #${this.dailyNumber}` : 'Unlimited'}) ${this.guesses.length}/${MAX_ATTEMPTS}`;
    const text = `${header}\n\n${lines.join('\n')}\n\nPlay: http://localhost:4567`;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Result copied to clipboard! 📋');
      this.playTone(880, 'triangle', 0.2);
    }).catch(() => {
      this.showToast('Copied grid!');
    });
  }

  // 14. Stats Modal
  openStatsModal() {
    const stats = StorageManager.getStats();
    const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;

    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-winrate').textContent = `${winRate}%`;
    document.getElementById('stat-streak').textContent = stats.currentStreak;
    document.getElementById('stat-maxstreak').textContent = stats.maxStreak;

    // Render distribution bars
    const distContainer = document.getElementById('guess-distribution');
    if (distContainer) {
      distContainer.innerHTML = '';
      const maxGuesses = Math.max(1, ...Object.values(stats.guessDistribution));

      for (let i = 1; i <= 6; i++) {
        const count = stats.guessDistribution[i] || 0;
        const pct = Math.round((count / maxGuesses) * 100);

        const row = document.createElement('div');
        row.className = 'dist-row';
        row.innerHTML = `
          <span class="dist-label">${i}</span>
          <div class="dist-bar-wrapper">
            <div class="dist-bar" style="width: ${Math.max(8, pct)}%;">${count}</div>
          </div>
        `;
        distContainer.appendChild(row);
      }
    }

    this.statsModal.classList.remove('hidden');
  }

  // 15. UI Helpers
  shakeActiveRow() {
    const row = this.gridEl.querySelector(`.grid-row[data-row="${this.currentRow}"]`);
    if (row) {
      row.classList.add('shake');
      setTimeout(() => row.classList.remove('shake'), 520);
    }
  }

  showToast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 2400);
  }

  closeAllModals() {
    this.oracleModal.classList.add('hidden');
    this.vocabModal.classList.add('hidden');
    this.helpModal.classList.add('hidden');
    this.statsModal.classList.add('hidden');
    this.btnOracle.setAttribute('aria-expanded', 'false');
  }

  pronounceWord(word) {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(word.toLowerCase());
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
      this.showToast(`🔊 /${word.toLowerCase()}/`);
    } else {
      this.playTone(523, 'sine', 0.25);
    }
  }

  initAudioContext() {
    // Initialized on first user gesture
  }

  playTone(freq, type = 'sine', duration = 0.1) {
    try {
      if (!this.audioCtx) {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (AudioClass) this.audioCtx = new AudioClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playFanfare() {
    [440, 554, 659, 880].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.2), idx * 120);
    });
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LexiQuestApp();
});
