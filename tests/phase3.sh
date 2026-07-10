#!/usr/bin/env bash
# Phase 3 integration tests (PROMPT.md sections 6, 10, 12).
#   - generate_sundays via API is admin-only and idempotent (52 for a year);
#   - readonly can VIEW the full order of service;
#   - songs are editable by Louvor/admin only; a ministry's roster by that
#     ministry/admin only; EBD by EBD/admin only.
set -uo pipefail

FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_iel-calendario}"

ADMIN_TOK="test-admin-token"; LOUVOR_TOK="test-louvor-token"; MM_TOK="test-mm-token"
RO_TOK="test-ro-token"; EBD_TOK="test-ebd-token"

pass=0; fail=0
sha() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "→ Seeding tokens + a test person..."
LOUVOR_ID=$(psql -c "select id from ministries where slug='louvor';")
MM_ID=$(psql -c "select id from ministries where slug='multimedia';")
EBD_ID=$(psql -c "select id from ministries where slug='ebd';")
CLASS_ID=$(psql -c "select id from ebd_classes order by sort_order limit 1;")
psql <<SQL >/dev/null
delete from access_tokens where label like 'TEST-%';
delete from people where full_name like 'TEST %';
delete from services where extract(year from service_date)=2028;
insert into people (full_name) values ('TEST Cantor');
insert into access_tokens (ministry_id, scope, token_hash, label) values
  (null,'admin','$(sha "$ADMIN_TOK")','TEST-admin'),
  ('$LOUVOR_ID','ministry','$(sha "$LOUVOR_TOK")','TEST-louvor'),
  ('$MM_ID','ministry','$(sha "$MM_TOK")','TEST-mm'),
  ('$EBD_ID','ministry','$(sha "$EBD_TOK")','TEST-ebd'),
  (null,'readonly','$(sha "$RO_TOK")','TEST-ro');
SQL
PERSON=$(psql -c "select id from people where full_name='TEST Cantor';")

BODY_FILE=$(mktemp)
req() {
  local method="$1" path="$2" token="$3" json="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "x-access-token: $token"); [ -n "$json" ] && args+=(-d "$json")
  curl "${args[@]}" "$FUNCTIONS_URL$path"
}
check() {
  if [ "$2" = "$3" ]; then printf '  ✅ %-54s [%s]\n' "$1" "$3"; pass=$((pass+1))
  else printf '  ❌ %-54s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); printf '        body: %s\n' "$(cat "$BODY_FILE")"; fi
}
jget() { python3 -c "import json;print(json.load(open('$BODY_FILE'))$1)" 2>/dev/null; }

echo "→ generate_sundays via API"
check "readonly POST /services/generate -> 403" 403 "$(req POST /services/generate "$RO_TOK"    '{"year":2028}')"
check "louvor   POST /services/generate -> 403" 403 "$(req POST /services/generate "$LOUVOR_TOK" '{"year":2028}')"
EXPECTED_SUNDAYS=$(psql -c "select count(*) from generate_series('2028-01-01'::date,'2028-12-31','1 day') d where extract(isodow from d)=7;")
check "admin    POST /services/generate -> 200" 200 "$(req POST /services/generate "$ADMIN_TOK"  '{"year":2028}')"
check "  inserted all sundays ($EXPECTED_SUNDAYS)" "$EXPECTED_SUNDAYS" "$(jget "['inserted']")"
req POST /services/generate "$ADMIN_TOK" '{"year":2028}' >/dev/null
check "  idempotent: second run inserts 0"       0   "$(jget "['inserted']")"

req GET "/services?year=2028" "$ADMIN_TOK" >/dev/null
SID=$(jget "[0]['id']"); SDATE=$(jget "[0]['service_date']")
echo "  (using service $SDATE)"

echo "→ View detail (readonly may see the whole order of service)"
check "readonly GET /services?date -> 200"       200 "$(req GET "/services?date=$SDATE" "$RO_TOK")"
check "  detail has ministry_roles"              "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if d.get('ministry_roles') else 'no')")"

echo "→ Header edit (admin only)"
check "louvor PATCH header -> 403"               403 "$(req PATCH "/services/$SID" "$LOUVOR_TOK" '{"theme":"Graça"}')"
check "admin  PATCH header -> 200"               200 "$(req PATCH "/services/$SID" "$ADMIN_TOK"  '{"theme":"Graça","scripture":"João 1"}')"

echo "→ Songs (Louvor or admin)"
SONGS='{"songs":[{"title":"TEST Grande é o Senhor","moment":"abertura"}]}'
check "multimedia PUT songs -> 403"              403 "$(req PUT "/services/$SID/songs" "$MM_TOK" "$SONGS")"
check "readonly   PUT songs -> 403"              403 "$(req PUT "/services/$SID/songs" "$RO_TOK" "$SONGS")"
check "louvor     PUT songs -> 200"              200 "$(req PUT "/services/$SID/songs" "$LOUVOR_TOK" "$SONGS")"
check "admin      PUT songs -> 200"              200 "$(req PUT "/services/$SID/songs" "$ADMIN_TOK" "$SONGS")"

echo "→ Assignments (own ministry or admin)"
ASSIGN=$(printf '{"assignments":[{"person_id":"%s","role":"Projeção","sort_order":0}]}' "$PERSON")
check "louvor PUT ?ministry=multimedia -> 403"   403 "$(req PUT "/services/$SID/assignments?ministry=multimedia" "$LOUVOR_TOK" "$ASSIGN")"
check "multimedia PUT its roster -> 200"         200 "$(req PUT "/services/$SID/assignments?ministry=multimedia" "$MM_TOK" "$ASSIGN")"
check "  roster now has the person"              "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if any(a['person_id']=='$PERSON' for a in d['assignments']) else 'no')")"

echo "→ EBD (EBD ministry or admin)"
EBD=$(printf '{"assignments":[{"person_id":"%s","role":"Professor"}]}' "$PERSON")
check "louvor PUT /ebd -> 403"                   403 "$(req PUT "/services/$SID/ebd?class=$CLASS_ID" "$LOUVOR_TOK" "$EBD")"
check "ebd    PUT /ebd -> 200"                   200 "$(req PUT "/services/$SID/ebd?class=$CLASS_ID" "$EBD_TOK" "$EBD")"

psql <<SQL >/dev/null
delete from services where extract(year from service_date)=2028;
delete from people where full_name like 'TEST %';
delete from access_tokens where label like 'TEST-%';
SQL
rm -f "$BODY_FILE"
echo; echo "──────────────────────────────────────────"; echo "  PASS: $pass    FAIL: $fail"; echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
