# Encerramento de cliente: remoção automática da hospedagem no Cloudflare Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o status de um prospect vira `perdido` ou `descartado` no CRM (Drawer ou
drag no Kanban) e ele tinha `landing_page_url` preenchido, remover automaticamente o projeto
Cloudflare Pages correspondente, sem botão novo na UI.

**Architecture:** Uma função pura em `domain.ts` detecta a transição de status que fecha
hospedagem ativa. O único ponto de escrita do CRM (`useProspects.ts::update`) usa essa função
pra pedir confirmação (`window.confirm`) antes de salvar e, depois de salvar com sucesso,
chama fire-and-forget uma Edge Function do Supabase. A Edge Function dispara (via API REST do
GitHub) um `workflow_dispatch` num workflow novo no repo `agent-okaisites`, que roda
`wrangler pages project delete` usando os secrets do Cloudflare já configurados lá.

**Tech Stack:** TypeScript/React (crm-okaisites), Deno (Supabase Edge Functions), GitHub
Actions + Wrangler CLI (agent-okaisites), `node:test` para testes TS puros, `Deno.test` para
testes das Edge Functions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-08-encerramento-cliente-cloudflare-design.md`
  (repo `crm-okaisites`).
- Repositório do site do cliente: `vhokuboz/agent-okaisites` (dir local `~/agent-okaisites`).
- Nome do workflow que remove a hospedagem: `encerrar-cliente.yml`.
- Projeto Supabase: `brwfbyxthuqwwwzlzbwj` (usar em todo `--project-ref`).
- Sem status novo no enum `prospect_status` — reusa `perdido`/`descartado`, já existentes.
- Sem botão novo na UI — o gatilho é o seletor de status já existente (Drawer e Kanban).
- Sem retry automático se a chamada de rede falhar (fire-and-forget simples).
- Ação destrutiva: qualquer step que rode o workflow de verdade contra o Cloudflare (Task 5)
  só deve ser executado com autorização explícita do usuário no momento — não é seguro
  automatizar essa confirmação.

---

## Task 1: `closesHostedSite` em `domain.ts`

**Files:**
- Modify: `src/lib/domain.ts:443-445` (logo após `isOpen`)
- Modify: `src/lib/domain.test.ts` (helper `fakeProspect` + testes novos)

**Interfaces:**
- Produces: `closesHostedSite(previous: Prospect, patch: ProspectUpdate): boolean` — usada
  pela Task 4 (`useProspects.ts`).

- [ ] **Step 1: Estender o helper `fakeProspect` com `landing_page_url` opcional**

Em `src/lib/domain.test.ts`, o helper hoje é:

```ts
function fakeProspect(status: string, revisionCount = 0): Prospect {
  return { status, revision_count: revisionCount } as unknown as Prospect
}
```

Trocar por (mantém compatibilidade com todas as chamadas existentes, que passam 1 ou 2
argumentos):

```ts
function fakeProspect(
  status: string,
  revisionCount = 0,
  landingPageUrl: string | null = null,
): Prospect {
  return {
    status,
    revision_count: revisionCount,
    landing_page_url: landingPageUrl,
  } as unknown as Prospect
}
```

- [ ] **Step 2: Escrever os testes que falham**

Adicionar ao final de `src/lib/domain.test.ts`:

```ts
test('closesHostedSite - vira perdido com preview publicado: true', () => {
  const previous = fakeProspect('contatado', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), true)
})

test('closesHostedSite - vira descartado com preview publicado: true', () => {
  const previous = fakeProspect('novo', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'descartado' }), true)
})

test('closesHostedSite - sem landing_page_url: false', () => {
  const previous = fakeProspect('contatado', 0, null)
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), false)
})

test('closesHostedSite - status igual ao atual nao fecha nada: false', () => {
  const previous = fakeProspect('perdido', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), false)
})

test('closesHostedSite - vira status que nao encerra (ex: finalizado): false', () => {
  const previous = fakeProspect('entrega', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'finalizado' }), false)
})

