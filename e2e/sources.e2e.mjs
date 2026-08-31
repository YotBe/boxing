import path from 'node:path';
import { launch, openPage, waitForReady, readFps, createReporter } from './lib/harness.mjs';
import { ensureFixtureVideo } from './lib/fixture-video.mjs';
import { ROOT } from './lib/serve.mjs';

/**
 * The frame source is swappable and the engine cannot tell the difference —
 * it receives an HTMLVideoElement either way. That is what makes a recorded
 * clip a complete stand-in when a room's lighting or a permission prompt lets
 * the camera down.
 *
 * Round-tripping in both directions matters: detaching a file source used to
 * set `video.src = ''`, which resolves against the document APP_URL, so browsers
 * went off and tried to load the page itself as a video.
 */

const APP_URL = process.argv[2] ?? process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const SCRATCH = path.join(ROOT, 'node_modules', '.cache', 'e2e');

const reporter = createReporter('Frame sources');
const clip = await ensureFixtureVideo(SCRATCH);

const browser = await launch();
const { page, errors, noise } = await openPage(browser, { url: APP_URL });
await waitForReady(page);

const source = async () =>
  (await page.locator('body').innerText()).match(/source\s+([^\n]+)/i)?.[1] ?? '';

const step = async (label, action, expect) => {
  await action();
  await page.waitForTimeout(10000);
  const s = await source();
  reporter.record(label, expect.test(s) && (await readFps(page)) !== '0', s);
};

reporter.record('starts on the front camera', /front camera/i.test(await source()), await source());

await step('switches to the recorded clip', () => page.setInputFiles('input[type=file]', clip), /file · clip\.webm/i);
await step('switches to the rear camera', () => page.getByRole('button', { name: /^Rear$/ }).click(), /rear camera/i);
await step('back to the clip from a camera', () => page.setInputFiles('input[type=file]', clip), /file · clip\.webm/i);
await step('back to the front camera from a file', () => page.getByRole('button', { name: /^Front$/ }).click(), /front camera/i);

reporter.noErrors('no app console errors across the round trip', errors, noise);

await browser.close();
const { failed } = reporter.summary();
process.exit(failed ? 1 : 0);
