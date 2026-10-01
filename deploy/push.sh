#!/usr/bin/env bash
# Upload a kit to the server over SSH and run an install.sh command there.
#
#   deploy/push.sh [archive] [command]      # command: preflight (default) | deploy | cert | status | rollback
#   deploy/push.sh deploy/out/battle-20261001-1830-abc1234.tar.gz deploy
#
# Requires `ssh $DEPLOY_HOST` to work (see docs/handoff/deploy.md).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-prod-server}
REMOTE_DIR=/root/battle-deploy
archive=${1:-$(ls -t deploy/out/battle-*.tar.gz 2>/dev/null | head -1)}
cmd=${2:-preflight}
[ -f "$archive" ] || {
  echo "no archive; run deploy/package.sh first" >&2
  exit 1
}
name=$(basename "$archive" .tar.gz)
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

ssh "${SSH_OPTS[@]}" "$HOST" "install -d -m 700 $REMOTE_DIR"
scp "${SSH_OPTS[@]}" "$archive" "$archive.sha256" "$HOST:$REMOTE_DIR/"
ssh "${SSH_OPTS[@]}" "$HOST" "set -e; cd $REMOTE_DIR; sha256sum -c $name.tar.gz.sha256; \
  if [ ! -d $name ]; then tar --no-same-owner -xzf $name.tar.gz; fi; bash $name/install.sh $cmd"
