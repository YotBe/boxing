import {
  launch,
  openPage,
  waitForReady,
  openSection,
  createReporter,
  CAMERA_ARGS,
  NO_AUTOGRANT_ARGS,
} from './lib/harness.mjs';

/**
 * Flows that were never exercised before this suite existed: the round-timer
 * state machine, the history log, calibration persistence, the mode switch,
 * camera denial, delegate persistence, the tuning sliders and layout overflow.
 *
 * None of it needs a detected human, which is exactly why it is automatable.
 * Each section is independent so one failure does not mask the rest.
 */

const APP_URL = process.argv[2] ?? process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const ONLY = process.argv[3] ?? process.env.E2E_ONLY;
const want = (s) => !ONLY || ONLY === s;

const reporter = createReporter('Untested flows');
const { record } = reporter;
const browser = await launch(CAMERA_ARGS);

/** Open a page against the suite APP_URL, already navigated. */
const open = (opts = {}) => openPage(browser, { url: APP_URL, ...opts });
const running = waitForReady;

// ---------------------------------------------------------------- round timer
if (want('rounds')) {
  console.log('\n=== Round timer state machine ===');
  const { context: ctx, page, errors, noise } = await open();
  await running(page);

  await openSection(page, /Round timer/i);
  const selects = page.locator('select');
  // Movement picker is select 0; rounds/work/rest follow inside the section.
  await selects.nth(1).selectOption('2');
  await selects.nth(2).selectOption('30');
  await selects.nth(3).selectOption('15');
  await page.getByRole('button', { name: /Start session/i }).click();

  const body = () => page.locator('body').innerText();
  await page.waitForTimeout(1500);
  const t1 = await body();
  record('round 1 starts in work phase', /Round 1 of 2/i.test(t1) && /work/i.test(t1),
    (t1.match(/Round \d of \d · \w+/) ?? [''])[0]);

  // 30s work -> rest overlay
  const gotRest = await page
    .waitForFunction(() => /Next: round 2 of 2/i.test(document.body.innerText), { timeout: 45000 })
    .then(() => true).catch(() => false);
  record('work → rest transition + rest overlay', gotRest);

  if (gotRest) {
    const bannerVisible = await page.evaluate(() =>
      [...document.querySelectorAll('div')].some(
        (d) =>
          /Looking for you|Form OK|Adjust your position/.test(d.textContent) &&
          d.className.includes('backdrop-blur') &&
          d.getBoundingClientRect().height > 0,
      ));
    record('rest phase hides the cue banner', !bannerVisible);
  }

  // 15s rest -> round 2 work
  const gotRound2 = await page
    .waitForFunction(() => /Round 2 of 2 · work/i.test(document.body.innerText), { timeout: 40000 })
    .then(() => true).catch(() => false);
  record('rest → round 2 transition', gotRound2);

  // 30s work -> complete. Polled rather than waitForFunction: the page is busy
  // running inference, rAF-based polling starves, and a compound predicate that
  // flips late is indistinguishable from one that never flips. Polling shows
  // the state on the way.
  let gotComplete = false;
  for (let i = 0; i < 24; i++) {
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      return { live: /Round \d of \d/i.test(t), idle: /Round timer/i.test(t) };
    });
    if (!st.live && st.idle) { gotComplete = true; break; }
    await page.waitForTimeout(5000);
  }
  record('final round → session complete, returns to idle', gotComplete);

  reporter.noErrors('no console errors across a full round session', errors, noise);
  await ctx.close();
}

// ------------------------------------------------------------- stop mid-round
if (want('stop')) {
  console.log('\n=== Stop mid-session ===');
  const { context: ctx, page, errors, noise } = await open();
  await running(page);
  await openSection(page, /Round timer/i);
  await page.getByRole('button', { name: /Start session/i }).click();
  await page.waitForTimeout(1500);
  const started = /Round 1 of/i.test(await page.locator('body').innerText());
  await page.getByRole('button', { name: /^Stop$/i }).click();
  await page.waitForTimeout(800);
  const stopped = !/Round 1 of/i.test(await page.locator('body').innerText());
  record('start then stop returns to idle', started && stopped);
  reporter.noErrors('no console errors on stop', errors, noise);
  await ctx.close();
}

