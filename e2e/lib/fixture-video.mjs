import fs from 'node:fs';
import path from 'node:path';
import { launch } from './harness.mjs';

/**
 * A short video file for the recorded-clip frame source.
 *
 * Generated rather than committed: a binary in the repo for one test is worth
 * avoiding, and Playwright can record an animated canvas in a few seconds. The
 * content does not matter — MediaPipe will not find a person in it either way.
 * What is under test is that the pipeline runs on a file at all, and that the
 * source resolution and label follow the switch.
 */
export async function ensureFixtureVideo(scratch) {
  const out = path.join(scratch, 'clip.webm');
  if (fs.existsSync(out)) return out;

  fs.mkdirSync(scratch, { recursive: true });
  const browser = await launch(['--enable-unsafe-swiftshader']);
  const context = await browser.newContext({
    recordVideo: { dir: scratch, size: { width: 640, height: 480 } },
    viewport: { width: 640, height: 480 },
  });
  const page = await context.newPage();
  await page.setContent(`<canvas id=c width=640 height=480></canvas><script>
    const x = document.getElementById('c').getContext('2d');
    let t = 0;
    setInterval(() => {
      t += 0.05;
      x.fillStyle = '#123'; x.fillRect(0, 0, 640, 480);
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(320 + Math.sin(t) * 200, 240 + Math.cos(t) * 120, 60, 0, 7);
      x.fill();
    }, 33);
  </script>`);
  await page.waitForTimeout(5000);
  const recorded = await page.video().path();
  await context.close();
  await browser.close();
  fs.renameSync(recorded, out);
  return out;
}
