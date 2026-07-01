# FigureShift — working notes

## Changelog

When a feature or user-visible fix is **completed**, add a short user-facing
summary to the `## [Unreleased]` section of `CHANGELOG.md`.

- Write it for the person using the app, not for developers. Describe what they
  can now do or what got fixed — **not** the individual implementation commits.
- One feature = one entry (a bullet or two), matching the style of the existing
  released sections.
- Leave version numbers and dates alone; the release process moves the
  `[Unreleased]` items under a new version heading. If you don't add the entry
  when the feature lands, it won't make it into the release notes.

## Releasing

Releases are cut with `./release.sh` (run from a clean `main`). It bumps
`package.json`, stamps the `[Unreleased]` changelog section into a dated
version heading, commits `Release vX.Y.Z`, creates an annotated tag, and pushes
main + the tag. Pushing the `vX.Y.Z` tag triggers `.github/workflows/release.yml`,
which builds unsigned macOS (arm64 + Intel x64) and Windows installers and
attaches them to a GitHub **pre-release**.

Common invocations (see `./release.sh --help`):

- `./release.sh --patch` / `--minor` / `--major` — compute the next version from
  the latest `vX.Y.Z` tag. Feature ⇒ `--minor`; fix-only ⇒ `--patch`.
- `./release.sh vX.Y.Z` — release an explicit version.
- add `--watch` to wait for the CI build (`gh run watch`) and report success.
- `./release.sh [vX.Y.Z] --no-tag` — resume a release whose tag already exists
  (e.g. after a push failed mid-run); just re-pushes.
