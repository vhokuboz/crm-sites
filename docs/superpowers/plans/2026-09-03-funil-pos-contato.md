# Funil pós-contato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o trecho genérico do funil (`contatado → respondeu → negociando →
fechado`) por um funil detalhado que reflete o processo real de venda e entrega de sites
(`contatado → briefing → aguardando_pendencias → refinamento → em_analise → entrega →
aguardando_pagamento → finalizado`), com regras automáticas de próxima ação e avanço de
status nos pontos previsíveis do processo.

**Architecture:** Uma função pura nova (`statusTransitionPatch`) centraliza toda regra que
depende só da mudança de status, chamada de dentro do único ponto de escrita do app
(`useProspects.ts::update`) — assim ela dispara igual não importa se o status mudou por
arrastar no Kanban, pelo seletor mobile do card, ou pela ficha. Regras que dependem de
campos sendo editados junto (protótipo, documentos+sinal, pagamento final) continuam
montadas no `Drawer.tsx`, mesmo padrão já usado hoje pra `novo`→`prototipado`.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (Postgres/RLS). Testes com o test
runner nativo do Node (`node:test` + `node:assert/strict`, zero dependência de framework —
mesmo espírito de `supabase/functions/add-prospect/parsing.test.ts`, que usa só o test
runner nativo do Deno).

## Global Constraints

- `prospect_status` é enum do Postgres: um valor novo de enum não pode ser usado na mesma
  transação em que foi criado — a migração que adiciona valores tem que ser commitada
  antes de qualquer migração que os use (mesmo padrão de
  `supabase/migrations/20260725210000_add_prototipado_status.sql`).
- Enum do Postgres não suporta remover valor sem recriar o tipo inteiro. `respondeu`,
  `negociando`, `fechado` ficam no enum do banco (nunca mais usados/renderizados pelo app),
  em vez de uma migração de recriação de tipo — decisão já registrada na spec.
- Todas as strings visíveis ao usuário (rótulos, textos de UI) em português do Brasil,
  seguindo o padrão já usado em todo o app.
- Sem framework de teste novo (Jest/Vitest) — usar `node:test`/`node:assert/strict`
  (built-in do Node, zero dependência de runtime; precisa de `@types/node` só como
  dev-dependency pra o `tsc` reconhecer os módulos `node:*` no typecheck).
- Projeto Supabase: `brwfbyxthuqwwwzlzbwj` (ref usado nas chamadas de MCP/CLI abaixo).
- Sem dado fabricado: os 2 registros reais afetados pela migração de vocabulário
  (`negociando`→`refinamento`, `fechado`→`finalizado`) já foram confirmados com o usuário
  na spec — não adivinhar status de nenhum outro registro.

---

## Task 1: Migração — novos valores do enum `prospect_status`

**Files:**
- Create: `supabase/migrations/20260903120000_add_funil_pos_contato_status_values.sql`

**Interfaces:**
- Produces: 7 valores novos no enum `public.prospect_status` — `briefing`,
  `aguardando_pendencias`, `refinamento`, `em_analise`, `entrega`,
  `aguardando_pagamento`, `finalizado` — disponíveis para uso a partir da próxima
  migração/consulta (não na mesma transação em que foram criados).

- [ ] **Step 1: Escrever a migração**

Conteúdo de `supabase/migrations/20260903120000_add_funil_pos_contato_status_values.sql`:

```sql
-- Funil pós-contato: adiciona os 7 status novos que substituem o trecho
-- genérico 'respondeu'/'negociando'/'fechado'. Um valor novo de enum não pode
-- ser usado na mesma transação em que é criado, por isso esta migração só
-- adiciona valores — nada mais (mesmo padrão de
-- 20260725210000_add_prototipado_status.sql).
alter type public.prospect_status add value if not exists 'briefing' after 'contatado';
alter type public.prospect_status add value if not exists 'aguardando_pendencias' after 'briefing';
alter type public.prospect_status add value if not exists 'refinamento' after 'aguardando_pendencias';
alter type public.prospect_status add value if not exists 'em_analise' after 'refinamento';
alter type public.prospect_status add value if not exists 'entrega' after 'em_analise';
alter type public.prospect_status add value if not exists 'aguardando_pagamento' after 'entrega';
alter type public.prospect_status add value if not exists 'finalizado' after 'aguardando_pagamento';
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase**

Use a ferramenta MCP `mcp__claude_ai_Supabase__apply_migration` com:
- `project_id`: `brwfbyxthuqwwwzlzbwj`
- `name`: `add_funil_pos_contato_status_values`
- `query`: o conteúdo SQL do Step 1 (sem o cabeçalho de comentário, só as 7 linhas `alter type`)

- [ ] **Step 3: Verificar que os valores foram criados**

Use `mcp__claude_ai_Supabase__execute_sql` com `project_id` `brwfbyxthuqwwwzlzbwj` e:

```sql
select enumlabel from pg_enum
where enumtypid = 'public.prospect_status'::regtype
order by enumsortorder;
```

