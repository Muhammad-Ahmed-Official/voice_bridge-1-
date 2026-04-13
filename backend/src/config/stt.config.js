/**
 * STT (Speech-to-Text) Configuration
 * All values configurable via environment variables
 * No hardcoding - everything externalized
 */

// Confidence thresholds for quality assessment
const STT_CONFIDENCE_THRESHOLDS = {
  HIGH: parseFloat(process.env.STT_CONFIDENCE_HIGH || '0.85'),    // > 85% = Show and continue
  MEDIUM: parseFloat(process.env.STT_CONFIDENCE_MEDIUM || '0.70'), // 70-85% = Show but flag as uncertain
  LOW: parseFloat(process.env.STT_CONFIDENCE_LOW || '0.50'),       // 50-70% = Show with warning
  VERY_LOW: parseFloat(process.env.STT_CONFIDENCE_VERY_LOW || '0'),// < 50% = Show with strong warning
};

// Provider-specific confidence thresholds
// Using only Google STT (available resources, no paid tools)
const PROVIDER_THRESHOLDS = {
  GOOGLE: parseFloat(process.env.GOOGLE_STT_THRESHOLD || '0.85'),
};

// Retry configuration
const STT_RETRY_CONFIG = {
  MAX_RETRIES: parseInt(process.env.STT_MAX_RETRIES || '3', 10),
  INITIAL_BACKOFF_MS: parseInt(process.env.STT_BACKOFF_MS || '500', 10),
};

// Language-specific settings (all use Google STT)
const LANGUAGE_CONFIG = {
  URDU: {
    code: 'ur',
    locale: 'ur-PK',
    provider: 'GOOGLE',
    // Confidence adjustment for non-English languages (harder to recognize)
    confidenceAdjustment: parseFloat(process.env.URDU_CONFIDENCE_ADJUSTMENT || '-0.15'),
    // Enabled by default - proper word list for Karachi Urdu
    enableValidation: process.env.URDU_ENABLE_VALIDATION !== 'false', // true by default
  },
  ARABIC: {
    code: 'ar',
    locale: 'ar-SA',
    provider: 'GOOGLE',
    confidenceAdjustment: parseFloat(process.env.ARABIC_CONFIDENCE_ADJUSTMENT || '-0.15'),
    // Enabled by default - proper word list for Modern Standard Arabic
    enableValidation: process.env.ARABIC_ENABLE_VALIDATION !== 'false', // true by default
  },
  ENGLISH: {
    code: 'en',
    locale: 'en-US',
    provider: 'GOOGLE',
    confidenceAdjustment: parseFloat(process.env.ENGLISH_CONFIDENCE_ADJUSTMENT || '0'),
    enableValidation: false, // English validation typically not needed
  },
};

