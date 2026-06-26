# FigureShift Slice 2 — Library Walk, Path Inference & YAML State (+ promote shared helpers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the shared TWDB resolvers into `twdb-client` (with a new `inferMachineFromPath`), refactor DT to consume them, then build FigureShift's library scan: detect machine folders, infer metadata from the path, and read/write the two per-machine YAML files.

**Architecture:** Three repos, in dependency order. (A) `twdb-client` gains pure, browser-safe `resolve.ts` (`resolveExact`, `suggestMatch`, `suggestTwdbYear`) and `infer.ts` (`inferMachineFromPath`), published via GitHub. (B) DynamicallyTyped refactors `twdbMap.ts`/`twdbPreflight.ts` to import them from the library (no behavior change). (C) FigureShift consumes the bumped library: a main-process library walker detects machines, seeds `machine.yaml` from path inference, and reads/writes `machine.yaml` (user) + `machine.twdb.yaml` (app) via the comment-preserving `yaml` package, exposed to the renderer over IPC with a minimal folder-picker + machine list.

**Tech Stack:** TypeScript (twdb-client: NodeNext ESM, Vitest in `test/`; DT: node:test/assert; FigureShift: Vitest, Electron, `yaml` package). FigureShift consumes `github:jberger/twdb-client`.

**Repos & paths:**
- twdb-client: `/Users/joelberger/Programs/Node/twdb-client`
- DynamicallyTyped: `/Users/joelberger/Programs/Sites/DynamicallyTyped`
- FigureShift: `/Users/joelberger/Programs/Node/figureshift`