Esperado: lista incluindo `novo`, `prototipado`, `contatado`, `briefing`,
`aguardando_pendencias`, `refinamento`, `em_analise`, `entrega`,
`aguardando_pagamento`, `finalizado`, `respondeu`, `negociando`, `fechado`, `perdido`,
`descartado` (a ordem exata dos 3 últimos antigos não importa — a UI nunca usa a ordem do
enum, só a ordem do array `FUNNEL` em `domain.ts`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260903120000_add_funil_pos_contato_status_values.sql
git commit -m "feat: adiciona status novos do funil pós-contato ao enum prospect_status"
```

---

## Task 2: Migração — colunas novas e backfill dos registros reais

**Depends on:** Task 1 (usa os valores de enum criados lá; precisa estar em transação
separada e já commitada).

**Files:**
- Create: `supabase/migrations/20260903120100_add_funil_pos_contato_columns_and_backfill.sql`

**Interfaces:**
- Produces: colunas `contact_attempts` (integer, default 0), `docs_received` (boolean,
  default false), `deposit_paid_amount` (numeric, nullable), `final_paid_amount` (numeric,
  nullable), `revision_count` (integer, default 0), `deal_value` (numeric, nullable) em
  `public.prospects`. Os 2 registros reais em `negociando`/`fechado` passam a
  `refinamento`/`finalizado`.

- [ ] **Step 1: Escrever a migração**

Conteúdo de
`supabase/migrations/20260903120100_add_funil_pos_contato_columns_and_backfill.sql`:

```sql
-- Colunas de acompanhamento do funil pós-contato: tentativas de contato,
-- documentos/pagamento de sinal, pagamento final, contagem de rodadas de
-- revisão e valor combinado com o cliente.
alter table public.prospects
  add column contact_attempts integer not null default 0,
  add column docs_received boolean not null default false,
  add column deposit_paid_amount numeric,
  add column final_paid_amount numeric,
  add column revision_count integer not null default 0,
  add column deal_value numeric;

-- Backfill dos 2 registros reais que estavam em status removidos do
-- vocabulário ativo do app. Mapeamento confirmado com o usuário (ver
-- docs/superpowers/specs/2026-09-03-funil-pos-contato-design.md):
-- Rafael Iglesias Fotografia (site local pronto, deploy pendente, pendências
-- do cliente em aberto) -> refinamento.
update public.prospects set status = 'refinamento'
  where id = '71c8f749-5850-4cf5-aa22-bd05ec6e7296';

-- Noélle Garcia ADVOCACIA (site entregue e pago) -> finalizado.
update public.prospects set status = 'finalizado'
  where id = 'fccade1b-96c9-4d96-824f-d89eeb41b2e0';
```

- [ ] **Step 2: Aplicar a migração**

Use `mcp__claude_ai_Supabase__apply_migration` com:
- `project_id`: `brwfbyxthuqwwwzlzbwj`
- `name`: `add_funil_pos_contato_columns_and_backfill`
- `query`: o conteúdo SQL do Step 1 (sem os comentários, só o `alter table` e os dois
  `update`)

- [ ] **Step 3: Verificar colunas e backfill**

Use `mcp__claude_ai_Supabase__execute_sql` com `project_id` `brwfbyxthuqwwwzlzbwj`:

```sql
select id, name, status, contact_attempts, docs_received, deposit_paid_amount,
       final_paid_amount, revision_count, deal_value
from public.prospects
where id in ('71c8f749-5850-4cf5-aa22-bd05ec6e7296', 'fccade1b-96c9-4d96-824f-d89eeb41b2e0');
```

Esperado: Rafael Iglesias Fotografia com `status = 'refinamento'`, Noélle Garcia ADVOCACIA
com `status = 'finalizado'`, e as 6 colunas novas presentes com os defaults
(`contact_attempts = 0`, `docs_received = false`, `revision_count = 0`, os 3 numéricos
`null`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260903120100_add_funil_pos_contato_columns_and_backfill.sql
git commit -m "feat: adiciona colunas de pagamento/acompanhamento e migra os 2 registros reais"
```

---

## Task 3: `database.types.ts` — refletir colunas e enum novos

**Depends on:** Task 1, Task 2 (os tipos devem espelhar o schema real já aplicado).

**Files:**
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `Prospect` (= `Row`) e `ProspectUpdate` (= `Partial<Insert>`) ganham os 6
  campos novos: `contact_attempts: number`, `docs_received: boolean`,
  `deposit_paid_amount: number | null`, `final_paid_amount: number | null`,
  `revision_count: number`, `deal_value: number | null`. `ProspectStatus` passa a incluir
  os 7 valores novos do enum.

- [ ] **Step 1: Adicionar os campos novos em `Row`**

Em `src/lib/database.types.ts`, dentro de `prospects.Row` (linhas 9-43), inserir mantendo
a ordem alfabética já usada no arquivo:

```ts
          contact: string | null
          contact_attempts: number
          created_at: string
          deal_value: number | null
          deposit_paid_amount: number | null
          docs_received: boolean
          email: string | null
          facebook: string | null
          final_paid_amount: number | null
          google_cid: string | null
```

(ou seja: `contact_attempts` logo após `contact`; `deal_value`, `deposit_paid_amount`,
`docs_received` entre `created_at` e `email`; `final_paid_amount` entre `facebook` e
`google_cid`. Mais abaixo, `revision_count` entra entre `prospected_at` e `segment`:)

```ts
          prospected_at: string
          revision_count: number
          segment: string
```

- [ ] **Step 2: Adicionar os mesmos campos em `Insert`**

Mesma posição, dentro de `prospects.Insert` (linhas 44-78), como opcionais (têm default no
banco ou são nullable):

```ts
          contact?: string | null
          contact_attempts?: number
          created_at?: string
          deal_value?: number | null
          deposit_paid_amount?: number | null
          docs_received?: boolean
          email?: string | null
          facebook?: string | null
          final_paid_amount?: number | null
          google_cid?: string | null
```

e:

```ts
          prospected_at?: string
          revision_count?: number
          segment: string
```

(`Update` não precisa de mudança — já é `Partial<Insert>`.)

- [ ] **Step 3: Adicionar os valores novos no enum `prospect_status`**

Em `src/lib/database.types.ts:86-95`, trocar:

```ts
      prospect_status:
        | 'novo'
        | 'prototipado'
        | 'contatado'
        | 'respondeu'
        | 'negociando'
        | 'fechado'
        | 'perdido'
        | 'descartado'
```

por:

```ts
      prospect_status:
        | 'novo'
        | 'prototipado'
        | 'contatado'
        | 'briefing'
        | 'aguardando_pendencias'
        | 'refinamento'
        | 'em_analise'
        | 'entrega'
        | 'aguardando_pagamento'
        | 'finalizado'
        | 'respondeu'
        | 'negociando'
        | 'fechado'
        | 'perdido'
        | 'descartado'
```

- [ ] **Step 4: Rodar o typecheck**

```bash
npm run typecheck
```

Esperado: falha nesta etapa, porque `src/lib/domain.ts` ainda referencia só os status
antigos em `FUNNEL`/`STATUS_LABEL`/`STATUS_TONE` (isso é normal — corrigido na Task 4). Se
o erro for em `database.types.ts` (não em `domain.ts`), há um problema de sintaxe neste
arquivo — revisar antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: reflete colunas e status novos do funil pós-contato nos tipos"
```

---

## Task 4: `domain.ts` — funil novo e regras automáticas (TDD)

**Depends on:** Task 3.

**Files:**
- Modify: `src/lib/domain.ts`
- Create: `src/lib/domain.test.ts`
- Modify: `package.json` (script `test`)
- Modify: `package.json`, `package-lock.json` (dependência `@types/node`)

**Interfaces:**
- Consumes: `Prospect`, `ProspectStatus`, `ProspectUpdate` de `./database.types` (Task 3).
- Produces:
  - `addBusinessDaysISO(days: number, from?: string): string`
  - `statusTransitionPatch(previous: Prospect, patch: ProspectUpdate): ProspectUpdate`
  - `FUNNEL: ProspectStatus[]` com os 10 status ativos (usado por `Funil.tsx`, `Hoje.tsx`,
    `Base.tsx` via `ALL_STATUS`)
  - `STATUS_LABEL`, `STATUS_TONE`: `Record<ProspectStatus, string>` cobrindo todos os 15
    valores do enum (os 10 ativos + os 3 mortos + `perdido`/`descartado`) — o tipo
    `Record` exige todas as chaves do enum, mesmo as que a UI nunca mais itera.
  - `isOpen(p: Prospect): boolean` — agora trata `finalizado` (não mais `fechado`) como
    status fechado.

- [ ] **Step 1: Instalar `@types/node` (dev) e configurar o script de teste**

```bash
npm install --save-dev @types/node
```

Em `package.json`, no bloco `"scripts"`, adicionar:

```json
    "test": "node --experimental-strip-types --test src/lib/*.test.ts"
```

(ao lado de `dev`, `build`, `preview`, `typecheck` já existentes)

- [ ] **Step 2: Escrever os testes de `addBusinessDaysISO` (falhando)**

Criar `src/lib/domain.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDaysISO } from './domain.ts'