test('closesHostedSite - patch sem status: false', () => {
  const previous = fakeProspect('contatado', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { notes: 'x' }), false)
})
```

E atualizar o import do topo do arquivo (linha 4) de:

```ts
import { addBusinessDaysISO, addDaysISO, statusTransitionPatch } from './domain.ts'
```

para:

```ts
import { addBusinessDaysISO, addDaysISO, closesHostedSite, statusTransitionPatch } from './domain.ts'
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — `closesHostedSite is not a function` (ou `is not exported`).

- [ ] **Step 4: Implementar `closesHostedSite` em `domain.ts`**

Em `src/lib/domain.ts`, logo depois de `isOpen` (linhas 443-445):

```ts
export function isOpen(p: Prospect): boolean {
  return !['finalizado', 'perdido', 'descartado'].includes(p.status)
}

/**
 * true quando a mudança de status vai apagar hospedagem publicada de
 * verdade (preview ou produção) no Cloudflare Pages.
 */
export function closesHostedSite(previous: Prospect, patch: ProspectUpdate): boolean {
  return (
    !!patch.status &&
    patch.status !== previous.status &&
    CLOSED.includes(patch.status) &&
    !!previous.landing_page_url
  )
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os testes de `domain.test.ts`, incluindo os 6 novos.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd ~/crm-okaisites
git add src/lib/domain.ts src/lib/domain.test.ts
git commit -m "feat: adiciona closesHostedSite para detectar encerramento com hospedagem ativa"
```

---

## Task 2: Workflow `encerrar-cliente.yml` (repo `agent-okaisites`)

**Depends on:** nenhuma (independente das Tasks do `crm-okaisites`).

**Files:**
- Create: `.github/workflows/encerrar-cliente.yml` (em `~/agent-okaisites`)

**Interfaces:**
- Produces: um `workflow_dispatch` chamável como
  `POST /repos/vhokuboz/agent-okaisites/actions/workflows/encerrar-cliente.yml/dispatches`
  com `{ ref: "main", inputs: { slug } }` — é o que a Task 3 (Edge Function) vai chamar.

- [ ] **Step 1: Criar o workflow**

Criar `~/agent-okaisites/.github/workflows/encerrar-cliente.yml`:

```yaml
name: Encerrar Cliente

on:
  workflow_dispatch:
    inputs:
      slug:
        description: "Slug do cliente (projeto Cloudflare Pages a remover)"
        required: true
        type: string

jobs:
  encerrar:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      SLUG: ${{ inputs.slug }}
    steps:
      - name: Remover projeto Cloudflare Pages
        run: |
          set +e
          delete_output=$(npx wrangler pages project delete "$SLUG" --yes 2>&1)
          delete_status=$?
          set -e
          echo "$delete_output"
          if [ $delete_status -ne 0 ] && ! echo "$delete_output" | grep -qiE "not found|does not exist|8000007"; then
            echo "::error::Falha ao remover o projeto Cloudflare Pages '$SLUG'"
            exit 1
          fi
          echo "Projeto '$SLUG' removido (ou já não existia)."
```

Não precisa de `actions/checkout`: ao contrário do `deploy-pages.yml`, esse workflow não lê
nenhum arquivo do repositório, só chama a API do Cloudflare via `wrangler`.

O padrão de mensagem de erro do wrangler pra "projeto não existe" pode variar entre versões
— o grep cobre as variações mais prováveis (`not found`, `does not exist`, o código de erro
`8000007` que o Cloudflare usa pra "Project not found"). A Task 5 confirma isso rodando
contra um slug inexistente de verdade; se o texto real não bater com nenhum desses padrões,
ajustar o `grep -qiE` com o texto exato retornado antes de seguir.

- [ ] **Step 2: Commit e push**

```bash
cd ~/agent-okaisites
git add .github/workflows/encerrar-cliente.yml
git commit -m "feat: adiciona workflow pra remover projeto Cloudflare Pages de um cliente"
git push
```

- [ ] **Step 3: Confirmar que o GitHub reconheceu o workflow (sem executá-lo)**