**Execution notes:**
- Do each phase on a feature branch in its repo (don't commit to `main`/`master` directly).
- Phase A must be pushed to GitHub before Phase C can `npm update` it. Phase B can proceed in parallel with C once A is pushed.
- FigureShift packaging (not needed in this slice) still requires Node 24.15.0; dev/test run on the default Node.

---

## Phase A — twdb-client: promote resolvers + add `inferMachineFromPath`

### Task A1: `resolve.ts` — resolveExact, suggestMatch, suggestTwdbYear

**Files:**
- Create: `/Users/joelberger/Programs/Node/twdb-client/src/resolve.ts`
- Test: `/Users/joelberger/Programs/Node/twdb-client/test/resolve.test.ts`
- Modify: `/Users/joelberger/Programs/Node/twdb-client/src/index.ts`

- [ ] **Step 1: Branch**

```bash
cd /Users/joelberger/Programs/Node/twdb-client && git checkout -b feat/promote-resolvers-infer
```

- [ ] **Step 2: Write the failing test**

Create `test/resolve.test.ts` (mirrors DT's existing cases; Vitest style like `test/validate.test.ts`):

```ts
// test/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { resolveExact, suggestMatch, suggestTwdbYear } from '../src/resolve.js';

describe('resolveExact', () => {
  it('case-insensitive full match → canonical candidate, else null', () => {
    expect(resolveExact('continental', ['Continental', 'Continental (Brother)'])).toBe('Continental');
    expect(resolveExact('  Klein ', ['Klein', 'Klein Conti'])).toBe('Klein');
    expect(resolveExact('contin', ['Continental'])).toBeNull(); // NOT a prefix match
    expect(resolveExact('', ['Continental'])).toBeNull();
  });
});

describe('suggestMatch', () => {
  it('exact > startsWith > contains (ci), else empty', () => {
    expect(suggestMatch('continental', ['Adler', 'Continental', 'Continental (Brother)'])).toBe('Continental');
    expect(suggestMatch('contin', ['Adler', 'Continental'])).toBe('Continental');
    expect(suggestMatch('klein', ['Adler', 'Klein-Continental'])).toBe('Klein-Continental');
    expect(suggestMatch('zzz', ['Adler', 'Continental'])).toBe('');
    expect(suggestMatch('', ['Adler', 'Continental'])).toBe('');
  });
});

describe('suggestTwdbYear', () => {
  it('empty / unparseable → empty', () => {
    expect(suggestTwdbYear('')).toBe('');
    expect(suggestTwdbYear(null)).toBe('');
    expect(suggestTwdbYear('no year here')).toBe('');
  });
  it('single concrete year (incl. prose/approx)', () => {
    expect(suggestTwdbYear('1928')).toBe('1928');
    expect(suggestTwdbYear('~1950')).toBe('1950');
    expect(suggestTwdbYear('March 1952')).toBe('1952');
  });
  it('decade notation → trailing X', () => {
    expect(suggestTwdbYear('1940s')).toBe('194X');
  });
  it('full ranges → common-prefix trailing X', () => {
    expect(suggestTwdbYear('1927-1929')).toBe('192X');
    expect(suggestTwdbYear('1940 - 1952')).toBe('19XX');
  });
  it('abbreviated ranges expand forward; year-month does not', () => {
    expect(suggestTwdbYear('1911-12')).toBe('191X');
    expect(suggestTwdbYear('1945 - 6')).toBe('194X');
    expect(suggestTwdbYear('1945-03')).toBe('1945');
  });
  it('no shared leading digit → empty (never malformed XXXX)', () => {
    expect(suggestTwdbYear('1900-2000')).toBe('');
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd /Users/joelberger/Programs/Node/twdb-client && npx vitest run test/resolve.test.ts`
Expected: FAIL — `../src/resolve.js` not found.

- [ ] **Step 4: Implement `src/resolve.ts`** (verbatim from DT's `twdbMap.ts`, incl. the private `trailingX`)

```ts
// src/resolve.ts -- pure, browser-safe helpers for matching/suggesting TWDB field values.

/** Case-insensitive full match against candidates → the canonical candidate, else null. */
export function resolveExact(value: string, candidates: string[]): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return candidates.find((c) => c.toLowerCase() === v) ?? null;
}

/** Best-effort suggestion to pre-highlight in a picker: exact > startsWith > contains (ci); '' if none. */
export function suggestMatch(value: string, candidates: string[]): string {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  return (
    candidates.find((c) => c.toLowerCase() === v) ??
    candidates.find((c) => c.toLowerCase().startsWith(v)) ??
    candidates.find((c) => c.toLowerCase().includes(v)) ??
    ''
  );
}

/** Loose, human-entered year text → a TWDB year (NNNN or trailing-X), or '' if none can be inferred. */
export function suggestTwdbYear(loose: string | null | undefined): string {
  if (!loose) return '';
  const years = new Set<number>();

  // Abbreviated ranges (1911-12, "1945 - 6"): expand the short suffix against the first year,
  // accepting only a forward move (rejects a year-month like 1945-03 → 1903).
  const abbr = /(\d{4})\s*[-–—]\s*(\d{1,3})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = abbr.exec(loose)) !== null) {
    const first = Number(m[1]);
    const suffix = m[2];
    const expanded = Number(m[1].slice(0, 4 - suffix.length) + suffix);
    if (expanded > first) {
      years.add(first);
      years.add(expanded);
    }
  }

  // Every full 4-digit year.
  for (const g of loose.matchAll(/\d{4}/g)) years.add(Number(g[0]));

  if (years.size === 0) return '';
  if (years.size === 1) {
    const y = [...years][0];
    if (y % 10 === 0 && new RegExp(`\\b${y}s\\b`).test(loose)) return `${Math.floor(y / 10)}X`;
    return String(y);
  }
  return trailingX(String(Math.min(...years)), String(Math.max(...years)));
}

function trailingX(lo: string, hi: string): string {
  let prefix = '';
  for (let i = 0; i < 4; i++) {
    if (lo[i] === hi[i]) prefix += lo[i];
    else break;
  }
  // No shared leading digit (e.g. 1900–2000): a bare "XXXX" isn't a TWDB-valid year, so we
  // can't suggest one — return '' rather than violate the 4-digit/trailing-X contract.
  if (prefix.length === 0) return '';
  return prefix.length === 4 ? prefix : prefix + 'X'.repeat(4 - prefix.length);
}
```

- [ ] **Step 5: Export from `src/index.ts`**

Add after the existing `export { isValidTwdbYear } ...` line:

```ts
export { resolveExact, suggestMatch, suggestTwdbYear } from './resolve.js';
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npx vitest run test/resolve.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add resolve.ts (resolveExact, suggestMatch, suggestTwdbYear)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: `infer.ts` — inferMachineFromPath

**Files:**
- Create: `/Users/joelberger/Programs/Node/twdb-client/src/infer.ts`
- Test: `/Users/joelberger/Programs/Node/twdb-client/test/infer.test.ts`
- Modify: `/Users/joelberger/Programs/Node/twdb-client/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `test/infer.test.ts`:

```ts
// test/infer.test.ts
import { describe, it, expect } from 'vitest';
import { inferMachineFromPath } from '../src/infer.js';

const BRANDS = ['Continental', 'Smith-Corona', 'L.C. Smith & Bros', 'Royal'];

describe('inferMachineFromPath', () => {
  it('single-token brand, year, and leftover model', () => {
    expect(inferMachineFromPath('1932-continental-klein', BRANDS)).toEqual({
      brandGuess: 'Continental',
      modelGuess: 'klein',
      yearGuess: '1932',
    });
  });
  it('multi-token brand across separators (Smith Corona)', () => {
    expect(inferMachineFromPath('Smith-Corona/1950-Silent', BRANDS)).toEqual({
      brandGuess: 'Smith-Corona',
      modelGuess: 'Silent',
      yearGuess: '1950',
    });
  });
  it('punctuation-heavy brand (L.C. Smith & Bros)', () => {
    expect(inferMachineFromPath('L.C. Smith & Bros/No 8', BRANDS)).toEqual({
      brandGuess: 'L.C. Smith & Bros',
      modelGuess: 'No',
      yearGuess: '',
    });
  });
  it('no brand match → empty brand, all non-numeric tokens as model', () => {
    expect(inferMachineFromPath('mystery-typewriter', BRANDS)).toEqual({
      brandGuess: '',
      modelGuess: 'mystery typewriter',
      yearGuess: '',
    });
  });
  it('decade folder → trailing-X year', () => {
    expect(inferMachineFromPath('Royal/1940s/Quiet De Luxe', BRANDS)).toEqual({
      brandGuess: 'Royal',
      modelGuess: 'Quiet De Luxe',
      yearGuess: '194X',
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run test/infer.test.ts`
Expected: FAIL — `../src/infer.js` not found.

- [ ] **Step 3: Implement `src/infer.ts`**

```ts
// src/infer.ts -- pure path → machine-metadata inference (first-guess for the review screen).
import { suggestTwdbYear } from './resolve.js';

export interface MachineGuess {
  brandGuess: string; // canonical brand name from the provided list, or ''
  modelGuess: string; // leftover (non-brand, non-year) tokens joined by spaces, or ''
  yearGuess: string;  // TWDB year form (NNNN / trailing-X), or ''
}

// Split a path relative to the library root into tokens on path separators and common
// word separators (incl. '.' and '&' so "L.C. Smith & Bros" tokenizes cleanly).
const SEP = /[/\\\-_.&\s]+/;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isNumericToken = (t: string) => /^\d+$/.test(t) || /^\d*[x]+$/i.test(t);

export function inferMachineFromPath(relPath: string, brandNames: string[]): MachineGuess {
  const tokens = relPath.split(SEP).filter(Boolean);

  // Longest consecutive-token run whose normalized form equals a brand's normalized form.
  const brandByKey = new Map<string, string>();
  for (const b of brandNames) {
    const k = norm(b);
    if (k && !brandByKey.has(k)) brandByKey.set(k, b);
  }
  let brandGuess = '';
  const brandIdx = new Set<number>();
  let bestLen = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = tokens.length; j > i; j--) {
      const key = norm(tokens.slice(i, j).join(''));
      const match = brandByKey.get(key);
      if (match && j - i > bestLen) {
        brandGuess = match;
        bestLen = j - i;
        brandIdx.clear();
        for (let k = i; k < j; k++) brandIdx.add(k);
      }
    }
  }

  const modelGuess = tokens
    .filter((t, idx) => !brandIdx.has(idx) && !isNumericToken(t))
    .join(' ');

  return { brandGuess, modelGuess, yearGuess: suggestTwdbYear(relPath) };
}
```

- [ ] **Step 4: Export from `src/index.ts`**

Add:

```ts
export { inferMachineFromPath } from './infer.js';
export type { MachineGuess } from './infer.js';
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run test/infer.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 6: Full test suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc` build succeeds (dist updated).

- [ ] **Step 7: Commit, bump version, push**

```bash
npm version minor   # 0.2.6 -> 0.3.0
git push -u origin feat/promote-resolvers-infer --follow-tags
```
Then merge to the default branch so `github:jberger/twdb-client` serves it (open/merge a PR, or fast-forward `main` locally and push). Confirm the default branch now contains `resolve.ts`/`infer.ts`.

---

## Phase B — DynamicallyTyped: consume the promoted helpers (no behavior change)

### Task B1: Refactor DT to import from twdb-client

**Files:**
- Modify: `/Users/joelberger/Programs/Sites/DynamicallyTyped/src/lib/twdbMap.ts` (remove the 3 funcs + `trailingX`)
- Modify: `/Users/joelberger/Programs/Sites/DynamicallyTyped/src/lib/twdbPreflight.ts` (import source)
- Modify: `/Users/joelberger/Programs/Sites/DynamicallyTyped/src/lib/twdbMap.test.ts` (drop promoted-fn tests)

- [ ] **Step 1: Branch and update the dependency**

```bash
cd /Users/joelberger/Programs/Sites/DynamicallyTyped && git checkout -b feat/use-promoted-twdb-helpers
npm update @joelberger/twdb-client
node -e "console.log(require('@joelberger/twdb-client/package.json').version)"   # expect 0.3.0
```

- [ ] **Step 2: Point twdbPreflight at the library**

In `src/lib/twdbPreflight.ts`, the import currently pulls `resolveExact, suggestMatch, suggestTwdbYear` from `./twdbMap`. Move just those three to a new import from `@joelberger/twdb-client`, leaving any other `./twdbMap` imports intact. Example:

```ts
import { resolveExact, suggestMatch, suggestTwdbYear } from '@joelberger/twdb-client'
// ...keep the remaining `import { ... } from './twdbMap'` for the non-promoted helpers
```

- [ ] **Step 3: Remove the promoted functions from `twdbMap.ts`**

Delete `resolveExact`, `suggestMatch`, `suggestTwdbYear`, and the private `trailingX` from `src/lib/twdbMap.ts`. Leave every other export (`mapCollection`, `pushBrand`, `pushModel`, `pushYear`, `twdbLinks`, `partitionPhotos`, `missingPushFields`, `galleryIdFromTwdbUrl`, `lexicalToPlainText`, `readPushMachine`, `readPushPhotos`, the interfaces) untouched.

- [ ] **Step 4: Remove the promoted-function tests from `twdbMap.test.ts`**

In `src/lib/twdbMap.test.ts`, remove the `import { resolveExact, suggestMatch, suggestTwdbYear }` (and delete the `suggestTwdbYear`, `resolveExact`, `suggestMatch` test blocks). Keep all other tests. (These functions are now covered by twdb-client's `test/resolve.test.ts`.)

- [ ] **Step 5: Run DT's tests + typecheck**

Run: `npm test && npx tsc --noEmit` (use DT's actual test command from its package.json if different).
Expected: PASS — no behavior change; the preflight still resolves brand/model/year via the library.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: consume resolveExact/suggestMatch/suggestTwdbYear from twdb-client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Leave the branch for the user to merge/deploy on DT's normal cadence — do not deploy as part of this slice.)

---

## Phase C — FigureShift: library scan, inference, and YAML state

### Task C1: Bump twdb-client and add the `yaml` dependency

**Files:**
- Modify: `/Users/joelberger/Programs/Node/figureshift/package.json`

- [ ] **Step 1: Branch, update deps**

```bash
cd /Users/joelberger/Programs/Node/figureshift && git checkout -b feat/slice2-library-inference
npm update @joelberger/twdb-client
node -e "console.log(require('@joelberger/twdb-client/package.json').version)"   # expect 0.3.0
npm install yaml
```

- [ ] **Step 2: Sanity — the new exports resolve**

Run: `node -e "import('@joelberger/twdb-client').then(m => console.log(typeof m.inferMachineFromPath, typeof m.resolveExact))"`
Expected: `function function`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: bump twdb-client to 0.3.0; add yaml

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C2: YAML read/write for the two per-machine files

**Files:**
- Create: `/Users/joelberger/Programs/Node/figureshift/src/main/machineYaml.ts`
- Test: `/Users/joelberger/Programs/Node/figureshift/src/main/machineYaml.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/machineYaml.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readMachineYaml,
  writeMachineYaml,
  readTwdbYaml,
  writeTwdbYaml,
  type MachineDoc,
} from './machineYaml';

function tmp() {
  return mkdtempSync(path.join(tmpdir(), 'fs-yaml-'));
}

describe('machineYaml', () => {
  it('writes and reads back a machine.yaml round-trip', () => {
    const dir = tmp();
    const doc: MachineDoc = {
      make: 'Continental',
      model: 'Klein',
      year: '1932',
      serialNo: '12345',
      description: 'A lovely machine',
      photos: [{ file: 'a.jpg', role: 'cover', caption: 'front' }],
    };
    writeMachineYaml(dir, doc);
    expect(existsSync(path.join(dir, 'machine.yaml'))).toBe(true);
    expect(readMachineYaml(dir)).toEqual(doc);
  });

  it('preserves user comments when rewriting machine.yaml', () => {
    const dir = tmp();
    writeFileSync(
      path.join(dir, 'machine.yaml'),
      'make: Royal\n# user note: verify the year\nyear: "1948"\nphotos: []\n',
    );
    const doc = readMachineYaml(dir);
    doc.model = 'Quiet De Luxe';
    writeMachineYaml(dir, doc);
    const text = readFileSync(path.join(dir, 'machine.yaml'), 'utf8');
    expect(text).toContain('# user note: verify the year');
    expect(text).toContain('Quiet De Luxe');
  });

  it('reads a missing twdb file as empty state and round-trips', () => {
    const dir = tmp();
    expect(readTwdbYaml(dir)).toEqual({ photos: {} });
    writeTwdbYaml(dir, { twdbUrl: 'x.123.typewriter', galleryId: '123', photos: {}, lastPushedAt: '2026-06-25' });
    expect(readTwdbYaml(dir).galleryId).toBe('123');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/main/machineYaml.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/machineYaml.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, parse } from 'yaml';

export type PhotoRole = 'cover' | 'typeSample' | 'gallery' | 'skip';

export interface MachinePhoto {
  file: string;
  role: PhotoRole;
  caption?: string;
}

export interface MachineDoc {
  make?: string;
  model?: string;
  year?: string;
  serialNo?: string;
  description?: string;
  photos: MachinePhoto[];
}

export interface TwdbPhotoState {
  twdbPhotoId?: string;
  twdbPhotoUrl?: string;
  hash?: string;
}

export interface TwdbDoc {
  twdbUrl?: string;
  galleryId?: string;
  photos: Record<string, TwdbPhotoState>;
  lastPushedAt?: string;
}

const MACHINE = 'machine.yaml';
const TWDB = 'machine.twdb.yaml';

export function readMachineYaml(dir: string): MachineDoc {
  const file = path.join(dir, MACHINE);
  if (!existsSync(file)) return { photos: [] };
  const doc = (parse(readFileSync(file, 'utf8')) ?? {}) as Partial<MachineDoc>;
  return { ...doc, photos: doc.photos ?? [] };
}

// Rewrite machine.yaml, preserving any existing comments/formatting by editing the
// parsed Document in place rather than re-serializing from scratch.
export function writeMachineYaml(dir: string, machine: MachineDoc): void {
  const file = path.join(dir, MACHINE);
  const doc = existsSync(file) ? parseDocument(readFileSync(file, 'utf8')) : new Document({});
  for (const [k, v] of Object.entries(machine)) doc.set(k, v);
  writeFileSync(file, doc.toString());
}

export function readTwdbYaml(dir: string): TwdbDoc {
  const file = path.join(dir, TWDB);
  if (!existsSync(file)) return { photos: {} };
  const doc = (parse(readFileSync(file, 'utf8')) ?? {}) as Partial<TwdbDoc>;
  return { ...doc, photos: doc.photos ?? {} };
}

// The app owns this file entirely, so a clean re-serialize is fine (no user comments here).
export function writeTwdbYaml(dir: string, state: TwdbDoc): void {
  const doc = new Document(state);
  writeFileSync(path.join(dir, TWDB), doc.toString());
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run src/main/machineYaml.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: read/write machine.yaml + machine.twdb.yaml (comment-preserving)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C3: Library walk + machine detection

**Files:**
- Create: `/Users/joelberger/Programs/Node/figureshift/src/main/library.ts`
- Test: `/Users/joelberger/Programs/Node/figureshift/src/main/library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/library.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isImageFile, findMachineDirs } from './library';

function tree() {
  const root = mkdtempSync(path.join(tmpdir(), 'fs-lib-'));
  mkdirSync(path.join(root, 'Royal', '1948 Quiet'), { recursive: true });
  writeFileSync(path.join(root, 'Royal', '1948 Quiet', 'a.jpg'), 'x');
  writeFileSync(path.join(root, 'Royal', '1948 Quiet', 'b.JPG'), 'x');
  mkdirSync(path.join(root, 'Continental'), { recursive: true });   // no images directly → not a machine
  mkdirSync(path.join(root, 'Continental', 'Klein'), { recursive: true });
  writeFileSync(path.join(root, 'Continental', 'Klein', 'c.png'), 'x');
  writeFileSync(path.join(root, 'notes.txt'), 'x');                  // non-image at root
  return root;
}

describe('library', () => {
  it('isImageFile recognizes common extensions, case-insensitive', () => {
    expect(isImageFile('a.jpg')).toBe(true);
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('a.txt')).toBe(false);
  });

  it('detects only folders that directly contain image files, with paths relative to root', () => {
    const root = tree();
    const dirs = findMachineDirs(root).map((d) => d.relPath).sort();
    expect(dirs).toEqual(['Continental/Klein', 'Royal/1948 Quiet']);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/main/library.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/library.ts`**

```ts
import { readdirSync } from 'node:fs';
import path from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tif', '.tiff']);

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase());
}

export interface MachineDir {
  absPath: string;
  relPath: string;        // POSIX-style, relative to the library root
  imageFiles: string[];   // image file names directly in this folder
}

// A folder that *directly* contains image files is a machine (spec heuristic).
export function findMachineDirs(root: string): MachineDir[] {
  const out: MachineDir[] = [];
  const walk = (abs: string) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const imageFiles = entries.filter((e) => e.isFile() && isImageFile(e.name)).map((e) => e.name);
    if (imageFiles.length > 0) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      out.push({ absPath: abs, relPath: rel, imageFiles: imageFiles.sort() });
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(abs, e.name));
  };
  walk(root);
  return out;
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run src/main/library.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: library walk + machine detection (folders with images)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C4: Scan = detect + infer + seed machine.yaml + status

**Files:**
- Create: `/Users/joelberger/Programs/Node/figureshift/src/main/scan.ts`
- Test: `/Users/joelberger/Programs/Node/figureshift/src/main/scan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/scan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanLibrary } from './scan';
import { readMachineYaml } from './machineYaml';

const BRANDS = ['Royal', 'Continental'];

function root() {
  const r = mkdtempSync(path.join(tmpdir(), 'fs-scan-'));
  mkdirSync(path.join(r, 'Royal', '1948-Quiet-De-Luxe'), { recursive: true });
  writeFileSync(path.join(r, 'Royal', '1948-Quiet-De-Luxe', 'a.jpg'), 'x');
  return r;
}

describe('scanLibrary', () => {
  it('seeds machine.yaml from path inference and reports status "new"', () => {
    const r = root();
    const machines = scanLibrary(r, BRANDS);
    expect(machines).toHaveLength(1);
    const m = machines[0];
    expect(m.relPath).toBe('Royal/1948-Quiet-De-Luxe');
    expect(m.status).toBe('new');
    expect(m.machine.make).toBe('Royal');
    expect(m.machine.year).toBe('1948');
    expect(m.machine.model).toBe('Quiet De Luxe');
    expect(m.machine.photos.map((p) => p.file)).toEqual(['a.jpg']);
    // machine.yaml was written to disk
    expect(existsSync(path.join(m.absPath, 'machine.yaml'))).toBe(true);
  });

  it('does not overwrite an existing machine.yaml', () => {
    const r = root();
    scanLibrary(r, BRANDS); // seeds it
    const dir = path.join(r, 'Royal', '1948-Quiet-De-Luxe');
    const edited = readMachineYaml(dir);
    edited.model = 'Hand-Corrected';
    writeFileSync(path.join(dir, 'machine.yaml'), `make: Royal\nmodel: Hand-Corrected\nyear: "1948"\nphotos:\n  - {file: a.jpg, role: gallery}\n`);
    const m = scanLibrary(r, BRANDS)[0];
    expect(m.machine.model).toBe('Hand-Corrected'); // inference did not clobber the edit
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/main/scan.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/main/scan.ts`**

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { inferMachineFromPath } from '@joelberger/twdb-client';
import { findMachineDirs } from './library';
import { readMachineYaml, writeMachineYaml, readTwdbYaml, type MachineDoc } from './machineYaml';

export type MachineStatus = 'new' | 'onTwdb';

export interface ScannedMachine {
  absPath: string;
  relPath: string;
  status: MachineStatus;
  machine: MachineDoc;
}

// Detect machine folders; for any without a machine.yaml, seed one from path inference.
// Never overwrites an existing machine.yaml (the user's edits win).
export function scanLibrary(root: string, brandNames: string[]): ScannedMachine[] {
  return findMachineDirs(root).map((dir) => {
    const machineFile = path.join(dir.absPath, 'machine.yaml');
    if (!existsSync(machineFile)) {
      const { brandGuess, modelGuess, yearGuess } = inferMachineFromPath(dir.relPath, brandNames);
      const seeded: MachineDoc = {
        make: brandGuess || undefined,
        model: modelGuess || undefined,
        year: yearGuess || undefined,
        photos: dir.imageFiles.map((file) => ({ file, role: 'gallery' as const })),
      };
      writeMachineYaml(dir.absPath, seeded);
    }
    const machine = readMachineYaml(dir.absPath);
    const twdb = readTwdbYaml(dir.absPath);
    return {
      absPath: dir.absPath,
      relPath: dir.relPath,
      status: twdb.twdbUrl ? 'onTwdb' : 'new',
      machine,
    };
  });
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run src/main/scan.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scanLibrary — detect, infer-seed machine.yaml, report status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C5: Brand fetch + IPC + minimal renderer (folder picker → machine list)

**Files:**
- Create: `/Users/joelberger/Programs/Node/figureshift/src/main/brands.ts`
- Modify: `/Users/joelberger/Programs/Node/figureshift/src/main.ts` (IPC handlers + dialog)
- Modify: `/Users/joelberger/Programs/Node/figureshift/src/preload.ts` (expose API)
- Modify: `/Users/joelberger/Programs/Node/figureshift/src/App.tsx` (folder picker + list)

- [ ] **Step 1: Brand cache helper**

Create `src/main/brands.ts`:

```ts
import { TwdbClient } from '@joelberger/twdb-client';

let cache: string[] | null = null;

// Brand names for inference. Cached per session (be a good citizen: fetch once).
export async function getBrandNames(client: TwdbClient): Promise<string[]> {
  if (cache) return cache;
  const brands = await client.listBrands();
  cache = brands.map((b) => b.name);
  return cache;
}
```

- [ ] **Step 2: Hold the logged-in client and add IPC in `src/main.ts`**

The slice-1 login handler (`attemptLogin`) constructs a throwaway client. Update it to keep the authenticated client in a module variable so scanning can fetch brands. Replace the existing `twdb:login` handler region with:

```ts
import { dialog, ipcMain } from 'electron';
import { TwdbClient } from '@joelberger/twdb-client';
import { attemptLogin } from './main/twdbAuth';
import { resizeSmokeTest } from './main/resizeSmokeTest';
import { getBrandNames } from './main/brands';
import { scanLibrary } from './main/scan';

let client: TwdbClient | null = null;

ipcMain.handle('twdb:login', async (_e, { username, password }: { username: string; password: string }) => {
  const c = new TwdbClient();
  const res = await attemptLogin(username, password, () => c);
  if (res.ok) client = c;
  return res;
});
ipcMain.handle('twdb:resizeSmokeTest', () => resizeSmokeTest());

ipcMain.handle('library:pickRoot', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('library:scan', async (_e, root: string) => {
  const brandNames = client ? await getBrandNames(client) : [];
  return scanLibrary(root, brandNames);
});
```

(Remove the now-duplicated old `attemptLogin`/`resizeSmokeTest` imports/handlers so there's a single definition.)

- [ ] **Step 3: Expose the API in `src/preload.ts`**

Add to the `exposeInMainWorld('figureshift', { ... })` object:

```ts
  pickRoot: () => ipcRenderer.invoke('library:pickRoot'),
  scan: (root: string) => ipcRenderer.invoke('library:scan', root),
```

- [ ] **Step 4: Minimal renderer in `src/App.tsx`**

Extend the `window.figureshift` type and add a "Pick library folder" button that scans and lists detected machines (name + inferred make/model/year + status). Add to the interface:

```ts
      pickRoot: () => Promise<string | null>;
      scan: (root: string) => Promise<Array<{
        relPath: string;
        status: 'new' | 'onTwdb';
        machine: { make?: string; model?: string; year?: string; photos: { file: string }[] };
      }>>;
```

And in the component body + JSX (after the existing smoke-test section):

```tsx
  const [machines, setMachines] = useState<Awaited<ReturnType<typeof window.figureshift.scan>>>([]);
  const [root, setRoot] = useState('');

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (!picked) return;
    setRoot(picked);
    setMachines(await window.figureshift.scan(picked));
  }
```

```tsx
      <hr />
      <button onClick={onPick}>Pick library folder…</button>
      {root && <p>{machines.length} machine(s) in {root}</p>}
      <ul>
        {machines.map((m) => (
          <li key={m.relPath}>
            <strong>{m.relPath}</strong> — {m.machine.make ?? '?'} {m.machine.model ?? ''}{' '}
            {m.machine.year ?? ''} [{m.status}] · {m.machine.photos.length} photo(s)
          </li>
        ))}
      </ul>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Manual verification (needs the user)**

Run: `npm start`. Log in, click **Pick library folder…**, choose a folder of typewriter photos (or a test tree). Expect the detected machines to list with inferred make/model/year and `[new]` status, and a `machine.yaml` to appear in each machine folder. Confirm re-scanning doesn't clobber an edited `machine.yaml`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: brand fetch + IPC + minimal folder-picker/machine-list UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## After All Tasks

Run `npm test` in FigureShift (all Vitest suites green) and confirm Phase A/B test suites pass in their repos. Then use `superpowers:finishing-a-development-branch` for the FigureShift branch. The DT branch (Phase B) is left for the user to merge/deploy on DT's normal cadence. Update project memory ([[figureshift-resume]]) to mark slice 2 done and point at slice 3 (review UI).

## Self-Review Notes

- **Spec coverage:** promote resolvers + new `inferMachineFromPath` into twdb-client (A); DT refactor, no behavior change (B); library root walk, machine detection heuristic, path tokenization/inference, two human-editable YAMLs with clean ownership, status (C). Review UI proper is slice 3 (only a minimal list here).
- **Types consistent:** `MachineDoc`/`MachinePhoto`/`TwdbDoc` shared across `machineYaml.ts`, `scan.ts`, and the renderer's inline shape; `MachineGuess` from twdb-client matches `scan.ts` usage (`brandGuess`/`modelGuess`/`yearGuess`).
- **No placeholders:** all helper code is verbatim from DT or fully specified; inference algorithm + tests are concrete.
- **Good-citizen:** brand list fetched once per session and cached.
