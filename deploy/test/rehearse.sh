#!/usr/bin/env bash
# Rehearse deploy/server/install.sh end-to-end in a throwaway container shaped like the production server.
#
#   deploy/package.sh && deploy/test/rehearse.sh            # newest kit in deploy/out/
#   deploy/test/rehearse.sh deploy/out/battle-<id>           # a specific kit directory
#
# Sandbox (mirrors the 2026-10-01 read-only audit of the production server):
#   * nginx with an explicit `listen 80 default_server` site
#   * HTTPS sites listening only on 192.0.2.10:443 and 127.0.0.1:443 (ssl http2), the first one
#     being the implicit :443 default
#   * another process owning 198.51.100.7:443 so a wildcard `listen 443` fails
# Scenarios: preflight → deploy → refuse redeploy → second release → rollback → broken template
# (auto-restore, live release kept) → bare `listen 443` template refused before any change →
# certificate → HTTPS → purge (nginx config byte-identical to the baseline, default cert unchanged).
# Exits non-zero on the first failed assertion. Needs Docker and the ubuntu:24.04 image.
set -euo pipefail
cd "$(dirname "$0")/../.."
kit=${1:-$(command ls -td deploy/out/battle-*/ 2>/dev/null | head -1)}
kit=${kit%/}
[ -f "$kit/install.sh" ] || {
  echo "no kit found; run deploy/package.sh first" >&2
  exit 1
}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
name=$(basename "$kit")
mk() { # mk <dir-name>: copy the kit with the current installer/templates
  cp -R "$kit" "$work/$1"
  cp deploy/server/install.sh "$work/$1/install.sh"
  cp deploy/nginx/battle.*.conf "$work/$1/nginx/"
  rm -f "$work/$1/MANIFEST.sha256"
}
mk "$name"
mk battle-29991231-0000-second
echo "<!-- second -->" >>"$work/battle-29991231-0000-second/site/index.html"
mk battle-29991231-0001-broken
echo "server { this is broken; }" >"$work/battle-29991231-0001-broken/nginx/battle.http.conf"
echo "<!-- broken -->" >>"$work/battle-29991231-0001-broken/site/index.html"
mk battle-29991231-0002-badlisten
sed -i.bak -e 's/listen 192.0.2.10:443 ssl http2;/listen 443 ssl;/' -e '/listen 127.0.0.1:443/d' "$work/battle-29991231-0002-badlisten/nginx/battle.https.conf"

