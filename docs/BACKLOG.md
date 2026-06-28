# FigureShift backlog

Running queue of issues/ideas (beta feedback + deferred work). Not prioritized; grab what's ready.

## Inference (make/model/year)

These live mostly in `@joelberger/twdb-client` (`inferMake`/`inferModel`/`suggestTwdbYear`) per the
DT-leads strategy — fix in the library, both DT and FigureShift benefit.

**DONE in twdb-client v0.5.0 (FigureShift now consumes it):**
- ✅ **Specificity tie-break (make AND model).** "Smith Corona" no longer collapses to "Corona", and
  "Deluxe 660TR" isn't shortened to "Deluxe" — on a score tie the longer/more-specific candidate wins.
- ✅ **Built-in alias `SCM` → Smith Corona** (extensible table in `fuzzy.ts`).
- ✅ **Literal `196X` / `19XX` year detection** in `suggestTwdbYear` (arbitrary `12x`-style tokens rejected).
- ✅ **Spacing/hyphen normalization verified** — *de luxe ≡ deluxe*, *Smith-Corona ≡ Smith Corona*,
  *Silver-Reed ≡ Silver Reed* already work via `norm` (covered by tests).

**Still open:**
- **More alias entries + user-defined aliases.** The table is seeded with `SCM`; add other common
  abbreviations, and let users add their own via the settings store (below).
- **2-digit decades / apostrophes** in `suggestTwdbYear` (`60s`, `1960's`) still aren't detected
  (century-ambiguous; lower priority).

## App-wide settings (new infrastructure)

- **Persistent app settings store** (e.g. JSON in Electron `userData`). Enables the items below.
- **User-specified aliases.** Let users add their own make aliases (extends the built-in table above).
  Needs the settings store.
- **Remember the library/base directory** across launches (auto-rescan or offer to). Needs the settings
  store.

## Per-machine UX

- **"Re-detect from folder name" (per-machine).** `scanLibrary` never overwrites an existing
  `machine.yaml`, so when a user **renames a folder** to fix detection, the stale `machine.yaml` keeps
  the old (wrong) inference. Add a per-machine action that discards the seeded fields and re-infers from
  the current folder name. (Name TBD — "Re-detect from folder name" / "Reset & re-scan".) *(beta feedback)*

## Previously deferred (pre-beta)

- **Gallery overwrite-resync on push** — editor *Overwrite* on an already-pushed *gallery* photo doesn't
  re-upload yet (hash-diff → `updatePhoto(image)`). Save-as-new already syncs; cover/type-sample done.
- **Clearing ALL links on update** — links reconcile doesn't handle removing every link cleanly.
- **No-serial-model exception** — some models never had serials (the Bing); push readiness currently
  *requires* a serial.
- **Crisp 1024² app icon** (current FigKey2 placeholder is 479², upscaled-soft) + eventual code-signing
  (macOS Developer ID + notarization; Windows cert). Path pre-wired via `APPLE_IDENTITY`.
- **Determinate scan progress** (counts) — currently just a spinner.
- **Container-folder detection** — images in a generic `pictures/`/`photos/` subfolder make that leaf the
  "machine"; should collapse to the parent.
- Optional Silver-Reed URL backfill (cosmetic).
