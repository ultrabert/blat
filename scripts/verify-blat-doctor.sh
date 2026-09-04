#!/usr/bin/env bash
# Read-only check: is this blat instance worth driving?
# Does not start or kill servers. Exit 0 only when client + server answer on IPv4.
set -euo pipefail

CLIENT_URL="${VERIFY_BLAT_CLIENT:-http://127.0.0.1:5173}"
SERVER_URL="${VERIFY_BLAT_SERVER:-http://127.0.0.1:2567}"
fail=0

check_http() {
  local name="$1" url="$2" expect="$3"
  local code
  code="$(curl -s -o /tmp/verify-blat-doctor.body -w '%{http_code}' --max-time 3 "$url" || true)"
  if [[ "$code" != "$expect" ]]; then
    echo "FAIL  $name  $url  http $code (want $expect)"
    fail=1
    return
  fi
  echo "ok    $name  $url  http $code"
}

set +e
python3 - "$CLIENT_URL" "$SERVER_URL" <<'PY'
import socket, sys, urllib.parse
def port_open(host, port, family):
    s = socket.socket(family, socket.SOCK_STREAM)
    s.settimeout(1)
    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()

client = urllib.parse.urlparse(sys.argv[1])
server = urllib.parse.urlparse(sys.argv[2])
cport = client.port or (443 if client.scheme == "https" else 80)
sport = server.port or (443 if server.scheme == "https" else 80)
v4c = port_open("127.0.0.1", cport, socket.AF_INET)
v6c = port_open("::1", cport, socket.AF_INET6)
v4s = port_open("127.0.0.1", sport, socket.AF_INET)
print(f"{'ok   ' if v4c else 'FAIL '} client IPv4 127.0.0.1:{cport}")
print(f"{'ok   ' if v6c else 'warn '} client IPv6 ::1:{cport}")
print(f"{'ok   ' if v4s else 'FAIL '} server IPv4 127.0.0.1:{sport}")
if not v4c:
    print("hint  Vite 8 binds [::1] only unless server.host is true. Agent browsers often hit 127.0.0.1.")
    sys.exit(2)
if not v4s:
    sys.exit(2)
PY
ports_ok=$?
set -euo pipefail
if [[ "$ports_ok" -ne 0 ]]; then fail=1; fi

check_http "demo"   "${CLIENT_URL}/demo" "200"
check_http "health" "${SERVER_URL}/api/health" "200"

if [[ -f /tmp/verify-blat-doctor.body ]]; then
  if grep -q '"ok":true' /tmp/verify-blat-doctor.body && grep -q '"name":"blat"' /tmp/verify-blat-doctor.body; then
    echo "ok    health body  name=blat"
  else
    echo "FAIL  health body  $(head -c 200 /tmp/verify-blat-doctor.body)"
    fail=1
  fi
fi

lag="$(curl -s --max-time 3 "${SERVER_URL}/api/lag" || true)"
if [[ -z "$lag" ]]; then
  echo "warn  lag     ${SERVER_URL}/api/lag  empty (open /demo first)"
elif echo "$lag" | grep -q '"hint"'; then
  echo "warn  lag     no spectator report yet — open /demo, wait 2s, curl again"
else
  echo "ok    lag     $lag"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "doctor FAIL — do not drive this instance. See Launch in .cursor/skills/verify-blat/SKILL.md"
  exit 1
fi
echo "doctor PASS"
exit 0
