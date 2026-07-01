# Changelog

All notable changes to FigureShift, newest first.

## [Unreleased]

- "Check for new photos" now confirms with "Up to date — no new photos." when nothing changed, so the button no longer feels unresponsive.

## [0.5.0] - 2026-06-30

- Pick up photos added to a machine's folder without re-importing — automatically when you open the folder, or on demand via "Check for new photos". New photos are highlighted; ones that have disappeared are flagged for removal.

## [0.4.2] - 2026-06-30

- Fix: changing the library folder from the menu now reloads the review screen to show the new library instead of the previous one.

## [0.4.1] - 2026-06-30

- Add a "No serial number" option (records "N/A") for models that never had one.
- Photo-card refinements: Edit overlaid on the thumbnail, always-visible reorder arrows, and a smoother thumbnail-size slider.

## [0.4.0] - 2026-06-30

- Dark mode, with a neutral black/gray/silver theme and a toggle.
- Drag-and-drop reordering of gallery photos, synced to the gallery order on TWDB.
- Separate cover and type-sample slots from the gallery list (sectioned photo area).
- Remember the library folder and change it any time (Reopen + File ▸ Open Library Folder).

## [0.3.0] - 2026-06-28

- Smarter make/model/year detection: prefer the most specific match (e.g. "Smith Corona", not "Corona"), an SCM → Smith Corona alias, and "196X"-style years.

## [0.2.0] - 2026-06-28

- Per-machine "ready to upload" confirmation before anything is sent to TWDB.
- Cleaner native menu (removed the browser Reload/Force Reload/DevTools items).
- Clearer "(not detected)" label when the make or model can't be inferred.

## [0.1.1] - 2026-06-27

- First-run onboarding walkthrough with contextual hints.
- Larger default window.
- No longer opens the developer console in release builds.

## [0.1.0] - 2026-06-27

_Initial release._

- Bulk-upload a typewriter collection from a folder of photos to the Typewriter Database.
- Automatic make/model/year detection from folder names.
- Master–detail review screen with per-photo roles (cover, type sample, gallery, skip).
- Automatic photo resizing; create and update TWDB galleries, photos, captions, and links.
- Resumable, on-disk per-machine state.
- Built-in photo editor (crop & rotate).
- Remember-me sign-in stored in the OS keychain.
- Cross-platform macOS and Windows builds via a CI release pipeline.
