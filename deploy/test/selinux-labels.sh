#!/usr/bin/env bash
# Control-flow regression checks in an isolated Linux filesystem.
# SELinux commands are simulated; this does not claim real enforcing-policy coverage.
set -euo pipefail
installer=${1:?usage: selinux-labels.sh <installer>}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sed '/^case "${1:-}" in/,$d' "$installer" >"$work/functions.sh"
printf 'EXPECT_IP=192.0.2.10\n' >"$work/site.env"
cat >"$work/deploy-case.sh" <<'CASE'
set -euo pipefail
. "$TEST_FUNCTIONS"
KIT="$TEST_ROOT/kit"; SITE="$TEST_ROOT/site"; REL=new
ACME="$TEST_ROOT/acme"; STATE="$SITE/.state"
preflight() { :; }
baseline() { :; }
getenforce() { printf '%s\n' "$TEST_MODE"; }
write_nginx() { printf '%s\n' config-checked >"$TEST_ROOT/config-checked"; }
verify() { :; }
if [ "$TEST_RESTORE" != missing ]; then
  restorecon() {
    [ "$#" = 2 ] && [ "$1" = -R ] && [ "$2" = "$SITE/releases/new" ] || return 2
    [ "$(readlink "$SITE/current")" = releases/old ] || return 3
    [ ! -e "$TEST_ROOT/config-checked" ] || return 4
    [ "$TEST_RESTORE" != fail ] || return 1
    printf '%s\n' restored >"$TEST_ROOT/labels-restored"
  }
fi
deploy
CASE

failures=0
run_case() {
  local name="$1" mode="$2" restore="$3" want="$4" rc=0 dir="$work/$1"
  mkdir -p "$dir/kit/site" "$dir/site/releases/old"
  printf old >"$dir/site/releases/old/index.html"
  printf new >"$dir/kit/site/index.html"
  ln -s releases/old "$dir/site/current"
  TEST_FUNCTIONS="$work/functions.sh" TEST_ROOT="$dir" TEST_MODE="$mode" TEST_RESTORE="$restore" \
    bash "$work/deploy-case.sh" >"$dir/output.txt" 2>&1 || rc=$?
  local got
  got=$(readlink "$dir/site/current")
  if [ "$want" = blocked ]; then
    if [ "$rc" = 0 ] || [ "$got" != releases/old ] || [ -e "$dir/config-checked" ]; then
      printf 'FAIL %s: rc=%s current=%s; label failure must stop before activation\n' "$name" "$rc" "$got"
      failures=$((failures + 1)); return
    fi
    if ! grep -Eq 'could not restore SELinux labels|restorecon is missing' "$dir/output.txt"; then
      printf 'FAIL %s: deployment stopped for an unrelated reason\n' "$name"
      failures=$((failures + 1)); return
    fi
  else
    if [ "$rc" != 0 ] || [ "$got" != releases/new ]; then
      printf 'FAIL %s: rc=%s current=%s; valid release must activate\n' "$name" "$rc" "$got"
      failures=$((failures + 1)); return
    fi
    if [ "$mode" != Disabled ] && [ ! -e "$dir/labels-restored" ]; then
      printf 'FAIL %s: enabled policy was not restored before activation\n' "$name"
      failures=$((failures + 1)); return
    fi
    if [ "$mode" = Disabled ] && [ -e "$dir/labels-restored" ]; then
      printf 'FAIL %s: disabled-policy path unexpectedly restored labels\n' "$name"
      failures=$((failures + 1)); return
    fi
  fi
  printf 'PASS %s\n' "$name"
}

run_case enforcing-restore-failure Enforcing fail blocked
run_case enforcing-missing-restorecon Enforcing missing blocked
run_case enforcing-restore-success Enforcing success activate
run_case permissive-restore-success Permissive success activate
run_case disabled-policy Disabled success activate
[ "$failures" = 0 ] || exit 1
echo 'SELINUX LABEL FLOW CHECKS PASSED (5)'
