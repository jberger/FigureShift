#!/usr/bin/env bash
#
# Cut a release of FigureShift. See --help.
#
set -euo pipefail

usage() {
  cat <<'EOF'
release.sh — cut a FigureShift release (mac + windows installers via CI).

Usage:
  ./release.sh vX.Y.Z [--watch]         release an explicit version
  ./release.sh --patch [--watch]        bump the latest tag's patch  (vX.Y.Z -> vX.Y.(Z+1))
  ./release.sh --minor [--watch]        bump minor                   (-> vX.(Y+1).0)
  ./release.sh --major [--watch]        bump major                   (-> v(X+1).0.0)
  ./release.sh [vX.Y.Z] --no-tag [--watch]
                                        resume: tag/commit already exist; just (re)push
                                        (omit the version to resume the latest tag)
  ./release.sh --help

Flags:
  --watch                  after pushing, wait for the release build (gh run watch).
  --major | --minor | --patch
                           compute the next version from the latest vX.Y.Z tag (no version arg).
  --no-tag                 don't bump/commit/tag; resume an existing release (e.g. after a push
                           failed mid-run). Mutually exclusive with --major/--minor/--patch.
  -h, --help               show this help.

Normal flow: set package.json version -> commit "Release vX.Y.Z" -> annotated tag -> push
main + tag (triggers .github/workflows/release.yml -> a GitHub Release with installers attached).
EOF
}

VERSION=""
WATCH=0
NOTAG=0
BUMP="" # major | minor | patch

for arg in "$@"; do
  case "$arg" in
    --watch) WATCH=1 ;;
    --no-tag) NOTAG=1 ;;
    --major | --minor | --patch)
      [[ -n "$BUMP" ]] && { echo "error: pick only one of --major/--minor/--patch" >&2; exit 1; }
      BUMP="${arg#--}" ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "error: unknown flag '$arg' (try --help)" >&2; exit 1 ;;
    *)
      [[ -n "$VERSION" ]] && { echo "error: more than one version given" >&2; exit 1; }
      VERSION="$arg" ;;
  esac
done

# Run from the repo root regardless of where it's invoked.
cd "$(dirname "$0")"

latest_tag() { git tag --list 'v*' --sort=-v:refname | head -1; }

# --- resolve the version -----------------------------------------------------
if [[ -n "$BUMP" ]]; then
  [[ -n "$VERSION" ]] && { echo "error: don't pass a version with --$BUMP" >&2; exit 1; }
  [[ "$NOTAG" == 1 ]] && { echo "error: --no-tag can't be combined with --$BUMP" >&2; exit 1; }
  base="$(latest_tag)"
  [[ -n "$base" ]] || { echo "error: no existing vX.Y.Z tag to bump from" >&2; exit 1; }
  IFS=. read -r MA MI PA <<<"${base#v}"
  case "$BUMP" in
    major) MA=$((MA + 1)); MI=0; PA=0 ;;
    minor) MI=$((MI + 1)); PA=0 ;;
    patch) PA=$((PA + 1)) ;;
  esac
  VERSION="v${MA}.${MI}.${PA}"
  echo "==> ${BUMP} bump: ${base} -> ${VERSION}"
elif [[ -z "$VERSION" && "$NOTAG" == 1 ]]; then
  VERSION="$(latest_tag)"
  [[ -n "$VERSION" ]] || { echo "error: --no-tag with no version and no existing tag" >&2; exit 1; }
  echo "==> resume latest tag: ${VERSION}"
fi

if [[ -z "$VERSION" ]]; then
  echo "error: need a version (vX.Y.Z), a bump (--major/--minor/--patch), or --no-tag" >&2
  echo "       try: $(basename "$0") --help" >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must look like v1.2.3 (got '$VERSION')" >&2
  exit 1
fi

# --- watch prerequisites (checked before any push) ---------------------------
if [[ "$WATCH" == 1 ]]; then
  command -v gh >/dev/null || { echo "error: --watch needs 'gh' on PATH" >&2; exit 1; }
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "error: on branch '$branch', expected 'main'" >&2; exit 1; }

if [[ "$NOTAG" == 1 ]]; then
  # --- resume: tag/commit already exist; just (re)push (idempotent) ----------
  git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null \
    || { echo "error: --no-tag but tag $VERSION does not exist" >&2; exit 1; }
  echo "==> resume $VERSION: pushing main + tag (idempotent)"
  git push origin main
  git push origin "$VERSION"
else
  # --- create: bump, commit, tag, push --------------------------------------
  if ! git diff-index --quiet HEAD --; then
    echo "error: working tree has uncommitted changes — commit or stash first" >&2
    git status --short >&2
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
    echo "error: tag $VERSION already exists (use --no-tag to resume it)" >&2
    exit 1
  fi

  # Bump package.json + package-lock.json to the bare version (no leading 'v'), no git tag.
  # Bump package.json (skip if already at the target, e.g. the very first release at this version).
  cur="$(node -p "require('./package.json').version")"
  if [[ "$cur" != "${VERSION#v}" ]]; then
    npm version --no-git-tag-version "${VERSION#v}" >/dev/null
    echo "==> set version: $cur -> ${VERSION#v}"
  else
    echo "==> package.json already at ${VERSION#v}"
  fi

  # Stamp CHANGELOG.md: turn the [Unreleased] placeholder into this version, leaving a fresh placeholder.
  if [[ -f CHANGELOG.md ]] && grep -q '^## \[Unreleased\]' CHANGELOG.md; then
    awk -v ver="${VERSION#v}" -v date="$(date +%F)" '
      !stamped && /^## \[Unreleased\]/ { print; print ""; print "## [" ver "] - " date; stamped = 1; next }
      { print }
    ' CHANGELOG.md >CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
    echo "==> stamped CHANGELOG.md for ${VERSION#v}"
  fi

  git add package.json package-lock.json
  [[ -f CHANGELOG.md ]] && git add CHANGELOG.md
  git --no-pager diff --cached --stat
  git diff --cached --quiet || git commit -m "Release $VERSION"
  git tag -a "$VERSION" -m "Release $VERSION"

  echo "==> pushing main + tag $VERSION (triggers the release build)"
  git push origin main
  git push origin "$VERSION"
fi

if [[ "$WATCH" != 1 ]]; then
  cat <<EOF

Release $VERSION pushed.
  - CI is building mac (arm64 + x64) and windows installers (Actions: release)
  - they'll attach to the GitHub Release for $VERSION when green

EOF
  exit 0
fi

# --- wait for the build ------------------------------------------------------
# Keep the machine awake for the long multi-platform watch (only on macOS).
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w "$$" &
fi

echo "==> waiting for the release run for $VERSION to appear..."
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow=release.yml --limit 20 \
    --json databaseId,headBranch,event \
    --jq "[.[] | select(.headBranch==\"$VERSION\" and .event==\"push\")][0].databaseId" 2>/dev/null || true)"
  [[ -n "$run_id" && "$run_id" != "null" ]] && break
  run_id=""
  sleep 3
done
[[ -n "$run_id" ]] || { echo "error: no release run found for $VERSION; check the Actions tab" >&2; exit 1; }

echo "==> watching release run $run_id (~several min)..."
gh run watch "$run_id" --exit-status

echo
echo "Release $VERSION built. Assets are on the GitHub Release."
