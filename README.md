# Calendário — IEL

Plataforma web para gerir o calendário de atividades e as escalas de serviço de uma igreja
evangélica em Portugal. Substitui folhas de Excel e grupos de WhatsApp.

- **Interface:** português europeu · **Fuso:** `Europe/Lisbon` · **A semana começa à segunda-feira.**
- **Frontend:** Vite + React 18 + TypeScript + Tailwind, alojado em **GitHub Pages** (estático).
- **Servidor:** **Supabase** (Postgres + Edge Functions em Deno). Região: **União Europeia**.

> Estado atual: **Fases 0–5** concluídas — andaime, identidade/autorização, calendário (4 vistas),
> ordem do culto (escalas, EBD por classe, músicas, impressão A4, conflitos), administração
> (tokens, auditoria, indisponibilidades) e feed ICS + deploy. Falta a **Fase 6** (Outlook + Teams),
> opcional — ver `PROMPT.md`, secção 11.

---

## ⚠️ Avisos importantes

> **Quem tiver o link, tem o acesso.** O link de `admin` permite editar tudo e (quando a Fase 6
> estiver ligada) escreve no calendário do Microsoft 365 da igreja. **Não o partilhes em grupos de
> WhatsApp.**

> **A SINCRONIZAÇÃO COM O OUTLOOK É DE SENTIDO ÚNICO: PLATAFORMA → OUTLOOK.** NADA É LIDO DO
> OUTLOOK. EDIÇÕES FEITAS DIRETAMENTE NO OUTLOOK SÃO SOBRESCRITAS NA SINCRONIZAÇÃO SEGUINTE.

> **O GitHub desativa workflows agendados ao fim de 60 dias sem atividade no repositório.** Se
> ninguém fizer *commit* durante dois meses, a igreja perde o *keep-alive* do Supabase **e** a
> sincronização ao mesmo tempo. Um *commit* ocasional (ou correr o workflow `keepalive` à mão em
> Actions) resolve.

---

## Regra de arquitetura inviolável

O browser **nunca** acede às tabelas do Postgres. A chave anónima do Supabase **não** é usada para
dados de domínio. O RLS nega tudo a `anon` e a `authenticated`. Todo o acesso passa pelas Edge
Functions, que validam o token (`x-access-token`, ou `?token=` para o ICS) e usam a `service_role`.
O CORS permite **apenas** a origem do GitHub Pages — nunca `*`.

## Acessos

Cada ministério recebe um link `https://<user>.github.io/<repo>/#t=<token>`. O token viaja no
fragmento, é lido uma vez, guardado em memória e removido da barra de endereço.

| Âmbito | Pode |
|---|---|
| `readonly` | Ver tudo (calendário, ordem do culto); nunca escrever |
| `ministry` | O anterior + eventos, escala e pessoas **do próprio ministério** (músicas: só o Louvor) |
| `admin` | Tudo: cabeçalho do culto, ministérios, funções, classes, tokens, auditoria |

Os tokens geram-se em **Administração → Tokens**. O token em claro é mostrado **uma única vez**;
guarda-se apenas o SHA-256. Revogação imediata no mesmo ecrã.

---

## Desenvolvimento local

Requisitos: **Node 18+** e **Docker** (para a stack local do Supabase).

```bash
npm install
cp .env.example .env        # VITE_FUNCTIONS_URL já aponta para o Supabase local
npm run db:start            # Postgres + Edge Functions locais
npm run db:reset            # migrações + seed
npm run dev                 # http://127.0.0.1:5173
```

| Comando | Faz |
|---|---|
| `npm run dev` / `build` / `typecheck` | Frontend |
| `npm run db:start` / `db:stop` / `db:reset` | Stack local do Supabase |

### Testes de integração

Com a stack local a correr — provam por `curl` que a autorização é imposta **no servidor**:

```bash
bash tests/phase1.sh   # identidade, /ministries, /people, /ministry-members (403 entre ministérios)
bash tests/phase2.sh   # /events: criar, ver no calendário geral, 403 entre ministérios
bash tests/phase3.sh   # /services: gerar domingos, escalas, músicas (só Louvor/admin), EBD
bash tests/phase4.sh   # /tokens (uma exibição, revogação), /audit, /unavailabilities, funções
bash tests/phase5.sh   # feed ICS: query-string token, filtro, RFC 5545 (folding, escaping)
```

---

## Deploy

### 1. Projeto Supabase (uma vez)

1. Criar projeto em [supabase.com](https://supabase.com) — **região União Europeia (Frankfurt ou
   Irlanda)**. A região não se muda depois; os dados identificam membros de uma igreja (categoria
   especial, art. 9.º RGPD).
