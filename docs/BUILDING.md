# Building FigureShift

## Dev & tests

```bash
npm start      # dev (Vite dev server + Electron); runs fine on your default Node
npm test       # Vitest unit tests
```

These work on **Node 24.16.0** (the current default) without issue.

## Packaging (the installable .app / .dmg)

```bash
PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" npm run make
```

Artifacts land in `out/make/` (a `.dmg` and a `.zip`); the raw app is
`out/FigureShift-darwin-arm64/FigureShift.app`.

### ⚠️ Do NOT package on Node 24.16.0

Node **24.16.0 has a regression** that makes `@electron/packager`'s `extract-zip`
silently stall mid-extraction — the build exits 0 at "Finalizing package" with no
app and no error. Node **24.15.0 works** (and so does 20.x). Dev/test are
unaffected; only packaging hits the `extract-zip` path.

- Upstream: <https://github.com/nodejs/node/issues/63487>
- Once a fixed 24.16.x ships, drop the `v24.15.0` PATH prefix.

## Signing

- **Ad-hoc (default, free):** no env vars needed. On Apple Silicon the app is
  ad-hoc signed automatically; a `postPackage` hook does a clean deep re-sign so
  the bundle verifies and launches locally. Good for development and early
  adopters (who open it once via right-click → Open).
- **Distribution (Developer ID + notarization):** set the env vars from
  `.env.example` — `APPLE_IDENTITY` (a `Developer ID Application: ...` name)
  enables real signing; setting `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`
  also notarizes. This is deferred until the app is validated (see the design
  spec's "$99 Apple fee" note).

## Native modules (sharp)

`sharp` (pulled in by `@joelberger/twdb-client`) is a native addon that can't be
bundled by Vite, and `@electron-forge/plugin-vite` strips `node_modules` from the
package. A `packageAfterCopy` hook in `forge.config.ts` copies sharp's full
production dependency closure (including its `@img/sharp-*` binary packages) back
into the app, and `asar.unpack` keeps the `.node`/`.dylib` files on disk so they
load at runtime.

## Deferred hardening

The Electron **FusesPlugin** (disable `RunAsNode`, cookie encryption, asar-only
loading, asar integrity) is intentionally omitted for now: flipping fuses rewrites
the signed Electron binary and breaks the ad-hoc signature on Apple Silicon
("Code Signature Invalid" SIGKILL). Re-add it together with the Developer ID
signing + notarization flow, which seals fuses and signature consistently.

## Windows (future — not yet built/verified)

The macOS signing pain (ad-hoc signing, deep re-sign, fuses breaking the
signature) is **Apple-Silicon-specific** and does **not** apply to Windows:

- **Unsigned Windows apps run.** There's no equivalent of Apple Silicon's
  SIGKILL-on-invalid-signature, so the whole ad-hoc/re-sign/fuses dance is moot.
  The FusesPlugin hardening could even stay enabled for Windows.
- **SmartScreen** shows a click-through "Windows protected your PC" warning for
  unsigned / low-reputation installers — softer than macOS Gatekeeper. Early
  adopters can choose "More info → Run anyway". Posture: ship unsigned first,
  defer signing (same as macOS).
- **Authenticode signing (to remove SmartScreen)** is the cost/logistics part:
  since the 2023–24 CA/Browser Forum rules, all code-signing keys (OV *and* EV)
  must live on a hardware token or HSM. Cheapest modern path is **Azure Trusted
  Signing (~$10/mo)**; alternatives are an OV cert + token (reputation builds
  slowly) or EV (pricier, faster reputation).
- **Carries over from above:** the Node 24.16.0 `extract-zip` bug is OS-agnostic
  (build on 24.15.0 for Windows too); and cross-building Windows from macOS needs
  Wine/Mono for the Squirrel maker, so a Windows CI runner is cleaner.
