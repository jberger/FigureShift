# FigureShift backlog

Running queue of issues/ideas (beta feedback + deferred work). Not prioritized; grab what's ready.

## Inference (make/model/year)

These live mostly in `@joelberger/twdb-client` (`inferMake`/`inferModel`/`suggestTwdbYear`) per the
DT-leads strategy — fix in the library, both DT and FigureShift benefit.

- **Built-in manufacturer aliases.** Map common abbreviations/variants to the canonical TWDB make before
  fuzzy matching: e.g. `SCM` → *Smith Corona*, `Smith-Corona` → *Smith Corona*. (Punctuation variants
  like the hyphen may already normalize via `norm`/tokenize — verify; abbreviations like `SCM`
  definitely need an explicit alias table.) *(beta feedback)*
- **Prefer the longer / more-specific make match.** "Smith Corona" is being detected as **"Corona"**
  (a shorter make that also exists on TWDB). The matcher needs to recognize that "Corona" matched but
  keep going and prefer "Smith Corona" as the longer, more-token-consuming, more-specific candidate.
  Tricky — likely a scoring tweak in `inferMake` (favor multi-token candidates / more path tokens
  consumed when one make name is a subset of another). *(beta feedback)*
- **Loose-year gaps in `suggestTwdbYear`.** Today: `1960s` → `196X` works, but a **literal `196X` / `19XX`
  in the folder name is NOT detected** (it only scans `\d{4}`), nor `60s` (2-digit decade), nor `1960's`
  (apostrophe). Consider matching `\d{3}[xX]` / `\d{2}[xX]{2}` and 2-digit decades. (`isValidTwdbYear`
  already accepts the `X` forms; only detection lags.)

## App-wide settings (new infrastructure)

- **Persistent app settings store** (e.g. JSON in Electron `userData`). Enables the items below.
- **User-specified aliases.** Let users add their own make aliases (extends the built-in table above).
  Needs the settings store.
- **Remember the library/base directory** across launches (auto-rescan or offer to). Needs the settings
  store.

## UI clarity

- **Replace the `?` placeholder.** When make/model can't be inferred from the path, the UI shows `?`
  (machine list + editor heading), which isn't obvious to some users. Use explicit text, e.g.
  *"(make not detected)"* / *"Needs make"*. *(beta feedback)*

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