// -------------------------------------------------------------- history flow
if (want('history')) {
  console.log('\n=== History persistence ===');
  const seeded = JSON.stringify([
    { id: 'a', movementId: 'jab', movementName: 'Left Jab', timestamp: new Date().toISOString(), reps: 12, peakSpeed: 420 },
    { id: 'b', movementId: 'muaythai-guard', movementName: 'Muay Thai Guard', timestamp: new Date().toISOString(), holdTime: 31 },
  ]);
  const { context: ctx, page, errors, noise } = await open({ seed: { 'pose-coach:history': seeded } });
  await running(page);

  await openSection(page, /History/i);
  // Scope to the History section: the movement dropdown's <option> text also
  // contains these names, so matching document.body proved nothing.
  const historyText = () =>
    page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim().startsWith('History'));
      return btn?.parentElement?.innerText ?? '';
    });
  const t = await historyText();
  record('seeded history renders both entries', /Left Jab/.test(t) && /Muay Thai Guard/.test(t));
  record('rep entry shows reps', /12 reps/.test(t), (t.match(/12 reps/) ?? [''])[0]);
  record('hold entry shows seconds', /31s/.test(t), (t.match(/31s/) ?? [''])[0]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await running(page);
  await openSection(page, /History/i);
  record('history survives reload', /Left Jab/.test(await historyText()));

  await page.getByRole('button', { name: /Clear history/i }).click();
  await page.waitForTimeout(400);
  const afterClear = await historyText();
  const key = await page.evaluate(() => localStorage.getItem('pose-coach:history'));
  record('clear empties the UI', !/Left Jab/.test(afterClear));
  record('clear removes the storage key', key === null || key === '[]', String(key).slice(0, 30));
  reporter.noErrors('no console errors in history flow', errors, noise);
  await ctx.close();
}

// ---------------------------------------------------------- calibration state
if (want('calib')) {
  console.log('\n=== Calibration persistence + failure path ===');
  const cal = JSON.stringify({
    left_hand_height: { min: 80, max: 175 },
    right_hand_height: { min: 82, max: 176 },
    left_elbow: { min: 15, max: 118 },
    right_elbow: { min: 16, max: 119 },
  });
  const { context: ctx, page, errors, noise } = await open({
    seed: { 'pose-coach:calibration:v2:muaythai-guard': cal },
  });
  await running(page);

  const t = await page.locator('body').innerText();
  record('seeded calibration is reflected in the UI', /Calibrated to you/i.test(t));

  await page.getByRole('button', { name: /Reset to defaults/i }).click();
  await page.waitForTimeout(500);
  const after = await page.locator('body').innerText();
  const key = await page.evaluate(() =>
    localStorage.getItem('pose-coach:calibration:v2:muaythai-guard'),
  );
  record('reset clears the stored calibration', key === null, String(key).slice(0, 30));
  record('reset reverts the copy to defaults', /default angle ranges/i.test(after));

  // Nobody is in frame, so a capture must fail cleanly rather than hang or
  // silently persist a bad calibration.
  await page.getByRole('button', { name: /^Calibrate$/i }).click();
  const sawCountdown = await page
    .waitForFunction(() => /Get into your stance/i.test(document.body.innerText), { timeout: 6000 })
    .then(() => true).catch(() => false);
  record('calibration countdown overlay appears', sawCountdown);

  const failed = await page
    .waitForFunction(() => /Couldn.t see your form clearly/i.test(document.body.innerText), { timeout: 20000 })
    .then(() => true).catch(() => false);
  record('capture with nobody in frame fails visibly', failed);
  const keyAfter = await page.evaluate(() =>
    localStorage.getItem('pose-coach:calibration:v2:muaythai-guard'),
  );
  record('failed capture stores nothing', keyAfter === null, String(keyAfter).slice(0, 30));
  reporter.noErrors('no console errors in calibration flow', errors, noise);
  await ctx.close();
}

// --------------------------------------------------------------- mode switch
if (want('modes')) {
  console.log('\n=== Mode switch ===');
  const { context: ctx, page, errors, noise } = await open();
  await running(page);
  const practice = await page.locator('body').innerText();
  record('practice shows movement + Calibrate', /Calibrate/.test(practice));

  await page.getByRole('button', { name: /^Combos$/ }).click();
  await page.waitForTimeout(2000);
  const combos = await page.locator('body').innerText();
  record('combos shows current combo', /Current combo/i.test(combos));
  record('combos hides the Calibrate card', !/^.*Calibrate.*$/m.test(combos.split('Current combo')[0].split('\n').filter(l => /Calibrate/.test(l)).join('')) || !/Calibrate/.test(combos));

  await page.getByRole('button', { name: /^Practice$/ }).click();
  await page.waitForTimeout(1500);
  record('switching back restores practice', /Calibrate/.test(await page.locator('body').innerText()));
  reporter.noErrors('no console errors on mode switching', errors, noise);
  await ctx.close();
}

