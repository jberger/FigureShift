# FigureShift — CI Release Builds design

**Date:** 2026-06-27
**Status:** Approved.

## Goal

Produce unsigned macOS (arm64 + Intel x64) and Windows installers for beta testers, built by CI and attached to a GitHub Release, with a one-command release flow.

## Trigger & flow

Push a `vX.Y.Z` tag → `.github/workflows/release.yml` runs. `release.sh` automates the version bump + tag + push (adapted from DynamicallyTyped's `release.sh`, with the kube-deploy parts replaced by a desktop-app version bump and an optional CI watch).

## Workflow (`.github/workflows/release.yml`)

- `on: push: tags: ['v*']`, `permissions: contents: write`.
- **test** (`ubuntu-latest`): `npm ci` → `npm test` (platform-agnostic, gates the build).
- **build** (`needs: test`, matrix): `macos-14` (arm64), `macos-13` (Intel x64), `windows-latest` (x64). Each: `setup-node@24.15.0` (avoids the 24.16.0 extract-zip packaging bug) → `npm ci` → `npm run make` → upload `out/make/**/*`. Each runner builds its **native arch** so the `sharp` native closure (copied by the existing `packageAfterCopy` hook) is correct; the mac ad-hoc codesign (`postPackage`) is already guarded to darwin.
- **release** (`needs: build`): download all artifacts → `softprops/action-gh-release@v2` attaches them to the tag's Release, `prerelease: true`, with a body carrying the unsigned-install instructions (macOS right-click→Open / `xattr -dr com.apple.quarantine`; Windows SmartScreen → Run anyway).

## `release.sh`

Bash, run from repo root. `vX.Y.Z` | `--patch|--minor|--major` (bump from latest tag) | `--no-tag` (resume) | `--watch` (gh run watch) | `--help`. Guards: on `main`, clean tree, tag not already present. Bumps `package.json` + `package-lock.json` via `npm version --no-git-tag-version`, commits `Release vX.Y.Z`, annotated tag, pushes main + tag.

## Decisions

macOS arm64 **and** Intel x64 (separate downloads). Trigger: version-tag push. Delivery: GitHub Release (prerelease). Unsigned (beta). Linux makers exist but aren't part of the matrix.

## Testing

CI YAML isn't unit-testable; verified by cutting a beta tag (`./release.sh v0.1.0 --watch`) and confirming all three artifacts attach to the Release and launch on a test machine (after clearing quarantine / SmartScreen).
