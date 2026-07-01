# FigureShift — Pick up new photos in a machine folder

**Date:** 2026-06-30
**Status:** Approved, ready for planning

## Problem

Beta testers want to add photos to a machine *while FigureShift is open*. Today they can't: `scanLibrary` only seeds `machine.yaml` for folders that lack one; for a folder that already has a `machine.yaml`, it reads the yaml as-is and **never reconciles the photo list against the files on disk** (`src/main/scan.ts:38`). A photo dropped into an existing machine folder is invisible to FigureShift, no matter how many times the library is reopened.

The core need is a **reconcile step**: diff the files on disk against `machine.yaml`'s photo list and pick up the new ones. Every UI trigger the testers imagined (button, tab-switch rescan, watcher, drag-to-copy) is just a different way to fire that one engine.

## Scope

**In this slice:**
- The reconcile engine.
- **Tab-switch auto-rescan**, including the first tab shown at startup.
- A **per-machine "Check for new photos" button**.
- **Flagging** yaml entries whose file is missing from disk, with a manual **Remove** action.
- A brief **notice** when new photos are picked up.

**Out of scope → backlog:**
- Discovering brand-new *machine folders* added while the app is open (needs a library-level rescan + adding a tab).
- Dragging external files onto the app to copy them into a folder.
- A live directory watcher (the two triggers above cover the workflow without cross-platform watcher risk).

## Design

### 1. The engine (main process)

New module `src/main/rescan.ts`:

```ts
reconcileMachineDir(absPath: string): { added: string[]; missing: string[] }
```

- Lists image files **directly** in `absPath` (reuses `isImageFile` from `library.ts`).
- Reads the current photo list from `machine.yaml` (`readMachineYaml`).
- `added` = image files on disk **not** present in the yaml photo list, sorted (deterministic, matching `findMachineDirs`).
- `missing` = files named in the yaml photo list with **no** matching file on disk.
- **Does not write yaml or mutate anything** — it only reports. This keeps it trivially testable and, crucially, lets the renderer perform the merge so it never clobbers a user's unsaved role/caption/order edits. (Role and caption edits don't change the file set, so computing `added`/`missing` from the on-disk yaml is correct even when the renderer holds unsaved edits.)

Matching is by exact filename string (as returned by `readdir` / stored in yaml). Already-listed files and `-edited` files are therefore never re-added.

Wired through a new IPC channel `machine:rescan`: main handler + `preload.ts` (`rescan: (absPath) => invoke('machine:rescan', absPath)`) + type in `figureshift.d.ts`.

### 2. Triggers (both call one renderer routine)

A single `rescan()` in `MachineEditor`:
1. calls `window.figureshift.rescan(absPath)`;
2. appends each `added` file to the **current in-memory** `doc.photos` as `role: 'gallery'` (unsaved edits survive);
3. saves via the existing `saveMachine` and bubbles up via `onSaved` (so the pickup persists across tab switches within the session and to disk);
4. stores the `missing` set and the `added` set in component state (for flagging + highlight).

If `added` is empty **and** `missing` is empty, `rescan()` makes no write and shows no notice.

- **Tab-switch auto-rescan / first tab at startup.** `ReviewScreen` renders `<MachineEditor key={current.relPath}>`, so each tab is a distinct mount. `rescan()` is hooked into `MachineEditor`'s mount effect (the existing `[machine.relPath]` effect at `MachineEditor.tsx:42`). **The trigger is "on mount," not "on tab change"** — the first render at startup is itself a mount, so machine 0 on a fresh session is rescanned by the same code path as every later tab. This is the base case, not an exception; a future refactor must not guard the effect to skip its initial run.

- **Per-machine button.** A "Check for new photos" button by the Photos header calls the same `rescan()`. Works even while already sitting on the tab.

### 3. Feedback & missing-file flagging

- **Notice:** a brief message near the Photos section, e.g. `Added 2 new photo(s).` — with `— 1 photo's file is missing` appended when applicable. Newly-added gallery cards land at the end of the gallery and receive a short highlight so they're easy to spot (`PhotoGrid` gets the `added` set for this).
- **Missing flag:** `PhotoGrid` takes a `missing` set. A card whose file is gone (its `figimg://` thumbnail would 404 anyway) renders a "File not found" badge in place of the broken image, plus a small **Remove** action that filters the entry out of `doc.photos` and saves. This makes the flag actionable without the risky silent auto-delete.

## Testing

TDD, following the temp-dir style of `src/main/scan.test.ts`. Unit tests for `reconcileMachineDir`:
- new file on disk → appears in `added`;
- yaml entry with no file on disk → appears in `missing`;
- already-listed file and `-edited` file → not re-added;
- non-image files → ignored;
- yaml file is left unchanged on disk (no mutation).