// -------------------------------------------------------------- camera denied
if (want('denied')) {
  console.log('\n=== Camera permission denied ===');
  // A separate browser: --use-fake-ui-for-media-stream auto-accepts the
  // permission prompt, so with it the camera is granted and this path is
  // unreachable. Dropping it is what makes the denial real.
  const denyBrowser = await launch(NO_AUTOGRANT_ARGS);
  const { page } = await openPage(denyBrowser, { url: APP_URL, permissions: [] });

  const shown = await page
    .waitForFunction(() => /permission was denied/i.test(document.body.innerText), { timeout: 30000 })
    .then(() => true).catch(() => false);
  const t = await page.locator('body').innerText();
  const buttons = await page.locator('button').evaluateAll((els) =>
    els.map((e) => e.textContent.trim()));
  record('denial produces a blocking message, not a blank frame', shown);
  record('the message names the cause', /Camera permission was denied/i.test(t));
  record('states the remedy', /Allow camera access/i.test(t));
  record('offers Retry', buttons.includes('Retry'));
  record('offers the other camera', buttons.some((b) => /Try other camera/i.test(b)));
  record('offers the video-file route', /Video file/i.test(t));
  await denyBrowser.close();
}

// ------------------------------------------------------------- dev + delegate
if (want('persist')) {
  console.log('\n=== Dev mode + delegate persistence ===');
  const { context: ctx, page, errors, noise } = await open({ dev: false });
  await running(page);
  const before = await page.locator('body').innerText();
  record('dev off hides the telemetry overlay', !/ms infer/i.test(before));
  record('dev off hides source/model/compute rows', !/Compute/i.test(before));

  await page.getByRole('button', { name: /^Dev$/ }).click();
  await page.waitForTimeout(1500);
  const on = await page.locator('body').innerText();
  record('dev on reveals telemetry', /ms infer/i.test(on));
  record('dev on reveals the control rows', /Compute/i.test(on));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await running(page);
  record('dev mode survives reload', /ms infer/i.test(await page.locator('body').innerText()));

  // GPU -> CPU has never been exercised (only Lite<->Full).
  await page.getByRole('button', { name: /^CPU$/ }).click();
  const swapped = await page
    .waitForFunction(() => (document.body.innerText.match(/(\d+(\.\d+)?)\s*fps/i)?.[1] ?? '0') !== '0', { timeout: 60000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(1000);
  const delegateKey = await page.evaluate(() => localStorage.getItem('pose-coach:delegate'));
  record('GPU → CPU swap keeps the loop running', swapped);
  record('delegate choice is persisted', delegateKey === 'CPU', String(delegateKey));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await running(page);
  await openSection(page, /Pre-flight/i);
  record('reload comes back on CPU', /Running on CPU/i.test(await page.locator('body').innerText()));
  reporter.noErrors('no console errors across persistence flow', errors, noise);
  await ctx.close();
}

// -------------------------------------------------------------------- tuning
if (want('tuning')) {
  console.log('\n=== Tuning sliders ===');
  const { context: ctx, page, errors, noise } = await open();
  await running(page);
  await openSection(page, /^Tuning$/i);
  const sliders = page.locator('input[type=range]');
  record('both sliders present', (await sliders.count()) === 2, `${await sliders.count()}`);

  // Visibility floor: applies next frame, no rebuild.
  const setRange = (locator, value) =>
    locator.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

  await setRange(sliders.nth(0), 0.2);
  await page.waitForTimeout(1200);
  record('visibility floor applies without a rebuild',
    /0\.20/.test(await page.locator('body').innerText()) &&
    (await page.locator('body').innerText()).match(/(\d+(\.\d+)?)\s*fps/i)?.[1] !== '0');

  // Detection floor: debounces into a landmarker rebuild.
  await setRange(sliders.nth(1), 0.7);
  const backUp = await page
    .waitForFunction(() => (document.body.innerText.match(/(\d+(\.\d+)?)\s*fps/i)?.[1] ?? '0') !== '0', { timeout: 60000 })
    .then(() => true).catch(() => false);
  record('detection floor rebuild recovers to a running loop', backUp);
  reporter.noErrors('no console errors from tuning', errors, noise);
  await ctx.close();
}

// -------------------------------------------------------------------- layout
if (want('layout')) {
  console.log('\n=== Layout ===');
  for (const [label, viewport, dev] of [
    ['phone dev-off', { width: 414, height: 896 }, false],
    ['phone dev-on', { width: 414, height: 896 }, true],
    ['desktop dev-on', { width: 1280, height: 900 }, true],
  ]) {
    const { context: ctx, page } = await open({ dev, viewport });
    await running(page).catch(() => {});
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    record(`${label}: no horizontal overflow`,
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `${overflow.scrollWidth} vs ${overflow.clientWidth}`);
    await ctx.close();
  }
}

await browser.close();
const { failed } = reporter.summary();
process.exit(failed ? 1 : 0);