Run: `gh workflow list --repo vhokuboz/agent-okaisites`
Expected: a lista inclui `Encerrar Cliente` como um workflow ativo — confirma que a sintaxe
YAML e o `workflow_dispatch` foram aceitos, sem gastar minutos do plano free do Actions
executando o job de verdade.

---

## Task 3: Edge Function `encerrar-hospedagem` (repo `crm-okaisites`)

**Depends on:** Task 2 (usa o nome do workflow e do repo definidos lá, mas só como string —
não há dependência de código).

**Files:**
- Create: `supabase/functions/encerrar-hospedagem/dispatch.ts`
- Create: `supabase/functions/encerrar-hospedagem/dispatch.test.ts`
- Create: `supabase/functions/encerrar-hospedagem/index.ts`

**Interfaces:**
- Produces: `buildDispatchRequest(slug: string, token: string): { url: string, init: RequestInit }`
  — consumido só por `index.ts` nesta mesma task.
- Produces: a function HTTP `encerrar-hospedagem`, invocável como
  `supabase.functions.invoke('encerrar-hospedagem', { body: { slug } })` — consumida pela
  Task 4.

- [ ] **Step 1: Escrever `dispatch.ts` (lógica pura, sem I/O)**

Segue o mesmo padrão de separação de `supabase/functions/add-prospect/parsing.ts` (lógica
pura testável, separada do `index.ts` que faz I/O):

```ts
// Monta a requisição de workflow_dispatch pro GitHub Actions do repo
// agent-okaisites, que roda o wrangler pages project delete do slug. Esta
// function não fala com o Cloudflare direto: quem faz isso é o workflow,
// que já tem os secrets da conta Cloudflare.
const REPO = 'vhokuboz/agent-okaisites'
const WORKFLOW = 'encerrar-cliente.yml'

export function buildDispatchRequest(
  slug: string,
  token: string,
): { url: string; init: RequestInit } {
  return {
    url: `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs: { slug } }),
    },
  }
}
```

- [ ] **Step 2: Escrever `dispatch.test.ts`**

Mesmo padrão de `supabase/functions/add-prospect/parsing.test.ts` (`Deno.test` + assert do
Deno std):

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildDispatchRequest } from './dispatch.ts'

Deno.test('buildDispatchRequest - monta URL do repo e workflow corretos', () => {
  const { url } = buildDispatchRequest('advogada-jessica-juliao', 'tok')
  assertEquals(
    url,
    'https://api.github.com/repos/vhokuboz/agent-okaisites/actions/workflows/encerrar-cliente.yml/dispatches',
  )
})

Deno.test('buildDispatchRequest - body leva o slug como input e ref main', () => {
  const { init } = buildDispatchRequest('advogada-jessica-juliao', 'tok')
  assertEquals(JSON.parse(init.body as string), {
    ref: 'main',
    inputs: { slug: 'advogada-jessica-juliao' },
  })
})

Deno.test('buildDispatchRequest - usa o token no header Authorization', () => {
  const { init } = buildDispatchRequest('slug-x', 'meu-token')
  const headers = init.headers as Record<string, string>
  assertEquals(headers.Authorization, 'Bearer meu-token')
})
```

- [ ] **Step 3: Rodar os testes**

Se `deno` não estiver instalado no ambiente: `curl -fsSL https://deno.land/install.sh | sh`
(ou `brew install deno` se for macOS com Homebrew), depois garantir que `~/.deno/bin` está no
`PATH` da sessão atual.