cat >"$work/run.sh" <<'EOS'
set -u
fail() { echo "ASSERT FAILED: $*"; exit 1; }
ok() { echo "  ok: $*"; }
step() { echo; echo "===== $*"; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq nginx curl openssl ca-certificates iproute2 >/dev/null 2>&1 || fail "apt-get"
ip addr add 192.0.2.10/32 dev lo && ip addr add 198.51.100.7/32 dev lo || fail "ip addr (needs --cap-add NET_ADMIN)"
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/other /var/www/miner /etc/ssl/other && echo other-ok >/var/www/other/index.html && echo miner >/var/www/miner/index.html
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=other.test" -keyout /etc/ssl/other/key.pem -out /etc/ssl/other/cert.pem >/dev/null 2>&1
cat >/etc/nginx/conf.d/other.conf <<'C'
server { listen 80; server_name other.test; return 301 https://$host$request_uri; }
server { listen 192.0.2.10:443 ssl http2; listen 127.0.0.1:443 ssl http2; server_name other.test;
  ssl_certificate /etc/ssl/other/cert.pem; ssl_certificate_key /etc/ssl/other/key.pem; root /var/www/other; }
C
cat >/etc/nginx/conf.d/xmine.conf <<'C'
server { listen 80 default_server; server_name miner.test; return 301 https://miner.test$request_uri; }
C
# a foreign process owning a specific-IP :443 (as on production)
openssl s_server -accept 198.51.100.7:443 -cert /etc/ssl/other/cert.pem -key /etc/ssl/other/key.pem -www >/dev/null 2>&1 &
sleep 1
nginx || fail "nginx start"
FP0=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)
K1=$(ls -d /k/battle-2[0-8]*/ | head -1); K1=${K1%/}
B=/k/battle-29991231-0001-broken; S=/k/battle-29991231-0000-second; L=/k/battle-29991231-0002-badlisten
get() { curl -s -H 'Host: battle.ondream.ai' http://127.0.0.1/; }
other() { curl -sk --resolve other.test:443:127.0.0.1 https://other.test/; }
defcert() { echo | openssl s_client -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | tr -d ' '; }
DEF0=$(defcert)

step preflight
out=$(bash $K1/install.sh preflight 2>&1); echo "$out" | tail -9
echo "$out" | grep -q "other.test 301 200" || fail "other site not detected"; ok "other sites detected"
echo "$out" | grep -q "already bound by nginx" || fail "socket check"; ok "https sockets verified"
[ ! -e /root/battle-deploy/baseline ] || fail "preflight wrote a baseline"; ok "preflight changed nothing"

step "deploy #1 (records baseline first)"
bash $K1/install.sh deploy 2>&1 | grep -E "baseline|installed|deployed|ERROR" | tail -4
[ "$(cat /root/battle-deploy/baseline/nginx-T.sha256)" = "$FP0" ] || fail "baseline fingerprint"; ok "baseline = pre-change nginx fingerprint"
get | grep -q '<!doctype html>' || fail "site not served"; ok "site served over http"
[ "$(stat -c %U:%G /var/www/battle.ondream.ai/current/index.html)" = root:root ] || fail "release files not owned by root"; ok "release files owned by root:root"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"
[ "$(defcert)" = "$DEF0" ] || fail "default cert changed"; ok "default :443 cert unchanged"

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
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"

step "certificate (fake CA) present"
mkdir -p /etc/letsencrypt/live/battle.ondream.ai && cd /tmp
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=Test CA" -keyout ca.key -out ca.crt >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj "/CN=battle.ondream.ai" -keyout /etc/letsencrypt/live/battle.ondream.ai/privkey.pem -out s.csr >/dev/null 2>&1
printf "subjectAltName=DNS:battle.ondream.ai" >ext
openssl x509 -req -in s.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 2 -extfile ext -out /etc/letsencrypt/live/battle.ondream.ai/fullchain.pem >/dev/null 2>&1
cp ca.crt /usr/local/share/ca-certificates/testca.crt && update-ca-certificates >/dev/null 2>&1
cat >/usr/local/bin/certbot <<'C'
#!/bin/sh
echo "certbot-shim $*"
if [ "$1" = delete ]; then rm -rf /etc/letsencrypt/live/battle.ondream.ai; fi
C
chmod +x /usr/local/bin/certbot

step "bare 'listen 443' template must be refused before any change"
cp /etc/nginx/conf.d/zz-battle.ondream.ai.conf /tmp/before.conf
out=$(bash $L/install.sh cert 2>&1); echo "$out" | tail -1
echo "$out" | grep -q "refusing" || fail "bare listen 443 not refused"; ok "refused"
cmp -s /tmp/before.conf /etc/nginx/conf.d/zz-battle.ondream.ai.conf || fail "config touched"; ok "config untouched"

step "switch to https"
bash $K1/install.sh cert 2>&1 | tail -2
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: battle.ondream.ai' http://127.0.0.1/)" = 301 ] || fail "http not redirecting"; ok "http → https 301"
curl -s --resolve battle.ondream.ai:443:127.0.0.1 https://battle.ondream.ai/ | grep -q '<!doctype html>' || fail "https not serving"; ok "https serving with its own cert"
[ "$(other)" = other-ok ] || fail "other site broken"; ok "other site intact"
[ "$(defcert)" = "$DEF0" ] || fail "default cert changed"; ok "default :443 cert still $DEF0"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: unknown.test' http://127.0.0.1/)" = 301 ] || fail "port 80 default changed"; ok "port 80 default_server unchanged"

step status
bash $K1/install.sh status 2>&1

step "purge (full rollback with proof)"
out=$(bash $K1/install.sh purge 2>&1); echo "$out" | tail -6
echo "$out" | grep -q "PURGE VERIFIED" || fail "purge not verified"; ok "purge verified by the installer"
[ "$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)" = "$FP0" ] || fail "nginx config differs from pre-deploy"; ok "nginx -T fingerprint identical to pre-deploy ($FP0)"
[ ! -e /var/www/battle.ondream.ai ] && [ ! -e /var/www/battle-acme ] && [ ! -e /etc/letsencrypt/live/battle.ondream.ai ] || fail "leftovers"; ok "site files and certificate removed"
[ "$(other)" = other-ok ] && [ "$(defcert)" = "$DEF0" ] || fail "other site / default cert"; ok "other site and default cert as before"
echo; echo "REHEARSAL PASSED"
EOS
docker run --rm --cap-add NET_ADMIN -v "$work:/k" ubuntu:24.04 bash /k/run.sh
