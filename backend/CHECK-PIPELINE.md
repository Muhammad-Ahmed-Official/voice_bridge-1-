# 🔍 Pipeline Diagnosis Without Real Call

## Quick Check: Just Look at Logs

Jab real call test kro, backend logs dekh:

### ✅ Healthy Pipeline (English → Urdu)

```
[socket] room created: User_A_User_B_xxx
[Route] User_A(speaks=EN,clone=false) → User_B(hears=EN,clone=false) | stt=en-US tts=en-US | strategy=tts
[STT] Recognized (en-US): "Hello"
[STT] User_A: "Hello" (EN→EN) [tts] 82% confidence
[Pipeline] User_A → "Hello" (EN→EN)
[Translate] "Hello" (EN) → [AUTO-SKIP, same language]
[TTS Router] GOOGLE TTS (fast) — speaker=User_A locale=en-US
[TTS] Google TTS: "Hello" (en)
```

### ❌ Broken Pipeline (English → Urdu)

What you reported:
```
[Route] User_A(speaks=EN,clone=false) → User_B(hears=UR,clone=false) | ... | strategy=???
[STT] Recognized (en-US): "Hello"
[Pipeline] User_A → "Hello" (EN→UR)
[Translate] "Hello" (EN) → [MISSING OR FAILED]
[TTS Router] [MISSING - NO TTS CALLED]
[TTS] [MISSING]
```

---

## 🔧 What to Check

### 1. **STT Confidence Logging**
Look for this line IMMEDIATELY after audio-chunk:
```
[STT] User_A: "text" (locale) [tts] XX% confidence
```

✅ If present: STT working + confidence scoring working
❌ If missing: transcribeWithConfidence() not being called

---

### 2. **Translation Step**
After STT, should see:
```
[Pipeline] User_A → "text" (LANG1→LANG2)
[Translate] "text" (LANG1) → "translated_text" (LANG2)
```

✅ If present: Translation pipeline working
❌ If missing: bufferAndTranslate() not called or translation failed

---

### 3. **TTS Routing Decision**
Should see:
```
[TTS Router] GOOGLE TTS (fast) — speaker=User_A locale=en-US
```

✅ If present: Backend decided to use TTS
❌ If missing: Route decision broken (check resolveAudioStrategy())

---

### 4. **Actual TTS Synthesis**
Should see:
```
[TTS] Google TTS: "translated_text" (lang_code)
```

✅ If present: Google TTS called successfully
❌ If missing: getTtsForUser() not working

---

## 🎯 For Your Specific Bug (EN→UR)

Run this **exact test scenario** and watch logs:

```
User A: Speak=EN, Hear=UR
User B: Speak=UR, Hear=EN

[A speaks "hello"]
Expected logs:
  1. [STT] "hello" (en-US) XX% confidence ← STT
  2. [Pipeline] "hello" (EN→UR) ← buffer created
  3. [Translate] "hello" (EN) → "سلام" (UR) ← translation
  4. [TTS Router] GOOGLE TTS ← router decision
  5. [TTS] Google TTS: "سلام" (ur) ← TTS call
  6. [TTS] Receiver User_B finished playback ← delivery

If any step missing: that's the break point!
```

---

## 📝 Log Examples to Grep

```bash
# Watch ONLY your test conversation
npm start &
# Then run call test
# Then in another terminal:
grep "User_A\|User_B" logs.txt | tail -100

# Or look for the exact break point:
grep -A5 "Pipeline.*EN" logs.txt
grep -B2 -A2 "Translate.*EN" logs.txt
grep "TTS Router" logs.txt
```

---

## 🚨 Likely Culprits (EN→UR Bug)

Based on your report, check these functions:

1. **resolveAudioStrategy()** - decides if strategy='passthrough' or 'tts'
   - For EN→UR: should be 'tts' (NOT passthrough)
   - If it's choosing 'passthrough' → audio won't be translated

2. **bufferAndTranslate()** - triggers translation pipeline
   - Check if it's being called for EN→UR pair
   - If not called → pipeline stops here

3. **translateText()** - actual translation
   - Should convert EN text to UR
   - If fails → pipeline breaks

4. **getTtsForUser()** - generates TTS audio
   - Should return audio buffer
   - If fails/missing → User_B gets text only

---

## ⚡ Quick Test (No Real Call)

Just add this to socket handler temporarily:

```javascript
socket.on('test-pipeline', ({ speak, hear, text }) => {
  console.log(`[TEST] Testing ${speak}→${hear} with: "${text}"`);
  const route = resolveAudioStrategy(room, socket.id);
  console.log(`[TEST] Route decision:`, route.strategy, route.speakLang, route.hearLang);

  // Manually test translation
  translateText(text, speak, hear).then(result => {
    console.log(`[TEST] Translation result:`, result);
  });
});
```

Then emit from frontend console:
```javascript
socket.emit('test-pipeline', {
  speak: 'EN',
  hear: 'UR',
  text: 'Hello'
});
```

---

## 🎯 Final Diagnosis

```
❌ Audio not reaching User_B?
  → Check getTtsForUser() return value

❌ Only text showing?
  → Check if translated-text event has audioBase64

❌ Raw English audio being played?
  → Check if passthrough strategy wrongly chosen

❌ Confidence not showing?
  → Check if transcribeWithConfidence() being called
```

**Look for these patterns in logs to pinpoint exact issue!**
