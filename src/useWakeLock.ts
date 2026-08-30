import { useEffect, useState } from 'react';

/**
 * Hold a screen wake lock while `enabled` is true.
 *
 * Without this the phone dims and locks part-way through a demo, taking the
 * camera stream with it. The lock is dropped by the browser whenever the tab
 * is hidden, so it has to be re-acquired on every return to visibility rather
 * than requested once at startup.
 *
 * Returns whether a lock is currently held — reported honestly, because Safari
 * before 16.4 and some Android browsers have no Wake Lock API at all, and a
 * badge claiming otherwise would be worse than one admitting the truth.
 */
export function useWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const anyNavigator = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
    };
    if (!anyNavigator.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const release = () => {
      setActive(false);
      sentinel = null;
    };

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await anyNavigator.wakeLock!.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setActive(true);
        lock.addEventListener('release', release);
      } catch {
        // Denied (low battery, or the tab lost visibility mid-request). The
        // visibility handler will try again on the next return to foreground.
        setActive(false);
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
      setActive(false);
    };
  }, [enabled]);

  return active;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
