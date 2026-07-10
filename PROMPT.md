# Prompt para Claude Code — Plataforma de Calendarização de Ministérios

> Guarda este ficheiro na raiz do repositório como `PROMPT.md` e escreve no Claude Code:
> «Lê o PROMPT.md, responde às perguntas da secção 13 e executa a Fase 0.»

---

## 1. Contexto

Aplicação web para gerir o calendário de atividades e as escalas de serviço de uma igreja
evangélica em Portugal. Substitui folhas de Excel e grupos de WhatsApp.

**Utilizadores:** 10 a 15 responsáveis de ministério, mais o Presbitério. Não são pessoas técnicas.
Interface inteiramente em **português europeu**.

**Fuso horário:** `Europe/Lisbon`. **A semana começa à segunda-feira.**

---

## 2. Arquitetura — não reabrir

| Camada | Escolha |
|---|---|
| Página | Estática, alojada em **GitHub Pages** |
| Frontend | Vite + React 18 + TypeScript + Tailwind |
| Calendário | FullCalendar v6 (`multiMonthYear`, `dayGridMonth`, `timeGridWeek`, `timeGridDay`) |
| Dados e lógica de servidor | **Supabase** (Postgres + Edge Functions em Deno, `verify_jwt = false`) |
| Autenticação | Link secreto por ministério (ver secção 5) |
| Saída para o Outlook | Microsoft Graph, uma via, **atrás de um interruptor** (secção 7) |
| Notificações | Webhook da aplicação **Workflows** do Teams. Sem Azure. |
| SharePoint | **Não integrado.** O Presbitério abre o SharePoint diretamente. |

**Regra inviolável:** o browser nunca acede às tabelas do Postgres. A chave anónima do Supabase não é
usada para dados de domínio. RLS nega tudo a `anon` e a `authenticated`. Todo o acesso passa pelas
Edge Functions, que validam o token e usam a `service_role`.

O frontend e a API estão em domínios diferentes. Configura CORS nas Edge Functions para permitir
apenas a origem do GitHub Pages. Nada de `*`.

Não uses `localStorage` como fonte de verdade. Só para cache de interface e para o token da sessão.

Nomes de ficheiros sem acentos. `index.html`, não `calendário.html`.

**Região do projeto Supabase: União Europeia** (Frankfurt ou Irlanda). Escolhe na criação — não se
muda depois. Os dados identificam pessoas como membros de uma igreja, o que é categoria especial no
artigo 9.º do RGPD. A base legal existe (art. 9.º, n.º 2, al. d), mas a região não é negociável.

---

## 3. Modelo de domínio

Chaves primárias `uuid` (`gen_random_uuid()`), `timestamptz` para instantes, `date` para datas.

```
ministries
  id, slug (unique), name, color (hex), sort_order, active, created_at

people
  id, full_name, email (nullable), phone (nullable), active, notes, created_at

ministry_members
  id, ministry_id -> ministries, person_id -> people, role (text, nullable)
  unique (ministry_id, person_id)

access_tokens
  id, ministry_id -> ministries (nullable quando scope='admin'),
  scope: enum ('admin', 'ministry', 'readonly'),
  token_hash (text, unique),      -- SHA-256 do token em claro, hex
  label, created_at, last_used_at, revoked_at (nullable)

events
  id, ministry_id -> ministries,
  title, description,
  starts_at (timestamptz), ends_at (timestamptz), all_day (bool),
  location,
  status: enum ('proposta', 'confirmada', 'cancelada'),
  created_at, updated_at, created_by_token -> access_tokens,
  -- sincronização com o Outlook (secção 7)
  outlook_event_id (text, nullable, unique),
  sync_state: enum ('pending', 'synced', 'failed', 'skipped') default 'pending',
  sync_attempts (int default 0), sync_error (text, nullable), synced_at (timestamptz, nullable)

services
  id, service_date (date), service_time (time, default '10:30'),
  label, theme, scripture,
  preacher_id -> people (nullable), leader_id -> people (nullable), notes,
  unique (service_date, service_time)

service_assignments
  id, service_id -> services, ministry_id -> ministries,
  person_id -> people (nullable),   -- nullable = lugar por preencher
  role (text, ex.: 'Baixo', 'Projeção', 'Ceia'), sort_order

service_songs
  id, service_id -> services,
  position (int), title, author (nullable), song_key (nullable),
  moment: enum ('abertura', 'adoracao', 'ceia', 'final', 'outro'), link (nullable)

unavailabilities
  id, person_id -> people, start_date (date), end_date (date), reason

audit_log
  id, at (timestamptz), token_id, ministry_id, action, entity, entity_id,
  before (jsonb), after (jsonb)

outbox                            -- eventos apagados que ainda têm de ser removidos do Outlook
  id, outlook_event_id (text), deleted_at, processed_at (nullable)
```

