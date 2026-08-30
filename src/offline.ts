import { MODEL_VARIANTS, MODEL_VARIANT_IDS } from './engine/poseDetector';

/**
 * Service-worker registration and cache warming.
 *
 * Registration is production-only on purpose: in dev, Vite serves unbundled
 * modules that change on every edit, and a cache-first worker in front of that
 * is a debugging trap. The offline guarantee is a property of the deployed
 * build, and that is where it should be verified.
 */

/**
 * The app's own bundle, read off the live document.
 *
 * These filenames carry a content hash that changes on every build, so they
 * cannot be written down anywhere ahead of time — and the worker cannot cache
 * them on its own during the very first load, because the page requests them
 * before the worker has taken control. Harvesting them from the DOM is what
 * closes that gap: without it, a reload with no network serves a cached
 * index.html that then fails to fetch its own script, which looks exactly like
 * the offline support working right up until the screen stays blank.
 */
function appShellUrls(): string[] {
  const base = import.meta.env.BASE_URL;
  const urls = [
    base,
    `${base}index.html`,
    `${base}manifest.webmanifest`,
    `${base}favicon.svg`,
  ];
  document
    .querySelectorAll<HTMLScriptElement>('script[src]')
    .forEach((el) => urls.push(el.src));
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')
    .forEach((el) => urls.push(el.href));
  return urls.filter((url) => {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Everything that must be in the cache before the network can be pulled away.
 * The WASM runtime is listed in its SIMD form only — every browser that can run
 * this at a usable frame rate has SIMD, and the no-SIMD build is another 10MB
 * to hold for a case that would be too slow to demo anyway.
 */
function criticalUrls(): string[] {
  const base = import.meta.env.BASE_URL;
  return [
    ...appShellUrls(),
    `${base}wasm/vision_wasm_internal.js`,
    `${base}wasm/vision_wasm_internal.wasm`,
    ...MODEL_VARIANT_IDS.map((id) => MODEL_VARIANTS[id].path),
  ];
}

/**
 * How the offline guarantee is actually doing.
 *
 * A boolean was not enough: "not ready" covered a browser with no service
 * worker at all (iOS Private Browsing), a registration that was rejected, a
 * warm still downloading 15MB of models, and a warm that gave up — four
 * situations with four different responses, all rendering as the same shrug.
 */
export type OfflineStatus =
  | 'unsupported'
  | 'registering'
  | 'caching'
  | 'ready'
  | 'failed';

function serviceWorkerAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!serviceWorkerAvailable()) return;

  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    // Registering with an explicit scope keeps the worker's control limited to
    // this app's subtree, which matters on a host where other projects share
    // the origin — a GitHub Pages user site, for instance.
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}

/**
 * Ask the worker to fill any gaps in the offline set, and resolve with whether
 * everything is now stored. Called once the app is already running, so the
 * download of the variant the user has not selected never competes with the
 * cold start.
 */
export function warmOfflineCache(): Promise<OfflineStatus> {
  // In dev there is deliberately no worker, so there is nothing to be ready
  // about — say so rather than claiming a failure.
  if (!import.meta.env.PROD) return Promise.resolve('unsupported');
  if (!serviceWorkerAvailable()) return Promise.resolve('unsupported');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: OfflineStatus) => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(status);
    };

    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'warm-result') {
        finish(event.data.ready ? 'ready' : 'failed');
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage);

    navigator.serviceWorker.ready
      .then((registration) => {
        const worker = registration.active;
        if (!worker) return finish('failed');
        worker.postMessage({ type: 'warm', urls: criticalUrls() });
        // Downloading ~15MB of models over a slow connection is allowed to take
        // a while, but the badge should not hang forever if the worker dies.
        setTimeout(() => finish('failed'), 120_000);
      })
      .catch(() => finish('failed'));
  });
}
