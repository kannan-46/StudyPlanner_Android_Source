import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfig = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
);
const vercelEntrypoint = await readFile(new URL('../api/server.ts', import.meta.url), 'utf8');

test('Vercel forwards the API suffix through the server function', () => {
  assert.equal(vercelConfig.framework, null);
  assert.equal(vercelConfig.outputDirectory, 'public');
  assert.deepEqual(vercelConfig.routes, [
    {
      src: '/api/server/(?<path>.*)',
      dest: '/api/server',
      transforms: [
        {type: 'request.path', op: 'set', args: '/$path'},
      ],
    },
  ]);
});

test('Vercel entrypoint explicitly constructs an Express app and exports its HTTP server', () => {
  assert.match(vercelEntrypoint, /import express from ["']express["']/);
  assert.match(vercelEntrypoint, /const app = express\(\)/);
  assert.match(vercelEntrypoint, /createApiServer\(app\)/);
  assert.match(vercelEntrypoint, /export default httpServer/);
});
