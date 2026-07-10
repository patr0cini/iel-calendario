#!/usr/bin/env bash
# Phase 1 integration tests (PROMPT.md sections 11 & 12).
#
# Proves, with curl, that authorization is enforced server-side:
#   - a `ministry` token gets 403 writing to ANOTHER ministry;
#   - a `readonly` token gets 403 on any write;
#   - scope gates (admin-only routes) hold;
#   - revoked/missing tokens are rejected.
#
# Requires the local Supabase stack to be running (npm run db:start).
set -uo pipefail

FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_iel-calendario}"

# Clear test tokens (unhashed). Only their SHA-256 is stored.
ADMIN_TOK="test-admin-token"
LOUVOR_TOK="test-louvor-token"
MM_TOK="test-multimedia-token"
RO_TOK="test-readonly-token"
REVOKED_TOK="test-revoked-token"

pass=0
fail=0

sha() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

# --- Setup: seed tokens + a test person -------------------------------------
echo "→ Seeding test tokens and data..."
LOUVOR_ID=$(psql -c "select id from ministries where slug='louvor';")
MM_ID=$(psql -c "select id from ministries where slug='multimedia';")

psql <<SQL >/dev/null
delete from ministry_members where person_id in (select id from people where full_name like 'TEST %');
delete from people where full_name like 'TEST %';
delete from ministries where slug like 'test-%';
delete from access_tokens where label like 'TEST-%';
insert into access_tokens (ministry_id, scope, token_hash, label) values
  (null,          'admin',    '$(sha "$ADMIN_TOK")',   'TEST-admin'),
  ('$LOUVOR_ID',  'ministry', '$(sha "$LOUVOR_TOK")',  'TEST-louvor'),
  ('$MM_ID',      'ministry', '$(sha "$MM_TOK")',      'TEST-multimedia'),
  (null,          'readonly', '$(sha "$RO_TOK")',      'TEST-readonly'),
  (null,          'readonly', '$(sha "$REVOKED_TOK")', 'TEST-revoked');
update access_tokens set revoked_at = now() where label = 'TEST-revoked';
SQL

BODY_FILE=$(mktemp)

# req METHOD PATH TOKEN [JSON] -> prints HTTP status, writes body to $BODY_FILE
req() {
  local method="$1" path="$2" token="$3" json="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "x-access-token: $token")
  [ -n "$json" ] && args+=(-d "$json")
  curl "${args[@]}" "$FUNCTIONS_URL$path"
}

check() { # check "desc" EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then
    printf '  ✅ %-55s [%s]\n' "$1" "$3"; pass=$((pass + 1))
  else
    printf '  ❌ %-55s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail + 1))
    printf '        body: %s\n' "$(cat "$BODY_FILE")"
  fi
}

jsonget() { python3 -c "import sys,json;d=json.load(open('$BODY_FILE'));print(d$1)" 2>/dev/null; }

echo "→ Auth / identity"
check "no token -> 401"                    401 "$(req GET  /ministries '')"
check "revoked token -> 401"               401 "$(req GET  /ministries "$REVOKED_TOK")"
check "bad token -> 401"                   401 "$(req GET  /ministries 'not-a-real-token')"
check "auth/resolve louvor -> 200"         200 "$(req POST /auth/resolve "$LOUVOR_TOK")"
check "  scope is ministry"                "ministry" "$(jsonget "['scope']")"
check "  ministry slug is louvor"          "louvor"   "$(jsonget "['ministry']['slug']")"
req POST /auth/resolve "$RO_TOK" >/dev/null
check "auth/resolve readonly -> ministry null" "None" "$(jsonget "['ministry']")"

echo "→ Read access (any scope)"
check "louvor GET /ministries -> 200"      200 "$(req GET /ministries "$LOUVOR_TOK")"
check "readonly GET /ministries -> 200"    200 "$(req GET /ministries "$RO_TOK")"
check "readonly GET /people -> 403 (PII)"  403 "$(req GET /people "$RO_TOK")"

echo "→ Scope gates (admin-only)"
check "louvor POST /ministries -> 403"     403 "$(req POST /ministries "$LOUVOR_TOK" '{"slug":"test-x","name":"X","color":"#000000"}')"
check "readonly POST /ministries -> 403"   403 "$(req POST /ministries "$RO_TOK"     '{"slug":"test-x","name":"X","color":"#000000"}')"
check "admin POST /ministries -> 201"      201 "$(req POST /ministries "$ADMIN_TOK"  '{"slug":"test-tmp","name":"Temp","color":"#123456"}')"
NEW_MIN=$(jsonget "['id']")
check "admin DELETE /ministries/{id} -> 204" 204 "$(req DELETE "/ministries/$NEW_MIN" "$ADMIN_TOK")"

echo "→ People (create test person as admin)"
check "admin POST /people -> 201"          201 "$(req POST /people "$ADMIN_TOK" '{"full_name":"TEST Pessoa"}')"
PERSON=$(jsonget "['id']")
check "readonly POST /people -> 403"       403 "$(req POST /people "$RO_TOK" '{"full_name":"TEST Nope"}')"

echo "→ Cross-ministry rule (the Phase 1 gate)"
J_OWN=$(printf '{"ministry_id":"%s","person_id":"%s"}' "$LOUVOR_ID" "$PERSON")
J_OTHER=$(printf '{"ministry_id":"%s","person_id":"%s"}' "$MM_ID" "$PERSON")
check "louvor adds member to OWN ministry -> 201"   201 "$(req POST /ministry-members "$LOUVOR_TOK" "$J_OWN")"
check "louvor adds member to OTHER ministry -> 403" 403 "$(req POST /ministry-members "$LOUVOR_TOK" "$J_OTHER")"
check "readonly adds member -> 403"                 403 "$(req POST /ministry-members "$RO_TOK"     "$J_OWN")"

echo "→ Cross-ministry person edit (person is a Louvor member only)"
check "multimedia PATCH louvor's person -> 403"     403 "$(req PATCH "/people/$PERSON" "$MM_TOK" '{"full_name":"TEST Hijack"}')"
check "louvor PATCH its own member -> 200"          200 "$(req PATCH "/people/$PERSON" "$LOUVOR_TOK" '{"full_name":"TEST Pessoa Editada"}')"

echo "→ Admin overrides boundaries; ownership is dynamic"
check "admin adds person to Multimedia -> 201"      201 "$(req POST /ministry-members "$ADMIN_TOK" "$J_OTHER")"
check "multimedia can now PATCH the person -> 200"  200 "$(req PATCH "/people/$PERSON" "$MM_TOK" '{"active":true}')"

echo "→ Audit log recorded the writes"
check "audit_log has entries" "true" "$([ "$(psql -c "select count(*) > 0 from audit_log where entity in ('people','ministries','ministry_members');")" = "t" ] && echo true || echo false)"

# --- Teardown ----------------------------------------------------------------
psql <<SQL >/dev/null
delete from ministry_members where person_id in (select id from people where full_name like 'TEST %');
delete from people where full_name like 'TEST %';
delete from ministries where slug like 'test-%';
delete from access_tokens where label like 'TEST-%';
SQL
rm -f "$BODY_FILE"

echo
echo "──────────────────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