// Validation word lists - common phrases/words people use in calls
// Can be overridden via environment variables (JSON string)
// Kept as reasonable list - not huge, for performance
const DEFAULT_URDU_WORDS = [
  // ===== GREETINGS (Karachi proper Urdu) =====
  'السلام و علیکم',
  'السلام علیکم',
  'سلام',
  'السلام',
  'صباح الخير',
  'السلام و علیکم و رحمة الله وبركاته',
  'والیکم السلام',

  // ===== FORMAL RESPONSES =====
  'جی', // yes (formal, most common in Karachi)
  'جی بالکل', // yes, definitely
  'جی ہاں', // yes (mixed)
  'ہاں', // yes
  'نہیں', // no
  'جناب', // sir (respectful)
  'صاحب', // sir/mister
  'بہت اچھا', // very good
  'خوب', // excellent

  // ===== PROFESSIONAL RESPONSES =====
  'بالکل', // definitely
  'ضرور', // of course
  'بالتمام و کمال', // completely
  'بہترین', // excellent
  'شکریہ', // thanks
  'شکریہ بہت', // thanks a lot
  'مہربانی', // please/kindness
  'براہ کرم', // please (formal)
  'کچھ نہیں', // nothing
  'کوئی بات نہیں', // no problem
  'کوئی مسئلہ نہیں', // no issue

  // ===== HOW ARE YOU (multiple forms - Karachi variation) =====
  'کیسے ہیں', // how are you (formal)
  'آپ کیسے ہیں', // how are you (very formal)
  'آپ ٹھیک تو ہیں', // are you okay
  'کیا حال ہے', // how's it going
  'حال کیسا ہے', // how are things
  'سب ٹھیک ہے', // everything okay
  'الحمد اللہ', // thanks to God (response to "how are you")
  'الحمد للہ ٹھیک ہوں', // thanks to God, I'm fine
  'ان شاء اللہ', // God willing
  'ان شاء اللہ ٹھیک ہے', // God willing, it's fine

  // ===== BUSINESS/PROFESSIONAL CALLS =====
  'میں سنتا ہوں', // I can hear
  'مجھے سنائی دے رہا ہے', // I can hear you
  'آپ سن رہے ہیں', // can you hear me
  'میں سن رہا ہوں', // I'm listening
  'بات کریں', // please speak
  'ایک منٹ', // one moment
  'ایک منٹ رکیں', // wait one moment
  'صرف ایک لمحہ', // just a moment
  'براہ کرم انتظار کریں', // please wait
  'صبر کریں', // be patient

  // ===== PHONE QUALITY =====
  'سنائی دے رہا ہے', // I can hear (you)
  'آواز صاف ہے', // voice is clear
  'آواز سنائی دے رہی ہے', // I can hear your voice
  'واضح ہے', // it's clear
  'صحیح ہے', // it's right
  'بہترین ہے', // it's excellent

  // ===== COMMON ACTIONS =====
  'کہہ دیں', // tell me
  'بتائیں', // tell (formal)
  'سمجھا', // understood
  'ٹھیک ہے', // alright
  'بہت ٹھیک', // very well
  'چل گیا', // it's done
  'ہو گیا', // it's done

  // ===== BASIC QUESTIONS =====
  'کیا', // what
  'کون', // who
  'کہاں', // where
  'کب', // when
  'کیوں', // why
  'کیسے', // how
  'کتنا', // how much

  // ===== COMMON BUSINESS PHRASES =====
  'آفس میں ہوں', // I'm in office
  'گھر میں ہوں', // I'm at home
  'باہر ہوں', // I'm outside
  'کام میں مصروف ہوں', // I'm busy with work
  'فون پر ہوں', // I'm on phone
  'ابھی ہوتا ہوں', // I'll do it now
  'بعد میں بتاتا ہوں', // I'll tell you later
  'آپ کو کال کروں گا', // I'll call you
  'متصل رہوں گا', // I'll stay connected

  // ===== CODE-SWITCHING: COMMON ENGLISH WORDS IN KARACHI URDU =====
  'hello', // English greeting
  'hi', // English hi
  'yes', // English yes
  'no', // English no
  'okay', // English okay
  'ok', // English ok
  'thanks', // English thanks
  'thank you', // English thank you
  'please', // English please
  'sorry', // English sorry
  'excuse me', // English excuse
  'what', // English what
  'how', // English how
  'where', // English where
  'when', // English when
  'why', // English why
  'alright', // English alright
  'sure', // English sure
  'fine', // English fine
  'good', // English good
  'bye', // English bye
  'goodbye', // English goodbye
  'see you', // English see you
  'call you later', // English phrase
  'talk to you soon', // English phrase
  'take care', // English phrase
];

