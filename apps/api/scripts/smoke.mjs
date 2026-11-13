// End-to-end smoke test. Usage: BASE_URL=http://localhost:3000 npm run smoke
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const onVercel = /vercel\.app|\/api\/server/.test(BASE_URL);

async function step(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

const dateOnly = d => d.toISOString().slice(0, 10);

await step('GET /health', async () => {
  const r = await call('GET', '/health');
  expect(r.status === 200 && r.json?.status === 'ok', `got ${r.status}`);
});

if (onVercel) {
  await step('GET /privacy', async () => {
    const r = await call('GET', '/privacy');
    expect(r.status === 200 && r.text.includes('Privacy'), `got ${r.status}`);
  });
  console.log('Vercel target: skipped authenticated steps (stub refused).');
  process.exit(0);
}

let token;
let topic;
const today = dateOnly(new Date());

await step('GET /privacy', async () => {
  const r = await call('GET', '/privacy');
  expect(
    r.status === 200 && r.text.includes('MongoDB Atlas'),
    `got ${r.status}`,
  );
});

await step('POST /v1/auth/google (dev stub)', async () => {
  const r = await call('POST', '/v1/auth/google', {
    body: { idToken: 'dev:smoke:smoke@test.dev' },
  });
  expect(r.status === 200 && r.json?.accessToken, `got ${r.status}`);
  token = r.json.accessToken;
});

let subjectId;
await step('POST /v1/subjects', async () => {
  const r = await call('POST', '/v1/subjects', {
    token,
    body: { name: 'Smoke Subject' },
  });
  expect(r.status === 201 && r.json?.id, `got ${r.status}`);
  subjectId = r.json.id;
});

await step('POST /v1/topics', async () => {
  const r = await call('POST', '/v1/topics', {
    token,
    body: { name: 'Smoke Topic', subjectId, studiedOn: today },
  });
  expect(r.status === 201 && r.json?.revisions?.length > 0, `got ${r.status}`);
  topic = r.json;
});

const revPath = () =>
  `/v1/topics/${topic.id}/revisions/${topic.revisions[0].id}`;

await step('complete R1', async () => {
  const r = await call('POST', `${revPath()}/complete`, {
    token,
    body: { doneOn: today },
  });
  expect(r.status === 200, `got ${r.status} ${r.text}`);
});

await step('undo R1', async () => {
  const r = await call('POST', `${revPath()}/undo`, { token, body: {} });
  expect(r.status === 200, `got ${r.status} ${r.text}`);
});

await step('GET /v1/agenda', async () => {
  const r = await call('GET', `/v1/agenda?today=${today}`, { token });
  expect(r.status === 200, `got ${r.status}`);
});

await step('DELETE /v1/me', async () => {
  const r = await call('DELETE', '/v1/me', { token });
  expect(r.status === 204 || r.status === 200, `got ${r.status}`);
});

console.log('Smoke test passed.');
