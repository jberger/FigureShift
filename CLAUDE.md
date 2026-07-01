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
