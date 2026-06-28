# FigureShift backlog

Running queue of issues/ideas (beta feedback + deferred work). Not prioritized; grab what's ready.

## Inference (make/model/year)

These live mostly in `@joelberger/twdb-client` (`inferMake`/`inferModel`/`suggestTwdbYear`) per the
DT-leads strategy — fix in the library, both DT and FigureShift benefit.

- **Built-in manufacturer aliases (true abbreviations / nicknames).** Map non-obvious variants that
  normalization alone won't catch to the canonical TWDB make before fuzzy matching: e.g. `SCM` →
  *Smith Corona*. (Spacing/hyphen variants are handled by the normalization item below, not here.) Later:
  user-defined aliases via the settings store. *(beta feedback)*
- **Prefer the longer / more-specific match (make AND model).** Shorter candidates win when a longer,
  more-specific one should: "Smith Corona" detected as **"Corona"**; Brother **"Deluxe 660TR"** detected
  as only **"Deluxe"**. The matcher needs to recognize the short candidate matched but keep going and
  prefer the longer, more-token-consuming candidate when one name is a subset/prefix of another. Tricky —
  a scoring tweak in both `inferMake` and `inferModel` (favor multi-token candidates / more path tokens
  consumed). *(beta feedback)*
- **Normalize spacing / hyphen / punctuation variants. (Common — prioritize.)** Same family, frequent:
  makes — *Smith-Corona* ≡ *Smith Corona*, *Silver-Reed* ≡ *Silver Reed*, etc.; models — *de luxe* ≡
  *deluxe*. Normalize on **both** sides during detection (the user's folder name AND the TWDB candidate
  names) so hyphens/spaces don't block a match. Note: `norm` already strips non-alphanumerics, so the
  joined-token path likely matches these today — **verify and make it robust** (esp. the token-level
  path). No output inconsistency: the resolved value is always TWDB's canonical spelling. *(beta feedback)*
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
