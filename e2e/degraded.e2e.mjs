import path from 'node:path';
import {
  launch,
  openPage,
  waitForReady,
  openSection,
  createReporter,
  CAMERA_ARGS,
} from './lib/harness.mjs';
import { serve, distWithoutModels, ROOT } from './lib/serve.mjs';

/**
 * Two ways the app can be running while quietly degraded, and the requirement
 * that it says so instead of looking healthy.
 *
 * 1. WebGL unavailable — MediaPipe's GPU delegate is refused. The fallback
 *    ladder must try CPU rather than retrying the same delegate against a
 *    different host, and because MediaPipe shares one WASM module per page a
 *    failed GPU graph poisons it, so the app must surface the failure and
 *    persist CPU for the next load rather than hanging.
 * 2. The bundled model 404s — the hosted copy must be used, the local runtime
 *    kept, and the UI must flag that this run will NOT survive airplane mode.
 */

const APP_URL = process.argv[2] ?? process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const SCRATCH = path.join(ROOT, 'node_modules', '.cache', 'e2e');
const reporter = createReporter('Degraded runs');

/** Remove WebGL from the page without touching the compositor.
 *
 * Browser flags cannot do this cleanly: disabling the GPU also takes down the
 * compositor, so requestAnimationFrame never fires and the loop reports zero
 * frames for reasons unrelated to the detector — while --disable-webgl leaves
 * swiftshader still handing out contexts. Overriding getContext is the shape
 * of the real failure: MediaPipe asks for a webgl2 context and does not get
 * one, while 2D canvas, video decode and the compositor keep working.
 */
const BLOCK_WEBGL = () => {
  const block = (proto) => {
    if (!proto) return;
    const original = proto.getContext;
    proto.getContext = function (type, ...rest) {
      if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
      return original.call(this, type, ...rest);
    };
  };
  block(HTMLCanvasElement.prototype);
  // Emscripten creates its GL context off an OffscreenCanvas, so blocking only
  // the DOM canvas leaves the delegate perfectly happy.
  block(typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas.prototype : null);
};

// ---------------------------------------------------------- GPU unavailable
{
  const browser = await launch(CAMERA_ARGS);
  const { page } = await openPage(browser, {});
  const warnings = [];
  page.on('console', (m) => {
    if (/fell back/i.test(m.text())) warnings.push(m.text());
  });
  await page.addInitScript(BLOCK_WEBGL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  const surfaced = await page
    .waitForFunction(() => /Inference is failing/i.test(document.body.innerText), { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  reporter.record('a dead detector surfaces instead of hanging', surfaced);
  reporter.record('the ladder tried the CPU delegate', warnings.some((w) => /CPU delegate/i.test(w)),
    (warnings[0] ?? '').slice(0, 60));

  const stored = await page.evaluate(() => localStorage.getItem('pose-coach:delegate'));
  reporter.record('CPU is persisted for the next load', stored === 'CPU', String(stored));
  reporter.record('the remedy names a reload', /Reload the page/i.test(await page.locator('body').innerText()));

  // The reload is the actual recovery: a fresh page means a clean WASM module.
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const recovered = await waitForReady(page).then(() => true).catch(() => false);
  reporter.record('reload recovers on the persisted delegate', recovered);
  await openSection(page, /Pre-flight/i);
  reporter.record('pre-flight reports it is running on CPU',
    /Running on CPU/i.test(await page.locator('body').innerText()));

  await browser.close();
}

// -------------------------------------------------- bundled assets missing
{
  const dir = distWithoutModels(SCRATCH);
  const server = await serve(dir, { vary: true });
  const browser = await launch(CAMERA_ARGS);
  const { page } = await openPage(browser, {});

  // The real model CDN is not reachable from every build environment, so it is
  // stood in for by the same file served locally. The app still takes its
  // genuine CDN code path — it just gets an answer.
  await page.route('https://storage.googleapis.com/**', async (route) => {
    const name = route.request().url().split('/').pop();
    const res = await fetch(new URL(`models/${name}`, APP_URL).href);
    if (!res.ok) return route.fulfill({ status: 404, body: '' });
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from(await res.arrayBuffer()),
    });
  });

  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  const up = await waitForReady(page).then(() => true).catch(() => false);
  reporter.record('still runs when the bundled model is missing', up);

  await openSection(page, /Pre-flight/i);
  const t = await page.locator('body').innerText();
  reporter.record('flags that assets came from a CDN', /Assets served from CDN/i.test(t));
  reporter.record('still reports the requested delegate', /Running on GPU/i.test(t));
  reporter.record('warns the run will not survive airplane mode', /NOT survive airplane mode/i.test(t));

  await browser.close();
  await server.close();
}

const { failed } = reporter.summary();
process.exit(failed ? 1 : 0);
