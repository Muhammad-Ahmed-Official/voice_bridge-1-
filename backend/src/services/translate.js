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

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

/**
 * Translate text using Google Cloud Translation API v2 (Basic).
 * Requires GOOGLE_API_KEY_TRANSLATION env variable.
 *
 * @param {string} text - Text to translate
 * @param {string} fromCode - Source language code (UR, EN, AR, ur-PK, en-US, ar-SA, etc.) or 'auto'
 * @param {string} toCode - Target language code
 * @returns {Promise<{text: string, success: boolean}>} Translated text and success flag
 */
export async function translateText(text, fromCode, toCode) {
  if (!text || !text.trim()) {
    return { text, success: true };
  }

  const apiKey = process.env.GOOGLE_API_KEY_TRANSLATION;
  if (!apiKey) {
    logger.error('Translate', 'GOOGLE_API_KEY_TRANSLATION is not set');
    return { text, success: false };
  }

  const normalizedFrom = (fromCode ?? '').toString().trim();
  const normalizedTo   = (toCode   ?? '').toString().trim();

  const from = normalizedFrom && normalizedFrom.toLowerCase() !== 'auto'
    ? (LANG_MAP[normalizedFrom] ?? normalizedFrom.toLowerCase())
    : null;
  const to = LANG_MAP[normalizedTo] ?? normalizedTo.toLowerCase();

  if (!to) {
    logger.error('Translate', 'Missing/invalid target language:', toCode);
    return { text, success: false };
  }

  // Skip translation if source and target are the same
  if (from && from === to) {
    logger.info('Translate', `Same language (${from}), skipping translation`);
    return { text, success: true };
  }

  try {
    const body = {
      q:      text,
      target: to,
      format: 'text',
    };
    if (from) {
      body.source = from;
    }

    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)');
      logger.error('Translate', `Google API HTTP ${res.status}: ${errText}`);
      return { text, success: false };
    }

    const data = await res.json();
    const translated = data?.data?.translations?.[0]?.translatedText;

    if (!translated) {
      logger.error('Translate', 'Google API returned no translatedText', JSON.stringify(data));
      return { text, success: false };
    }

    logger.info('Translate', `"${text.substring(0, 40)}" (${fromCode}) → "${translated.substring(0, 40)}" (${toCode})`);
    return { text: translated, success: true };

  } catch (err) {
    logger.error('Translate', `Failed: ${err.message}`);
    return { text, success: false };
  }
}