Um `trigger` em `events` põe `sync_state = 'pending'` sempre que `title`, `description`,
`starts_at`, `ends_at`, `all_day`, `location` ou `status` mudam. Um `trigger` de `DELETE` insere
em `outbox`. **Sem isto, apagar um evento na plataforma deixa-o vivo no Outlook para sempre.**

**Seed** (`ministries`): Presbitério, Louvor, Multimédia, Assistentes, Escola Bíblica Dominical,
412 (Adolescentes e Jovens).

**Geração de cultos:** função `generate_sundays(year)`, idempotente, que insere um `service` por cada
domingo do ano. O Presbitério invoca-a pela interface e pode acrescentar ou remover cultos à mão.

---

## 4. Supabase: a pausa do plano gratuito

Projetos do plano gratuito são pausados ao fim de 7 dias sem atividade **na base de dados**. Um
pedido à página estática do GitHub Pages não conta. Acordar demora cerca de 30 segundos.

Cria `.github/workflows/keepalive.yml`: cron de 6 em 6 horas, `curl` a `/functions/v1/health`, que
faz um `select 1` real. Isto serve simultaneamente de *keep-alive* e de despoletador da
sincronização (secção 7).

**Armadilha:** o GitHub desativa workflows agendados ao fim de 60 dias sem atividade no repositório.
Documenta isto no `README.md`. Se ninguém fizer *commit* durante dois meses, a igreja perde as duas
coisas ao mesmo tempo.

Limites do plano gratuito, todos folgados aqui: 500 MB de base de dados, 5 GB de tráfego,
50.000 utilizadores ativos mensais.

---

## 5. Regras de acesso

Cada ministério recebe um URL: `https://<user>.github.io/<repo>/#t=<token>`.
O token é lido do **fragmento** (`location.hash`), guardado em memória, enviado no cabeçalho
`x-access-token`. Limpa o fragmento da barra de endereço logo após a leitura.

| Ação | `readonly` | `ministry` | `admin` (Presbitério) |
|---|---|---|---|
| Ver calendário geral (todos os eventos) | ✅ | ✅ | ✅ |
| Criar/editar/apagar eventos **do próprio ministério** | ❌ | ✅ | ✅ |
| Editar eventos de outros ministérios | ❌ | ❌ | ✅ |
| Ver ordem do culto completa | ✅ | ✅ | ✅ |
| Editar `service_assignments` do **próprio ministério** | ❌ | ✅ | ✅ |
| Editar `service_songs` | ❌ | só o Louvor | ✅ |
| Editar tema, texto, pregador, dirigente | ❌ | ❌ | ✅ |
| Criar/editar/apagar ministérios | ❌ | ❌ | ✅ |
| Criar/editar/apagar pessoas e membros | ❌ | só do próprio ministério | ✅ |
| Gerar, rodar e revogar tokens | ❌ | ❌ | ✅ |
| Ver `audit_log` | ❌ | ❌ | ✅ |

