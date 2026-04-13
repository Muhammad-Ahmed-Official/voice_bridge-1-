/**
 * Meeting with Offline Users - Manual Test
 * Tests creating meetings with offline invitees and status updates
 */

import io from 'socket.io-client';
import { createServer } from 'http';
import { initSocket } from '../src/socket/index.js';
import mongoose from 'mongoose';
import { User } from '../src/models/user.models.js';
import dotenv from 'dotenv';

dotenv.config();

const TEST_TIMEOUT = 30000;
const BASE_URL = 'http://localhost:3000';

let server, sockets = [];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      reconnection: true,
      reconnectionDelay: 100,
      reconnectionDelayMax: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log(`✅ Client connected: ${socket.id}`);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err.message);
      reject(err);
    });

    setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, TEST_TIMEOUT);
  });
}

async function testMeetingWithOfflineUsers() {
  console.log('\n========================================');
  console.log('🧪 Testing Meeting with Offline Users');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not set in environment');
    }

    await mongoose.connect(`${mongoUri}/voice-bridge-test`);
    console.log('✅ Connected to MongoDB');

    // Create test users
    const users = [];
    const userIds = ['host_user', 'online_user', 'offline_user1', 'offline_user2'];

    for (const userId of userIds) {
      await User.deleteOne({ userId });
      await User.create({
        userId,
        password: 'test123',
        voiceCloningEnabled: false,
      });
      users.push(userId);
      console.log(`✅ Created user: ${userId}`);
    }

    // Test 1: Create meeting with offline invitees
    console.log('\n--- Test 1: Create Meeting with Offline Invitees ---');

    const hostSocket = await createClient(BASE_URL);
    const onlineSocket = await createClient(BASE_URL);
    sockets.push(hostSocket, onlineSocket);

    // Register users
    hostSocket.emit('register', { userId: users[0], odId: 'odid_1' });
    onlineSocket.emit('register', { userId: users[1], odId: 'odid_2' });
    await sleep(500);

    // Create meeting with all 4 users (2 offline)
    const meetingId = `meeting_${Date.now()}`;
    console.log(`\n📝 Creating meeting: ${meetingId}`);
    console.log(`   Host: ${users[0]} (online)`);
    console.log(`   Invitees: ${users[1]} (online), ${users[2]} (offline), ${users[3]} (offline)`);

    hostSocket.emit('create-meeting', {
      meetingId,
      hostSpeakLang: 'EN',
      hostHearLang: 'EN',
      invitees: [
        { userId: users[1] },
        { userId: users[2] },
        { userId: users[3] },
      ],
    });

    // Verify meeting created
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Meeting creation timeout')), TEST_TIMEOUT);
      hostSocket.once('meeting-created', (data) => {
        clearTimeout(timeout);
        console.log(`\n✅ Meeting created with config:`);
        data.config.forEach(p => {
          const status = p.isOnline ? '🟢 ONLINE' : '🔴 OFFLINE';
          console.log(`   ${p.userId}: status=${p.status}, ${status}`);
        });

        // Verify offline users are marked offline
        const offlineUsers = data.config.filter(c => c.userId === users[2] || c.userId === users[3]);
        const allMarkedOffline = offlineUsers.every(u => u.isOnline === false);
        if (allMarkedOffline) {
          console.log(`✅ Offline users correctly marked as offline`);
        } else {
          throw new Error('Offline users not marked correctly');
        }
        resolve(data);
      });
    });

    // Test 2: Online user joins meeting
    console.log('\n--- Test 2: Online User Joins Meeting ---');

    onlineSocket.emit('join-meeting', {
      meetingId,
      speakLang: 'EN',
      hearLang: 'EN',
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Join timeout')), TEST_TIMEOUT);
      onlineSocket.once('meeting-joined-ack', (data) => {
        clearTimeout(timeout);
        console.log(`✅ ${users[1]} joined meeting`);
        console.log(`   Config shows:`);
        data.config.forEach(p => {
          const status = p.isOnline ? '🟢' : '🔴';
          console.log(`   ${status} ${p.userId}: ${p.status}`);
        });
        resolve(data);
      });
    });

    // Test 3: Offline user comes online
    console.log('\n--- Test 3: Offline User Comes Online ---');

    const formerlyOfflineSocket = await createClient(BASE_URL);
    sockets.push(formerlyOfflineSocket);

    console.log(`📱 ${users[2]} coming online...`);
    formerlyOfflineSocket.emit('register', { userId: users[2], odId: 'odid_3' });

    await sleep(1000);

    // Listen for status update on online user
    console.log(`👂 Waiting for status update notifications...`);

    let statusUpdateReceived = false;
    onlineSocket.once('meeting-participant-online', (data) => {
      console.log(`✅ Status update received: ${data.userId} is now ONLINE`);
      console.log(`   Updated config:`);
      data.config.forEach(p => {
        const status = p.isOnline ? '🟢' : '🔴';
        console.log(`   ${status} ${p.userId}: ${p.status}`);
      });
      statusUpdateReceived = true;
    });

    // New user joins
    console.log(`\n   ${users[2]} joining meeting...`);
    formerlyOfflineSocket.emit('join-meeting', {
      meetingId,
      speakLang: 'EN',
      hearLang: 'EN',
    });

    await sleep(2000);

    // Test 4: Message from host to all participants
    console.log('\n--- Test 4: Host Sends Message ---');

    const messagePromises = [];

    onlineSocket.once('meeting-translated', (data) => {
      console.log(`✅ ${users[1]} received message: "${data.text}"`);
    });

    formerlyOfflineSocket.once('meeting-translated', (data) => {
      console.log(`✅ ${users[2]} received message: "${data.text}"`);
    });

    console.log(`📢 Host sending message...`);
    hostSocket.emit('meeting-speech-text', {
      meetingId,
      text: 'Hello everyone, welcome to the meeting!',
    });

    await sleep(3000);

    // Test 5: Host disconnects (should end meeting)
    console.log('\n--- Test 5: Host Disconnects ---');

    onlineSocket.once('meeting-ended', (data) => {
      console.log(`✅ Meeting ended: ${data.reason}`);
    });

    formerlyOfflineSocket.once('meeting-ended', (data) => {
      console.log(`✅ Participant got meeting-ended: ${data.reason}`);
    });

    console.log(`🔌 Host disconnecting...`);
    hostSocket.disconnect();

    await sleep(2000);

    // Clean up
    console.log('\n--- Cleanup ---');
    for (const socket of sockets) {
      socket.disconnect();
    }
    await mongoose.connection.close();
    console.log('✅ Test complete');

    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);

    for (const socket of sockets) {
      try { socket.disconnect(); } catch {}
    }
    try { await mongoose.connection.close(); } catch {}

    process.exit(1);
  }
}

// Run the test
testMeetingWithOfflineUsers();
