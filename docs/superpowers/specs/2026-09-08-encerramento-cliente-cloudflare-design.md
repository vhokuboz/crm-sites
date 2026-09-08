# Encerramento de cliente: remoção automática da hospedagem no Cloudflare Pages

Data: 2026-09-08
Status: aprovado, pronto para plano de implementação

## Contexto

Primeira desistência de um cliente (Jéssica Julião, `advogada-jessica-juliao`, status
`contatado`, só com preview publicado — nunca chegou a produção). Hoje não existe nenhuma
automação de encerramento: o site/preview fica publicado pra sempre no Cloudflare Pages
mesmo depois do prospect virar "perdido"/"descartado" no funil.

A hospedagem real não vive neste repo (`crm-okaisites`, o CRM em si). Ela é publicada a
partir do repo **`agent-okaisites`**, pasta `clientes/<slug>/`, por um workflow manual
(`.github/workflows/deploy-pages.yml`) que roda `wrangler pages project create/deploy` — um
projeto Cloudflare Pages por cliente (`<slug>.pages.dev` em produção,
`preview.<slug>.pages.dev` na branch preview). O `CLAUDE.md` desse repo já estabelece que
deploys nunca disparam sozinhos: sempre `gh workflow run` manual, plano free do GitHub
Actions.

Objetivo: quando o status do prospect vira `perdido` ou `descartado` no CRM (Drawer ou drag
no Kanban) e ele tinha `landing_page_url` preenchido, remover o projeto Cloudflare Pages
correspondente — sem precisar abrir o terminal e sem adicionar um botão dedicado, reusando o
seletor de status que já existe. Por ser destrutivo e irreversível, exige confirmação
explícita no momento da mudança de status.

Fora de escopo (decidido explicitamente): mudar o status é responsabilidade do usuário, não
desta automação; arquivar a pasta `clientes/<slug>` no `agent-okaisites` fica de fora; sem
retry automático se a chamada de rede falhar; sem status novo no enum (`perdido`/`descartado`
já modelam a desistência).

## Arquitetura

```
crm-okaisites (CRM)                    agent-okaisites (site do cliente)
─────────────────────                  ──────────────────────────────
Usuário muda status pra
perdido/descartado
(Drawer+Salvar ou drag no Kanban)
  │
  ▼
useProspects.ts::update()
  │ tinha landing_page_url?
  │   sim → window.confirm(...)
  │     cancelou → aborta, nada muda
  ▼
grava status no Supabase (fluxo atual, sem mudança)
  │ sucesso + confirmou
  ▼
supabase.functions.invoke('encerrar-hospedagem', { slug })
  (fire-and-forget, não bloqueia a UI)
  │
  ▼
Edge Function encerrar-hospedagem            ┌─────────────────────────────┐
  POST /repos/vhokuboz/agent-okaisites/       │ .github/workflows/          │
  actions/workflows/encerrar-cliente.yml/  ──▶│ encerrar-cliente.yml        │
  dispatches  { ref: main, inputs: { slug } }  │ wrangler pages project      │
                                               │ delete <slug> --yes         │
                                               │ (não existe → sucesso)      │
                                               └─────────────────────────────┘
```

## Componente 1 — Workflow `encerrar-cliente.yml` (repo `agent-okaisites`)

Novo arquivo `.github/workflows/encerrar-cliente.yml`, gêmeo do `deploy-pages.yml`
existente:

- `workflow_dispatch` com input `slug` (string, obrigatório)
- Um step: `npx wrangler pages project delete "$SLUG" --yes`, com `set +e` tratando saída
  contendo "not found"/"does not exist" como sucesso — mesmo padrão de
  `grep -qi "already exists"` que o `deploy-pages.yml` já usa pro `project create`
