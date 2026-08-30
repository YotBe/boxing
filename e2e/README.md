# End-to-end verification

Drives the built app in a real browser. Run deliberately, not in CI:

```bash
npm run e2e            # build, serve, run every suite
npm run e2e:flows      # one suite
```

Needs a Chromium. `npx playwright install chromium` if you do not have one; the
harness also picks up a browser already provisioned under
`PLAYWRIGHT_BROWSERS_PATH`, or one named by `CHROMIUM_PATH`.

Takes about six minutes — the round-timer suite runs a session in real time.

## The suites

| Suite | Proves |
| --- | --- |
| `flows` | 49 checks: round-timer state machine, history persistence, calibration, mode switching, camera denial, dev/delegate persistence, tuning sliders, layout overflow |
| `offline` | The offline set is cached, and the app cold-starts with the network off — including the model variant that was never selected |
| `smoke` | A continuous run with model and movement switching, asserting no console errors, page errors or failed requests |
| `sources` | Front camera ↔ recorded clip ↔ rear camera, in both directions |
| `degraded` | GPU refused → CPU ladder → persisted delegate → reload recovers; and bundled model missing → CDN fallback, correctly flagged |

## Two details that carry their weight

**The static server sends `Vary: Origin` on purpose.** Real hosts do, and the
Cache API honours Vary by default — so an entry stored by a worker-initiated
fetch stopped matching the page's own request for the same URL. That silently
broke offline reload, and testing against a server that omits the header would
let the same class of bug back in unnoticed.

**Console errors are classified, not counted.** MediaPipe is an Emscripten
build, so its stderr — including plain `INFO:` lines — arrives as
`console.error`. Library noise is reported separately rather than filtered away,
so a genuine error can never hide behind the filter.

## What this cannot cover

Nothing here puts a **human body in frame**. Chromium's fake camera is a moving
pattern: mean keypoint confidence reads 0.00 and no skeleton is produced. So
every flow gated on a detected pose is out of reach:

- rep counting, hold timing, the form verdict and cue text, the joint-angle rows
- a *successful* calibration capture (the failure path is covered)
- combo step advance and completion

The maths behind those is unit-tested with synthetic landmarks (`npm test`,
44 tests across `angles`, `evaluator`, `dynamics`, `smoothing`, `calibration`
and the movement geometry suites). What remains unproven is the wiring from
detector output to UI state, and that needs a person.

### The manual pass

On a phone, dev mode on:

1. Stand 2–3m back. Skeleton draws, `keypoint conf` above ~0.5. If not, drop the
   visibility floor under Tuning and watch it recover.
2. Hold the guard: banner green, "Form OK". Drop one hand: amber, with the cue
   for *that* hand.
3. Open Joint angles — four rows, markers inside their bands on a good guard.
4. Calibrate holding a good guard. Must end "Calibrated to you"; reload keeps it;
   Reset returns to defaults.
5. Arm Raise (demo config): five raises reads 5. Half-raises must not count.
6. Guard again: held-seconds climbs only while the verdict is green.
7. Switch movement after some reps — the set appears in History.
8. Combos: throw the called strike; the step strip advances and the combo
   completes.
9. Bells at round transitions, voice cues on bad form; both toggles silence them.
10. Note fps and ms on Lite, then Full — the only true numbers, since frame
    rates measured in a container have no bearing on a phone.
