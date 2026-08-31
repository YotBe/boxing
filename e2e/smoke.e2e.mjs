import {
  launch,
  openPage,
  waitForReady,
  readFps,
  openSection,
  createReporter,
} from './lib/harness.mjs';

/**
 * A continuous run with the controls exercised mid-flight: model variant,
 * movement config, and the raw-config viewer. The assertion that matters is
 * the absence of console errors, page errors and failed requests across the
 * whole window — this is what catches a detector being handed a frame after
 * it has been torn down, which is how a model swap used to abort the WASM
 * module and spray errors mid-demo.
 */

const APP_URL = process.argv[2] ?? process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const RUN_MS = Number(process.argv[3] ?? process.env.E2E_RUN_MS ?? 70000);

const reporter = createReporter('Continuous run');
const browser = await launch();
const { page, errors, noise } = await openPage(browser, { url: APP_URL });

const failedRequests = [];
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

const t0 = Date.now();
await waitForReady(page);
reporter.record('reaches a running state', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);

const variantLabel = async () =>
  (await page.locator('body').innerText()).match(/model\s+(\w+)/i)?.[1] ?? '?';

await page.getByRole('button', { name: /^Full/i }).click();
await page.waitForTimeout(8000);
reporter.record('switches to Full', (await variantLabel()) === 'Full', `${await readFps(page)} fps`);

await page.getByRole('button', { name: /^Lite/i }).click();
await page.waitForTimeout(6000);
reporter.record('switches back to Lite', (await variantLabel()) === 'Lite', `${await readFps(page)} fps`);

await openSection(page, /Movement config/i);
reporter.record('active config JSON is viewable', await page.locator('pre').first().isVisible());

// The point of the domain-agnostic engine: a different movement is a different
// JSON file and no engine code at all.
await page.locator('select').first().selectOption('arm-raise');
await page.waitForTimeout(4000);
const afterSwitch = await page.locator('body').innerText();
reporter.record('movement switches at runtime', /Arm Raise/.test(afterSwitch));
reporter.record('loop still running after the switch', (await readFps(page)) !== '0');

const remaining = Math.max(0, RUN_MS - (Date.now() - t0));
console.log(`  … settling into a continuous run for ${(remaining / 1000).toFixed(0)}s`);
await page.waitForTimeout(remaining);

reporter.record('still running at the end of the window', (await readFps(page)) !== '0', `${await readFps(page)} fps`);
reporter.noErrors('no app console errors across the run', errors, noise);
reporter.record('no failed requests', failedRequests.length === 0, failedRequests.slice(0, 2).join(' | '));

await browser.close();
const { failed } = reporter.summary();
process.exit(failed ? 1 : 0);
