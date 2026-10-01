#!/usr/bin/env bash
# Build a release kit for battle.ondream.ai.
#
#   deploy/package.sh            # requires a clean git tree
#   ALLOW_DIRTY=1 deploy/package.sh
#
# Output (git-ignored): deploy/out/battle-<YYYYMMDD-HHMM>-<sha>.tar.gz (+ .sha256)
# Kit layout: battle-<id>/{site/, nginx/, install.sh, release.json, MANIFEST.sha256}
set -euo pipefail
cd "$(dirname "$0")/.."

dirty=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$dirty" != "0" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "working tree is dirty ($dirty files); commit first or set ALLOW_DIRTY=1" >&2
  exit 1
fi

commit=$(git rev-parse HEAD)
id="$(date -u +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"
kit="deploy/out/battle-$id"
[ ! -e "$kit" ] || {
  echo "$kit already exists" >&2
  exit 1
}

pnpm build
mkdir -p "$kit/nginx"
cp -R dist "$kit/site"
cp deploy/nginx/battle.http.conf deploy/nginx/battle.https.conf "$kit/nginx/"
cp deploy/server/install.sh "$kit/install.sh"
chmod 755 "$kit/install.sh"
cat >"$kit/release.json" <<JSON
{
  "id": "$id",
  "commit": "$commit",
  "dirty": $([ "$dirty" = "0" ] && echo false || echo true),
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "domain": "battle.ondream.ai"
}
JSON
(cd "$kit" && find . -type f ! -name MANIFEST.sha256 | LC_ALL=C sort | sed 's|^\./||' | xargs shasum -a 256 >MANIFEST.sha256)

# COPYFILE_DISABLE keeps macOS AppleDouble (._*) files out of the archive.
# --uid/--gid: archive members owned by root instead of the macOS user (uid 501, gid 20).
COPYFILE_DISABLE=1 tar --uid 0 --gid 0 --uname root --gname root -czf "deploy/out/battle-$id.tar.gz" -C deploy/out "battle-$id"
(cd deploy/out && shasum -a 256 "battle-$id.tar.gz" >"battle-$id.tar.gz.sha256")
echo "kit:     $kit"
echo "archive: deploy/out/battle-$id.tar.gz ($(du -h "deploy/out/battle-$id.tar.gz" | cut -f1))"
cat "deploy/out/battle-$id.tar.gz.sha256"