2. Ligar o repositório local e publicar:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push                    # aplica as migrações
   npx supabase functions deploy           # publica todas as Edge Functions
   ```
3. Semear os dados iniciais (ministérios, funções, classes): correr o conteúdo de
   `supabase/seed.sql` no SQL Editor do painel do Supabase.
4. Definir segredos das funções:
   ```bash
   npx supabase secrets set ALLOWED_ORIGIN=https://<user>.github.io
   ```
5. Criar o primeiro token de admin (só desta vez, à mão). No SQL Editor:
   ```sql
   -- Gera um token forte fora da base (ex.: openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
   insert into access_tokens (scope, token_hash, label)
   values ('admin', encode(digest('<TOKEN-EM-CLARO>', 'sha256'), 'hex'), 'Presbitério');
   ```
   Guarda o link `https://<user>.github.io/<repo>/#t=<TOKEN-EM-CLARO>` num sítio seguro. A partir
   daqui, todos os outros tokens criam-se na interface.

### 2. GitHub Pages

1. Em **Settings → Pages**: Source = **GitHub Actions**.
2. Em **Settings → Secrets and variables → Actions → Variables**: criar
   `SUPABASE_FUNCTIONS_URL = https://<ref>.supabase.co/functions/v1`.
3. `git push` para `main` — o workflow [deploy.yml](.github/workflows/deploy.yml) compila, copia
   `index.html` para `404.html` (deep links do SPA) e publica. O workflow falha se detetar um
   segredo no bundle.
4. Em **Settings → Secrets**: criar `SUPABASE_FUNCTIONS_URL` também como *secret* se preferires
   usá-lo no `keepalive.yml` (que o lê de `secrets.`).

### 3. Keep-alive

O plano gratuito do Supabase pausa projetos após 7 dias sem atividade na base de dados. O workflow
[keepalive.yml](.github/workflows/keepalive.yml) chama `/health` (um `select` real) de 6 em 6 horas.
Confirma em **Actions** que está ativo. (Ver aviso dos 60 dias, acima.)

---

## Feed ICS (voluntários sem licença Microsoft)

Cada voluntário pode subscrever o calendário no telemóvel ou no Google Calendar:

```
https://<ref>.supabase.co/functions/v1/ics?token=<token-readonly>&ministry=all
https://<ref>.supabase.co/functions/v1/ics?token=<token-readonly>&ministry=louvor
```

- **Google Calendar:** Definições → Adicionar calendário → **De URL** → colar o link.
- **iPhone/iPad:** Definições → Calendário → Contas → Adicionar conta → Outra →
  **Adicionar calendário subscrito** → colar o link.

Emite tokens `readonly` dedicados para isto (Administração → Tokens). O token vai na query string
porque os clientes de calendário não enviam cabeçalhos personalizados — **o link é o segredo**:
se fugir, revoga o token e emite outro. O feed inclui os eventos (do ministério escolhido, ou todos
com prefixo `[Ministério]`) e os cultos de domingo. Os clientes atualizam de X em X horas — as
alterações não aparecem no minuto.

---

## Estrutura

```
src/                          Frontend React
  components/                 Calendário, Ordem do Culto, Escala, Administração
  session/SessionProvider.tsx Identidade + permissões (UX; a autorização real é no servidor)
  lib/session.ts              Token do fragmento (#t=...) -> memória
  lib/api.ts                  Cliente das Edge Functions (x-access-token)
supabase/
  migrations/                 Esquema, triggers de sync, generate_sundays, RLS deny-all
  seed.sql                    Ministérios, funções, classes EBD
  functions/                  auth, ministries, people, ministry-members, events,
                              services, tokens, audit, unavailabilities, ebd-classes,
                              ics, health (+ _shared/)
tests/                        Testes de integração por fase (curl contra a stack local)
.github/workflows/            deploy.yml (Pages) e keepalive.yml (Supabase)
```

---

## Fase 6 (opcional): Outlook + Teams — checklist do administrador do tenant

Estes passos fazem-se no portal Microsoft, **não por código** (ver `PROMPT.md`, secções 7–9 e 14):

1. Criar **caixa de correio partilhada** (sem licença, < 50 GB). Nunca usar a caixa pessoal de alguém.
2. App Registration no Entra ID com permissão de aplicação `Calendars.ReadWrite` + consentimento de
   administrador.
3. Carregar **certificado** (não segredo de cliente — expira e anda em texto). Registar a data de
   expiração num sítio que alguém veja.
4. `New-ApplicationAccessPolicy` (Exchange Online PowerShell) a **restringir a app à caixa
   partilhada** — sem isto a permissão abrange todas as caixas da igreja.
5. `Test-ApplicationAccessPolicy` contra a caixa partilhada (deve **conceder**) e contra a caixa do
   pastor (deve **negar**). Registar as duas saídas aqui no README.
6. Criar o fluxo do **Workflows** no canal do Teams (gatilho «pedido de webhook»). O URL é o
   segredo. **Acrescentar um co-proprietário no dia da criação** — o fluxo pertence a uma pessoa,
   não ao canal.
7. Segredos no Supabase: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CERT_KEY`, `GRAPH_MAILBOX`,
   `TEAMS_WEBHOOK_URL`, e ligar com `OUTLOOK_SYNC_ENABLED=true`.