// 2026-09-04 é sexta-feira; 2026-09-05/06 são sábado/domingo.
test('addBusinessDaysISO - pula fim de semana indo de sexta pra segunda', () => {
  assert.equal(addBusinessDaysISO(1, '2026-09-04'), '2026-09-07')
})

// 2026-09-03 é quinta-feira: +3 dias úteis = sex, seg, ter.
test('addBusinessDaysISO - soma 3 dias úteis cruzando um fim de semana', () => {
  assert.equal(addBusinessDaysISO(3, '2026-09-03'), '2026-09-08')
})

test('addBusinessDaysISO - sem fim de semana no meio soma direto', () => {
  // 2026-09-01 é terça; +2 dias úteis = quarta, quinta.
  assert.equal(addBusinessDaysISO(2, '2026-09-01'), '2026-09-03')
})
```

Nota: o import usa a extensão `.ts` explícita (`./domain.ts`) porque este arquivo roda
direto no Node (via `--experimental-strip-types`), fora do bundler do Vite — Node exige a
extensão exata em imports relativos de ESM.

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npm test
```

Esperado: FAIL — `addBusinessDaysISO` ainda não existe em `domain.ts`.

- [ ] **Step 4: Implementar `addBusinessDaysISO`**

Em `src/lib/domain.ts`, logo depois da função `addDaysISO` (que termina na linha 22, antes
de `daysFromToday`), adicionar:

```ts
/** Como addDaysISO, mas pulando sábado e domingo ao contar os `days` úteis. */
export function addBusinessDaysISO(days: number, from = todayISO()): string {
  let date = from
  let remaining = days
  while (remaining > 0) {
    date = addDaysISO(1, date)
    const dow = new Date(`${date}T00:00:00`).getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return date
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: PASS nos 3 testes de `addBusinessDaysISO`.

- [ ] **Step 6: Escrever os testes de `statusTransitionPatch` (falhando)**

Primeiro, no topo de `src/lib/domain.test.ts`, trocar a linha `import { addBusinessDaysISO }
from './domain.ts'` do Step 2 e adicionar um import de tipo novo, ficando os 4 imports do
arquivo assim:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDaysISO, addDaysISO, statusTransitionPatch } from './domain.ts'
import type { Prospect } from './database.types.ts'
```

Depois, adicionar ao final do arquivo (abaixo dos 3 testes de `addBusinessDaysISO` já
existentes):