- Reusa os secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` já configurados no repo;
  nenhum secret novo aqui

## Componente 2 — Edge Function `encerrar-hospedagem` (repo `crm-okaisites`, `supabase/functions/`)

Segue o padrão já estabelecido por `supabase/functions/add-prospect/index.ts` (`Deno.serve`,
`CORS_HEADERS`, helper `jsonResponse`):

- Recebe `POST { slug: string }`
- Chama `POST https://api.github.com/repos/vhokuboz/agent-okaisites/actions/workflows/encerrar-cliente.yml/dispatches`
  com body `{ ref: "main", inputs: { slug } }` e header
  `Authorization: Bearer <GH_DISPATCH_TOKEN>`
- Secret novo: `GH_DISPATCH_TOKEN`, um GitHub PAT fine-grained com permissão "Actions:
  read/write" restrita ao repo `agent-okaisites`, configurado via
  `supabase secrets set GH_DISPATCH_TOKEN=...` no projeto Supabase (`brwfbyxthuqwwwzlzbwj`)
- Autenticação do chamador: nenhum código extra — Edge Functions do Supabase já exigem um
  JWT válido por padrão, e o CRM já autentica via `supabase.auth.signInWithPassword`
- Resposta: repassa o status do dispatch da API do GitHub (202/204 → sucesso; erro → 500
  com a mensagem)

## Componente 3 — `crm-okaisites`: `domain.ts` + `useProspects.ts`

**`domain.ts`** — uma função pura nova, reaproveitando o array `CLOSED` já existente
(`['perdido', 'descartado']`):

```ts
export function closesHostedSite(previous: Prospect, patch: ProspectUpdate): boolean {
  return !!patch.status && patch.status !== previous.status &&
    CLOSED.includes(patch.status) && !!previous.landing_page_url
}
```

**`useProspects.ts::update`** — único ponto de escrita do app (mesmo lugar que já roda
`statusTransitionPatch`, dispara igual não importa se a mudança de status veio do Drawer, do
drag no Kanban ou do seletor mobile do card):

1. Lê `previous` do estado atual (leitura sem mutar, antes de aplicar qualquer coisa).
2. Se `closesHostedSite(previous, patch)` → `window.confirm("Isso vai apagar a hospedagem do
   preview de \"<nome>\" no Cloudflare Pages. Confirmar?")`. Cancelou → `return false`, nada
   muda (nem otimista, nem banco).
3. Segue o fluxo de update de sempre (escrita otimista + grava no Supabase), sem alteração.
4. Se salvou com sucesso e a condição do passo 2 era verdadeira → dispara fire-and-forget
   `supabase.functions.invoke('encerrar-hospedagem', { body: { slug: previous.slug } })`.
   Erro nessa chamada aparece no banner de erro que o CRM já tem (`state.error`) — o status
   já foi salvo, só a limpeza da hospedagem que falhou; sem rollback do status.

## Edge cases

- Projeto Cloudflare já não existe (nunca foi publicado, ou já foi removido antes) → tratado
  como sucesso no workflow, não gera erro visível no CRM.
- Prospect sem `slug` preenchido mas com `landing_page_url` (não deveria acontecer no dado
  atual, mas não é validado em banco) → a Edge Function falha ao disparar o workflow, erro
  aparece no banner do CRM; sem crash.
- Chamada de rede à Edge Function nunca retorna/falha → sem retry automático (fire-and-forget
  simples); usuário pode reexecutar manualmente com `gh workflow run encerrar-cliente.yml -f
  slug=<slug>` se notar que a hospedagem continua no ar.
- Usuário cancela o `window.confirm` → nenhuma escrita acontece, nem otimista nem no banco;
  status do prospect continua o de antes.

## Testes

- `closesHostedSite`: testável isoladamente (função pura) — casos: patch sem `status`, patch
  pro mesmo status atual, `landing_page_url` nulo, transição pra `perdido`/`descartado` com
  `landing_page_url` preenchido.
- Workflow `encerrar-cliente.yml`: validar manualmente com um slug inexistente (garante que
  "not found" não quebra o job) e com o slug real da Jéssica Julião.
