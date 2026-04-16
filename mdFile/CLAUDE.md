# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice Bridge is a **real-time multilingual voice chat application** with translation and voice cloning capabilities. It enables users to communicate across language barriers (Urdu, English, Arabic) using voice, with real-time translation and optional AI voice cloning.

### Key Features
- Real-time voice messaging via Socket.IO
- Speech-to-Text (STT) with multiple implementation strategies
- Text-to-Speech: Google TTS (default) + ElevenLabs (advanced with voice cloning)
- Real-time translation (Google Cloud Translate)
- JWT authentication with bcrypt password hashing
- User voice cloning capability

## Architecture Overview

The project follows a **monorepo structure** with separate backend and frontend:

```
Voice_Bridge/
├── backend/          (Node.js/Express API server)
│   ├── src/
│   │   ├── index.js              (Server entry point)
│   │   ├── app.js                (Express app setup)
│   │   ├── db/                   (MongoDB connection)
│   │   ├── models/               (Mongoose schemas)
│   │   ├── controllers/          (Request handlers)
│   │   ├── routes/               (API routes)
│   │   ├── services/             (Business logic: STT, TTS, translation, voice cloning)
│   │   ├── socket/               (Socket.IO event handlers: meeting manager, room manager)
│   │   └── config/               (Configuration: STT, ElevenLabs)
│   └── tests/                    (Jest tests + latency benchmarks)
└── frontend/         (React Native/Expo mobile app)
    ├── app/                      (Expo Router app structure)
    ├── components/               (Reusable React Native components)
    ├── contexts/                 (React Context: AuthContext)
    ├── api/                      (Axios API client)
    └── hooks/                    (Custom React hooks)
```

### Backend Architecture

**Service Layer Separation:**
- `stt.js / sttImproved.js / sttWithFallback.js` - Speech-to-text strategies
- `tts.js` - Google TTS service
- `elevenlabsTts.js` - ElevenLabs TTS with voice cloning
- `voiceCloning.js` - Voice enrollment and cloning logic
- `translate.js` - Google Cloud translation
- `sttConfidenceHandler.js` - Confidence scoring for transcripts
- `ttsChunkHandler.js` - Audio chunk streaming

**Real-time Communication:**
- Socket.IO is the backbone for real-time audio/text exchange
- `meetingManager.js` - Manages active meetings/sessions
- `roomManager.js` - Manages chat rooms and user presence

**Data Models:**
- User: userId, password (bcrypt), voiceCloningEnabled, voiceId
- Chat: Message history with metadata
- History: Persistent conversation records

### Frontend Architecture

- **Expo Router**: File-based routing using `app/` directory
- **AuthContext**: Manages JWT tokens and authentication state
- **Tab Navigation**: Main app shell with multiple tabs (tabs layout)
- **Axios Client**: Configured in `api/axios.js` for API calls

## Development Commands

### Backend

```bash
# Development with hot reload (nodemon)
cd backend
npm run dev

# Production start
npm start

# Run all tests
npm test

# Run specific test file
npm run test:voice              # Voice flow tests
npm run test:latency            # Latency benchmarks
npm run test:integration        # Integration tests

# To run custom test
npm test tests/yourTest.js
```

**Environment Setup:**
- Create `.env` file in `/backend` with:
  - `PORT=3000` (or port of choice)
  - `MONGODB_URI=mongodb://...`
  - `JWT_SECRET=your_secret`
  - `GOOGLE_CLOUD_PROJECT_ID=...`
  - `GOOGLE_CLOUD_PRIVATE_KEY=...`
  - `ELEVENLABS_API_KEY=...` (optional, for voice cloning)

### Frontend

```bash
# Development server (opens in browser/simulator)
cd frontend
npm start

# Run on web
npm run web

# Run on Android
npm run android

# Run on iOS
npm run ios

# Linting
npm run lint
```

## Testing Strategy

The backend includes comprehensive tests for **voice flow latency and reliability**:

- `voiceFlow.test.js` - End-to-end voice message flow
- `latencyBenchmark.js` - Latency measurements for STT/TTS/translation
- `concurrentLatencyTest.js` - Multiple concurrent users
- `textLengthLatencyTest.js` - Performance with varying text lengths
- `networkResilienceTest.js` - Behavior under network failures
- `chunkStreamingTest.js` - Audio chunk streaming validation
- `integrationTest.js` - Full integration with mocked services

**Key Testing Patterns:**
- STT/TTS/translation are usually mocked or use test APIs
- Tests measure end-to-end latency (socket → service → response)
- Focus on real-time performance metrics and reliability

## Key Technical Decisions

### Audio Processing
- **FFmpeg integration** for audio format conversion
- **Multiple STT strategies**: fallback system if one fails
- **Chunk-based TTS delivery**: Streams audio in small chunks for low latency

### Language Support
- **3 languages**: Urdu (UR), English (EN), Arabic (AR)
- Text direction handling in frontend for RTL languages (Urdu, Arabic)

### Voice Cloning Architecture
- Users can enroll their voice (upload reference audio)
- ElevenLabs stores voice profiles; backend maps userId → voiceId
- Global `voiceCloningEnabled` flag + optional voiceId per user

### Real-time Strategy
- Socket.IO for bidirectional communication (not REST polling)
- Meetings managed in-memory on server; persist history to MongoDB
- Audio chunks streamed as binary data over Socket.IO

## Common Development Tasks

### Adding a New Route
1. Create handler in `src/controllers/`
2. Define route in `src/routes/`
3. Wire up in `src/app.js` with `app.use()`

### Adding STT/TTS Logic
Services are in `src/services/`. Each implements similar interfaces:
- Accept input (audio bytes or text)
- Return output asynchronously
- Implement error handling + fallback strategy

### Debugging Socket Events
- Check `src/socket/index.js` for event listeners
- Add logging to event handlers
- Test with real Socket.IO client or test suite

### Adding Frontend Screens
1. Create `.tsx` file in `app/` or `app/(tabs)/`
2. Use Expo Router conventions (file = route)
3. Import components from `components/` and hooks from `hooks/`
4. Use `AuthContext` for user/token state

## Performance Considerations

- **Latency targets**: STT (200-500ms) + Translation (100-200ms) + TTS (200-400ms)
- **Concurrent users**: Socket.IO connection pooling; tested up to 20 concurrent
- **Memory**: Audio chunks are streamed; full files never buffered
- **Database**: Indexed queries on userId, roomId for fast lookups

## Important Notes

- **Security**: See `memory/security_audit.md` for critical findings and required fixes
- **Environment variables**: Never commit `.env`; use `.env.example` template
- **Audio formats**: Backend expects WEBM/OPUS; transcoding via FFmpeg
- **CORS**: Currently permissive in app.js; tighten for production
- **Error Handling**: Use Socket.IO error events for real-time error propagation
