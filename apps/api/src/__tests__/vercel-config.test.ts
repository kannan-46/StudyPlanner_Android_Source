import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('vercel.json', () => {
  const cfg = JSON.parse(
    readFileSync(join(__dirname, '../../vercel.json'), 'utf8'),
  );

  it('routes /api/server/* to the api/index function', () => {
    expect(cfg.functions).toHaveProperty(['api/index.ts']);
    expect(cfg.routes[0].src).toBe('/api/server/(?<path>.*)');
    expect(cfg.routes[0].dest).toBe('/api');
    expect(cfg.routes[0].transforms[0]).toMatchObject({
      type: 'request.path',
      op: 'set',
      args: '/$path',
    });
  });
});
