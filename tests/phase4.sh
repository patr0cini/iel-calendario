#!/usr/bin/env bash
# Phase 4 integration tests (PROMPT.md sections 6, 9, 11).
#   - /tokens: admin-only; clear token returned exactly once; revocation kills it;
#     the list never leaks hashes.
#   - /audit: admin-only, enriched entries.
#   - /unavailabilities: ministry only for own members.
#   - /ministries/{id}/roles: editable functions, admin-only writes.
#   - /ebd-classes: admin-only writes.
set -uo pipefail

FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_iel-calendario}"

ADMIN_TOK="test-admin-token"; LOUVOR_TOK="test-louvor-token"; RO_TOK="test-ro-token"

pass=0; fail=0
sha() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "→ Seeding..."
LOUVOR_ID=$(psql -c "select id from ministries where slug='louvor';")
MM_ID=$(psql -c "select id from ministries where slug='multimedia';")
psql <<SQL >/dev/null
delete from access_tokens where label like 'TEST-%';
delete from people where full_name like 'TEST %';
insert into people (full_name) values ('TEST Membro'), ('TEST Fora');
insert into access_tokens (ministry_id, scope, token_hash, label) values
  (null,'admin','$(sha "$ADMIN_TOK")','TEST-admin'),
  ('$LOUVOR_ID','ministry','$(sha "$LOUVOR_TOK")','TEST-louvor'),
  (null,'readonly','$(sha "$RO_TOK")','TEST-ro');
insert into ministry_members (ministry_id, person_id)
select '$LOUVOR_ID', id from people where full_name='TEST Membro';
SQL
MEMBER=$(psql -c "select id from people where full_name='TEST Membro';")
OUTSIDER=$(psql -c "select id from people where full_name='TEST Fora';")

BODY_FILE=$(mktemp)
req() {
  local method="$1" path="$2" token="$3" json="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "x-access-token: $token"); [ -n "$json" ] && args+=(-d "$json")
  curl "${args[@]}" "$FUNCTIONS_URL$path"
}
check() {
  if [ "$2" = "$3" ]; then printf '  ✅ %-56s [%s]\n' "$1" "$3"; pass=$((pass+1))
  else printf '  ❌ %-56s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); printf '        body: %s\n' "$(cat "$BODY_FILE")"; fi
}
jget() { python3 -c "import json;print(json.load(open('$BODY_FILE'))$1)" 2>/dev/null; }

echo "→ Tokens: access control"
check "louvor GET /tokens -> 403"                 403 "$(req GET /tokens "$LOUVOR_TOK")"
check "readonly POST /tokens -> 403"              403 "$(req POST /tokens "$RO_TOK" '{"scope":"admin"}')"
check "ministry scope sem ministry_id -> 400"     400 "$(req POST /tokens "$ADMIN_TOK" '{"scope":"ministry","label":"TEST-x"}')"
check "admin com ministry_id -> 400"              400 "$(req POST /tokens "$ADMIN_TOK" "{\"scope\":\"admin\",\"ministry_id\":\"$LOUVOR_ID\",\"label\":\"TEST-x\"}")"

echo "→ Tokens: lifecycle"
J_NEW=$(printf '{"scope":"ministry","ministry_id":"%s","label":"TEST-novo"}' "$LOUVOR_ID")
check "admin POST /tokens -> 201"                 201 "$(req POST /tokens "$ADMIN_TOK" "$J_NEW")"
CLEAR=$(jget "['token']"); NEW_ID=$(jget "['id']")
check "  resposta inclui o token em claro"        "yes" "$([ -n "$CLEAR" ] && [ "$CLEAR" != "None" ] && echo yes || echo no)"
check "  o novo token autentica (resolve)"        200 "$(req POST /auth/resolve "$CLEAR")"
check "  scope do novo token"                     "ministry" "$(jget "['scope']")"
req GET /tokens "$ADMIN_TOK" >/dev/null
check "  lista nao contem hashes nem claro"       "clean" "$(grep -qE 'token_hash|'"$CLEAR" "$BODY_FILE" && echo leaked || echo clean)"
check "admin revoga -> 200"                       200 "$(req PATCH "/tokens/$NEW_ID/revoke" "$ADMIN_TOK")"
check "  token revogado deixa de autenticar"      401 "$(req POST /auth/resolve "$CLEAR")"
check "  revogar duas vezes -> 400"               400 "$(req PATCH "/tokens/$NEW_ID/revoke" "$ADMIN_TOK")"

