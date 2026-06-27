# FigureShift — Visual Styling Pass design

**Date:** 2026-06-27
**Status:** Approved (direction); refined live after first render ("I'll know better when I see it").

## Goal

Make FigureShift look noticeably nicer and cohesive without changing behavior or adding features. Audience: typewriter collectors, skews non-technical/older — so legibility, generous spacing, and clarity come first, with a little typewriter character.

## Direction

Clean, modern, **light-only** UI with subtle vintage accents. Implemented as **custom CSS with theme variables** in `src/index.css`; inline `style={...}` props are replaced with semantic classNames. **No new dependencies, no behavior changes, no new features.**

## Theme tokens (CSS custom properties on `:root`)

- **Surfaces:** `--bg` warm off-white `#f4f1ec`; `--surface` `#ffffff`; `--border` `#e2ddd4`
- **Text:** `--text` `#1f1d1b`; `--muted` `#6b6661`
- **Accent:** `--accent` typewriter-red `#b3422e` (primary buttons, selected/active, focus ring); `--success` green `#3f7d52` (the "on TWDB ✓")
- **Type:** `--font-serif` system serif stack (Georgia, 'Iowan Old Style', 'Times New Roman', serif) for headings; `--font-sans` system-ui sans for body. Zero bundled font assets (upgradeable to a bundled pair later).
- **Shape/space:** `--radius` 10px (cards) / `--radius-sm` 6px (controls); spacing scale 4/8/12/16/24; one soft card shadow `--shadow`.

These are starting values; expect to nudge the accent/palette after seeing it.

## Component treatments

- **Buttons:** `.btn` base; `.btn-primary` (accent bg, white text) for Save / Push; `.btn-secondary` (white, bordered) for Log out / add-link / View-on-TWDB. Clear hover + disabled states.
- **Inputs / select / textarea:** full-width, padded, bordered, accent focus ring.
- **Cards:** auth + "ready" screens become a centered card with the serif **FigureShift** title; the editor is a card with lightly-sectioned fields.
- **Status pills:** muted "new" pill; green "on TWDB ✓" pill — in the machine list and the progress count header.
- **Master–detail:** sidebar gets a paper-tinted background; list rows with hover and an accent left-border when selected; styled progress header ("X of Y on TWDB").
- **Photo grid:** rounded thumbnail cards, tidy role `select` + caption input; `skip` photos dimmed.

## Scope

Touches the six render files — `src/App.tsx`, `src/renderer/{ReviewScreen,MachineList,MachineEditor,PhotoGrid}.tsx`, and `src/index.css`. DOM structure is preserved (only classes change), so nothing functional breaks.

## Testing

Visual — verified by eye in `npm start` across every screen (login, ready/folder-pick, review master–detail, editor, photo grid, push states). No unit tests for CSS; existing Vitest suites and `tsc` remain green.
