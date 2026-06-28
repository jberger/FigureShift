# FigureShift — Onboarding design

**Date:** 2026-06-27
**Status:** Approved.

## Goal

Help non-technical/older collectors get started: a first-run walkthrough (re-openable) plus contextual empty-state hints, in plain language, grounded in the real folder convention. Emphasize the credential-privacy story.

## A. First-run walkthrough

A modal (reuses `.modal-overlay`/`.modal`), shown on first launch and re-openable via a **Help** link. Gated by a persisted `onboarded` flag in `localStorage` (`fs-onboarded`) — no main/IPC changes. Stepper with Back/Next/Done and step dots. Steps:

1. **Welcome** — "FigureShift uploads your typewriter photos to the Typewriter Database, in bulk."
2. **Sign in** — with your TWDB account (same login as the website). **Privacy:** "Your password is stored only on this computer, in its secure credential store (Keychain on macOS, Credential Manager on Windows), and is never sent anywhere except to log in to the Typewriter Database."
3. **Organize your photos** — each typewriter's photos go in **its own folder**; name the folder like **"Smith-Corona Silent 1948"** so make/model/year are pre-filled. Pick the folder that holds all the machine folders. (Mechanism: any folder that directly contains images is one machine; its images become that machine's photos.)
4. **Review each machine** — check the guessed make/model/year; add serial number + description.
5. **Pick photo roles** — one **cover**, one **type sample**, the rest **gallery**, **skip** the rest. Crop/rotate with **Edit**.
6. **Push** — push a machine, or **Push all ready** for a batch.

## B. Empty-state / contextual hints

Short plain-language lines where people get stuck:
- **Login screen** — needs a TWDB account; the same one-line privacy reassurance (near Remember-me).
- **Folder-pick (ready) screen** — the one-folder-per-machine convention + a Help link.
- **Editor** — a one-line role explainer above the photo grid (cover / type sample / gallery / skip).

## Architecture

- `src/renderer/Walkthrough.tsx` — the stepped modal. Props: `onClose`. Static step content (text/emoji now; real screenshots later).
- `src/App.tsx` — show on first run (when `localStorage.fs-onboarded` is unset; set it on close); a **Help** affordance (login + ready screens) reopens it. Add the login privacy hint.
- `src/renderer/ReviewScreen.tsx` — a **Help** link (sidebar foot) reopens the walkthrough; pass through so the editor hint shows.
- `src/renderer/MachineEditor.tsx` / `PhotoGrid.tsx` — one-line role explainer above the grid.
- `src/index.css` — small `.walkthrough`/stepper styles (dots, nav row) on top of the modal classes.

No main-process, IPC, or dependency changes.

## Scope

In: walkthrough, first-run gating + Help re-open, empty-state hints, privacy emphasis. Out: interactive product tour/coachmarks, screenshots/illustrations (placeholder text for now), localization.

## Testing

No pure logic to unit-test (static UI). Verified live: first launch shows the walkthrough; closing it and relaunching does not re-show; Help reopens it; hints render on login/pick/editor; the privacy line is present. `tsc` + existing suites stay green.