A autorização decide-se **dentro das Edge Functions**. Esconder botões é cosmético.

Escreve um único `resolveIdentity(request)` que devolve `{ ministryId, scope, tokenId }`, e um
`requireScope()` usado em todas as rotas. Hoje `resolveIdentity` lê o cabeçalho `x-access-token`.
Se um dia a igreja quiser login a sério, substitui-se essa função e nada mais.
**Não acoples a lógica de permissões ao token.**

---

## 6. API (Edge Functions)

```
POST /auth/resolve            -> { ministry, scope, permissions[] }

GET  /events?from=&to=        -> todos os eventos no intervalo
POST /events
PATCH|DELETE /events/{id}

GET  /services?year=
POST /services                (admin)
PATCH /services/{id}          (admin)
PUT  /services/{id}/assignments?ministry={slug}
PUT  /services/{id}/songs     (louvor ou admin)
POST /services/generate       (admin) { year }

GET  /people   GET /ministries
POST|PATCH|DELETE /people, /ministries, /ministry-members

POST /tokens   PATCH /tokens/{id}/revoke   (admin)

GET  /ics?token={token}&ministry={slug|all}   -> feed iCalendar
GET  /health                                  -> select 1, e aciona /sync se houver pendências
POST /sync                                    -> secção 7, protegida por segredo interno
```

O feed ICS é o canal principal para os voluntários: não têm licença Microsoft, logo não têm Outlook
nem Teams. Subscrevem o ICS no Google Calendar ou no calendário do telemóvel. Emite tokens
`readonly` dedicados para isto — o token vai na query string, porque clientes de calendário não
enviam cabeçalhos personalizados.

Toda a escrita grava em `audit_log`.

---

## 7. Saída para o Outlook (módulo opcional)

Controlado pela variável `OUTLOOK_SYNC_ENABLED`. Com o valor `false`, nada neste módulo corre e a
aplicação funciona na íntegra. **Implementa-o de forma a que desligá-lo não parta nada.**

**Sentido único: plataforma → Outlook.** Nada é lido do Outlook. Edições feitas no Outlook são
sobrescritas na sincronização seguinte. Escreve isto no `README.md`, em maiúsculas, porque alguém
vai tentar.

Destino: o calendário de uma **caixa de correio partilhada** (não consome licença). Nunca a caixa
pessoal de ninguém.

Fluxo, na Edge Function `/sync`, chamada pelo cron da secção 4:

1. Obtém *token* com *client credentials* (certificado, não segredo — ver secção 9).
2. Seleciona até 50 eventos com `sync_state = 'pending'`, ordenados por `updated_at`.
3. Para cada um: se `outlook_event_id` é nulo → `POST /users/{mailbox}/calendar/events`;
   caso contrário → `PATCH`. Guarda o `id` devolvido.
4. Processa a `outbox`: `DELETE` no Graph, marca `processed_at`.
5. Erros: incrementa `sync_attempts`, guarda `sync_error`. Ao fim de 5 tentativas, `sync_state =
   'failed'` e mostra um aviso no ecrã de administração. Nunca falhes em silêncio.
6. `429` ou `503`: respeita o cabeçalho `Retry-After`. Não reenvies em ciclo.
7. Eventos com `status = 'cancelada'` sincronizam com `isCancelled` ou são removidos — decide e
   documenta.

Idempotência é obrigatória. Se a função correr duas vezes em paralelo, não podem aparecer eventos
duplicados no Outlook. Usa `SELECT ... FOR UPDATE SKIP LOCKED`.

---

## 8. Notificações no Teams

Sem App Registration e sem Graph. Os *connectors* do Office 365 foram retirados.

Na aplicação **Workflows** do Teams, no canal do Presbitério, cria um fluxo com o gatilho
«quando é recebido um pedido de webhook do Teams». Obtém-se um URL. A Edge Function faz `POST` com
um Adaptive Card.

