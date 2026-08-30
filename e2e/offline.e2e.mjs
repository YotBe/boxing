import {
  launch,
  openPage,
  waitForReady,
  openSection,
  createReporter,
} from './lib/harness.mjs';

/**
 * The headline guarantee: after one successful load the app cold-starts and
 * runs with the network switched off entirely.
 *
 * Worth stating what makes this test meaningful: it must run against a host
 * that sends `Vary: Origin`, because that header is what broke offline in the
 * first place. The Cache API honours Vary by default, so an entry stored by a
 * worker-initiated fetch stopped matching the page's own request for the same
 * APP_URL — a silent miss that failed hard offline. `serve.mjs` sends the header
 * for exactly this reason.
 */

const APP_URL = process.argv[2] ?? process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const reporter = createReporter('Offline');
const browser = await launch();
const { context, page, errors, noise } = await openPage(browser, { url: APP_URL });

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1);

await waitForReady(page);
reporter.record('first load reaches a running state', true, `${at()}s`);

// Pre-flight carries the offline status row.
await openSection(page, /Pre-flight/i);
const ready = await page
  .waitForFunction(() => /offline ready/i.test(document.body.innerText), { timeout: 120000 })
  .then(() => true)
  .catch(() => false);
reporter.record('service worker reports the offline set is stored', ready, `${at()}s`);

// Enumerate every cache rather than naming one. An earlier version of this
// check opened 'pose-engine-v1' by name; when the worker bumped to v2 it began
// reporting an empty cache and passing regardless — proving nothing at all.
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const name of names) {
    const cache = await caches.open(name);
    out[name] = (await cache.keys()).map((r) => new URL(r.url).pathname).sort();
  }
  return out;
});
const names = Object.keys(cached);
const entries = names.flatMap((n) => cached[n]);
reporter.record('exactly one cache is in use', names.length === 1, names.join(', '));
reporter.record('both model variants are cached', entries.filter((e) => e.endsWith('.task')).length === 2);
reporter.record('the WASM runtime is cached', entries.some((e) => e.endsWith('.wasm')));
reporter.record('the app bundle is cached', entries.some((e) => /\/assets\/.*\.js$/.test(e)));

// The real test: no network, fresh navigation.
await context.setOffline(true);
const t1 = Date.now();
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
const cameUp = await waitForReady(page).then(() => true).catch(() => false);
const coldStart = ((Date.now() - t1) / 1000).toFixed(1);
reporter.record('cold start with the network off', cameUp, `${coldStart}s`);

// The variant that was never selected must work offline too, which is the
// whole point of warming both models rather than only the one in use.
await page.getByRole('button', { name: /^Full/i }).click();
await page.waitForTimeout(15000);
const text = await page.locator('body').innerText();
reporter.record('switching to the unused variant works offline', !/Failed to load/i.test(text));
reporter.record('no model error surfaced', !/Inference is failing/i.test(text));

reporter.noErrors('no app console errors offline', errors, noise);

await browser.close();
const { failed } = reporter.summary();
process.exit(failed ? 1 : 0);