echo "→ Auditoria"
check "readonly GET /audit -> 403"                403 "$(req GET /audit "$RO_TOK")"
check "louvor GET /audit -> 403"                  403 "$(req GET /audit "$LOUVOR_TOK")"
check "admin GET /audit -> 200"                   200 "$(req GET /audit?limit=50 "$ADMIN_TOK")"
check "  entradas enriquecidas com token_label"   "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if d and 'token_label' in d[0] else 'no')")"

echo "→ Indisponibilidades"
J_MEM=$(printf '{"person_id":"%s","start_date":"2026-09-01","end_date":"2026-09-07","reason":"TEST"}' "$MEMBER")
J_OUT=$(printf '{"person_id":"%s","start_date":"2026-09-01","end_date":"2026-09-07","reason":"TEST"}' "$OUTSIDER")
check "readonly GET -> 403"                       403 "$(req GET /unavailabilities "$RO_TOK")"
check "louvor declara p/ membro seu -> 201"       201 "$(req POST /unavailabilities "$LOUVOR_TOK" "$J_MEM")"
U_ID=$(jget "['id']")
check "louvor declara p/ pessoa de fora -> 403"   403 "$(req POST /unavailabilities "$LOUVOR_TOK" "$J_OUT")"
check "admin declara p/ qualquer pessoa -> 201"   201 "$(req POST /unavailabilities "$ADMIN_TOK" "$J_OUT")"
U2_ID=$(jget "['id']")
req GET /unavailabilities "$ADMIN_TOK" >/dev/null
check "  lista com person_name"                   "yes" "$(python3 -c "import json;d=json.load(open('$BODY_FILE'));print('yes' if any(u.get('person_name')=='TEST Membro' for u in d) else 'no')")"
check "louvor apaga a sua -> 204"                 204 "$(req DELETE "/unavailabilities/$U_ID" "$LOUVOR_TOK")"
check "admin apaga a outra -> 204"                204 "$(req DELETE "/unavailabilities/$U2_ID" "$ADMIN_TOK")"

echo "→ Funções editáveis (ministry_roles)"
ROLES='{"roles":[{"name":"Dirigente"},{"name":"Voz"},{"name":"Violino"}]}'
check "louvor PUT roles -> 403"                   403 "$(req PUT "/ministries/$LOUVOR_ID/roles" "$LOUVOR_TOK" "$ROLES")"
check "admin PUT roles -> 200"                    200 "$(req PUT "/ministries/$LOUVOR_ID/roles" "$ADMIN_TOK" "$ROLES")"
check "  ficaram 3 funções"                       3 "$(python3 -c "import json;print(len(json.load(open('$BODY_FILE'))))")"
req GET "/ministries/$LOUVOR_ID/roles" "$RO_TOK" >/dev/null
check "  readonly consegue LER as funções"        "Violino" "$(jget "[2]['name']")"

echo "→ Classes EBD"
check "louvor POST /ebd-classes -> 403"           403 "$(req POST /ebd-classes "$LOUVOR_TOK" '{"name":"TEST Classe"}')"
check "admin POST /ebd-classes -> 201"            201 "$(req POST /ebd-classes "$ADMIN_TOK" '{"name":"TEST Classe","age_range":"5-6"}')"
C_ID=$(jget "['id']")
check "admin PATCH -> 200"                        200 "$(req PATCH "/ebd-classes/$C_ID" "$ADMIN_TOK" '{"age_range":"5-7"}')"
check "admin DELETE -> 204"                       204 "$(req DELETE "/ebd-classes/$C_ID" "$ADMIN_TOK")"

echo "→ Painel de sincronização"
check "admin GET /events?sync_state=failed -> 200" 200 "$(req GET "/events?sync_state=failed" "$ADMIN_TOK")"

# Restore original Louvor roles from the seed
psql <<SQL >/dev/null
delete from ministry_roles where ministry_id='$LOUVOR_ID';
insert into ministry_roles (ministry_id, name, sort_order) values
  ('$LOUVOR_ID','Dirigente',1),('$LOUVOR_ID','Voz',2),('$LOUVOR_ID','Teclas',3),
  ('$LOUVOR_ID','Guitarra',4),('$LOUVOR_ID','Baixo',5),('$LOUVOR_ID','Bateria',6);
delete from ministry_members where person_id in (select id from people where full_name like 'TEST %');
delete from unavailabilities where person_id in (select id from people where full_name like 'TEST %');
delete from people where full_name like 'TEST %';
delete from access_tokens where label like 'TEST-%';
SQL
rm -f "$BODY_FILE"
echo; echo "──────────────────────────────────────────"; echo "  PASS: $pass    FAIL: $fail"; echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