Duas armadilhas a documentar no `README.md`:

- O URL do webhook **é** o segredo. Por defeito, qualquer pessoa que o tenha pode acioná-lo.
  Guarda-o nos segredos do Supabase, nunca no repositório.
- O fluxo pertence a uma **pessoa**, não ao canal. Se essa pessoa sair da igreja, o fluxo fica
  órfão. Acrescenta um co-proprietário no dia em que o criares.

Só o Presbitério tem licença Microsoft, logo só o Presbitério recebe estas notificações. Para avisar
voluntários de que estão de escala, usa **email**, não Teams.

---

## 9. Segurança

**Tokens de acesso**
- 32 bytes de `crypto.getRandomValues`, em `base64url`.
- Guarda-se apenas o SHA-256. O token em claro é mostrado uma única vez.
- Rotação e revogação pelo Presbitério. `last_used_at` atualizado a cada pedido válido.
- Limitação de taxa: 60 pedidos/minuto por token.
- `Cache-Control: no-store` em todas as respostas da API.
- Nunca registar o token em claro em logs.

**Credencial do Graph**
- **Certificado, não segredo.** Um segredo criado pelo portal expira em 24 meses no máximo; um
  certificado pode durar mais e não anda em texto simples. Guarda a chave privada nos segredos do
  Supabase.
- Permissão de aplicação `Calendars.ReadWrite`, com consentimento de administrador.
- **Restringe a aplicação a uma única caixa** com `New-ApplicationAccessPolicy` no Exchange Online
  PowerShell. Sem isto, a permissão abrange **todas** as caixas de correio da igreja.
- Confirma com `Test-ApplicationAccessPolicy` que a aplicação consegue aceder à caixa partilhada e
  **não consegue** aceder à caixa do pastor. Regista a saída dos dois testes no `README.md`.
- Regista a data de expiração do certificado num sítio que alguém veja.

**Aviso obrigatório no `README.md`**

> Quem tiver o link, tem o acesso. O link de `admin` permite editar tudo e escreve no calendário
> do Microsoft 365 da igreja. Não o partilhes em grupos de WhatsApp.

---

## 10. Frontend

1. **Calendário** (inicial)
   - Vistas Ano · Mês · Semana · Dia. Botões visíveis, atalhos `A M S D`.
   - Todos os eventos, coloridos pelo ministério. Filtro lateral por ministério, persistido.
   - Eventos do próprio ministério são editáveis (arrastar, redimensionar). Os outros abrem em
     leitura.
   - Os domingos têm um marcador que abre a ordem do culto.

2. **Ordem do Culto** (`/culto/:data`)
   - Cabeçalho: data, tema, texto, dirigente, pregador.
   - **Louvor**: músicas ordenadas (arrastáveis) com título, autor, tom e momento; escala por função.
   - **Multimédia**: Projeção, Som, Vídeo.
   - **Assistentes**: Acolhimento, Oferta, Ceia.
   - Secções sem permissão ficam visíveis e bloqueadas.
   - Botão «Imprimir», folha de estilo A4, uma página.
   - Aviso quando a mesma pessoa está em duas funções no mesmo culto, ou escalada durante uma
     indisponibilidade declarada.

3. **Escala** (`/escalas?ministerio=&de=&ate=`) — grelha domingos × funções, preenchimento rápido.

4. **Administração** (só `admin`) — ministérios, pessoas, membros, tokens, `audit_log`, geração dos
   domingos, e um painel com os eventos em `sync_state = 'failed'`.

**UX:** escrita otimista com reversão. Estados de carregamento e erro explícitos. Ecrã de espera
dedicado se o Supabase estiver a acordar. Responsivo — em telemóvel a vista de Ano degrada para
lista de meses. Navegação por teclado nos modais.

---

## 11. Fases

Para no fim de cada fase e mostra o que fizeste.