const DEFAULT_ARABIC_WORDS = [
  // ===== GREETINGS (Modern Standard Arabic + Gulf Arabic) =====
  'السلام و علیکم',
  'السلام علیکم',
  'السلام',
  'صباح الخير',
  'صباح النور',
  'مساء الخير',
  'مرحبا',
  'أهلا و سهلا',
  'كيفك',

  // ===== FORMAL RESPONSES =====
  'نعم', // yes
  'لا', // no
  'حسنا', // okay
  'تمام', // good
  'بالتأكيد', // definitely
  'ضرورة', // of course
  'ربما', // maybe
  'ان شاء الله', // God willing

  // ===== POLITE EXPRESSIONS =====
  'من فضلك', // please (masculine)
  'من فضلك', // please (masculine)
  'شكرا', // thanks
  'شكرا لك', // thanks to you
  'شكرا جزيلا', // thank you very much
  'بارك الله فيك', // may God bless you
  'عفوا', // you're welcome
  'لا شكر على واجب', // it was my duty

  // ===== HOW ARE YOU (Multiple forms) =====
  'كيف حالك', // how are you (masculine)
  'كيف حالك', // how are you (feminine)
  'كيف حالكم', // how are you all
  'كيفك أنت', // how are you
  'كيف أنت', // how are you
  'كيف الحال', // how's it going
  'الحمد لله', // thank God (response)
  'الحمد لله تمام', // thank God, very well

  // ===== BUSINESS/PROFESSIONAL CALLS =====
  'أسمعك', // I can hear you
  'أنا أسمعك', // I can hear you (explicit)
  'هل تسمعني', // can you hear me
  'أنا أستمع', // I'm listening
  'تفضل', // please go ahead
  'ابدأ', // begin/start
  'لحظة واحدة', // one moment
  'دقيقة واحدة', // one minute
  'ارجع قليلا', // wait a moment
  'أرجو الانتظار', // please wait

  // ===== PHONE QUALITY =====
  'أسمع بوضوح', // I hear clearly
  'الصوت واضح', // voice is clear
  'الخط جيد', // the line is good
  'سماع ممتاز', // excellent reception
  'الصوت قوي', // voice is strong

  // ===== COMMON ACTIONS =====
  'حسنا', // okay
  'تمام', // done
  'تمام التمام', // perfectly done
  'انتهى', // finished
  'خلصنا', // we're done
  'فهمت', // understood
  'فهمت تماما', // I understand completely

  // ===== BASIC QUESTIONS =====
  'ماذا', // what
  'من', // who
  'أين', // where
  'متى', // when
  'لماذا', // why
  'كيف', // how
  'كم', // how much
  'أي واحد', // which one

  // ===== COMMON BUSINESS PHRASES =====
  'أنا في المكتب', // I'm in office
  'أنا في البيت', // I'm at home
  'أنا بالخارج', // I'm outside
  'أنا مشغول', // I'm busy
  'مشغول جدا', // very busy
  'سأتصل بك', // I'll call you
  'اتصل بك لاحقا', // I'll call you later
  'تحدثنا قريبا', // we'll talk soon
  'شكرا على الاتصال', // thanks for calling

  // ===== CODE-SWITCHING: COMMON ENGLISH WORDS IN ARABIC CALLS =====
  'hello', // English greeting
  'hi', // English hi
  'yes', // English yes
  'no', // English no
  'okay', // English okay
  'ok', // English ok
  'thanks', // English thanks
  'thank you', // English thank you
  'please', // English please
  'sorry', // English sorry
  'alright', // English alright
  'sure', // English sure
  'fine', // English fine
  'good', // English good
  'bye', // English bye
  'goodbye', // English goodbye
];

// Load from environment or use defaults
const VALIDATION_WORDS = {
  URDU: process.env.URDU_COMMON_WORDS
    ? JSON.parse(process.env.URDU_COMMON_WORDS)
    : DEFAULT_URDU_WORDS,
  ARABIC: process.env.ARABIC_COMMON_WORDS
    ? JSON.parse(process.env.ARABIC_COMMON_WORDS)
    : DEFAULT_ARABIC_WORDS,
};

// Text analysis for confidence estimation
const TEXT_ANALYSIS_CONFIG = {
  MIN_LENGTH_FOR_HIGH_CONFIDENCE: parseInt(
    process.env.STT_MIN_LENGTH_HIGH_CONFIDENCE || '20',
    10
  ),
  MIN_LENGTH_ACCEPTABLE: parseInt(
    process.env.STT_MIN_LENGTH_ACCEPTABLE || '3',
    10
  ),
  LENGTH_BONUS_THRESHOLD: parseInt(
    process.env.STT_LENGTH_BONUS_THRESHOLD || '100',
    10
  ),
  LENGTH_CONFIDENCE_BONUS: parseFloat(
    process.env.STT_LENGTH_CONFIDENCE_BONUS || '0.15'
  ),
};

// Audio analysis for confidence estimation
const AUDIO_ANALYSIS_CONFIG = {
  NORMAL_CHARS_PER_SECOND: parseFloat(
    process.env.STT_CHARS_PER_SECOND || '5'
  ),
  RUSHED_RATIO_THRESHOLD: parseFloat(
    process.env.STT_RUSHED_RATIO || '0.8'
  ),
  CLEAR_RATIO_THRESHOLD: parseFloat(
    process.env.STT_CLEAR_RATIO || '1.5'
  ),
  RUSHED_PENALTY: parseFloat(process.env.STT_RUSHED_PENALTY || '-0.15'),
  CLEAR_BONUS: parseFloat(process.env.STT_CLEAR_BONUS || '0.1'),
};

export {
  STT_CONFIDENCE_THRESHOLDS,
  PROVIDER_THRESHOLDS,
  STT_RETRY_CONFIG,
  LANGUAGE_CONFIG,
  VALIDATION_WORDS,
  TEXT_ANALYSIS_CONFIG,
  AUDIO_ANALYSIS_CONFIG,
};
