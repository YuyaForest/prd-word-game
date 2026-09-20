// ==========================================================================
// LexiQuest AI - Chrome Built-in AI Prompt API Service (prompt-api-service.js)
// Integrates Gemini Nano on-device LLM with graceful algorithmic fallback
// ==========================================================================

import { TARGET_WORDS, SAMPLE_DEFINITIONS } from './words.js';

export class PromptApiService {
  constructor() {
    this.session = null;
    this.isAvailable = false;
    this.statusText = 'Checking Chrome Built-in AI...';
    this.downloadProgress = 0;
  }

  /**
   * Initializes the Prompt API session if supported on the browser.
   * @returns {Promise<boolean>}
   */
  async init() {
    if (typeof window === 'undefined') return false;

    // Check for window.ai.languageModel or global LanguageModel
    const aiApi = window.ai?.languageModel || (typeof LanguageModel !== 'undefined' ? LanguageModel : null);
    if (!aiApi) {
      this.statusText = 'Dictionary Fallback (Chrome Prompt API not present)';
      this.isAvailable = false;
      return false;
    }

    try {
      const availability = await (aiApi.availability ? aiApi.availability() : (aiApi.capabilities ? (await aiApi.capabilities()).available : 'unavailable'));
      
      if (availability === 'unavailable') {
        this.statusText = 'Dictionary Fallback (Model unavailable)';
        this.isAvailable = false;
        return false;
      }

      this.statusText = 'Initializing Gemini Nano...';

      const createOptions = {
        systemPrompt: "You are the LexiQuest Oracle, a cheerful, cryptic word puzzle master. You know the secret 5-letter English word. You must NEVER reveal or repeat the word directly or mention its exact root. Keep your hints concise, vivid, and under 25 words.",
        temperature: 0.7,
        topK: 3
      };

      // Add monitor if downloading
      if (availability === 'downloadable' || availability === 'downloading') {
        createOptions.monitor = (m) => {
          m.addEventListener('downloadprogress', (e) => {
            this.downloadProgress = Math.round((e.loaded / e.total) * 100);
            this.statusText = `Gemini Nano downloading: ${this.downloadProgress}%`;
            console.log(`[Prompt API] Download progress: ${this.downloadProgress}%`);
          });
        };
      }

      this.session = await aiApi.create(createOptions);
      this.isAvailable = true;
      this.statusText = 'Chrome Gemini Nano: Ready (0ms latency, On-Device)';
      console.log('[Prompt API] Successfully initialized Gemini Nano session');
      return true;
    } catch (err) {
      console.warn('[Prompt API] Failed to initialize Gemini Nano session:', err);
      this.statusText = 'Dictionary Fallback (Prompt API error)';
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Generates a dynamic hint for the secret word.
   * @param {'riddle' | 'rhyme' | 'context'} category
   * @param {string} targetWord
   * @returns {Promise<{ clue: string, source: 'ai' | 'fallback' }>}
   */
  async getHint(category, targetWord) {
    // 1. Try Chrome Built-in AI
    if (this.isAvailable && this.session) {
      try {
        let prompt = "";
        if (category === 'riddle') {
          prompt = `Provide a short, clever 1-sentence riddle describing the concept of the 5-letter word "${targetWord}". Never write the word.`;
        } else if (category === 'rhyme') {
          prompt = `List 3 common everyday English words that rhyme with "${targetWord}". Return only the rhyming words separated by commas.`;
        } else {
          prompt = `State the part of speech and provide a natural sample sentence with a blank [_____] where "${targetWord}" fits. Do not mention the word.`;
        }

        const aiResponse = await this.session.prompt(prompt);
        if (aiResponse && aiResponse.trim().length > 0) {
          return { clue: aiResponse.trim(), source: 'ai' };
        }
      } catch (err) {
        console.warn('[Prompt API] Prompt error, falling back to algorithmic clue:', err);
      }
    }

    // 2. High-Quality Algorithmic Fallback
    const fallbackClue = this.generateAlgorithmicFallback(category, targetWord);
    return { clue: fallbackClue, source: 'fallback' };
  }

  /**
   * Translates English hint text into Japanese using Chrome Built-in Translator API
   * or Gemini Nano Prompt API on-device translation.
   * @param {string} englishText
   * @returns {Promise<{ jaText: string, engine: string }>}
   */
  async translateToJapanese(englishText) {
    if (!englishText) return { jaText: '', engine: 'none' };

    // 1. Try Chrome Built-in Translator API (window.Translator or window.ai.translator or window.translation)
    try {
      const translatorApi = window.Translator || window.ai?.translator || window.translation;
      if (translatorApi) {
        let translatorInstance = null;
        if (typeof translatorApi.create === 'function') {
          translatorInstance = await translatorApi.create({ sourceLanguage: 'en', targetLanguage: 'ja' });
        } else if (typeof translatorApi.createTranslator === 'function') {
          translatorInstance = await translatorApi.createTranslator({ sourceLanguage: 'en', targetLanguage: 'ja' });
        }
        if (translatorInstance && typeof translatorInstance.translate === 'function') {
          const res = await translatorInstance.translate(englishText);
          if (res && res.trim()) {
            return { jaText: res.trim(), engine: 'Chrome Translator API (On-Device)' };
          }
        }
      }
    } catch (e) {
      console.warn('[Translator API] Native Translator API call failed:', e);
    }

    // 2. Try Chrome Gemini Nano Prompt API translation
    if (this.isAvailable && this.session) {
      try {
        const transPrompt = `Translate the following English puzzle hint into natural Japanese for a word game player. Keep any fill-in blanks like [_____] or ______ exactly intact. Output ONLY the Japanese translation without quotes:
${englishText}`;
        const aiTrans = await this.session.prompt(transPrompt);
        if (aiTrans && aiTrans.trim()) {
          return { jaText: aiTrans.trim().replace(/^"|"$/g, ''), engine: 'Chrome Gemini Nano (Prompt API)' };
        }
      } catch (err) {
        console.warn('[Prompt API] AI translation failed:', err);
      }
    }

    // 3. Fallback: Linguistic Japanese translation helper
    return {
      jaText: this.formatJapaneseFallback(englishText),
      engine: 'Linguistic Helper'
    };
  }

  /**
   * Generates helpful Japanese explanation for fallback hints
   */
  formatJapaneseFallback(text) {
    if (text.includes('Part of speech:')) {
      return text
        .replace(/Part of speech:\s*([^.]+)\./i, '【品詞】$1。')
        .replace(/First letter is located in the first half \(A-M\) of the alphabet\./i, '最初の文字はアルファベットの前半（A〜M）にあります。')
        .replace(/First letter is located in the second half \(N-Z\) of the alphabet\./i, '最初の文字はアルファベットの後半（N〜Z）にあります。');
    }
    if (text.includes('I rhyme with:')) {
      return text.replace(/I rhyme with:\s*([^!]+)!/i, '【押韻】以下の単語と同じ語尾（韻）を持ちます: $1');
    }
    if (text.includes('I am a 5-letter word starting with')) {
      return text
        .replace(/I am a 5-letter word starting with '([^']+)' and ending with '([^']+)'. I contain (\d+) vowels? \(([^)]+)\)\./i,
          '【文字ヒント】「$1」で始まり「$2」で終わる5文字の単語です。母音は $3 個（$4）含まれています。');
    }
    return `日本語解説: ${text}`;
  }

  /**
   * Algorithmic & Dictionary Fallback generator
   */
  generateAlgorithmicFallback(category, targetWord) {
    const word = targetWord.toUpperCase();
    const first = word[0];
    const last = word[4];
    const vowels = word.split('').filter(c => 'AEIOU'.includes(c));
    const uniqueVowels = [...new Set(vowels)];

    if (category === 'riddle') {
      if (SAMPLE_DEFINITIONS[word]) {
        return `"${SAMPLE_DEFINITIONS[word].definition} (Starts with '${first}', ends with '${last}')"`;
      }
      return `"I am a 5-letter word starting with '${first}' and ending with '${last}'. I contain ${vowels.length} vowel${vowels.length > 1 ? 's' : ''} (${uniqueVowels.join(', ')})."`;
    }

    if (category === 'rhyme') {
      const suffix = word.slice(2); // last 3 letters
      const rhymingWords = TARGET_WORDS.filter(w => w !== word && w.endsWith(suffix)).slice(0, 4);
      if (rhymingWords.length > 0) {
        return `"I rhyme with: ${rhymingWords.join(', ')}!"`;
      }
      return `"I end with the sound pattern '-${suffix}'. Look for matching letter blends!"`;
    }

    // Context fallback
    const pos = SAMPLE_DEFINITIONS[word]?.pos || (vowels.length >= 2 ? 'noun or verb' : 'adjective or noun');
    const half = first <= 'M' ? 'first half (A-M)' : 'second half (N-Z)';
    return `"Part of speech: ${pos}. First letter is located in the ${half} of the alphabet."`;
  }

  /**
   * Generates or retrieves post-game vocabulary learning card data
   * @param {string} targetWord
   * @returns {Promise<{phonetic: string, pos: string, definition: string, example: string, trivia: string, source: string}>}
   */
  async getVocabCard(targetWord) {
    const word = targetWord.toUpperCase();

    // 1. Check curated sample definitions
    if (SAMPLE_DEFINITIONS[word]) {
      return { ...SAMPLE_DEFINITIONS[word], source: 'Curated Dictionary' };
    }

    // 2. Try Chrome Built-in AI
    if (this.isAvailable && this.session) {
      try {
        const prompt = `For the English word "${word}", output a single JSON object with these exact keys:
"definition": 1 concise sentence explaining its meaning,
"pos": part of speech,
"example": 1 realistic sentence using the word,
"trivia": 1 interesting etymology or historical fact.
Do not output markdown, only valid JSON.`;

        const res = await this.session.prompt(prompt);
        const cleaned = res.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          phonetic: `/${word.toLowerCase()}/`,
          pos: parsed.pos || 'noun / verb',
          definition: parsed.definition || 'A recognized English vocabulary term.',
          example: parsed.example || `The term ${word.toLowerCase()} is frequently encountered in everyday prose.`,
          trivia: parsed.trivia || 'Derived from ancient classical roots.',
          source: 'Gemini Nano (Prompt API)'
        };
      } catch (err) {
        console.warn('[Prompt API] Vocab card generation failed, using standard fallback:', err);
      }
    }

    // 3. Dynamic Linguistic Fallback
    return {
      phonetic: `/${word.toLowerCase()}/`,
      pos: "common 5-letter English word",
      definition: `A classic English word formed from high-frequency Latin and Germanic linguistic roots.`,
      example: `Recognizing words like "${word.toLowerCase()}" is key to expanding advanced English vocabulary.`,
      trivia: `Consists of ${word.length} letters, appearing regularly across international literature and lexicon tests.`,
      source: 'Dictionary Engine'
    };
  }

  destroy() {
    if (this.session) {
      try {
        this.session.destroy();
      } catch (e) {}
      this.session = null;
    }
  }
}
