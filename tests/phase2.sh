#!/usr/bin/env bash
# Phase 2 integration tests (PROMPT.md section 12).
#
#   - a ministry token creates an event and sees it in the general calendar;
#   - it gets 403 editing an event of ANOTHER ministry (verified with curl);
#   - a readonly token gets 403 on any write.
set -uo pipefail

FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_iel-calendario}"

ADMIN_TOK="test-admin-token"
LOUVOR_TOK="test-louvor-token"
RO_TOK="test-readonly-token"

pass=0; fail=0
sha() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "→ Seeding test tokens..."
LOUVOR_ID=$(psql -c "select id from ministries where slug='louvor';")
MM_ID=$(psql -c "select id from ministries where slug='multimedia';")
psql <<SQL >/dev/null
delete from access_tokens where label like 'TEST-%';
delete from events where title like 'TEST %';
insert into access_tokens (ministry_id, scope, token_hash, label) values
  (null,         'admin',    '$(sha "$ADMIN_TOK")',  'TEST-admin'),
  ('$LOUVOR_ID', 'ministry', '$(sha "$LOUVOR_TOK")', 'TEST-louvor'),
  (null,         'readonly', '$(sha "$RO_TOK")',     'TEST-readonly');
SQL

BODY_FILE=$(mktemp)
req() {
  local method="$1" path="$2" token="$3" json="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "x-access-token: $token")
  [ -n "$json" ] && args+=(-d "$json")
  curl "${args[@]}" "$FUNCTIONS_URL$path"
}
check() {
  if [ "$2" = "$3" ]; then printf '  ✅ %-52s [%s]\n' "$1" "$3"; pass=$((pass+1))
  else printf '  ❌ %-52s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); printf '        body: %s\n' "$(cat "$BODY_FILE")"; fi
}
jsonget() { python3 -c "import json;print(json.load(open('$BODY_FILE'))$1)" 2>/dev/null; }

FROM="2026-09-01T00:00:00Z"; TO="2026-09-30T23:59:59Z"
EV_OWN=$(printf '{"ministry_id":"%s","title":"TEST Ensaio","starts_at":"2026-09-06T18:00:00Z","ends_at":"2026-09-06T19:30:00Z","status":"confirmada"}' "$LOUVOR_ID")
EV_MM=$(printf '{"ministry_id":"%s","title":"TEST Projecao","starts_at":"2026-09-13T10:00:00Z","ends_at":"2026-09-13T12:00:00Z"}' "$MM_ID")

echo "→ Create + read"
check "louvor creates own event -> 201"        201 "$(req POST /events "$LOUVOR_TOK" "$EV_OWN")"
OWN_EV=$(jsonget "['id']")
check "readonly creates event -> 403"          403 "$(req POST /events "$RO_TOK" "$EV_OWN")"

req "GET" "/events?from=$FROM&to=$TO" "$LOUVOR_TOK" >/dev/null
check "louvor sees its event in the range"     "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if any(e['id']=='$OWN_EV' for e in d) else 'no')")"
req "GET" "/events?from=$FROM&to=$TO" "$RO_TOK" >/dev/null
check "readonly sees the same event (general)" "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if any(e['id']=='$OWN_EV' for e in d) else 'no')")"

echo "→ Cross-ministry edit (the acceptance test)"
check "admin creates a Multimedia event -> 201" 201 "$(req POST /events "$ADMIN_TOK" "$EV_MM")"
MM_EV=$(jsonget "['id']")
check "louvor PATCH Multimedia's event -> 403"  403 "$(req PATCH "/events/$MM_EV" "$LOUVOR_TOK" '{"title":"TEST Hijack"}')"
check "louvor DELETE Multimedia's event -> 403" 403 "$(req DELETE "/events/$MM_EV" "$LOUVOR_TOK")"
check "louvor PATCH its OWN event -> 200"        200 "$(req PATCH "/events/$OWN_EV" "$LOUVOR_TOK" '{"location":"Sala 1"}')"
check "admin PATCH any event -> 200"             200 "$(req PATCH "/events/$OWN_EV" "$ADMIN_TOK" '{"status":"confirmada"}')"
check "louvor DELETE its OWN event -> 204"       204 "$(req DELETE "/events/$OWN_EV" "$LOUVOR_TOK")"

psql <<SQL >/dev/null
delete from events where title like 'TEST %';
delete from access_tokens where label like 'TEST-%';
SQL
rm -f "$BODY_FILE"
echo; echo "──────────────────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