```ts
function fakeProspect(status: string, revisionCount = 0): Prospect {
  return { status, revision_count: revisionCount } as unknown as Prospect
}

test('statusTransitionPatch - entrar em contatado agenda 3 dias úteis à frente', () => {
  const previous = fakeProspect('prototipado')
  const patch = statusTransitionPatch(previous, { status: 'contatado' })
  assert.equal(patch.next_action_at, addBusinessDaysISO(3))
})

test('statusTransitionPatch - entrar em aguardando_pendencias agenda 2 dias corridos à frente', () => {
  const previous = fakeProspect('briefing')
  const patch = statusTransitionPatch(previous, { status: 'aguardando_pendencias' })
  assert.equal(patch.next_action_at, addDaysISO(2))
})

test('statusTransitionPatch - voltar de em_analise pra refinamento soma revision_count', () => {
  const previous = fakeProspect('em_analise', 1)
  const patch = statusTransitionPatch(previous, { status: 'refinamento' })
  assert.equal(patch.revision_count, 2)
})

test('statusTransitionPatch - ir pra refinamento sem vir de em_analise nao mexe em revision_count', () => {
  const previous = fakeProspect('aguardando_pendencias', 0)
  const patch = statusTransitionPatch(previous, { status: 'refinamento' })
  assert.equal('revision_count' in patch, false)
})

test('statusTransitionPatch - mudanca sem regra associada nao adiciona nada ao patch', () => {
  const previous = fakeProspect('entrega')
  const patch = statusTransitionPatch(previous, { status: 'aguardando_pagamento', notes: 'x' })
  assert.deepEqual(patch, { status: 'aguardando_pagamento', notes: 'x' })
})

test('statusTransitionPatch - status igual ao atual nao aplica regra nenhuma', () => {
  const previous = fakeProspect('contatado')
  const patch = statusTransitionPatch(previous, { status: 'contatado', notes: 'y' })
  assert.deepEqual(patch, { status: 'contatado', notes: 'y' })
})
```

- [ ] **Step 7: Rodar e confirmar que falha**

```bash
npm test
```

Esperado: FAIL — `statusTransitionPatch` ainda não existe.

- [ ] **Step 8: Implementar `statusTransitionPatch`**

Em `src/lib/domain.ts`, trocar a linha de import do topo do arquivo:

```ts
import type { Prospect, ProspectStatus } from './database.types'
```

por:

```ts
import type { Prospect, ProspectStatus, ProspectUpdate } from './database.types'
```

E, logo depois da função `isOpen` (que hoje termina o bloco "status", antes do comentário
`/* ----- fila do dia ----- */`), adicionar:

