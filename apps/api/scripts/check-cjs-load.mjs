// Simulates Vercel's CommonJS runtime: compiles the API without path aliases
// and loads the serverless entry with require(esm) disabled. Fails on any
// ERR_REQUIRE_ESM (an ESM-only dependency). Run before deploying.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(fileURLToPath(import.meta.url), '..', '..');
const rootDir = resolve(apiDir, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'planner-cjs-'));
const outDir = join(tmp, 'out');
const slash = p => p.split(String.fromCharCode(92)).join('/');

let status = 1;
try {
  const tsconfig = join(tmp, 'tsconfig.json');
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: slash(join(apiDir, 'tsconfig.json')),
      compilerOptions: {
        paths: {},
        types: ['node'],
        noEmit: false,
        rootDir: slash(apiDir),
        outDir: slash(outDir),
      },
      include: [slash(join(apiDir, 'src')), slash(join(apiDir, 'api'))],
      exclude: [slash(join(apiDir, 'src')) + '/**/*.test.ts'],
    }),
  );
  const tsc = join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  const c = spawnSync(process.execPath, [tsc, '-p', tsconfig], {
    cwd: apiDir,
    stdio: 'inherit',
  });
  if (c.status !== 0) throw new Error('tsc compile failed');

  const entry = join(outDir, 'api', 'index.js');
  const r = spawnSync(
    process.execPath,
    [
      '--no-experimental-require-module',
      '-e',
      `require(${JSON.stringify(entry)})`,
    ],
    {
      cwd: apiDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: [
          join(apiDir, 'node_modules'),
          join(rootDir, 'node_modules'),
        ].join(delimiter),
      },
    },
  );
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0 || /ERR_REQUIRE_ESM/.test(r.stderr ?? '')) {
    throw new Error('CommonJS load failed (ESM-only dependency?)');
  }
  console.log('check:cjs OK - API entry loads as CommonJS');
  status = 0;
} catch (e) {
  console.error(String(e.message ?? e));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(status);
