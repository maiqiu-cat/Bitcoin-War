#!/usr/bin/env bash
# Bitcoin Battle — server-side installer for battle.ondream.ai.
#
# Runs as root on the web server, from inside an unpacked release kit:
#   /root/battle-deploy/battle-<id>/install.sh <command>
#
# Commands
#   preflight   read-only checks (nginx, config, conflicts, disk, other sites)
#   deploy      install this kit's site as a new release, switch `current`, install nginx config
#   cert        issue the Let's Encrypt certificate (needs DNS → this server), switch to HTTPS config
#   rollback    point `current` back to the previous release
#   uninstall   remove the nginx site config (files under /var/www/battle.ondream.ai are kept)
#   status      show releases, config, certificate and HTTP checks
#
# Safety rules (shared server: other projects' sites live here)
#   * only touches: /var/www/battle.ondream.ai, /var/www/battle-acme,
#     /etc/nginx/conf.d/zz-battle.ondream.ai.conf, and certbot's battle.ondream.ai lineage
#   * every nginx change: backup → nginx -t → reload → compare other sites' HTTP codes
#     before/after; any failure or change restores the previous config automatically
set -euo pipefail

DOMAIN=battle.ondream.ai
EXPECT_IP=203.0.113.10
SITE=/var/www/battle.ondream.ai
ACME=/var/www/battle-acme
CONF=/etc/nginx/conf.d/zz-battle.ondream.ai.conf
CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
KIT="$(cd "$(dirname "$0")" && pwd)"
REL="$(basename "$KIT")"
REL="${REL#battle-}"
STATE="$SITE/.state"

log() { printf '[battle] %s\n' "$*"; }
warn() { printf '[battle] WARN: %s\n' "$*" >&2; }
die() {
  printf '[battle] ERROR: %s\n' "$*" >&2
  exit 1
}

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
}