Run: `deno test supabase/functions/encerrar-hospedagem/dispatch.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 4: Escrever `index.ts` (handler HTTP)**

Segue o mesmo padrão de `supabase/functions/add-prospect/index.ts` (`Deno.serve`,
`CORS_HEADERS`, helper `jsonResponse`):

```ts
// Recebe o slug de um prospect encerrado (perdido/descartado) e dispara o
// workflow do agent-okaisites que remove o projeto Cloudflare Pages
// correspondente.
import { buildDispatchRequest } from './dispatch.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GH_DISPATCH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!GH_DISPATCH_TOKEN) {
    return jsonResponse({ error: 'GH_DISPATCH_TOKEN não configurada nos secrets da function.' }, 500)
  }

  let slug: string | undefined
  try {
    ;({ slug } = await req.json())
  } catch {
    return jsonResponse({ error: 'Corpo inválido, esperado JSON.' }, 400)
  }
  if (!slug) {
    return jsonResponse({ error: 'Informe o slug do prospect.' }, 400)
  }

  const { url, init } = buildDispatchRequest(slug, GH_DISPATCH_TOKEN)
  const res = await fetch(url, init)

  if (!res.ok) {
    return jsonResponse({ error: `GitHub API respondeu ${res.status}: ${await res.text()}` }, 502)
  }

  return jsonResponse({ dispatched: true })
})
```

- [ ] **Step 5: Verificar sintaxe**

Run: `deno check supabase/functions/encerrar-hospedagem/index.ts`
Expected: sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
cd ~/crm-okaisites
git add supabase/functions/encerrar-hospedagem/
git commit -m "feat: adiciona edge function encerrar-hospedagem"
```

---

## Task 4: `useProspects.ts` — confirmação e disparo no fluxo de status

**Depends on:** Task 1 (`closesHostedSite`), Task 3 (nome da function `encerrar-hospedagem`).

**Files:**
- Modify: `src/lib/useProspects.ts:1-4` (import) e `:36-73` (`update`)

**Interfaces:**
- Consumes: `closesHostedSite(previous, patch)` de `./domain` (Task 1).
- Consumes: `supabase.functions.invoke('encerrar-hospedagem', { body: { slug } })` (Task 3).

- [ ] **Step 1: Atualizar o import**

Em `src/lib/useProspects.ts:3`, trocar:

```ts
import { statusTransitionPatch } from './domain'
```

por:

```ts
import { closesHostedSite, statusTransitionPatch } from './domain'
```

- [ ] **Step 2: Reescrever `update`**

Substituir o corpo inteiro de `update` (linhas 36-73) por:

```ts
const update = useCallback(async (id: string, patch: ProspectUpdate) => {
  let previous: Prospect | undefined
  setState((s) => {
    previous = s.prospects.find((p) => p.id === id)
    return s
  })

  if (previous && closesHostedSite(previous, patch)) {
    const ok = window.confirm(
      `Isso vai apagar a hospedagem do preview de "${previous.name}" no Cloudflare Pages. Confirmar?`,
    )
    if (!ok) return false
  }

  let finalPatch: ProspectUpdate = patch

  setState((s) => {
    previous = s.prospects.find((p) => p.id === id)
    finalPatch = previous ? statusTransitionPatch(previous, patch) : patch
    return {
      ...s,
      prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...finalPatch } : p)),
    }
  })

  const { data, error } = await supabase
    .from('prospects')
    .update(finalPatch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    setState((s) => ({
      ...s,
      error: `Não foi possível salvar: ${error.message}`,
      prospects: previous
        ? s.prospects.map((p) => (p.id === id ? (previous as Prospect) : p))
        : s.prospects,
    }))
    return false
  }

  setState((s) => ({
    ...s,
    error: null,
    prospects: s.prospects.map((p) => (p.id === id ? data : p)),
  }))

  if (previous && closesHostedSite(previous, patch)) {
    void supabase.functions
      .invoke('encerrar-hospedagem', { body: { slug: previous.slug } })
      .then(({ error: fnError }) => {
        if (fnError) {
          setState((s) => ({
            ...s,
            error: `Hospedagem não removida automaticamente: ${fnError.message}`,
          }))
        }
      })
  }

  return true
}, [])
```

A primeira leitura de `previous` (via `setState((s) => { ...; return s })`) não muda o
estado — só serve pra ler o valor atual antes do `window.confirm`, sem depender de
`state.prospects` nas dependências do `useCallback` (mantém `update` estável, mesmo padrão
já usado hoje pra ler `previous` dentro do `setState` de escrita). Como `window.confirm` é
síncrono e bloqueia a thread, não há corrida entre essa leitura e a segunda (a que aplica o
patch de fato).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Rodar os testes de domain (garantir que nada quebrou)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Testar manualmente no browser**

