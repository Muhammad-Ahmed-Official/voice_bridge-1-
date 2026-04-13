import { logger } from '../config/logger.js';

const LANG_MAP = {
  UR: 'ur',
  EN: 'en',
  AR: 'ar',
  'ur-PK': 'ur',
  'en-US': 'en',
  'ar-SA': 'ar',
  ur: 'ur',
  en: 'en',
  ar: 'ar',
};

const MYMEMORY_BASE_URL = 'https://api.mymemory.translated.net/get';

/**
 * Translate text using MyMemory Translation API (free, no authentication required)
 * @param {string} text - Text to translate
 * @param {string} fromCode - Source language code (UR, EN, AR, ur-PK, en-US, ar-SA, etc.)
 * @param {string} toCode - Target language code
 * @returns {Promise<{text: string, success: boolean}>} Translated text and success flag
 */
export async function translateText(text, fromCode, toCode) {
  if (!text || !text.trim()) {
    return { text, success: true };
  }

  const normalizedFrom = (fromCode ?? '').toString().trim();
  const normalizedTo = (toCode ?? '').toString().trim();

  const from = normalizedFrom && normalizedFrom.toLowerCase() !== 'auto'
    ? (LANG_MAP[normalizedFrom] ?? normalizedFrom.toLowerCase())
    : null;
  const to = LANG_MAP[normalizedTo] ?? normalizedTo.toLowerCase();

  if (!to) {
    logger.error('Translate', 'Missing/invalid target language:', toCode);
    return { text, success: false };
  }

  // If same language, skip translation
  if (from === to) {
    logger.info('Translate', `Same language (${from}), skipping translation`);
    return { text, success: true };
  }

  try {
    // Build language pair string (e.g., "ur|en" or "en|ur")
    const langPair = from ? `${from}|${to}` : `auto|${to}`;

    // Build query URL
    let url = `${MYMEMORY_BASE_URL}?q=${encodeURIComponent(text)}&langpair=${langPair}`;

    // Optionally add email for higher quota (50k chars/day instead of 10k)
    const email = process.env.MYMEMORY_EMAIL;
    if (email) {
      url += `&de=${encodeURIComponent(email)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    // MyMemory returns 200 for successful requests, with responseStatus indicating translation status
    if (data.responseStatus === 200) {
      const translation = data.responseData?.translatedText ?? '';
      logger.info('Translate', `MyMemory: "${text}" (${fromCode}) → "${translation}" (${toCode})`);
      return { text: translation, success: true };
    }

    // responseStatus 400-599 indicates an error
    logger.error('Translate', `MyMemory error (${data.responseStatus}): ${data.responseDetails}`);
    return { text, success: false };
  } catch (err) {
    logger.error('Translate', `Failed: ${err.message}`);
    return { text, success: false };
  }
}
