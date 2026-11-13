import {io} from 'socket.io-client';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/surgical_study_planner_test';
process.env.JWT_SECRET ??= 'test-only-jwt-secret-with-at-least-32-bytes';

const apiBaseUrl = (process.env.VERCEL_VERIFY_URL ?? 'http://127.0.0.1:3000/api/server').replace(/\/+$/, '');
const socketPath = `${new URL(apiBaseUrl).pathname.replace(/\/+$/, '')}/socket.io`;

async function checkJson(path, expected) {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}.`);
  const actual = await response.json();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`GET ${path} returned an unexpected response.`);
  }
}

async function verifySocket() {
  const {createAccessToken} = await import('../dist/tokens.js');
  const token = await createAccessToken('000000000000000000000001', 'vercel-check@example.com');
  const socket = io(apiBaseUrl, {
    path: socketPath,
    transports: ['websocket'],
    auth: {token},
    reconnection: false,
    timeout: 5_000,
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  socket.disconnect();
}

try {
  await checkJson('/health', {status: 'ok'});
  await checkJson('/v1/config', {registrationEnabled: false});
  await verifySocket();
  process.stdout.write('Vercel API and Socket.IO smoke check passed.\n');
} catch (error) {
  process.stderr.write(`Vercel API smoke check failed: ${error instanceof Error ? error.message : 'unexpected error'}\n`);
  process.exitCode = 1;
}
