import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfig = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
);

test('Vercel forwards the API suffix through the server function', () => {
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