```ts
/**
 * Regras automáticas que dependem só da MUDANÇA de status, chamada de dentro
 * do único ponto de escrita do app (useProspects.ts::update) — dispara igual
 * não importa se o status mudou por drag no Kanban, seletor mobile do card ou
 * pela ficha. Regras que também dependem de outro campo sendo editado junto
 * (protótipo, documentos+sinal, pagamento final) continuam no Drawer.
 */
export function statusTransitionPatch(
  previous: Prospect,
  patch: ProspectUpdate,
): ProspectUpdate {
  if (!patch.status || patch.status === previous.status) return patch
  const extra: ProspectUpdate = {}
  if (patch.status === 'contatado') extra.next_action_at = addBusinessDaysISO(3)
  if (patch.status === 'aguardando_pendencias') extra.next_action_at = addDaysISO(2)
  if (previous.status === 'em_analise' && patch.status === 'refinamento') {
    extra.revision_count = previous.revision_count + 1
  }
  return { ...extra, ...patch }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: PASS em todos os testes.

- [ ] **Step 10: Atualizar `FUNNEL`**

Em `src/lib/domain.ts`, trocar (bloco atual):

```ts
export const FUNNEL: ProspectStatus[] = [
  'novo',
  'prototipado',
  'contatado',
  'respondeu',
  'negociando',
  'fechado',
]
```

por:

```ts
export const FUNNEL: ProspectStatus[] = [
  'novo',
  'prototipado',
  'contatado',
  'briefing',
  'aguardando_pendencias',
  'refinamento',
  'em_analise',
  'entrega',
  'aguardando_pagamento',
  'finalizado',
]
```

(`CLOSED` e `ALL_STATUS` não mudam — continuam `['perdido', 'descartado']` e
`[...FUNNEL, ...CLOSED]`.)

- [ ] **Step 11: Atualizar `STATUS_LABEL`**

Trocar:

```ts
export const STATUS_LABEL: Record<ProspectStatus, string> = {
  novo: 'Novo',
  prototipado: 'Prototipado',
  contatado: 'Contatado',
  respondeu: 'Respondeu',
  negociando: 'Negociando',
  fechado: 'Fechado',
  perdido: 'Perdido',
  descartado: 'Descartado',
}
```

por:

```ts
export const STATUS_LABEL: Record<ProspectStatus, string> = {
  novo: 'Novo',
  prototipado: 'Prototipado',
  contatado: 'Contatado',
  briefing: 'Briefing',
  aguardando_pendencias: 'Aguardando cliente',
  refinamento: 'Refinamento',
  em_analise: 'Em análise',
  entrega: 'Entrega',
  aguardando_pagamento: 'Aguardando pagamento',
  finalizado: 'Finalizado',
  // Mortos: o enum do Postgres não permite remover valor sem recriar o tipo
  // inteiro. Nenhuma linha da tabela usa mais estes 3 status (migração em
  // 20260903120100_add_funil_pos_contato_columns_and_backfill.sql); ficam só
  // pra satisfazer o Record<ProspectStatus, string>, nunca renderizados
  // (fora de FUNNEL/ALL_STATUS).
  respondeu: 'Respondeu',
  negociando: 'Negociando',
  fechado: 'Fechado',
  perdido: 'Perdido',
  descartado: 'Descartado',
}
```

- [ ] **Step 12: Atualizar `STATUS_TONE`**

Trocar:

```ts
export const STATUS_TONE: Record<ProspectStatus, string> = {
  novo: 'bg-rule/60 text-ink',
  prototipado: 'bg-deep/8 text-deep',
  contatado: 'bg-deep/15 text-deep',
  respondeu: 'bg-deep/30 text-deep',
  negociando: 'bg-gold/25 text-gold',
  fechado: 'bg-deep text-card',
  perdido: 'bg-seal/12 text-seal',
  descartado: 'bg-rule/40 text-muted',
}
```

por:

```ts
export const STATUS_TONE: Record<ProspectStatus, string> = {
  novo: 'bg-rule/60 text-ink',
  prototipado: 'bg-deep/8 text-deep',
  contatado: 'bg-deep/15 text-deep',
  briefing: 'bg-deep/22 text-deep',
  aguardando_pendencias: 'bg-deep/30 text-deep',
  refinamento: 'bg-deep/40 text-deep',
  em_analise: 'bg-deep/50 text-deep',
  entrega: 'bg-gold/20 text-gold',
  aguardando_pagamento: 'bg-gold/35 text-gold',
  finalizado: 'bg-deep text-card',
  // Mortos — ver comentário em STATUS_LABEL.
  respondeu: 'bg-deep/30 text-deep',
  negociando: 'bg-gold/25 text-gold',
  fechado: 'bg-deep text-card',
  perdido: 'bg-seal/12 text-seal',
  descartado: 'bg-rule/40 text-muted',
}
```

- [ ] **Step 13: Corrigir `isOpen`**

Trocar:

```ts
export function isOpen(p: Prospect): boolean {
  return !['fechado', 'perdido', 'descartado'].includes(p.status)
}
```

por:

```ts
export function isOpen(p: Prospect): boolean {
  return !['finalizado', 'perdido', 'descartado'].includes(p.status)
}
```

`fechado` era o status terminal de sucesso antes desta mudança; `finalizado` é o novo
status terminal de sucesso (`fechado` nunca mais é usado — ver Task 2). Sem essa correção,
prospects `finalizado` continuariam contando como "em aberto" na aba Hoje.

- [ ] **Step 14: Rodar o typecheck e os testes**

```bash
npm run typecheck && npm test
```

Esperado: ambos passam sem erro.

- [ ] **Step 15: Commit**

```bash
git add src/lib/domain.ts src/lib/domain.test.ts package.json package-lock.json
git commit -m "feat: funil pós-contato em domain.ts, com regras automáticas centralizadas"
```

---

## Task 5: `useProspects.ts` — aplicar `statusTransitionPatch` centralizado

**Depends on:** Task 4.

**Files:**
- Modify: `src/lib/useProspects.ts`

**Interfaces:**
- Consumes: `statusTransitionPatch(previous: Prospect, patch: ProspectUpdate): ProspectUpdate`
  de `./domain` (Task 4).
- Produces: `update(id: string, patch: ProspectUpdate): Promise<boolean>` — mesma
  assinatura pública de hoje; internamente, quando `patch.status` muda o status de um
  prospect, o patch enviado ao Supabase e ao estado otimista passa a incluir os campos
  extras computados por `statusTransitionPatch`.

- [ ] **Step 1: Importar `statusTransitionPatch`**

Em `src/lib/useProspects.ts`, no topo do arquivo, trocar:

```ts
import type { Prospect, ProspectUpdate } from './database.types'
```

por:

```ts
import { statusTransitionPatch } from './domain'
import type { Prospect, ProspectUpdate } from './database.types'
```

- [ ] **Step 2: Calcular o patch final antes de escrever**

Trocar a função `update` inteira (hoje):

```ts
  const update = useCallback(async (id: string, patch: ProspectUpdate) => {
    let previous: Prospect | undefined

    setState((s) => {
      previous = s.prospects.find((p) => p.id === id)
      return {
        ...s,
        prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }
    })

    const { data, error } = await supabase
      .from('prospects')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
```

por:

```ts
  const update = useCallback(async (id: string, patch: ProspectUpdate) => {
    let previous: Prospect | undefined
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
```

(o resto da função — bloco `if (error)` de rollback e o `setState` de sucesso — não muda)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 4: Teste manual no navegador**

```bash
npm run dev
```

Abra `http://localhost:5173`, entre com login existente. Na aba Funil, arraste um card
`prototipado` (ou use "+ Novo prospect" pra criar um descartável) até a coluna
`Contatado`. Abra a ficha dele e confira que "Próxima ação" foi preenchida com a data 3
dias úteis à frente de hoje — confirma que a regra dispara mesmo vindo do drag do Kanban,
não só da ficha. Se você usou um prospect real, mova-o de volta pro status original ao
terminar o teste.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useProspects.ts
git commit -m "feat: centraliza regras automáticas de status em useProspects.update"
```

---

## Task 6: `Drawer.tsx` — campos de negócio, pagamento e "Cobrei de novo"

**Depends on:** Task 4, Task 5.

**Files:**
- Modify: `src/components/Drawer.tsx`

**Interfaces:**
- Consumes: `addBusinessDaysISO`, `addDaysISO` de `../lib/domain` (Task 4); `onUpdate` (=
  `update` de `useProspects`, já injetado via prop `onUpdate`).
- Produces: nenhuma interface nova consumida por outro componente — mudança é só de UI e
  do corpo do `patch` que `saveText()` já monta e envia via `onUpdate`.

- [ ] **Step 1: Importar os helpers de data novos**

Em `src/components/Drawer.tsx`, no import de `'../lib/domain'` (linhas 3-22), inserir
`addBusinessDaysISO` e `addDaysISO` entre `STATUS_LABEL` e `facebookHandle` (ordem
alfabética já usada no arquivo):

```ts
import {
  ALL_STATUS,
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  addBusinessDaysISO,
  addDaysISO,
  facebookHandle,
  facebookUrl,
  formatDateBR,
  formatWhatsapp,
  inactivityRisk,
  instagramHandle,
  instagramUrl,
  lastSocialActivityLabel,
  linkBioUrl,
  parsePhones,
  prototypeUrl,
  readEmail,
  websiteUrl,
  whatsappUrl,
} from '../lib/domain'
```

- [ ] **Step 2: Adicionar os estados dos campos novos**

Em `src/components/Drawer.tsx:75-88` (declarações de `useState` no corpo de `Drawer`),
adicionar logo após `const [nextAction, setNextAction] = useState(p.next_action_at ?? '')`:

```ts
  const [dealValue, setDealValue] = useState(p.deal_value?.toString() ?? '')
  const [docsReceived, setDocsReceived] = useState(p.docs_received)
  const [depositPaidAmount, setDepositPaidAmount] = useState(
    p.deposit_paid_amount?.toString() ?? '',
  )
  const [finalPaidAmount, setFinalPaidAmount] = useState(p.final_paid_amount?.toString() ?? '')
```

- [ ] **Step 3: Resetar os estados novos quando o prospect selecionado muda**

Em `src/components/Drawer.tsx:90-101`, dentro do `useEffect` que reseta os campos ao trocar
de prospect, adicionar as linhas de reset e as dependências novas:

```ts
  useEffect(() => {
    setNotes(p.notes ?? '')
    setApproach(p.approach_message ?? '')
    setEmail(p.email ?? '')
    setLanding(p.landing_page_url ?? '')
    setWhatsapp(p.whatsapp ?? '')
    setEditingWhatsapp(false)
    setStatus(p.status)
    setNextAction(p.next_action_at ?? '')
    setDealValue(p.deal_value?.toString() ?? '')
    setDocsReceived(p.docs_received)
    setDepositPaidAmount(p.deposit_paid_amount?.toString() ?? '')
    setFinalPaidAmount(p.final_paid_amount?.toString() ?? '')
    setSocialDrafts([])
    setEditingSocial({})
  }, [
    p.id,
    p.notes,
    p.approach_message,
    p.email,
    p.landing_page_url,
    p.whatsapp,
    p.status,
    p.next_action_at,
    p.deal_value,
    p.docs_received,
    p.deposit_paid_amount,
    p.final_paid_amount,
  ])
```

- [ ] **Step 4: Incluir os campos novos no cálculo de `dirty`**

Em `src/components/Drawer.tsx:125-134`, trocar:

```ts
  const dirty =
    notes !== (p.notes ?? '') ||
    approach !== (p.approach_message ?? '') ||
    email !== (p.email ?? '') ||
    landing !== (p.landing_page_url ?? '') ||
    whatsapp !== (p.whatsapp ?? '') ||
    status !== p.status ||
    nextAction !== (p.next_action_at ?? '') ||
    socialDrafts.some((d) => d.value.trim()) ||
    Object.keys(editingSocial).length > 0
```

por:

```ts
  const dirty =
    notes !== (p.notes ?? '') ||
    approach !== (p.approach_message ?? '') ||
    email !== (p.email ?? '') ||
    landing !== (p.landing_page_url ?? '') ||
    whatsapp !== (p.whatsapp ?? '') ||
    status !== p.status ||
    nextAction !== (p.next_action_at ?? '') ||
    dealValue !== (p.deal_value?.toString() ?? '') ||
    docsReceived !== p.docs_received ||
    depositPaidAmount !== (p.deposit_paid_amount?.toString() ?? '') ||
    finalPaidAmount !== (p.final_paid_amount?.toString() ?? '') ||
    socialDrafts.some((d) => d.value.trim()) ||
    Object.keys(editingSocial).length > 0
```

- [ ] **Step 5: Montar o patch novo e os avanços automáticos em `saveText`**

Em `src/components/Drawer.tsx:180-211`, trocar a função `saveText` inteira:

```ts
  async function saveText() {
    const patch: ProspectUpdate = {
      notes: notes || null,
      approach_message: approach || null,
      email: email.trim() || null,
      landing_page_url: landing.trim() || null,
      whatsapp: whatsapp.trim() || null,
      status,
      next_action_at: nextAction || null,
    }
    for (const d of socialDrafts) {
      const value = d.value.trim()
      if (value) patch[d.field] = normalizeSocialValue(d.field, value)
    }
    for (const [field, value] of Object.entries(editingSocial) as [SocialFieldKey, string][]) {
      const trimmed = value.trim()
      patch[field] = trimmed ? normalizeSocialValue(field, trimmed) : null
    }
    // Registrar o protótipo é o próprio ato de sair de "novo": quem tem página
    // publicada já está pronto para a abordagem, e reclassificar na mão seria
    // uma segunda etapa fácil de esquecer.
    if (patch.landing_page_url && status === 'novo') patch.status = 'prototipado'

    const ok = await onUpdate(p.id, patch)
    if (ok) {
      setSaved(true)
      setSocialDrafts([])
      setEditingSocial({})
      setEditingWhatsapp(false)
      setTimeout(() => setSaved(false), 1800)
    }
  }
```

por:

```ts
  async function saveText() {
    const patch: ProspectUpdate = {
      notes: notes || null,
      approach_message: approach || null,
      email: email.trim() || null,
      landing_page_url: landing.trim() || null,
      whatsapp: whatsapp.trim() || null,
      status,
      next_action_at: nextAction || null,
      deal_value: dealValue.trim() ? Number(dealValue) : null,
      docs_received: docsReceived,
      deposit_paid_amount: depositPaidAmount.trim() ? Number(depositPaidAmount) : null,
      final_paid_amount: finalPaidAmount.trim() ? Number(finalPaidAmount) : null,
    }
    for (const d of socialDrafts) {
      const value = d.value.trim()
      if (value) patch[d.field] = normalizeSocialValue(d.field, value)
    }
    for (const [field, value] of Object.entries(editingSocial) as [SocialFieldKey, string][]) {
      const trimmed = value.trim()
      patch[field] = trimmed ? normalizeSocialValue(field, trimmed) : null
    }
    // Registrar o protótipo é o próprio ato de sair de "novo": quem tem página
    // publicada já está pronto para a abordagem, e reclassificar na mão seria
    // uma segunda etapa fácil de esquecer.
    if (patch.landing_page_url && status === 'novo') patch.status = 'prototipado'
    // Mesma ideia: documentos + sinal recebidos é o próprio sinal de que dá
    // pra começar o refinamento. Pagamento final registrado fecha o card.
    if (status === 'aguardando_pendencias' && patch.docs_received && patch.deposit_paid_amount) {
      patch.status = 'refinamento'
    }
    if (status === 'aguardando_pagamento' && patch.final_paid_amount) {
      patch.status = 'finalizado'
    }

    const ok = await onUpdate(p.id, patch)
    if (ok) {
      setSaved(true)
      setSocialDrafts([])
      setEditingSocial({})
      setEditingWhatsapp(false)
      setTimeout(() => setSaved(false), 1800)
    }
  }
```

- [ ] **Step 6: Adicionar a seção "Cobrei de novo" e os campos de negócio na UI**

Em `src/components/Drawer.tsx`, a seção de Status/Próxima ação termina na linha 298
(`</section>`) e a seção seguinte é `{p.problem && (...)}` na linha 300. Inserir entre as
duas:

```tsx
          {(p.status === 'contatado' || p.status === 'aguardando_pendencias') && (
            <section>
              <h3 className="eyebrow">Cobrei de novo</h3>
              <button
                type="button"
                onClick={() => {
                  if (p.status === 'contatado') {
                    void onUpdate(p.id, {
                      next_action_at: addBusinessDaysISO(3),
                      contact_attempts: p.contact_attempts + 1,
                    })
                  } else {
                    void onUpdate(p.id, { next_action_at: addDaysISO(2) })
                  }
                }}
                className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
              >
                Cobrei de novo
              </button>
              {p.status === 'contatado' && (
                <p className="mt-1.5 font-mono text-[11px] text-muted">
                  {p.contact_attempts} tentativa{p.contact_attempts === 1 ? '' : 's'}
                </p>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h3 className="eyebrow">Negócio</h3>
            <label className="block">
              <span className="font-mono text-[11px] text-muted">Valor combinado (R$)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={docsReceived}
                onChange={(e) => setDocsReceived(e.target.checked)}
              />
              Documentos recebidos
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="font-mono text-[11px] text-muted">Sinal recebido (R$)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={depositPaidAmount}
                  onChange={(e) => setDepositPaidAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] text-muted">Pagamento final (R$)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={finalPaidAmount}
                  onChange={(e) => setFinalPaidAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
              </label>
            </div>
          </section>

```

(mantendo `{p.problem && (...)}` logo em seguida, sem alteração)

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 8: Teste manual no navegador**

```bash
npm run dev
```

Crie um prospect descartável (ou use um existente de teste) e:
1. Mova o status pra `aguardando_pendencias` (seletor da ficha) e salve — confirme que
   "Cobrei de novo" aparece e "Próxima ação" foi pra 2 dias corridos à frente.
2. Marque "Documentos recebidos" e preencha "Sinal recebido (R$)" com um valor, salve —
   confirme que o status virou `refinamento` sozinho.
3. Mova manualmente pra `aguardando_pagamento`, preencha "Pagamento final (R$)", salve —
   confirme que o status virou `finalizado` sozinho.
4. Com o status em `contatado`, clique "Cobrei de novo" — confirme que "Próxima ação"
   avançou 3 dias úteis e o contador de tentativas subiu, sem precisar clicar em "Salvar
   alterações".

Se usou um prospect real, restaure o status/campos originais ao terminar.

- [ ] **Step 9: Commit**

```bash
git add src/components/Drawer.tsx
git commit -m "feat: ficha ganha campos de negócio, pagamento e Cobrei de novo"
```

---

## Task 7: `Funil.tsx` — rolagem horizontal e contador de rodadas

**Depends on:** Task 4.

**Files:**
- Modify: `src/components/Funil.tsx`

**Interfaces:**
- Consumes: `p.status`, `p.revision_count` de `Prospect` (Task 3).
- Produces: nenhuma interface nova — mudança só de layout/exibição.

- [ ] **Step 1: Rolagem horizontal no lugar do grid de 6 colunas**

Em `src/components/Funil.tsx:31`, trocar:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
```

por:

```tsx
      <div className="flex gap-4 overflow-x-auto pb-2">
```

E, na mesma seção (linhas 43-45), trocar a className da coluna:

```tsx
              className={`flex min-h-40 flex-col rounded-sm border p-2 transition-colors ${
                over === status ? 'border-deep bg-deep/5' : 'border-rule bg-card/50'
              }`}
```

por:

```tsx
              className={`flex min-h-40 w-64 shrink-0 flex-col rounded-sm border p-2 transition-colors ${
                over === status ? 'border-deep bg-deep/5' : 'border-rule bg-card/50'
              }`}
```

(o fechamento do `<div className="grid ...">`/`</div>` na linha 72 não muda — só a tag de
abertura trocou de `grid` pra `flex`)

- [ ] **Step 2: Badge de rodadas no card de `refinamento`**

Em `src/components/Funil.tsx:137`, logo após `<BusinessStatusBadge prospect={p}
className="mt-1.5" />` e antes de `{p.next_action_at && (...)}` (linha 139), inserir:

```tsx
      {p.status === 'refinamento' && p.revision_count > 0 && (
        <p className="mt-1 font-mono text-[10px] text-gold">{p.revision_count + 1}ª rodada</p>
      )}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 4: Teste manual no navegador**

```bash
npm run dev
```

Na aba Funil, confirme visualmente que as 10 colunas aparecem lado a lado com rolagem
horizontal (sem quebrar linha/comprimir demais). Pegue um prospect de teste, mova pra
`refinamento`, depois `em_analise`, depois de volta pra `refinamento` — confirme que o
card mostra "2ª rodada". Restaure o prospect ao terminar se for um registro real.

- [ ] **Step 5: Commit**

```bash
git add src/components/Funil.tsx
git commit -m "feat: kanban com rolagem horizontal e contador de rodadas de revisão"
```

---

## Task 8: `README.md` — documentar o funil novo

**Depends on:** Task 4, Task 6, Task 7 (documenta o comportamento final).

**Files:**
- Modify: `README.md`

**Interfaces:** nenhuma — mudança só de documentação.

- [ ] **Step 1: Atualizar a seção "O funil"**

Em `README.md`, trocar o bloco (a partir de `## O funil`):

```markdown
## O funil

`novo → prototipado → contatado → respondeu → negociando → fechado`, mais
`perdido` e `descartado` fora da esteira.

**Prototipado** existe porque a criação do protótipo é feita por um agente à
parte: separa quem já tem página publicada — e portanto está pronto para a
abordagem — de quem ainda depende dessa etapa. O status muda sozinho ao salvar
uma URL em `landing_page_url` na ficha de um prospect ainda `novo`; o agente que
grava a URL direto no banco pode, em vez disso, escrever `status =
'prototipado'` junto. Na aba Hoje, quem está prototipado encabeça a fila "sem
próximo passo".
```

por:

```markdown
## O funil

`novo → prototipado → contatado → briefing → aguardando_pendencias →
refinamento → em_analise → entrega → aguardando_pagamento → finalizado`, mais
`perdido` e `descartado` fora da esteira (alcançáveis a partir de qualquer
etapa aberta, pelo seletor de status na ficha).

**Prototipado** existe porque a criação do protótipo é feita por um agente à
parte: separa quem já tem página publicada — e portanto está pronto para a
abordagem — de quem ainda depende dessa etapa. O status muda sozinho ao salvar
uma URL em `landing_page_url` na ficha de um prospect ainda `novo`; o agente que
grava a URL direto no banco pode, em vez disso, escrever `status =
'prototipado'` junto. Na aba Hoje, quem está prototipado encabeça a fila "sem
próximo passo".

**Do "contatado" em diante**, o funil segue o processo real de venda e entrega
do site, com algumas transições automáticas (função `statusTransitionPatch` em
`src/lib/domain.ts`, chamada de dentro de `useProspects.ts::update` — dispara
não importa se o status mudou pelo drag do Kanban, pelo seletor mobile do card
ou pela ficha):

- Entrar em `contatado` agenda a próxima ação pra 3 dias úteis à frente.
  Quando o cliente responde, o vendedor move manualmente pra `briefing` —
  conversa de escopo e do que falta ele enviar.
- Do briefing: `perdido` (cliente desistiu) ou `aguardando_pendencias`
  (interesse confirmado — entrar aqui agenda a próxima ação pra 2 dias à
  frente). Marcar "Documentos recebidos" e preencher o "Sinal recebido (R$)"
  na ficha avança sozinho pra `refinamento`, igual à regra do protótipo.
- `refinamento` → `em_analise`: cliente revisa o resultado. Pedidos de
  alteração voltam pra `refinamento` (contador de rodadas visível no card do
  Kanban, sem limite bloqueado pelo sistema) até ele aprovar.
- `em_analise` → `entrega` → `aguardando_pagamento`: finalização técnica
  (deploy, SEO, GA4 etc.) e cobrança do pagamento final. Preencher o
  "Pagamento final (R$)" na ficha avança sozinho pra `finalizado`.

O botão "Cobrei de novo" na ficha (visível em `contatado` e
`aguardando_pendencias`) reagenda a próxima ação pelo mesmo intervalo da
etapa sem precisar abrir o calendário, e conta as tentativas enquanto o
prospect está em `contatado`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: documenta o funil pós-contato no README"
```
