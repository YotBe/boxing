import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, serve, ROOT, DIST } from './lib/serve.mjs';

/**
 * Build once, serve once, run every suite against it.
 *
 * The static server sends `Vary: Origin` deliberately — real hosts do, and it
 * is what made the offline cache bug reproducible. Testing against a server
 * that omits it would let that class of bug back in unnoticed.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITES = ['flows', 'offline', 'smoke', 'sources', 'degraded'];
const only = process.argv[2];

ensureBuild();
const server = await serve(DIST, { vary: true });
console.log(`serving ${DIST} at ${server.url}`);

const run = (name) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(HERE, `${name}.e2e.mjs`), server.url],
      { stdio: 'inherit', cwd: ROOT },
    );
    child.on('exit', (code) => resolve({ name, code: code ?? 1 }));
  });

const results = [];
for (const name of SUITES) {
  if (only && only !== name) continue;
  results.push(await run(name));
}

await server.close();

console.log('\n================ ALL SUITES ================');
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name}`);
const failed = results.filter((r) => r.code !== 0);
console.log(`${results.length - failed.length}/${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
