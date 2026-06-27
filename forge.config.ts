import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// macOS notarization is only configured when all three credentials are present.
// Without them we ship an ad-hoc-signed build (free); enabling notarization later
// is a config-only flip once an Apple Developer ID exists.
const osxNotarize =
  process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID
    ? ({
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      } as const)
    : undefined;

// plugin-vite bundles JS but strips node_modules from the package, and native
// addons (sharp, via twdb-client) cannot be bundled — so the externalized `sharp`
// is missing from the packaged app. We copy sharp's full production dependency
// closure back into the package here. Each package.json is read by direct path
// (not require.resolve), which sidesteps sharp's restrictive `exports` field.
function copyNativeDepClosure(projectDir: string, appNodeModules: string, roots: string[]) {
  const seen = new Set<string>();
  const visit = (pkg: string) => {
    if (seen.has(pkg)) return;
    const pkgDir = path.join(projectDir, 'node_modules', pkg);
    const pjPath = path.join(pkgDir, 'package.json');
    if (!existsSync(pjPath)) return; // platform/optional dep not installed here
    seen.add(pkg);
    cpSync(pkgDir, path.join(appNodeModules, pkg), { recursive: true, dereference: true });
    const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
    const deps = { ...(pj.dependencies || {}), ...(pj.optionalDependencies || {}) };
    for (const dep of Object.keys(deps)) visit(dep);
  };
  for (const root of roots) visit(root);
}

const config: ForgeConfig = {
  packagerConfig: {
    // App icon. Forge/electron-packager appends the per-platform extension: .icns (macOS)
    // exists; a Windows .ico will be added with the real (non-placeholder) icon before release.
    icon: 'assets/icon',
    // Unpack node_modules from the asar so sharp's native .node and libvips .dylib
    // load from disk (dylibs cannot be loaded from inside an asar).
    asar: { unpack: '**/node_modules/**' },
    // On Apple Silicon, @electron/packager applies an ad-hoc signature
    // automatically (free). Set APPLE_IDENTITY to a "Developer ID Application: ..."
    // name to sign for distribution instead.
    ...(process.env.APPLE_IDENTITY
      ? { osxSign: { identity: process.env.APPLE_IDENTITY } as const }
      : {}),
    osxNotarize,
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      copyNativeDepClosure(process.cwd(), path.join(buildPath, 'node_modules'), ['sharp']);
    },
    // @electron/packager's automatic ad-hoc signature on Apple Silicon leaves
    // CodeResources inconsistent ("code has no resources..."), which fails strict
    // verification. A clean deep ad-hoc re-sign yields a valid, launchable bundle.
    // Skipped when a real APPLE_IDENTITY is set (osxSign handles signing then).
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform !== 'darwin' || process.env.APPLE_IDENTITY) return;
      for (const outPath of outputPaths) {
        const app = path.join(outPath, 'FigureShift.app');
        if (existsSync(app)) {
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // NOTE: the FusesPlugin (security hardening: disable RunAsNode, cookie
    // encryption, asar-only loading, asar integrity) is intentionally omitted for
    // now. Flipping fuses modifies the signed Electron binary and breaks the
    // ad-hoc signature on Apple Silicon. Re-add it together with the Developer ID
    // signing + notarization flow, which seals fuses and signature consistently.
  ],
};

export default config;
