#!/usr/bin/env node
/**
 * PIPELINE TEST SCRIPT
 * Test audio routing without real call
 * Usage: node test-pipeline.js
 */

import io from 'socket.io-client';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'http://localhost:3000';
const TEST_AUDIO_FILE = './test-audio.wav'; // Small 1s audio file

// Fake users
const USER_A = { userId: 'test_user_1', _id: 'obj_1', voiceCloningEnabled: false };
const USER_B = { userId: 'test_user_2', _id: 'obj_2', voiceCloningEnabled: false };

let socket_A, socket_B;
let roomId = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connectUsers() {
  console.log('\n📱 Connecting Users...\n');

  // Connect User A
  socket_A = io(BACKEND_URL, { reconnection: true });
  socket_A.on('connect', () => {
    console.log(`✓ User A connected: ${socket_A.id}`);
    socket_A.emit('register', {
      userId: USER_A.userId,
      objectId: USER_A._id,
    });
  });

  socket_A.on('registered', (data) => {
    console.log(`✓ User A registered`);
  });

  // Connect User B
  socket_B = io(BACKEND_URL, { reconnection: true });
  socket_B.on('connect', () => {
    console.log(`✓ User B connected: ${socket_B.id}`);
    socket_B.emit('register', {
      userId: USER_B.userId,
      objectId: USER_B._id,
    });
  });

  socket_B.on('registered', (data) => {
    console.log(`✓ User B registered`);
  });

  await sleep(1000);
}

async function initiateCall() {
  console.log('\n📞 Initiating Call: A(EN→UR) → B(UR→EN)\n');

  // Register listeners FIRST before emitting call
  socket_B.on('incoming-call', (data) => {
    console.log(`✓ User B received incoming call from ${data.callerId}`);

    // User B accepts call with Urdu→English
    socket_B.emit('accept-call', {
      callerId: USER_A.userId,
      speakLang: 'UR',
      hearLang: 'EN',
    });
  });

  socket_A.on('call-accepted', (data) => {
    console.log(`✓ Call accepted! Room: ${data.roomId}`);
    roomId = data.roomId;
  });

  await sleep(500);

  // NOW emit the call after listeners are ready
  socket_A.emit('call-user', {
    targetUserId: USER_B.userId,
    callerName: USER_A.userId,
    speakLang: 'EN',
    hearLang: 'UR',
  });

  await sleep(2000);
}

async function testAudioPipeline() {
  if (!roomId) {
    console.error('❌ No room ID - call not established');
    return;
  }

  console.log('\n🎤 Testing Audio Pipeline...\n');

  // Read test audio (or use dummy base64)
  const dummyAudio = Buffer.from('RIFF...').toString('base64'); // Minimal WAV

  // Test 1: User A speaks English
  console.log('Test 1: User A speaks English (expect: translate EN→UR, TTS to UR)');
  socket_A.emit('audio-chunk', {
    roomId,
    audioBase64: dummyAudio,
    mimeType: 'audio/wav',
  });

  // Listen for what User A gets back (should be Urdu TTS)
  socket_A.on('speech-transcript', (data) => {
    console.log(`  ✓ A received STT: "${data.text}" | confidence: ${data.confidence}%`);
  });

  socket_A.on('translated-text', (data) => {
    console.log(`  ✓ A received translation: "${data.text}" (expect: Urdu TTS audio)`);
    if (data.audioBase64) {
      console.log(`  ✓ A received TTS audio: ${data.audioBase64.length} bytes`);
    } else {
      console.log(`  ❌ A did NOT receive TTS audio (BUG!)`);
    }
  });

  await sleep(3000);

  // Test 2: User B speaks Urdu
  console.log('\nTest 2: User B speaks Urdu (expect: translate UR→EN, TTS to EN)');
  socket_B.emit('audio-chunk', {
    roomId,
    audioBase64: dummyAudio,
    mimeType: 'audio/wav',
  });

  // Listen for what User B gets back (should be English TTS)
  socket_B.on('speech-transcript', (data) => {
    console.log(`  ✓ B received STT: "${data.text}" | confidence: ${data.confidence}%`);
  });

  socket_B.on('translated-text', (data) => {
    console.log(`  ✓ B received translation: "${data.text}" (expect: English TTS audio)`);
    if (data.audioBase64) {
      console.log(`  ✓ B received TTS audio: ${data.audioBase64.length} bytes`);
    } else {
      console.log(`  ❌ B did NOT receive TTS audio (BUG!)`);
    }
  });

  await sleep(3000);
}

async function checkLogs() {
  console.log('\n📋 Checking Backend Logs...\n');
  console.log('Look for patterns:');
  console.log('  ✓ [Pipeline] User A → "text" (EN→UR)');
  console.log('  ✓ [Translate] "text" (EN) → "..." (UR)');
  console.log('  ✓ [TTS Router] GOOGLE TTS (en-US or ur-PK)');
  console.log('  ✓ [TTS] Google TTS: "..." (ur)');
  console.log('\nIf any step missing → pipeline broken at that point');
}

async function runTest() {
  try {
    await connectUsers();
    await initiateCall();
    await testAudioPipeline();
    await checkLogs();

    console.log('\n✅ Test Complete\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test Error:', err.message);
    process.exit(1);
  }
}

// Run
console.log('🚀 Starting Pipeline Test (No Real Call Needed)\n');
runTest();
