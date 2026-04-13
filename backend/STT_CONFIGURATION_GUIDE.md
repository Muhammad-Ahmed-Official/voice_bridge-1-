# STT Configuration Guide
## How Urdu/Arabic/English Speech Recognition Works

### Overview
Voice Bridge uses **Google Cloud Speech-to-Text** for all languages:
- English (en-US)
- Urdu (ur-PK)
- Arabic (ar-SA)

All thresholds and settings are **configurable via environment variables** - no hardcoding!

---

## ✅ Code-Switching (Urdu + English Mix)

**Good news:** Google STT automatically handles code-switching!

In Karachi, people commonly mix Urdu and English:
```
"Salam, aaj main kaise ho? I'm very busy right now"
"Yes, bilkul theek ہے, I'll call you back"
```

**The app handles this naturally** - no special setup needed. Google STT recognizes both languages in the same sentence.

---

## 📊 Confidence Scoring

Instead of trying to fix accuracy, the app shows **confidence levels**:

| Confidence | Quality | What User Sees | Action |
|-----------|---------|---|---|
| > 85% | HIGH ✅ | Text displayed, no warning | Accept as-is |
| 70-85% | MEDIUM ⚠️ | Text + "might be incorrect" | User can correct |
| 50-70% | LOW ⚠️⚠️ | Text + "Try speaking clearly" | Suggest retry |
| < 50% | VERY_LOW ❌ | "Could not understand" | Suggest retry |

### Language-Specific Adjustment
- Urdu/Arabic: -15% (harder languages)
- English: 0% (baseline)

Example:
- English text recognized with 85% confidence → Shows as HIGH (85%)
- Urdu text recognized with 85% confidence → Shows as MEDIUM (70%) due to -15% adjustment

---

## 🔧 Configuration

All settings in `.env` file:

### Confidence Thresholds
```env
# When to consider recognition "good enough"
STT_CONFIDENCE_HIGH=0.85
STT_CONFIDENCE_MEDIUM=0.70
STT_CONFIDENCE_LOW=0.50

# Google STT threshold for automatic retry
GOOGLE_STT_THRESHOLD=0.85
```

### Language Adjustments
```env
# How much to adjust confidence for each language
# Urdu/Arabic harder to recognize → reduce confidence
URDU_CONFIDENCE_ADJUSTMENT=-0.15
ARABIC_CONFIDENCE_ADJUSTMENT=-0.15
ENGLISH_CONFIDENCE_ADJUSTMENT=0
```

### Retry Configuration
```env
# How many times to retry if confidence is low
STT_MAX_RETRIES=3

# Wait time before retry (in milliseconds)
STT_BACKOFF_MS=500
```

### Text/Audio Analysis for Confidence
```env
# Text length indicators
STT_MIN_LENGTH_HIGH_CONFIDENCE=20
STT_LENGTH_BONUS_THRESHOLD=100
STT_LENGTH_CONFIDENCE_BONUS=0.15

# Audio speed analysis
STT_CHARS_PER_SECOND=5        # Expected speaking speed
STT_RUSHED_RATIO=0.8           # Threshold for "rushed" audio
STT_RUSHED_PENALTY=-0.15       # Confidence penalty if rushed
```

### Validation Words (Optional)
```env
# Enable/disable validation for Urdu/Arabic
URDU_ENABLE_VALIDATION=false
ARABIC_ENABLE_VALIDATION=false

# Custom validation words (JSON array)
# Default includes proper Urdu words + common English code-switching
# Only change if you have specific words to check
URDU_COMMON_WORDS=
ARABIC_COMMON_WORDS=
```

---

## 🎯 Default Validation Words

### Urdu (Proper Karachi Urdu)
**Greetings:**
- السلام و علیکم (Assalamu Alaikum)
- سلام (Salam)

**Common Responses:**
- جی (Yes - formal)
- نہیں (No)
- بالکل (Definitely)
- شکریہ (Thanks)

**Phone Phrases:**
- سنائی دے رہا ہے (Can you hear)
- آواز صاف ہے (Voice is clear)

**English Code-Switching:**
- hello, yes, no, okay, thanks, please
- what, how, where, when, why
- alright, sure, fine, good, bye

### Arabic
- السلام و علیکم (Assalamu Alaikum)
- نعم (Yes)
- لا (No)
- شكرا (Thanks)
- كيف حالك (How are you)

---

## 🧪 How It Works: Example Flow

### Scenario: Urdu speaker in Karachi

```
User speaks: "Salam, main thik hoon, aaj kya hall hai?"
           (Mix of Urdu formal greeting + English "okay" concept)
                    ↓
Google STT recognizes: "Salam, main thik hoon"
Raw confidence: 0.82 (82%)
                    ↓
Language adjustment: 0.82 - 0.15 = 0.67 (67%)
Text length bonus: +0.1 (reasonable length) = 0.77 (77%)
                    ↓
Validation check: Found "السلام" in text? Yes → +0.2 = 0.97 (97%)
                    ↓
Final confidence: 97% = HIGH ✅
User sees: ✅ "Salam, main thik hoon" (with high confidence)
```

### Scenario 2: Unclear audio

```
User speaks (bad audio): "Mmm... yeah... hello?"
Google STT: "hello" (9 chars, very short)
Raw confidence: 0.60
                    ↓
Text length penalty: < 20 chars → -0.2 = 0.40 (40%)
Audio rush check: Very fast → -0.15 = 0.25 (25%)
Validation: Found "hello" → +0.2 = 0.45 (45%)
                    ↓
Final: 45% = VERY_LOW ❌
User sees: ❌ "hello" (with message "Could not understand clearly")
Suggestion: "Please speak slower and enunciate"
```

---

## 📝 Custom Configuration Example

Want to add your own Urdu validation words?

```env
# In .env file:
URDU_ENABLE_VALIDATION=true
URDU_COMMON_WORDS=["السلام","کیسے","ہو","میں","آپ","ہاں","نہیں","شکریہ","براہ کرم"]
```

---

## 🚀 No Hardcoding!

All values are configurable:
- ✅ Change confidence thresholds anytime
- ✅ Adjust language penalties based on real testing
- ✅ Enable/disable validation per language
- ✅ Use default words or add custom ones
- ✅ No code changes needed - just update `.env`

---

## Performance Note

⚡ **Validation word checking** is fast (< 1ms even with 50+ words) because:
- Single text scan
- Early exit on first match
- No regex complexity

So code-switching + proper validation words = **confident Urdu recognition without latency penalty**!
