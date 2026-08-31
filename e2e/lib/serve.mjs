import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.task': 'application/octet-stream',
  '.json': 'application/json',
};

/**
 * Build `dist/` unless it is already there.
 *
 * `base` is passed through as BASE_PATH so the subdirectory build (the one a
 * GitHub Pages project site would get) can be exercised too.
 */
export function ensureBuild({ base = '/', force = false } = {}) {
  if (!force && base === '/' && fs.existsSync(path.join(DIST, 'index.html'))) return DIST;
  execSync('npm run build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BASE_PATH: base },
  });
  return DIST;
}

/**
 * Serve a directory over HTTP.
 *
 * Deliberately a plain static server rather than `vite preview`: these suites
 * need to serve variants (a subdirectory base, a copy with the models deleted)
 * and to control exactly which headers are sent, and `vite preview` sends
 * `Vary: Origin` — which is what made the offline cache bug reproducible in the
 * first place, so it is worth being able to choose.
 */
export async function serve(dir, { base = '/', port = 0, vary = false } = {}) {
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(req.url.split('?')[0]);
    if (base !== '/' && !pathname.startsWith(base)) {
      res.writeHead(404);
      return res.end('outside base');
    }
    const rel = base === '/' ? pathname.slice(1) : pathname.slice(base.length);
    let file = path.join(dir, rel || 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // Unknown path inside the app: fall through to the SPA entry, except for
      // asset directories where a 404 is the thing under test.
      if (/^\/(models|wasm|assets)\//.test(pathname.replace(base, '/'))) {
        res.writeHead(404);
        return res.end('not found');
      }
      file = path.join(dir, 'index.html');
    }
    const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
    if (vary) headers.Vary = 'Origin';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actual = server.address().port;
  return {
    url: `http://127.0.0.1:${actual}${base}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * A copy of the build with `models/` removed, so the detector's bundled model
 * 404s and the hosted-model rung of the fallback ladder is exercised.
 */
export function distWithoutModels(scratch) {
  const target = path.join(scratch, 'nomodels');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(DIST, target, { recursive: true });
  fs.rmSync(path.join(target, 'models'), { recursive: true, force: true });
  return target;
}

export { ROOT, DIST };