- **Fase 0** — Andaime: Vite, Tailwind, Supabase local, migração inicial, seed, `keepalive.yml`.
- **Fase 1** — `resolveIdentity`, `requireScope`, `/auth/resolve`, `/ministries`, `/people`.
  **Testes de integração que provam que um token de `ministry` recebe `403` ao escrever noutro
  ministério.** Sem estes testes, não avanças.
- **Fase 2** — Calendário, quatro vistas, CRUD de eventos, filtros, cores.
- **Fase 3** — Ordem do culto: `generate_sundays`, atribuições, músicas, impressão.
- **Fase 4** — Administração: tokens, auditoria, indisponibilidades, conflitos.
- **Fase 5** — Feed ICS. Deploy no GitHub Pages. `README.md` em português.
- **Fase 6** — Módulo do Outlook (secção 7) e webhook do Teams (secção 8). **Só depois de tudo o
  resto funcionar.** Se a Fase 5 chegar e ninguém sentir falta do Outlook, não faças a Fase 6.

---

## 12. Critérios de aceitação

- [ ] Um token de ministério cria um evento e vê-o no calendário geral.
- [ ] Esse token recebe `403` ao editar evento de outro ministério — verificado com `curl`.
- [ ] Um token `readonly` recebe `403` em qualquer escrita.
- [ ] `generate_sundays(2027)` cria 52 cultos; corrida duas vezes, não duplica.
- [ ] A ordem do culto imprime numa folha A4.
- [ ] O feed ICS subscreve no Google Calendar e no iOS.
- [ ] Com `OUTLOOK_SYNC_ENABLED=false` toda a aplicação funciona e nenhum teste falha.
- [ ] Criar, editar e apagar um evento reflete-se na caixa partilhada em menos de 10 minutos.
- [ ] Duas invocações simultâneas de `/sync` não criam eventos duplicados no Outlook.
- [ ] `Test-ApplicationAccessPolicy` confirma que a aplicação **não** acede à caixa do pastor.
- [ ] O bundle de produção não contém nenhum segredo (`grep`).
- [ ] Nenhuma chamada do browser atinge `*.supabase.co/rest/v1/`.

---

## 13. Antes de começares — pergunta-me

1. Há um ou dois cultos ao domingo? A que horas?
2. As funções de cada ministério (Louvor, Multimédia, Assistentes) estão corretas?
3. A Escola Bíblica Dominical precisa de escalas por classe, ou basta o calendário de eventos?
4. O ministério 412 tem necessidades específicas para além de eventos?
5. Qual é o endereço da caixa de correio partilhada de destino?

## 14. Checklist do administrador do tenant — não é trabalho teu

Lista estes passos no `README.md`. São feitos por uma pessoa no portal, não por código.

1. Criar caixa de correio partilhada (sem licença, abaixo de 50 GB).
2. App Registration no Entra ID. Permissão de aplicação `Calendars.ReadWrite`. Consentimento de
   administrador.
3. Carregar certificado. Registar a data de expiração.
4. `New-ApplicationAccessPolicy` a restringir a aplicação à caixa partilhada.
5. `Test-ApplicationAccessPolicy` contra duas caixas: a partilhada (deve conceder) e outra
   qualquer (deve negar).
6. Criar o fluxo do Workflows no canal do Teams. Acrescentar co-proprietário.
7. Colocar `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CERT_KEY`, `GRAPH_MAILBOX`,
   `TEAMS_WEBHOOK_URL` nos segredos do Supabase.

## 15. Restrições

- Sem `any` em TypeScript sem comentário a justificar.
- Sem Redux nem Zustand. React Query e `useState` chegam.
- Sem `<form>` com submissão nativa.
- Texto visível em português europeu. Código e comentários em inglês.
- Datas com `date-fns` e `date-fns-tz`. Nunca `new Date(string)` sem fuso explícito.
- Consultas parametrizadas. Nenhuma concatenação de SQL.
