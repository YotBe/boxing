import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Shared plumbing for the end-to-end suites.
 *
 * Every suite needs the same four things: a browser that can find its own
 * Chromium, a page with the app's local storage seeded before navigation, a
 * reliable "the app is running" signal, and a way to tell a genuine app error
 * apart from the library noise MediaPipe writes to console.error. Doing that
 * once here is what keeps each suite file about its own assertions.
 */

/** Chromium's fake camera is a moving pattern — enough to drive the pipeline. */
export const CAMERA_ARGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader',
];

/**
 * `--use-fake-ui-for-media-stream` auto-accepts the permission prompt, so it
 * has to be left out of any test that wants a denial to actually happen.
 */
export const NO_AUTOGRANT_ARGS = CAMERA_ARGS.filter(
  (a) => a !== '--use-fake-ui-for-media-stream',
);

/**
 * Find a Chromium that Playwright did not download itself.
 *
 * Some environments pre-provision browsers under PLAYWRIGHT_BROWSERS_PATH at a
 * build number that does not match the installed Playwright — which makes the
 * default launch fail even though a perfectly good Chromium is sitting there.
 * Rather than pin the dependency to whatever revision happens to be baked into
 * an image, fall back to scanning for one.
 */
function findInstalledChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;
  const candidates = fs
    .readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    // Prefer the full build over the headless shell: the shell cannot do the
    // fake-camera and WebGL work these suites depend on.
    .sort((a, b) => (a.includes('headless') ? 1 : 0) - (b.includes('headless') ? 1 : 0))
    .map((d) => path.join(root, d, 'chrome-linux', 'chrome'));
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/**
 * Launch Chromium. CHROMIUM_PATH wins if set; then Playwright's own resolution;
 * then any pre-provisioned build found on this machine.
 */
export async function launch(args = CAMERA_ARGS) {
  const attempts = [];
  if (process.env.CHROMIUM_PATH) attempts.push(process.env.CHROMIUM_PATH);
  attempts.push(undefined); // Playwright's own download
  const found = findInstalledChromium();
  if (found) attempts.push(found);

  let lastError;
  for (const executablePath of attempts) {
    try {
      return await chromium.launch({ executablePath, args });
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Could not launch Chromium. Run "npx playwright install chromium", ` +
      `or set CHROMIUM_PATH to an existing binary.\nUnderlying error: ${lastError?.message}`,
  );
}

/** MediaPipe is an Emscripten build: its stderr surfaces as console.error. */
const LIBRARY_NOISE =
  /^INFO:|^[IWE]\d{4} \d{2}:\d{2}:\d{2}|GL Driver Message|WebGL-0x|Using NORM_RECT without IMAGE_DIMENSIONS/;

/**
 * A page with console output classified. Library noise is kept separately
 * rather than discarded, so a real error can never hide behind the filter.
 *
 * `seed` writes localStorage before any app code runs, which is how dev mode
 * and the persistence fixtures are set up.
 */
export async function openPage(
  browser,
  { dev = true, permissions = ['camera'], seed = null, viewport, url } = {},
) {
  const mobile = !viewport;
  const context = await browser.newContext({
    permissions,
    viewport: viewport ?? { width: 414, height: 896 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = [];
  const noise = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    (LIBRARY_NOISE.test(m.text()) ? noise : errors).push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e}`));

  // Seeds *initial* state, once. addInitScript runs on every navigation, so
  // writing unconditionally would re-assert these values on each reload — and
  // silently defeat any test of whether the app persists them itself.
  await page.addInitScript(
    ([devOn, seeded]) => {
      try {
        if (sessionStorage.getItem('__e2e_seeded')) return;
        sessionStorage.setItem('__e2e_seeded', '1');
        localStorage.setItem('pose-coach:dev', devOn ? '1' : '0');
        if (seeded) {
          for (const [k, v] of Object.entries(seeded)) localStorage.setItem(k, v);
        }
      } catch {}
    },
    [dev, seed],
  );

  if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { context, page, errors, noise };
}

/**
 * Wait until the app is actually running.
 *
 * The Calibrate button is disabled on `!cameraReady || !detectorReady`, which
 * makes it a precise readiness signal — and unlike the frame-rate readout it
 * still exists with dev mode off, where the telemetry overlay is hidden.
 */
export async function waitForReady(page, timeout = 60000) {
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Calibrate',
      );
      if (btn) return !btn.disabled;
      // Combos mode has no Calibrate button; fall back to the fps readout.
      return (document.body.innerText.match(/(\d+(\.\d+)?)\s*fps/i)?.[1] ?? '0') !== '0';
    },
    { timeout },
  );
  // Let the render loop produce its first telemetry sample.
  await page.waitForTimeout(1200);
}

/** Current rolling frame rate as shown in the telemetry overlay (dev mode). */
export async function readFps(page) {
  const t = await page.locator('body').innerText();
  return t.match(/(\d+(\.\d+)?)\s*fps/i)?.[1] ?? '0';
}

/** Expand a collapsible Section by its title if it is not already open. */
export async function openSection(page, name) {
  const btn = page.getByRole('button', { name }).first();
  if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
  await page.waitForTimeout(300);
}

/** Collects results and decides the process exit code. */
export function createReporter(suiteName) {
  const results = [];
  const allNoise = [];
  console.log(`\n=== ${suiteName} ===`);
  return {
    record(name, ok, detail = '') {
      results.push({ name, ok, detail });
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    /** Assert a page produced no *app* errors, keeping library noise aside. */
    noErrors(name, errors, noise = []) {
      allNoise.push(...noise);
      this.record(name, errors.length === 0, errors.slice(0, 2).join(' | '));
    },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} passed — ${suiteName}`);
      if (allNoise.length) {
        const uniq = [...new Set(allNoise.map((t) => t.split('\n')[0].slice(0, 90)))];
        console.log(`(library noise via console.error, not app errors: ${allNoise.length} lines, ${uniq.length} distinct)`);
      }
      if (failed.length) {
        console.log('FAILURES:');
        failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
      }
      return { passed: results.length - failed.length, total: results.length, failed: failed.length };
    },
  };
}
