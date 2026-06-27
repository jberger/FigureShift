# FigureShift — Progress & Status Indicators design

**Date:** 2026-06-27
**Status:** Approved.

## Goal

Give the long operations (library scan, push) visible feedback, and surface failures in the UI (not just the console) — as one consistent "status" surface with in-progress / success / error states.

## Behavior

- **Scan:** while `scan(root)` runs, show an indeterminate "Scanning your library…" status (scan returns all at once). On failure, show a red error instead of a blank screen.
- **Push (determinate):** `pushMachine` emits progress over a new `push:progress` main→renderer event channel. Phases → labels: `metadata` "Saving gallery details…", `upload` **"Uploading photo N of M…"** (with a progress bar), `captions` "Updating captions…", `deletes` "Removing photos…", `finalize` "Finishing…". The editor subscribes **only during its own push** (subscribe before, unsubscribe after) so push-all doesn't cross-talk.
- **Push-all:** keep the "Pushing machine X of Y: «relPath»…" line (styled as status); tally failures; end with "Pushed X, Y failed" + the failed relPaths.
- **Errors as status:** scan failures, per-machine push failures, and push-all failures all surface in red in the relevant status area.

## Architecture

- `src/main/pushProgress.ts` — pure: `type PushProgress = { phase: 'metadata' | 'upload' | 'captions' | 'deletes' | 'finalize'; current?: number; total?: number }` and `pushProgressLabel(p: PushProgress): string`. Unit-tested; importable by both main and renderer (no node deps).
- `src/main/push.ts` — `pushMachine(client, absPath, onProgress?: (p: PushProgress) => void)` emits at each phase (and per uploaded photo with `current/total`).
- `src/main.ts` — the `machine:push` handler forwards `onProgress` via `event.sender.send('push:progress', p)`.
- `src/preload.ts` + `src/figureshift.d.ts` — `onPushProgress(cb) => () => void` (subscribe, returns unsubscribe).
- `src/App.tsx` — scan spinner + scan error (try/catch around `scan`).
- `src/renderer/MachineEditor.tsx` — subscribe during push; show the live phase/bar; success or red error after.
- `src/renderer/ReviewScreen.tsx` — push-all failure tally + summary.
- `src/index.css` — `.progress-bar` (track + fill) and a success status variant.

## Scope

In: scan spinner, determinate push progress + bar, push-all failure summary, in-UI errors. Out: determinate scan counts, a persistent per-row error badge.

## Testing

Pure `pushProgressLabel` → Vitest. Eventing + UI verified live (`npm start`): scan a folder (spinner), push a multi-photo machine (photo N of M + bar), push-all (X of Y + any failures), and a forced failure shows red. Existing suites + `tsc` stay green.
