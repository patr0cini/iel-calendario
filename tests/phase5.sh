#!/usr/bin/env bash
# Phase 5 integration tests (PROMPT.md sections 6 & 12): the ICS feed.
#   - token travels in the query string (calendar clients cannot send headers);
#   - ministry={slug} filters, ministry=all aggregates with [Ministério] prefix;
#   - structure is RFC 5545-ish: CRLF, folding <= 75 octets, escaping, statuses;
#   - all-day events use VALUE=DATE with exclusive DTEND;
#   - Sunday services appear with theme.
set -uo pipefail

FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_iel-calendario}"

RO_TOK="test-ics-readonly"

pass=0; fail=0
sha() { printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; }
psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "→ Seeding..."
LOUVOR_ID=$(psql -c "select id from ministries where slug='louvor';")
MM_ID=$(psql -c "select id from ministries where slug='multimedia';")
NOW_PLUS_7=$(date -u -v+7d '+%Y-%m-%d' 2>/dev/null || date -u -d '+7 days' '+%Y-%m-%d')
NOW_PLUS_8=$(date -u -v+8d '+%Y-%m-%d' 2>/dev/null || date -u -d '+8 days' '+%Y-%m-%d')
psql <<SQL >/dev/null
delete from access_tokens where label like 'TEST-%';
delete from events where title like 'TESTICS%';
insert into access_tokens (ministry_id, scope, token_hash, label) values
  (null,'readonly','$(sha "$RO_TOK")','TEST-ics');
insert into events (ministry_id, title, description, starts_at, ends_at, status, location) values
  ('$LOUVOR_ID','TESTICS Ensaio; com, vírgulas','linha1
linha2','${NOW_PLUS_7} 18:00:00+00','${NOW_PLUS_7} 19:30:00+00','confirmada','Sala 1'),
  ('$MM_ID','TESTICS Formacao','','${NOW_PLUS_7} 10:00:00+00','${NOW_PLUS_7} 12:00:00+00','cancelada',null);
insert into events (ministry_id, title, starts_at, ends_at, all_day, status) values
  ('$LOUVOR_ID','TESTICS Retiro','${NOW_PLUS_7} 00:00:00+00','${NOW_PLUS_8} 00:00:00+00', true,'confirmada');
SQL

FEED_ALL=$(mktemp); FEED_LOUVOR=$(mktemp); HDRS=$(mktemp)
check() {
  if [ "$2" = "$3" ]; then printf '  ✅ %-56s [%s]\n' "$1" "$3"; pass=$((pass+1))
  else printf '  ❌ %-56s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

echo "→ Autenticação por query string"
S1=$(curl -s -o "$FEED_ALL" -w '%{http_code}' -D "$HDRS" "$FUNCTIONS_URL/ics?token=$RO_TOK&ministry=all")
check "GET /ics?token=...&ministry=all -> 200" 200 "$S1"
check "sem token -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$FUNCTIONS_URL/ics?ministry=all")"
check "token inválido -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$FUNCTIONS_URL/ics?token=nope&ministry=all")"
check "ministério desconhecido -> 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$FUNCTIONS_URL/ics?token=$RO_TOK&ministry=inexistente")"
check "Content-Type text/calendar" "yes" "$(grep -qi '^content-type: text/calendar' "$HDRS" && echo yes || echo no)"

echo "→ Estrutura do feed (all)"
check "BEGIN/END VCALENDAR" "yes" "$(head -1 "$FEED_ALL" | tr -d '\r' | grep -q 'BEGIN:VCALENDAR' && tail -c 20 "$FEED_ALL" | grep -q 'END:VCALENDAR' && echo yes || echo no)"
check "linhas terminam em CRLF" "yes" "$(head -3 "$FEED_ALL" | od -c | grep -q '\\r  \\n' && echo yes || echo no)"
check "nenhuma linha > 75 octetos" "0" "$(awk 'length($0) > 76' "$FEED_ALL" | wc -l | tr -d ' ')"
check "evento com prefixo [Louvor]" "yes" "$(tr -d '\r\n ' < "$FEED_ALL" | grep -q 'SUMMARY:\[Louvor\]TESTICSEnsaio' && echo yes || echo no)"
check "escaping de ; e ," "yes" "$(tr -d '\r\n ' < "$FEED_ALL" | grep -q 'Ensaio\\\;com\\\,vírgulas' && echo yes || echo no)"
check "descrição multi-linha vira \\n" "yes" "$(grep -qF 'linha1\nlinha2' "$FEED_ALL" && echo yes || echo no)"
check "cancelado -> STATUS:CANCELLED" "yes" "$(grep -q 'STATUS:CANCELLED' "$FEED_ALL" && echo yes || echo no)"
check "all-day -> DTSTART;VALUE=DATE" "yes" "$(grep -q 'DTSTART;VALUE=DATE:' "$FEED_ALL" && echo yes || echo no)"
NEXT_SUNDAY_THEME=$(grep -c 'SUMMARY:Culto' "$FEED_ALL" || true)
check "cultos de domingo presentes (>10)" "yes" "$([ "$NEXT_SUNDAY_THEME" -gt 10 ] && echo yes || echo no)"

echo "→ Filtro por ministério"
S2=$(curl -s -o "$FEED_LOUVOR" -w '%{http_code}' "$FUNCTIONS_URL/ics?token=$RO_TOK&ministry=louvor")
check "GET ministry=louvor -> 200" 200 "$S2"
check "contém o evento do Louvor" "yes" "$(tr -d '\r\n ' < "$FEED_LOUVOR" | grep -q 'TESTICSEnsaio' && echo yes || echo no)"
check "NÃO contém o evento da Multimédia" "yes" "$(grep -q 'TESTICS Formacao' "$FEED_LOUVOR" && echo no || echo yes)"
check "sem prefixo de ministério no feed filtrado" "yes" "$(tr -d '\r\n ' < "$FEED_LOUVOR" | grep -q 'SUMMARY:\[Louvor\]' && echo no || echo yes)"
check "cultos incluídos no feed filtrado" "yes" "$(grep -q 'SUMMARY:Culto' "$FEED_LOUVOR" && echo yes || echo no)"

echo "→ Validação Python (parser icalendar se disponível, senão estrutural)"
PYCHECK=$(python3 - "$FEED_ALL" <<'PY'
import sys
raw = open(sys.argv[1], 'rb').read().decode('utf-8')
# unfold
unfolded = raw.replace('\r\n ', '')
lines = [l for l in unfolded.split('\r\n') if l]
opens = sum(1 for l in lines if l == 'BEGIN:VEVENT')
closes = sum(1 for l in lines if l == 'END:VEVENT')
uids = [l for l in lines if l.startswith('UID:')]
dtstamps = [l for l in lines if l.startswith('DTSTAMP:')]
ok = opens == closes and opens == len(uids) == len(dtstamps) and opens > 0
print('ok' if ok else f'bad opens={opens} closes={closes} uids={len(uids)} stamps={len(dtstamps)}')
PY
)
check "VEVENTs equilibrados com UID+DTSTAMP" "ok" "$PYCHECK"

psql <<SQL >/dev/null
delete from events where title like 'TESTICS%';
delete from access_tokens where label like 'TEST-%';
SQL
rm -f "$FEED_ALL" "$FEED_LOUVOR" "$HDRS"
echo; echo "──────────────────────────────────────────"; echo "  PASS: $pass    FAIL: $fail"; echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