```bash
npm run dev
```

Abrir o CRM no navegador, abrir a ficha (Drawer) de um prospect de teste que tenha
`landing_page_url` preenchido (ou criar um registro de teste com esse campo preenchido — não
usar a Jéssica Julião real aqui, isso é só teste da UI, o disparo real vai falhar porque o
secret `GH_DISPATCH_TOKEN` ainda não existe até a Task 5):

1. Mudar o status pra "Perdido" e clicar Salvar → deve aparecer o `confirm()` do navegador.
2. Clicar "Cancelar" → o status não muda (a ficha continua com o status anterior).
3. Repetir e clicar "OK" → o status muda, e no painel de erro do CRM deve aparecer
   `Hospedagem não removida automaticamente: ...` (esperado — o secret ainda não existe,
   confirma que a chamada à Edge Function de fato saiu).
4. Mudar o status de um prospect **sem** `landing_page_url` pra "Perdido" → não deve aparecer
   nenhum `confirm()`, o status muda direto.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useProspects.ts
git commit -m "feat: dispara remocao da hospedagem ao marcar prospect como perdido/descartado"
```

---

## Task 5: Secret, deploy e verificação de ponta a ponta

**Depends on:** Task 2, Task 3, Task 4.

**Files:** nenhum arquivo novo — só comandos e configuração externa.

> Esta task executa uma ação real e irreversível (apaga hospedagem de verdade) e gasta
> minutos do plano free do GitHub Actions. Confirmar com o usuário antes de rodar os Steps 3
> em diante.

- [ ] **Step 1: Criar o GitHub PAT**

Em https://github.com/settings/personal-access-tokens/new, criar um token fine-grained:
- Repository access: só `vhokuboz/agent-okaisites`.
- Permissions: "Actions" → Read and write.
- Sem outras permissões.

- [ ] **Step 2: Configurar o secret na Edge Function e fazer deploy**

```bash
cd ~/crm-okaisites
supabase secrets set GH_DISPATCH_TOKEN=<o token gerado no Step 1> --project-ref brwfbyxthuqwwwzlzbwj
supabase functions deploy encerrar-hospedagem --project-ref brwfbyxthuqwwwzlzbwj
```

Expected: saída confirmando deploy bem-sucedido da function `encerrar-hospedagem`.

- [ ] **Step 3: Validar o tratamento de "projeto não existe" (slug inexistente)**

```bash
gh workflow run encerrar-cliente.yml --repo vhokuboz/agent-okaisites -f slug=slug-que-nao-existe-teste
```

Aguardar a run terminar (`gh run list --repo vhokuboz/agent-okaisites --workflow=encerrar-cliente.yml --limit 1`)
e conferir o log (`gh run view <id> --repo vhokuboz/agent-okaisites --log`).

Expected: job termina com sucesso (verde), log mostra "Projeto 'slug-que-nao-existe-teste'
removido (ou já não existia)." Se o job falhar porque a mensagem de erro real do wrangler não
bateu com o `grep -qiE` da Task 2, ajustar o padrão no workflow com o texto exato visto no
log, commitar e repetir este step.

- [ ] **Step 4: Verificação de ponta a ponta com a Jéssica Julião**

No CRM (`npm run dev`), abrir a ficha da Jéssica Julião (`advogada-jessica-juliao`, hoje em
`contatado`) e mudar o status pra "Perdido":

1. Confirmar o `window.confirm()`.
2. Confirmar que o painel de erro do CRM **não** mostra mensagem de falha.
3. Rodar `gh run list --repo vhokuboz/agent-okaisites --workflow=encerrar-cliente.yml --limit 1`
   e conferir que uma run nova foi disparada e terminou com sucesso.
4. Confirmar que `https://preview.advogada-jessica-juliao.pages.dev` deixou de responder
   (ex: `curl -I https://preview.advogada-jessica-juliao.pages.dev` retorna erro de DNS ou
   404 do Cloudflare, não mais 200).