# "<file> <name>" for every server_name in the live config (handles one-line server blocks).
server_names() {
  nginx -T 2>/dev/null | awk '
    /^# configuration file /{ f=$4; sub(/:$/,"",f); next }
    { line=$0; sub(/#.*/,"",line)
      while (match(line, /server_name[ \t]+[^;]+;/)) {
        s=substr(line, RSTART, RLENGTH); line=substr(line, RSTART+RLENGTH)
        sub(/^server_name[ \t]+/,"",s); sub(/;$/,"",s)
        n=split(s, a, /[ \t]+/); for (i=1;i<=n;i++) if (a[i]!="") print f, a[i]
      } }'
}

# Host names of every other site nginx serves (exact names only).
other_hosts() {
  server_names | awk -v conf="$CONF" '$1 != conf {print $2}' |
    grep -E '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' | grep -v -x "$DOMAIN" | sort -u | head -20 || true
}

# "host http-code https-code" for each other site, via loopback (no DNS involved).
snapshot_sites() {
  local h c80 c443
  for h in $(other_hosts); do
    c80=$(curl -s -o /dev/null -m 8 -w '%{http_code}' -H "Host: $h" http://127.0.0.1/ || true)
    c443=$(curl -sk -o /dev/null -m 8 -w '%{http_code}' --resolve "$h:443:127.0.0.1" "https://$h/" || true)
    printf '%s %s %s\n' "$h" "$c80" "$c443"
  done
}

preflight() {
  [ "$(id -u)" = 0 ] || die "run as root"
  command -v nginx >/dev/null || die "nginx not found"
  command -v curl >/dev/null || die "curl not found"
  log "nginx: $(nginx -v 2>&1)"
  nginx -t 2>/dev/null || die "current nginx config already fails 'nginx -t' — not touching anything"
  [ -d /etc/nginx/conf.d ] || die "/etc/nginx/conf.d missing"
  nginx -T 2>/dev/null | grep -q 'include[[:space:]]\+/etc/nginx/conf.d/\*\.conf' || warn "nginx.conf does not visibly include conf.d/*.conf"

  # Another file already serving this domain?
  local conflict
  conflict=$(server_names | awk -v conf="$CONF" -v d="$DOMAIN" '$1 != conf && $2 == d {print $1}' | sort -u)
  [ -z "$conflict" ] || die "$DOMAIN already configured in: $conflict"

  log "default_server lines (informational):"
  nginx -T 2>/dev/null | grep -n 'default_server' | sed 's/^/  /' || log "  (none — first server block per port is the implicit default; our file is named zz-* to stay last)"
  local avail
  avail=$(df -Pm /var/www 2>/dev/null | awk 'NR==2{print $4}')
  log "free space on /var/www: ${avail:-?} MB"
  [ "${avail:-0}" -gt 200 ] || die "less than 200 MB free on /var/www"
  if [ -f "$KIT/MANIFEST.sha256" ]; then
    (cd "$KIT" && sha256sum -c --quiet MANIFEST.sha256) || die "kit integrity check failed"
    log "kit integrity: OK ($(wc -l <"$KIT/MANIFEST.sha256") files)"
  fi
  command -v certbot >/dev/null && log "certbot: $(certbot --version 2>&1)" || warn "certbot not installed (needed for 'cert')"
  [ -f "$CERT" ] && log "certificate present: $(openssl x509 -enddate -noout -in "$CERT")" || log "certificate: not yet issued"
  local sites
  sites=$(snapshot_sites)
  log "other sites (host http https): $(printf '%s\n' "$sites" | grep -c . || true) found"
  printf '%s\n' "$sites" | sed 's/^/  /'
  log "preflight OK"
}

# Install the right nginx template (http before the cert exists, https after), with automatic restore.
write_nginx() {
  local tmpl="$KIT/nginx/battle.http.conf"
  [ -f "$CERT" ] && tmpl="$KIT/nginx/battle.https.conf"
  [ -f "$tmpl" ] || die "missing template $tmpl"
  install -d -m 700 "$STATE"
  local before backup=""
  before=$(snapshot_sites)
  if [ -e "$CONF" ]; then
    backup="$STATE/nginx-$(date -u +%Y%m%dT%H%M%SZ).conf"
    cp -p "$CONF" "$backup"
  fi
  install -m 644 "$tmpl" "$CONF.new"
  mv -f "$CONF.new" "$CONF"
  restore() {
    warn "restoring previous nginx state"
    if [ -n "$backup" ]; then cp -p "$backup" "$CONF"; else rm -f "$CONF"; fi
    nginx -t && reload_nginx
    sleep 2 # reload is asynchronous; let new workers take over before anyone re-checks
  }
  if ! nginx -t; then
    restore
    die "nginx -t failed with the new config (restored)"
  fi
  reload_nginx
  sleep 1
  local after
  after=$(snapshot_sites)
  if [ "$before" != "$after" ]; then
    printf 'before:\n%s\nafter:\n%s\n' "$before" "$after" >&2
    restore
    die "other sites changed their HTTP responses after reload (restored)"
  fi
  log "nginx config installed: $(basename "$tmpl") → $CONF"
}

verify() {
  local want got scheme=http opts=(-H "Host: $DOMAIN") url="http://127.0.0.1"
  if [ -f "$CERT" ]; then
    scheme=https
    opts=(--resolve "$DOMAIN:443:127.0.0.1")
    url="https://$DOMAIN"
  fi
  want=$(sha256sum "$SITE/current/index.html" | cut -d' ' -f1)
  got=$(curl -fsS -m 10 "${opts[@]}" "$url/" | sha256sum | cut -d' ' -f1) || {
    warn "GET / failed"
    return 1
  }
  [ "$want" = "$got" ] || {
    warn "served index.html does not match release ($got != $want)"
    return 1
  }
  local asset
  asset=$(grep -o '/assets/[^"]*\.js' "$SITE/current/index.html" | head -1 || true)
  if [ -n "$asset" ]; then
    curl -fsS -m 10 -o /dev/null -D - "${opts[@]}" "$url$asset" | grep -qi 'cache-control: public, max-age=31536000, immutable' || {
      warn "asset $asset missing or without immutable caching"
      return 1
    }
  fi
  log "verify OK over $scheme: index.html matches release $(readlink "$SITE/current"), assets cached immutable"
}

deploy() {
  preflight
  [ -d "$KIT/site" ] && [ -f "$KIT/site/index.html" ] || die "kit has no site/index.html"
  install -d -m 755 "$SITE" "$SITE/releases" "$ACME" "$ACME/.well-known/acme-challenge"
  [ ! -e "$SITE/releases/$REL" ] || die "release $REL already exists — build a new kit instead of overwriting"
  cp -a "$KIT/site" "$SITE/releases/$REL"
  find "$SITE/releases/$REL" -type d -exec chmod 755 {} +
  find "$SITE/releases/$REL" -type f -exec chmod 644 {} +
  install -d -m 700 "$STATE"
  local prev
  prev=$(readlink "$SITE/current" 2>/dev/null || true)
  # nginx first: if the config is rejected nothing user-visible has changed yet.
  write_nginx
  ln -sfn "releases/$REL" "$SITE/current.tmp"
  mv -Tf "$SITE/current.tmp" "$SITE/current"
  log "current → releases/$REL (previous: ${prev:-none})"
  if ! verify; then
    if [ -n "$prev" ]; then
      ln -sfn "$prev" "$SITE/current.tmp"
      mv -Tf "$SITE/current.tmp" "$SITE/current"
      die "verification failed — current switched back to $prev"
    fi
    die "verification failed (first release, nothing to switch back to; run 'uninstall' to remove the site)"
  fi
  printf '%s\n' "$prev" >"$STATE/PREVIOUS"
  log "deployed $REL — http://$DOMAIN/ (https after 'cert')"
}

cert() {
  [ "$(id -u)" = 0 ] || die "run as root"
  command -v certbot >/dev/null || die "certbot not installed"
  [ -e "$CONF" ] || die "run 'deploy' first (the HTTP config serves the ACME challenge)"
  if [ ! -f "$CERT" ]; then
    local resolved
    resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')
    [ "$resolved" = "$EXPECT_IP" ] || die "$DOMAIN resolves to '${resolved:-nothing}', expected $EXPECT_IP — add the DNS A record and wait for DNS"
    # Self-test the challenge path through nginx before asking Let's Encrypt.
    local tok="selftest-$RANDOM$RANDOM"
    echo "$tok" >"$ACME/.well-known/acme-challenge/$tok"
    local body
    body=$(curl -fsS -m 8 -H "Host: $DOMAIN" "http://127.0.0.1/.well-known/acme-challenge/$tok" || true)
    rm -f "$ACME/.well-known/acme-challenge/$tok"
    [ "$body" = "$tok" ] || die "ACME challenge path not served by nginx"
    certbot certonly --webroot -w "$ACME" -d "$DOMAIN" --non-interactive --keep-until-expiring \
      ${CERTBOT_EMAIL:+--email "$CERTBOT_EMAIL" --agree-tos}
  else
    log "certificate already present"
  fi
  write_nginx
  verify || die "HTTPS verification failed (config kept; run 'status' and check nginx error log)"
  log "HTTPS live: https://$DOMAIN/ ($(openssl x509 -enddate -noout -in "$CERT"))"
}

rollback() {
  local prev
  prev=$(cat "$STATE/PREVIOUS" 2>/dev/null || true)
  [ -n "$prev" ] && [ -d "$SITE/$prev" ] || die "no previous release recorded"
  local cur
  cur=$(readlink "$SITE/current")
  ln -sfn "$prev" "$SITE/current.tmp"
  mv -Tf "$SITE/current.tmp" "$SITE/current"
  echo "$cur" >"$STATE/PREVIOUS"
  log "current → $prev (was $cur)"
  verify || die "verification failed after rollback"
}

uninstall() {
  [ -e "$CONF" ] || {
    log "no nginx config installed"
    return
  }
  install -d -m 700 "$STATE"
  cp -p "$CONF" "$STATE/nginx-uninstalled-$(date -u +%Y%m%dT%H%M%SZ).conf"
  rm -f "$CONF"
  nginx -t || die "nginx -t failed after removing config"
  reload_nginx
  sleep 1
  log "nginx site removed (files kept under $SITE; certificate kept)"
}

status() {
  log "current:  $(readlink "$SITE/current" 2>/dev/null || echo none)"
  log "previous: $(cat "$STATE/PREVIOUS" 2>/dev/null || echo none)"
  log "releases: $(ls "$SITE/releases" 2>/dev/null | tr '\n' ' ')"
  log "config:   $([ -e "$CONF" ] && echo "$CONF" || echo 'not installed')"
  [ -f "$CERT" ] && log "cert:     $(openssl x509 -enddate -noout -in "$CERT")" || log "cert:     none"
  log "http:     $(curl -s -o /dev/null -m 8 -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/)"
  [ -f "$CERT" ] && log "https:    $(curl -s -o /dev/null -m 8 -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
  return 0
}

case "${1:-}" in
  preflight) preflight ;;
  deploy) deploy ;;
  cert) cert ;;
  rollback) rollback ;;
  uninstall) uninstall ;;
  status) status ;;
  *)
    sed -n '2,20p' "$0"
    exit 2
    ;;
esac
