#!/usr/bin/env bash
# Rehearse deploy/server/install.sh end-to-end in a throwaway Ubuntu + nginx container.
#
#   deploy/package.sh && deploy/test/rehearse.sh            # uses the newest kit in deploy/out/
#   deploy/test/rehearse.sh deploy/out/battle-<id>           # a specific kit directory
#
# Simulates the shared production server (another site in conf.d), then runs:
# preflight → deploy → refuse redeploy → second release → rollback → broken template
# (must auto-restore and keep the live release) → fake certificate (HTTPS template) → status → uninstall.
# Exits non-zero on the first failed assertion. Needs Docker and the ubuntu:24.04 image.
set -euo pipefail
cd "$(dirname "$0")/../.."
kit=${1:-$(ls -td deploy/out/battle-*/ 2>/dev/null | head -1)}
kit=${kit%/}
[ -f "$kit/install.sh" ] || {
  echo "no kit found; run deploy/package.sh first" >&2
  exit 1
}
# Refresh the kit's installer and templates so local edits are what gets rehearsed.
cp deploy/server/install.sh "$kit/install.sh"
cp deploy/nginx/battle.*.conf "$kit/nginx/"
rm -f "$kit/MANIFEST.sha256"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
name=$(basename "$kit")
cp -R "$kit" "$work/$name"
cp -R "$kit" "$work/battle-29991231-0000-second"
echo "<!-- second -->" >>"$work/battle-29991231-0000-second/site/index.html"
cp -R "$kit" "$work/battle-29991231-0001-broken"
echo "server { this is broken; }" >"$work/battle-29991231-0001-broken/nginx/battle.http.conf"
echo "<!-- broken -->" >>"$work/battle-29991231-0001-broken/site/index.html"

cat >"$work/run.sh" <<'EOS'
set -u
fail() { echo "ASSERT FAILED: $*"; exit 1; }
ok() { echo "  ok: $*"; }
step() { echo; echo "===== $*"; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq nginx curl openssl ca-certificates >/dev/null 2>&1 || fail "apt-get"
mkdir -p /var/www/other && echo other-ok >/var/www/other/index.html
# a one-line server block on purpose (the parser must still see it)
echo 'server { listen 80; server_name other2.test www.other2.test; root /var/www/other; }' >/etc/nginx/conf.d/other2.conf
nginx
K1=$(ls -d /k/battle-2[0-8]*/ | head -1); K1=${K1%/}
B=/k/battle-29991231-0001-broken; S=/k/battle-29991231-0000-second
get() { curl -s -H 'Host: battle.ondream.ai' http://127.0.0.1/; }
other() { curl -s -H 'Host: other2.test' http://127.0.0.1/; }

step preflight
out=$(bash $K1/install.sh preflight 2>&1); echo "$out" | tail -6
echo "$out" | grep -q "other2.test 200" || fail "other site not detected by preflight"; ok "other sites detected"

step "deploy #1"
bash $K1/install.sh deploy 2>&1 | tail -3
get | grep -q '<!doctype html>' || fail "site not served"; ok "site served"
curl -sI -H 'Host: battle.ondream.ai' http://127.0.0.1/ | grep -qi 'cache-control: no-cache' || fail "index cache header"; ok "index no-cache"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"

step "redeploy same kit"
bash $K1/install.sh deploy >/dev/null 2>&1 && fail "redeploy accepted"; ok "redeploy refused"

step "deploy #2 + rollback"
bash $S/install.sh deploy 2>&1 | tail -1
get | grep -q 'second' || fail "second release not live"; ok "second live"
bash $K1/install.sh rollback 2>&1 | tail -1
get | grep -q 'second' && fail "rollback did not switch"; ok "rolled back"

step "broken template"
cp /etc/nginx/conf.d/zz-battle.ondream.ai.conf /tmp/before.conf
live=$(readlink /var/www/battle.ondream.ai/current)
bash $B/install.sh deploy 2>&1 | tail -1
cmp -s /tmp/before.conf /etc/nginx/conf.d/zz-battle.ondream.ai.conf || fail "config not restored"; ok "config restored"
[ "$(readlink /var/www/battle.ondream.ai/current)" = "$live" ] || fail "current switched to broken release"; ok "live release kept"
get | grep -q 'broken' && fail "broken release served"; ok "broken release not served"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"

step "fake certificate → https"
mkdir -p /etc/letsencrypt/live/battle.ondream.ai && cd /tmp
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=Test CA" -keyout ca.key -out ca.crt >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj "/CN=battle.ondream.ai" -keyout /etc/letsencrypt/live/battle.ondream.ai/privkey.pem -out s.csr >/dev/null 2>&1
printf "subjectAltName=DNS:battle.ondream.ai" >ext
openssl x509 -req -in s.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 2 -extfile ext -out /etc/letsencrypt/live/battle.ondream.ai/fullchain.pem >/dev/null 2>&1
cp ca.crt /usr/local/share/ca-certificates/testca.crt && update-ca-certificates >/dev/null 2>&1
printf '#!/bin/sh\necho certbot-shim "$@"\n' >/usr/local/bin/certbot && chmod +x /usr/local/bin/certbot
out=$(bash $K1/install.sh cert 2>&1); echo "$out" | tail -2
if echo "$out" | grep -q "other sites changed"; then
  # Expected in this sandbox: the only other site has no :443 block, so ours would become the
  # implicit HTTPS default. The installer must detect that and restore the HTTP config.
  ok "installer refused to become the implicit :443 default (restored)"
  grep -q 'listen 443' /etc/nginx/conf.d/zz-battle.ondream.ai.conf && fail "https config left in place"; ok "http config restored"
  get | grep -q '<!doctype html>' || fail "site down after restore"; ok "site still served over http"
  # Give the other site an HTTPS block (as on the real server) and retry.
  printf 'server { listen 443 ssl; server_name other2.test; ssl_certificate /etc/letsencrypt/live/battle.ondream.ai/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/battle.ondream.ai/privkey.pem; root /var/www/other; }\n' >>/etc/nginx/conf.d/other2.conf
  nginx -s reload; sleep 1
  bash $K1/install.sh cert 2>&1 | tail -2
fi
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: battle.ondream.ai' http://127.0.0.1/)" = 301 ] || fail "http not redirecting"; ok "http → https 301"
curl -s --resolve battle.ondream.ai:443:127.0.0.1 https://battle.ondream.ai/ | grep -q '<!doctype html>' || fail "https not serving"; ok "https serving"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"

step status
bash $K1/install.sh status 2>&1

step uninstall
bash $K1/install.sh uninstall 2>&1 | tail -1
[ ! -e /etc/nginx/conf.d/zz-battle.ondream.ai.conf ] || fail "config still present"; ok "config removed"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"
echo; echo "REHEARSAL PASSED"
EOS
docker run --rm -v "$work:/k" ubuntu:24.04 bash /k/run.sh
