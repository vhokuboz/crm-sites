# Ciclo de vida do serviço (clientes ativos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controlar quais clientes estão ativos depois de `finalizado`: isenção de 6 meses, mensalidade por Pix manual, aviso de suspensão aos 7 dias de atraso e derrubada do site com um clique de confirmação.

**Architecture:** Seis colunas de data novas em `prospects`; o estado do serviço (`isento`, `renovacao`, `ativo`, `a_cobrar`, `suspender`, `suspenso`, `encerrado`) é **derivado** por funções puras em `src/lib/service.ts`, nunca armazenado. A UI ganha a aba "Clientes", uma seção "Serviço" na aba Hoje e um bloco "Serviço" na ficha, todos sobre os mesmos componentes (`ServiceActions`, `ClienteRow`). Suspender/encerrar passam por `useProspects.ts::update`, que já confirma e chama `encerrar-hospedagem`.

**Tech Stack:** React 19 + Vite + Tailwind 4, Supabase (Postgres + Edge Functions), testes com `node --experimental-strip-types --test`.

Spec: `docs/superpowers/specs/2026-10-07-ciclo-servico-clientes-design.md`

## Global Constraints

- Prazo de suspensão: **7 dias** de atraso (`SUSPEND_AFTER_DAYS = 7`). Isenção: **6 meses** (`FREE_MONTHS = 6`). Janela de renovação: **30 dias** (`RENEWAL_WINDOW_DAYS = 30`). Constantes nomeadas, nunca números soltos.
- Nenhum agendamento derruba site sozinho: suspender e encerrar são sempre ação do usuário com confirmação (checkbox no modal + `window.confirm` que `update` já exibe).
- O enum `prospect_status` **não muda**. O estado do serviço nunca é gravado.
- Colunas novas em inglês, tipo `date`: `service_started_at`, `free_until`, `paid_until`, `last_reminded_at`, `suspended_at`, `service_ended_at`. `monthly_fee` já existe e é reaproveitada.
- Datas são strings ISO `AAAA-MM-DD` manipuladas só com os helpers de `domain.ts`; nunca `new Date(string)` para comparar dias.
- "Lembrei o cliente" **não** mexe em `next_action_at` nem em `paid_until`. "Cobrei de novo" (follow-up de venda) não muda.
- Suspender = chamar `encerrar-hospedagem` (apaga o projeto Cloudflare Pages). Reativar só limpa `suspended_at` e mostra o lembrete de redeploy manual no `agent-okaisites`. Sem página de aviso de suspensão.
- Em `src/lib/*.ts`, imports de valores entre arquivos usam extensão `.ts` (`from './domain.ts'`), como em `contract.ts`, para rodar sob `node --experimental-strip-types`.
- Textos de interface em português com acentuação correta.
- Verificação a cada tarefa: `npm test` e `npm run typecheck`.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261007120000_add_service_cycle_to_prospects.sql` | criar | Colunas novas e backfill |
| `src/lib/database.types.ts` | modificar | Tipos das colunas novas |
| `src/lib/domain.ts` | modificar | `daysBetweenISO`, `addMonthsISO`; `closesHostedSite` cobre suspensão/encerramento |
| `src/lib/domain.test.ts` | modificar | Testes dos itens acima |
| `src/lib/service.ts` | criar | `serviceState`, patches, rótulos, resumo, grupos, fila |
| `src/lib/service.test.ts` | criar | Testes de `service.ts` |
| `src/lib/useProspects.ts` | modificar | Aplica `serviceStartPatch`; ajusta texto do `confirm` |
| `src/components/ServiceCloseModal.tsx` | criar | Modal de confirmação (suspender/encerrar) |
| `src/components/ServiceActions.tsx` | criar | Botões de ação por estado |
| `src/components/ClienteRow.tsx` | criar | Linha de cliente (badge, datas, ações) |
| `src/components/Clientes.tsx` | criar | Aba "Clientes" |
| `src/components/ServicoFila.tsx` | criar | Seção "Serviço" da aba Hoje |
| `src/components/Drawer.tsx` | modificar | Bloco "Serviço" na ficha |
| `src/components/Hoje.tsx` | modificar | Renderiza `ServicoFila` |
| `src/App.tsx` | modificar | Aba "Clientes" |
| `README.md` | modificar | Documenta o ciclo do serviço |

---

### Task 1: Migration e tipos

**Files:**
- Create: `supabase/migrations/20261007120000_add_service_cycle_to_prospects.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: colunas `service_started_at`, `free_until`, `paid_until`, `last_reminded_at`, `suspended_at`, `service_ended_at` (todas `string | null` em `Prospect`, opcionais em `ProspectUpdate`).

- [ ] **Step 1: Criar a migration**

```sql
-- Ciclo de vida do serviço depois de 'finalizado': 6 meses de mensalidade
-- isenta e, a partir daí, mensalidade paga por Pix manual. O estado (isento,
-- a cobrar, suspender...) é derivado dessas datas no app, não é guardado.
alter table public.prospects
  add column service_started_at date,
  add column free_until date,
  add column paid_until date,
  add column last_reminded_at date,
  add column suspended_at date,
  add column service_ended_at date;

-- Aproximação: não existe carimbo de quando o prospect virou 'finalizado',
-- então updated_at é o melhor palpite. Ajustável pela ficha.
update public.prospects
set service_started_at = updated_at::date,
    free_until = (updated_at::date + interval '6 months')::date
where status = 'finalizado';
```

- [ ] **Step 2: Atualizar os tipos**

Em `src/lib/database.types.ts`, no bloco `Row`, logo após `final_paid_amount: number | null`, acrescentar:

```ts
          free_until: string | null
          last_reminded_at: string | null
          paid_until: string | null
          service_ended_at: string | null
          service_started_at: string | null
          suspended_at: string | null
```

No bloco `Insert`, logo após `final_paid_amount?: number | null`, acrescentar:

```ts
          free_until?: string | null
          last_reminded_at?: string | null
          paid_until?: string | null
          service_ended_at?: string | null
          service_started_at?: string | null
          suspended_at?: string | null
```

- [ ] **Step 3: Conferir os `finalizado` existentes antes de aplicar**

Com a ferramenta `mcp__claude_ai_Supabase__execute_sql` (projeto `brwfbyxthuqwwwzlzbwj`), rodar só leitura:

```sql
select name, updated_at::date as finalizado_aprox from public.prospects where status = 'finalizado' order by updated_at;
```

Mostrar a lista ao usuário: as datas de `updated_at` viram o início do serviço. Se alguma estiver errada, anotar para ajustar pela ficha depois.

- [ ] **Step 4: Aplicar a migration (pedir confirmação ao usuário antes)**

É escrita em banco de produção. Depois do "sim" do usuário, aplicar com `mcp__claude_ai_Supabase__apply_migration` (nome `add_service_cycle_to_prospects`, mesmo SQL do Step 1). Conferir com `execute_sql`:

```sql
select count(*) filter (where free_until is not null) as com_isencao from public.prospects where status = 'finalizado';
```

Expected: igual ao número de `finalizado` listado no Step 3.

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add supabase/migrations/20261007120000_add_service_cycle_to_prospects.sql src/lib/database.types.ts
git commit -m "feat: adiciona colunas do ciclo de vida do serviço em prospects

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Helpers de data e `closesHostedSite` em domain.ts

**Files:**
- Modify: `src/lib/domain.ts` (`daysFromToday`, após `addBusinessDaysISO`, `closesHostedSite`)
- Test: `src/lib/domain.test.ts`

**Interfaces:**
- Produces: `daysBetweenISO(from: string, to: string): number`; `addMonthsISO(months: number, from?: string): string`; `closesHostedSite` passa a retornar `true` também quando o patch define `suspended_at` ou `service_ended_at` e o site ainda não foi derrubado.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/domain.test.ts`, trocar o bloco de import por:

```ts
import {
  addBusinessDaysISO,
  addDaysISO,
  addMonthsISO,
  canDiscard,
  closesHostedSite,
  daysBetweenISO,
  statusTransitionPatch,
} from './domain.ts'
```

E acrescentar ao final do arquivo:

```ts
test('addMonthsISO - soma 6 meses mantendo o dia', () => {
  assert.equal(addMonthsISO(6, '2026-09-12'), '2027-03-12')
})

test('addMonthsISO - dia 31 cai no último dia do mês mais curto', () => {
  assert.equal(addMonthsISO(1, '2026-01-31'), '2026-02-28')
})

test('addMonthsISO - ano bissexto', () => {
  assert.equal(addMonthsISO(1, '2028-01-31'), '2028-02-29')
})

test('addMonthsISO - vira o ano', () => {
  assert.equal(addMonthsISO(1, '2026-12-15'), '2027-01-15')
})

test('daysBetweenISO - positivo quando "to" é depois, negativo quando antes', () => {
  assert.equal(daysBetweenISO('2027-02-10', '2027-03-12'), 30)
  assert.equal(daysBetweenISO('2026-09-05', '2026-09-01'), -4)
})

function fakeService(patch: Record<string, unknown>): Prospect {
  return { status: 'finalizado', landing_page_url: 'https://x.pages.dev', ...patch } as unknown as Prospect
}

test('closesHostedSite - suspender serviço com site publicado: true', () => {
  assert.equal(closesHostedSite(fakeService({}), { suspended_at: '2027-04-20' }), true)
})

test('closesHostedSite - encerrar serviço com site publicado: true', () => {
  assert.equal(closesHostedSite(fakeService({}), { service_ended_at: '2027-04-20' }), true)
})

test('closesHostedSite - encerrar depois de suspenso: false (site já foi derrubado)', () => {
  const previous = fakeService({ suspended_at: '2027-04-20' })
  assert.equal(closesHostedSite(previous, { service_ended_at: '2027-05-01' }), false)
})

test('closesHostedSite - reativar (suspended_at null): false', () => {
  const previous = fakeService({ suspended_at: '2027-04-20' })
  assert.equal(closesHostedSite(previous, { suspended_at: null }), false)
})

test('closesHostedSite - suspender sem landing_page_url: false', () => {
  assert.equal(closesHostedSite(fakeService({ landing_page_url: null }), { suspended_at: '2027-04-20' }), false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --test src/lib/domain.test.ts`
Expected: FAIL (`addMonthsISO`/`daysBetweenISO` não exportados).

- [ ] **Step 3: Implementar em domain.ts**

Substituir `daysFromToday` por:

```ts
/** Dias de `from` até `to` (ambas ISO). Negativo = `to` antes de `from`. */
export function daysBetweenISO(from: string, to: string): number {
  const [a1, m1, d1] = from.split('-').map(Number)
  const [a2, m2, d2] = to.split('-').map(Number)
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)
  return Math.round(ms / 86_400_000)
}

/** Dias entre hoje e uma data ISO. Negativo = passado. */
export function daysFromToday(iso: string): number {
  return daysBetweenISO(todayISO(), iso)
}
```

Logo depois de `addBusinessDaysISO`, acrescentar:

```ts
/**
 * Soma meses mantendo o dia; se o mês de destino é mais curto, cai no último
 * dia dele (31/01 + 1 = 28/02).
 */
export function addMonthsISO(months: number, from = todayISO()): string {
  const [a, m, d] = from.split('-').map(Number)
  const lastDay = new Date(a, m - 1 + months + 1, 0).getDate()
  const date = new Date(a, m - 1 + months, Math.min(d, lastDay))
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mes}-${dia}`
}
```

Substituir `closesHostedSite` por:

```ts
/**
 * true quando a mudança vai apagar hospedagem publicada de verdade (preview
 * ou produção) no Cloudflare Pages: virar perdido/descartado, ou suspender/
 * encerrar o serviço de um cliente. Se o site já foi derrubado (suspenso),
 * não há o que apagar de novo.
 */
export function closesHostedSite(previous: Prospect, patch: ProspectUpdate): boolean {
  if (!previous.landing_page_url) return false
  const closesByStatus =
    !!patch.status && patch.status !== previous.status && CLOSED.includes(patch.status)
  const alreadyDown = !!previous.suspended_at || !!previous.service_ended_at
  const closesByService = !alreadyDown && (!!patch.suspended_at || !!patch.service_ended_at)
  return closesByStatus || closesByService
}
```

- [ ] **Step 4: Rodar tudo e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS (os testes antigos de `closesHostedSite` continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain.ts src/lib/domain.test.ts
git commit -m "feat: adiciona helpers de meses e fecha hospedagem ao suspender serviço

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `serviceState`

**Files:**
- Create: `src/lib/service.ts`
- Test: `src/lib/service.test.ts`

**Interfaces:**
- Consumes: `todayISO`, `daysBetweenISO` de `domain.ts` (Task 2).
- Produces (exports de `service.ts`): `FREE_MONTHS`, `RENEWAL_WINDOW_DAYS`, `SUSPEND_AFTER_DAYS`, `type ServiceState`, `type ServiceInput`, `serviceState(p: ServiceInput, hoje?: string): ServiceState | null`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/service.test.ts`:

```ts
/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serviceState, type ServiceInput } from './service.ts'

// Isenção de 6 meses: serviço começou em 12/09/2026, isento até 12/03/2027.
function svc(over: Partial<ServiceInput> = {}): ServiceInput {
  return {
    status: 'finalizado',
    service_started_at: '2026-09-12',
    free_until: '2027-03-12',
    paid_until: null,
    suspended_at: null,
    service_ended_at: null,
    ...over,
  }
}

test('serviceState - fora de finalizado ou sem início do serviço: null', () => {
  assert.equal(serviceState(svc({ status: 'entrega' }), '2026-12-01'), null)
  assert.equal(serviceState(svc({ service_started_at: null }), '2026-12-01'), null)
})

test('serviceState - dentro da isenção e longe do fim: isento', () => {
  assert.equal(serviceState(svc(), '2026-12-01'), 'isento')
})

test('serviceState - 31 dias antes do fim da isenção ainda é isento, 30 vira renovacao', () => {
  assert.equal(serviceState(svc(), '2027-02-09'), 'isento')
  assert.equal(serviceState(svc(), '2027-02-10'), 'renovacao')
})

test('serviceState - último dia da isenção sem decisão: renovacao', () => {
  assert.equal(serviceState(svc(), '2027-03-12'), 'renovacao')
})

test('serviceState - quem já optou por continuar segue isento até o fim da isenção', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-03-12' }), '2027-02-20'), 'isento')
})

test('serviceState - isenção acabou sem decisão: vence em free_until, a_cobrar no dia seguinte', () => {
  assert.equal(serviceState(svc(), '2027-03-13'), 'a_cobrar')
})

test('serviceState - optou por continuar e a isenção acabou: a_cobrar até o primeiro Pix', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-03-12' }), '2027-03-13'), 'a_cobrar')
})

test('serviceState - pago até o futuro ou até hoje: ativo', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-04-12' }), '2027-03-13'), 'ativo')
  assert.equal(serviceState(svc({ paid_until: '2027-04-12' }), '2027-04-12'), 'ativo')
})

test('serviceState - atraso de 1 a 7 dias: a_cobrar; 8 em diante: suspender', () => {
  const p = svc({ paid_until: '2027-04-12' })
  assert.equal(serviceState(p, '2027-04-13'), 'a_cobrar')
  assert.equal(serviceState(p, '2027-04-19'), 'a_cobrar')
  assert.equal(serviceState(p, '2027-04-20'), 'suspender')
})

test('serviceState - suspenso e encerrado vencem qualquer data; encerrado vence suspenso', () => {
  assert.equal(serviceState(svc({ suspended_at: '2027-04-20' }), '2026-12-01'), 'suspenso')
  assert.equal(serviceState(svc({ service_ended_at: '2027-05-01' }), '2026-12-01'), 'encerrado')
  assert.equal(
    serviceState(svc({ suspended_at: '2027-04-20', service_ended_at: '2027-05-01' }), '2027-06-01'),
    'encerrado',
  )
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --test src/lib/service.test.ts`
Expected: FAIL (`./service.ts` não existe).

- [ ] **Step 3: Implementar**

Criar `src/lib/service.ts`:

```ts
import type { Prospect } from './database.types.ts'
import { daysBetweenISO, todayISO } from './domain.ts'

/* ----------------------------------------------------------------- serviço ---
   Depois de `finalizado` o cliente tem 6 meses de mensalidade isenta; passado
   isso, paga mensalidade por Pix manual e o site cai 7 dias depois do
   vencimento. O estado é sempre DERIVADO das datas -- nunca gravado -- pra
   não ficar desatualizado quando ninguém mexe no registro.
*/

export const FREE_MONTHS = 6
export const RENEWAL_WINDOW_DAYS = 30
export const SUSPEND_AFTER_DAYS = 7

export type ServiceState =
  | 'isento'
  | 'renovacao'
  | 'ativo'
  | 'a_cobrar'
  | 'suspender'
  | 'suspenso'
  | 'encerrado'

export type ServiceInput = Pick<
  Prospect,
  'status' | 'service_started_at' | 'free_until' | 'paid_until' | 'suspended_at' | 'service_ended_at'
>

/**
 * `null` quando o prospect não é cliente (não está finalizado ou ainda não tem
 * o ciclo aberto). `suspender` = passou do prazo, só falta o clique do usuário.
 */
export function serviceState(p: ServiceInput, hoje = todayISO()): ServiceState | null {
  if (p.status !== 'finalizado' || !p.service_started_at || !p.free_until) return null
  if (p.service_ended_at) return 'encerrado'
  if (p.suspended_at) return 'suspenso'

  if (hoje <= p.free_until) {
    const restantes = daysBetweenISO(hoje, p.free_until)
    return !p.paid_until && restantes <= RENEWAL_WINDOW_DAYS ? 'renovacao' : 'isento'
  }

  // Quem não respondeu à renovação vence em free_until; quem já pagou, em paid_until.
  const atraso = daysBetweenISO(p.paid_until ?? p.free_until, hoje)
  if (atraso <= 0) return 'ativo'
  return atraso <= SUSPEND_AFTER_DAYS ? 'a_cobrar' : 'suspender'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/service.ts src/lib/service.test.ts
git commit -m "feat: deriva o estado do serviço a partir das datas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Patches (início do serviço, vai continuar, Pix) e fiação no `update`

**Files:**
- Modify: `src/lib/service.ts`, `src/lib/service.test.ts`, `src/lib/useProspects.ts`

**Interfaces:**
- Consumes: `addMonthsISO`, `todayISO` (`domain.ts`); `FREE_MONTHS` (Task 3).
- Produces: `serviceStartPatch(previous: Prospect, patch: ProspectUpdate): ProspectUpdate`; `continuePatch(p: Pick<Prospect,'free_until'>, fee: number): ProspectUpdate`; `pixReceivedPatch(p: Pick<Prospect,'paid_until'|'free_until'>): ProspectUpdate`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/service.test.ts`, trocar o import por:

```ts
import {
  continuePatch,
  pixReceivedPatch,
  serviceStartPatch,
  serviceState,
  type ServiceInput,
} from './service.ts'
import { addMonthsISO, todayISO } from './domain.ts'
import type { Prospect } from './database.types.ts'
```

E acrescentar ao final:

```ts
function prev(over: Record<string, unknown>): Prospect {
  return { status: 'aguardando_pagamento', service_started_at: null, ...over } as unknown as Prospect
}

test('serviceStartPatch - virar finalizado pela primeira vez abre o ciclo de 6 meses', () => {
  const patch = serviceStartPatch(prev({}), { status: 'finalizado' })
  assert.equal(patch.service_started_at, todayISO())
  assert.equal(patch.free_until, addMonthsISO(6, todayISO()))
  assert.equal(patch.status, 'finalizado')
})

test('serviceStartPatch - não sobrescreve ciclo já aberto nem refaz quando já era finalizado', () => {
  const aberto = prev({ service_started_at: '2026-09-12' })
  assert.deepEqual(serviceStartPatch(aberto, { status: 'finalizado' }), { status: 'finalizado' })
  const jaFinal = prev({ status: 'finalizado' })
  assert.deepEqual(serviceStartPatch(jaFinal, { status: 'finalizado' }), { status: 'finalizado' })
})

test('serviceStartPatch - patch sem status ou para outro status: intacto', () => {
  assert.deepEqual(serviceStartPatch(prev({}), { notes: 'x' }), { notes: 'x' })
  assert.deepEqual(serviceStartPatch(prev({}), { status: 'entrega' }), { status: 'entrega' })
})

test('serviceStartPatch - free_until explícito no patch vence', () => {
  const patch = serviceStartPatch(prev({}), { status: 'finalizado', free_until: '2030-01-01' })
  assert.equal(patch.free_until, '2030-01-01')
})

test('continuePatch - grava a mensalidade e cobra a partir do fim da isenção', () => {
  assert.deepEqual(continuePatch({ free_until: '2027-03-12' }, 89.9), {
    monthly_fee: 89.9,
    paid_until: '2027-03-12',
  })
})

test('pixReceivedPatch - soma 1 mês a partir do vencimento anterior, não de hoje', () => {
  assert.deepEqual(pixReceivedPatch({ paid_until: '2027-04-12', free_until: '2027-03-12' }), {
    paid_until: '2027-05-12',
  })
})

test('pixReceivedPatch - sem paid_until parte do fim da isenção', () => {
  assert.deepEqual(pixReceivedPatch({ paid_until: null, free_until: '2027-03-12' }), {
    paid_until: '2027-04-12',
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --test src/lib/service.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 3: Implementar**

Em `src/lib/service.ts`, trocar os imports do topo por:

```ts
import type { Prospect, ProspectUpdate } from './database.types.ts'
import { addMonthsISO, daysBetweenISO, todayISO } from './domain.ts'
```

E acrescentar ao final:

```ts
/* ---------------------------------------------------------------- patches --- */

/**
 * Abre o ciclo do serviço na primeira vez que o prospect vira `finalizado`.
 * Roda depois de `statusTransitionPatch`, dentro de `useProspects.ts::update`,
 * então vale igual venha da ficha ou do Kanban. O que o patch já traz vence.
 */
export function serviceStartPatch(previous: Prospect, patch: ProspectUpdate): ProspectUpdate {
  if (patch.status !== 'finalizado' || previous.status === 'finalizado' || previous.service_started_at) {
    return patch
  }
  const inicio = todayISO()
  return { service_started_at: inicio, free_until: addMonthsISO(FREE_MONTHS, inicio), ...patch }
}

/** Cliente decidiu continuar: guarda a mensalidade; a primeira cobrança vence quando a isenção acaba. */
export function continuePatch(p: Pick<Prospect, 'free_until'>, fee: number): ProspectUpdate {
  return { monthly_fee: fee, paid_until: p.free_until }
}

/**
 * Pix recebido: soma 1 mês ao vencimento anterior (e não à data do pagamento,
 * pra não deslocar o ciclo).
 * ponytail: 31/01 -> 28/02 -> 28/03 desliza o dia; aceitável pra cobrança manual.
 */
export function pixReceivedPatch(p: Pick<Prospect, 'paid_until' | 'free_until'>): ProspectUpdate {
  const base = p.paid_until ?? p.free_until
  return base ? { paid_until: addMonthsISO(1, base) } : {}
}
```

- [ ] **Step 4: Ligar no `update` e ajustar o texto do confirm**

Em `src/lib/useProspects.ts`, trocar o import:

```ts
import { closesHostedSite, statusTransitionPatch } from './domain'
import { serviceStartPatch } from './service'
```

Trocar a linha `finalPatch = previous ? statusTransitionPatch(previous, patch) : patch` por:

```ts
      finalPatch = previous ? serviceStartPatch(previous, statusTransitionPatch(previous, patch)) : patch
```

E o texto do `window.confirm` por (agora também vale para site de cliente em produção):

```ts
        `Isso vai apagar a hospedagem do site de "${previous.name}" no Cloudflare Pages. Confirmar?`,
```

- [ ] **Step 5: Rodar tudo e commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/service.ts src/lib/service.test.ts src/lib/useProspects.ts
git commit -m "feat: abre o ciclo do serviço ao finalizar e adiciona patches de continuar e Pix

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rótulos, resumo, grupos e fila

**Files:**
- Modify: `src/lib/service.ts`, `src/lib/service.test.ts`

**Interfaces:**
- Consumes: `serviceState`, `ServiceInput`, `ServiceState` (Task 3); `formatDateBR`, `daysBetweenISO`, `todayISO` (`domain.ts`).
- Produces:
  - `SERVICE_LABEL: Record<ServiceState, string>`, `SERVICE_TONE: Record<ServiceState, string>`
  - `serviceDateLabel(p: ServiceInput, hoje?: string): string`
  - `reminderLabel(p: Pick<Prospect,'last_reminded_at'>, hoje?: string): string | null`
  - `type ServiceGroupKey = 'suspender' | 'a_cobrar' | 'renovacao' | 'ativos' | 'inativos'`
  - `serviceGroups(prospects: Prospect[], hoje?: string): { key: ServiceGroupKey; items: Prospect[] }[]` (só grupos não vazios, nesta ordem)
  - `serviceSummary(prospects: Prospect[], hoje?: string): { ativos: number; isentos: number; pagantes: number; mrr: number }`
  - `serviceQueue(prospects: Prospect[], hoje?: string): Prospect[]` (suspender, a_cobrar, renovacao; mais urgente primeiro)

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/service.test.ts`, trocar o import de `./service.ts` por:

```ts
import {
  continuePatch,
  pixReceivedPatch,
  reminderLabel,
  serviceDateLabel,
  serviceGroups,
  serviceQueue,
  serviceStartPatch,
  serviceState,
  serviceSummary,
  type ServiceInput,
} from './service.ts'
```

E acrescentar ao final:

```ts
test('serviceDateLabel - cada estado diz a data que importa', () => {
  assert.equal(serviceDateLabel(svc(), '2026-12-01'), 'isento até 12/03/27')
  const pago = svc({ paid_until: '2027-04-12' })
  assert.equal(serviceDateLabel(pago, '2027-04-07'), 'vence em 5 dias')
  assert.equal(serviceDateLabel(pago, '2027-04-12'), 'vence hoje')
  assert.equal(serviceDateLabel(pago, '2027-04-13'), 'venceu há 1 dia')
  assert.equal(serviceDateLabel(pago, '2027-04-15'), 'venceu há 3 dias')
  assert.equal(serviceDateLabel(svc({ suspended_at: '2027-04-20' }), '2027-05-01'), 'suspenso em 20/04/27')
  assert.equal(serviceDateLabel(svc({ service_ended_at: '2027-05-01' }), '2027-06-01'), 'encerrado em 01/05/27')
})

test('reminderLabel - hoje, há N dias e sem lembrete', () => {
  assert.equal(reminderLabel({ last_reminded_at: null }, '2027-04-15'), null)
  assert.equal(reminderLabel({ last_reminded_at: '2027-04-15' }, '2027-04-15'), 'lembrado hoje')
  assert.equal(reminderLabel({ last_reminded_at: '2027-04-13' }, '2027-04-15'), 'lembrado há 2 dias')
})

function cli(id: string, over: Partial<ServiceInput> & { monthly_fee?: number | null } = {}): Prospect {
  return { id, name: id, monthly_fee: null, last_reminded_at: null, ...svc(over) } as unknown as Prospect
}

// Em 2027-04-20: a (pago até 12/04, 8 dias de atraso) = suspender; b (paga até 15/04) = a_cobrar;
// c (isento sem decisão, longe do fim) = isento; d (pago até 12/05) = ativo; e suspenso; f encerrado.
const HOJE = '2027-04-20'
const base = () => [
  cli('a', { paid_until: '2027-04-12' }),
  cli('b', { paid_until: '2027-04-15' }),
  cli('c', { free_until: '2027-10-01' }),
  cli('d', { paid_until: '2027-05-12', monthly_fee: 90 }),
  cli('e', { suspended_at: '2027-04-18' }),
  cli('f', { service_ended_at: '2027-04-10' }),
]

test('serviceGroups - agrupa por urgência e ordena pelo vencimento mais antigo', () => {
  const groups = serviceGroups(base(), HOJE)
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((p) => p.id)]),
    [
      ['suspender', ['a']],
      ['a_cobrar', ['b']],
      ['ativos', ['d', 'c']],
      ['inativos', ['e', 'f']],
    ],
  )
})

test('serviceGroups - ignora quem não é cliente', () => {
  const naoCliente = { id: 'x', name: 'x', status: 'entrega' } as unknown as Prospect
  assert.deepEqual(serviceGroups([naoCliente], HOJE), [])
})

test('serviceSummary - ativos exclui suspenso/encerrado; mrr soma só pagantes em dia', () => {
  assert.deepEqual(serviceSummary(base(), HOJE), { ativos: 4, isentos: 1, pagantes: 1, mrr: 90 })
})

test('serviceQueue - suspender, depois a_cobrar, depois renovacao', () => {
  const lista = [...base(), cli('g', { free_until: '2027-05-01' })]
  assert.deepEqual(serviceQueue(lista, HOJE).map((p) => p.id), ['a', 'b', 'g'])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --test src/lib/service.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 3: Implementar**

Em `src/lib/service.ts`, trocar o import de domain por:

```ts
import { addMonthsISO, daysBetweenISO, formatDateBR, todayISO } from './domain.ts'
```

E acrescentar ao final:

```ts
/* ------------------------------------------------------------ apresentação --- */

export const SERVICE_LABEL: Record<ServiceState, string> = {
  isento: 'Isento',
  renovacao: 'Renovação',
  ativo: 'Ativo',
  a_cobrar: 'A cobrar',
  suspender: 'Suspender',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
}

export const SERVICE_TONE: Record<ServiceState, string> = {
  isento: 'bg-deep/15 text-deep',
  renovacao: 'bg-gold/25 text-gold',
  ativo: 'bg-deep text-card',
  a_cobrar: 'bg-gold/35 text-gold',
  suspender: 'bg-seal/12 text-seal',
  suspenso: 'bg-seal/12 text-seal',
  encerrado: 'bg-rule/40 text-muted',
}

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)

/** A data que importa em cada estado: "isento até 12/03/27", "venceu há 3 dias"... */
export function serviceDateLabel(p: ServiceInput, hoje = todayISO()): string {
  const state = serviceState(p, hoje)
  if (!state) return ''
  if (state === 'encerrado') return `encerrado em ${formatDateBR(p.service_ended_at)}`
  if (state === 'suspenso') return `suspenso em ${formatDateBR(p.suspended_at)}`
  if (state === 'isento' || state === 'renovacao') return `isento até ${formatDateBR(p.free_until)}`
  const falta = daysBetweenISO(hoje, (p.paid_until ?? p.free_until) as string)
  if (falta === 0) return 'vence hoje'
  return falta > 0 ? `vence em ${dias(falta)}` : `venceu há ${dias(-falta)}`
}

export function reminderLabel(
  p: Pick<Prospect, 'last_reminded_at'>,
  hoje = todayISO(),
): string | null {
  if (!p.last_reminded_at) return null
  const atras = daysBetweenISO(p.last_reminded_at, hoje)
  return atras === 0 ? 'lembrado hoje' : `lembrado há ${dias(atras)}`
}

/* ------------------------------------------------------ listas e resumos --- */

export type ServiceGroupKey = 'suspender' | 'a_cobrar' | 'renovacao' | 'ativos' | 'inativos'

const GROUP_OF: Record<ServiceState, ServiceGroupKey> = {
  suspender: 'suspender',
  a_cobrar: 'a_cobrar',
  renovacao: 'renovacao',
  isento: 'ativos',
  ativo: 'ativos',
  suspenso: 'inativos',
  encerrado: 'inativos',
}

const GROUP_ORDER: ServiceGroupKey[] = ['suspender', 'a_cobrar', 'renovacao', 'ativos', 'inativos']

/** Vencimento mais antigo primeiro: pra quem está atrasado, é quem está há mais tempo. */
const byDue = (a: Prospect, b: Prospect) =>
  (a.paid_until ?? a.free_until ?? '').localeCompare(b.paid_until ?? b.free_until ?? '')

export function serviceGroups(
  prospects: Prospect[],
  hoje = todayISO(),
): { key: ServiceGroupKey; items: Prospect[] }[] {
  const byKey = new Map<ServiceGroupKey, Prospect[]>()
  for (const p of prospects) {
    const state = serviceState(p, hoje)
    if (!state) continue
    const key = GROUP_OF[state]
    byKey.set(key, [...(byKey.get(key) ?? []), p])
  }
  return GROUP_ORDER.filter((k) => byKey.has(k)).map((key) => ({
    key,
    items: (byKey.get(key) as Prospect[]).sort(byDue),
  }))
}

/** `ativos` = no ar (tudo menos suspenso/encerrado); `pagantes` = em dia depois da isenção. */
export function serviceSummary(prospects: Prospect[], hoje = todayISO()) {
  let ativos = 0
  let isentos = 0
  let pagantes = 0
  let mrr = 0
  for (const p of prospects) {
    const state = serviceState(p, hoje)
    if (!state || state === 'suspenso' || state === 'encerrado') continue
    ativos++
    if (state === 'isento' || state === 'renovacao') isentos++
    if (state === 'ativo') {
      pagantes++
      mrr += p.monthly_fee ?? 0
    }
  }
  return { ativos, isentos, pagantes, mrr }
}

const QUEUE_ORDER: ServiceState[] = ['suspender', 'a_cobrar', 'renovacao']

/** Quem exige ação hoje, mais urgente primeiro. */
export function serviceQueue(prospects: Prospect[], hoje = todayISO()): Prospect[] {
  return prospects
    .filter((p) => QUEUE_ORDER.includes(serviceState(p, hoje) as ServiceState))
    .sort(
      (a, b) =>
        QUEUE_ORDER.indexOf(serviceState(a, hoje) as ServiceState) -
          QUEUE_ORDER.indexOf(serviceState(b, hoje) as ServiceState) || byDue(a, b),
    )
}
```

- [ ] **Step 4: Rodar tudo e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS. Se o teste de `serviceSummary` falhar por causa do helper `cli` com `monthly_fee`, conferir que a linha `lista[3] = {...}` (já no teste) define `monthly_fee: 90`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/service.ts src/lib/service.test.ts
git commit -m "feat: adiciona rótulos, grupos, resumo e fila do serviço

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Componentes de ação (modal, ações, linha de cliente)

**Files:**
- Create: `src/components/ServiceCloseModal.tsx`, `src/components/ServiceActions.tsx`, `src/components/ClienteRow.tsx`

**Interfaces:**
- Consumes: `serviceState`, `continuePatch`, `pixReceivedPatch`, `serviceDateLabel`, `reminderLabel`, `SERVICE_LABEL`, `SERVICE_TONE` (`service.ts`); `todayISO` (`domain.ts`).
- Produces:
  - `ServiceCloseModal` props `{ prospect: Prospect; kind: 'suspender' | 'encerrar'; onConfirm: () => Promise<unknown> | void; onClose: () => void }`
  - `ServiceActions` props `{ prospect: Prospect; onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>; onModalChange?: (open: boolean) => void }`
  - `ClienteRow` props `{ prospect: Prospect; onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>; onOpen: (p: Prospect) => void }`

- [ ] **Step 1: Criar `ServiceCloseModal.tsx`** (mesmo padrão do `DiscardModal`, sem campo de nota)

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import type { Prospect } from '../lib/database.types'

type Props = {
  prospect: Prospect
  kind: 'suspender' | 'encerrar'
  onConfirm: () => Promise<unknown> | void
  onClose: () => void
}

const COPY = {
  suspender: {
    eyebrow: 'Suspender site',
    title: (name: string) => `Suspender o site de ${name}?`,
    body: 'Remove a hospedagem do Cloudflare Pages. Se o cliente pagar depois, é preciso rodar o deploy de novo no agent-okaisites.',
    check: 'Tenho certeza que quero derrubar o site',
    action: 'Suspender site',
    busy: 'Suspendendo…',
  },
  encerrar: {
    eyebrow: 'Encerrar cliente',
    title: (name: string) => `Encerrar ${name}?`,
    body: 'Marca o serviço como encerrado de vez e remove a hospedagem, se ainda estiver no ar.',
    check: 'Tenho certeza que quero encerrar este cliente',
    action: 'Encerrar cliente',
    busy: 'Encerrando…',
  },
} as const

/** Confirmação dupla (checkbox + o confirm do `update`), como o `DiscardModal`. */
export function ServiceCloseModal({ prospect, kind, onConfirm, onClose }: Props) {
  const copy = COPY[kind]
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    await onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title(prospect.name)}
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              {copy.title(prospect.name)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-rule px-2.5 py-1 font-mono text-[11px] hover:bg-card"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-muted">{copy.body}</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {copy.check}
          </label>
          <button
            type="submit"
            disabled={!confirmed || busy}
            className="w-full rounded-sm bg-seal px-4 py-2.5 font-display text-sm font-semibold text-card transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? copy.busy : copy.action}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `ServiceActions.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { todayISO } from '../lib/domain'
import { continuePatch, pixReceivedPatch, serviceState } from '../lib/service'
import { ServiceCloseModal } from './ServiceCloseModal'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  /** A ficha usa isto pra não fechar inteira com o Escape de um modal aberto por cima. */
  onModalChange?: (open: boolean) => void
}

const BTN = 'rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card disabled:opacity-40'
const BTN_DANGER = 'rounded-sm border border-seal/40 px-3 py-1.5 font-mono text-[11px] text-seal hover:bg-seal/10'

/** Botões do ciclo do serviço, conforme o estado derivado do cliente. */
export function ServiceActions({ prospect: p, onUpdate, onModalChange }: Props) {
  const state = serviceState(p)
  const [fee, setFee] = useState(p.monthly_fee?.toString() ?? '')
  const [modal, setModal] = useState<'suspender' | 'encerrar' | null>(null)

  useEffect(() => {
    onModalChange?.(modal !== null)
  }, [modal, onModalChange])

  if (!state || state === 'encerrado') return null

  const feeValue = Number(fee)

  function handleContinue(e: FormEvent) {
    e.preventDefault()
    if (feeValue > 0) void onUpdate(p.id, continuePatch(p, feeValue))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === 'suspenso' ? (
        <>
          <button type="button" className={BTN} onClick={() => void onUpdate(p.id, { suspended_at: null })}>
            Reativar
          </button>
          <p className="w-full font-mono text-[11px] text-muted">
            Site derrubado. Depois de reativar, rode o deploy de {p.slug ?? 'este cliente'} no
            agent-okaisites (workflow manual).
          </p>
        </>
      ) : (
        <>
          {p.paid_until === null ? (
            <form onSubmit={handleContinue} className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="Mensalidade (R$)"
                aria-label="Mensalidade (R$)"
                className="w-36 rounded-sm border border-rule bg-card px-2 py-1.5 text-sm"
              />
              <button type="submit" disabled={!(feeValue > 0)} className={BTN}>
                Vai continuar
              </button>
            </form>
          ) : (
            <button type="button" className={BTN} onClick={() => void onUpdate(p.id, pixReceivedPatch(p))}>
              Pix recebido
            </button>
          )}
          {(state === 'renovacao' || state === 'a_cobrar' || state === 'suspender') && (
            <button
              type="button"
              className={BTN}
              onClick={() => void onUpdate(p.id, { last_reminded_at: todayISO() })}
            >
              Lembrei o cliente
            </button>
          )}
          {state === 'suspender' && (
            <button type="button" className={BTN_DANGER} onClick={() => setModal('suspender')}>
              Suspender site
            </button>
          )}
        </>
      )}
      <button type="button" className={BTN_DANGER} onClick={() => setModal('encerrar')}>
        Encerrar cliente
      </button>

      {modal && (
        <ServiceCloseModal
          prospect={p}
          kind={modal}
          onConfirm={() =>
            onUpdate(p.id, modal === 'suspender' ? { suspended_at: todayISO() } : { service_ended_at: todayISO() })
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Criar `ClienteRow.tsx`**

```tsx
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { SERVICE_LABEL, SERVICE_TONE, reminderLabel, serviceDateLabel, serviceState } from '../lib/service'
import { ServiceActions } from './ServiceActions'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

/** Uma linha de cliente: badge do estado, a data que importa e as ações do estado. */
export function ClienteRow({ prospect: p, onUpdate, onOpen }: Props) {
  const state = serviceState(p)
  if (!state) return null
  const detalhes = [
    serviceDateLabel(p),
    reminderLabel(p),
    p.monthly_fee ? `R$ ${p.monthly_fee}/mês` : null,
  ].filter(Boolean)

  return (
    <article className="rounded-sm border border-rule bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(p)} className="min-w-0 text-left">
          <h3 className="truncate font-display text-base font-semibold tracking-tight">{p.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{detalhes.join(' · ')}</p>
        </button>
        <span
          className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SERVICE_TONE[state]}`}
        >
          {SERVICE_LABEL[state]}
        </span>
      </div>
      <div className="mt-3">
        <ServiceActions prospect={p} onUpdate={onUpdate} />
      </div>
    </article>
  )
}
```

- [ ] **Step 4: Typecheck e commit**

Run: `npm run typecheck`
Expected: sem erros (`noUnusedLocals` está ligado: nenhum import sobrando).

```bash
git add src/components/ServiceCloseModal.tsx src/components/ServiceActions.tsx src/components/ClienteRow.tsx
git commit -m "feat: adiciona ações do ciclo do serviço e linha de cliente

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bloco "Serviço" na ficha (Drawer)

**Files:**
- Modify: `src/components/Drawer.tsx`

**Interfaces:**
- Consumes: `ServiceActions` com `onModalChange` (Task 6); `serviceState`, `serviceDateLabel`, `reminderLabel`, `SERVICE_LABEL`, `SERVICE_TONE` (`service.ts`).

- [ ] **Step 1: Imports**

Depois da linha `import { supabase } from '../lib/supabase'`, acrescentar:

```ts
import {
  SERVICE_LABEL,
  SERVICE_TONE,
  reminderLabel,
  serviceDateLabel,
  serviceState,
} from '../lib/service'
```

E depois de `import { ImagePreviewModal } from './ImagePreviewModal'`:

```ts
import { ServiceActions } from './ServiceActions'
```

- [ ] **Step 2: Estado do modal e Escape**

Depois de `const [discardOpen, setDiscardOpen] = useState(false)`:

```ts
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
```

Trocar a linha do Escape:

```ts
      if (e.key === 'Escape' && previewIndex === null && !contractModalOpen && !discardOpen && !serviceModalOpen) onClose()
```

e as dependências do efeito:

```ts
  }, [onClose, previewIndex, contractModalOpen, discardOpen, serviceModalOpen])
```

- [ ] **Step 3: Estado derivado**

Depois de `const risk = inactivityRisk(p)`:

```ts
  const service = serviceState(p)
```

- [ ] **Step 4: Seção na ficha**

Imediatamente antes de `<section className="space-y-3">` cujo `<h3 className="eyebrow">Negócio</h3>` (logo depois do bloco "Cobrei de novo"), inserir:

```tsx
          {service && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <h3 className="eyebrow">Serviço</h3>
                <span
                  className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SERVICE_TONE[service]}`}
                >
                  {SERVICE_LABEL[service]}
                </span>
              </div>
              <p className="font-mono text-[11px] text-muted">
                {[serviceDateLabel(p), reminderLabel(p), p.monthly_fee ? `R$ ${p.monthly_fee}/mês` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <ServiceActions prospect={p} onUpdate={onUpdate} onModalChange={setServiceModalOpen} />
            </section>
          )}

```

- [ ] **Step 5: Verificar e commit**

Run: `npm run typecheck && npm run build`
Expected: sem erros; build gera `dist/`.

Verificação manual: `npm run dev`, abrir a ficha de um cliente `finalizado` → aparece o bloco "Serviço" com badge e botões; abrir o modal "Encerrar cliente" e apertar Escape fecha só o modal, não a ficha.

```bash
git add src/components/Drawer.tsx
git commit -m "feat: mostra o bloco de serviço na ficha do cliente

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Aba "Clientes"

**Files:**
- Create: `src/components/Clientes.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `serviceGroups`, `serviceSummary`, `type ServiceGroupKey` (Task 5); `ClienteRow` (Task 6).
- Produces: `Clientes` props `{ prospects: Prospect[]; onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>; onOpen: (p: Prospect) => void }`.

- [ ] **Step 1: Criar `Clientes.tsx`**

```tsx
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { serviceGroups, serviceSummary, type ServiceGroupKey } from '../lib/service'
import { ClienteRow } from './ClienteRow'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

const GROUP_TITLE: Record<ServiceGroupKey, string> = {
  suspender: 'Suspender',
  a_cobrar: 'A cobrar',
  renovacao: 'Renovação',
  ativos: 'Ativos',
  inativos: 'Suspensos e encerrados',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Clientes({ prospects, onUpdate, onOpen }: Props) {
  const groups = serviceGroups(prospects)
  const { ativos, isentos, pagantes, mrr } = serviceSummary(prospects)

  if (groups.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-rule px-4 py-10 text-center text-sm text-muted">
        Nenhum cliente ainda. Quem chega em Finalizado aparece aqui.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <p className="font-mono text-[12px] text-muted">
        {ativos} ativos · {isentos} isentos · {pagantes} pagantes · R$ {brl(mrr)}/mês
      </p>

      {groups.map(({ key, items }) => {
        const rows = (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <ClienteRow key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
            ))}
          </div>
        )
        const title = (
          <>
            <h2 className="font-display text-lg font-semibold tracking-tight">{GROUP_TITLE[key]}</h2>
            <span className={`font-mono text-xs ${key === 'suspender' ? 'text-seal' : 'text-muted'}`}>
              {items.length}
            </span>
          </>
        )
        // Suspensos/encerrados ficam recolhidos: já não pedem ação.
        return key === 'inativos' ? (
          <details key={key}>
            <summary className="flex cursor-pointer items-baseline gap-2">{title}</summary>
            {rows}
          </details>
        ) : (
          <section key={key}>
            <div className="flex items-baseline gap-2">{title}</div>
            {rows}
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Ligar no `App.tsx`**

Importar depois de `import { Base } from './components/Base'`:

```ts
import { Clientes } from './components/Clientes'
```

Trocar `const TABS = ['Hoje', 'Funil', 'Base'] as const` por:

```ts
const TABS = ['Hoje', 'Funil', 'Clientes', 'Base'] as const
```

Trocar o trecho do render:

```tsx
        ) : tab === 'Funil' ? (
          <Funil prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : tab === 'Clientes' ? (
          <Clientes prospects={prospects} onUpdate={update} onOpen={setOpen} />
        ) : (
          <Base onOpen={setOpen} />
        )}
```

- [ ] **Step 3: Verificar e commit**

Run: `npm run typecheck && npm run build`
Expected: sem erros.

Verificação manual: `npm run dev` → aba "Clientes" lista os `finalizado` agrupados, com o resumo no topo; "Suspensos e encerrados" começa recolhido; "Pix recebido" em um cliente `a_cobrar` empurra o vencimento e ele muda de grupo.

```bash
git add src/components/Clientes.tsx src/App.tsx
git commit -m "feat: adiciona a aba Clientes com grupos por urgência e resumo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Seção "Serviço" na aba Hoje e documentação

**Files:**
- Create: `src/components/ServicoFila.tsx`
- Modify: `src/components/Hoje.tsx`, `README.md`

**Interfaces:**
- Consumes: `serviceQueue` (Task 5); `ClienteRow` (Task 6).
- Produces: `ServicoFila` props `{ prospects: Prospect[]; onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>; onOpen: (p: Prospect) => void }`; renderiza `null` quando a fila é vazia.

- [ ] **Step 1: Criar `ServicoFila.tsx`**

```tsx
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { serviceQueue } from '../lib/service'
import { ClienteRow } from './ClienteRow'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

/** Fila de serviço do dia: suspensões pendentes, cobranças e renovações. Some quando não há nada. */
export function ServicoFila({ prospects, onUpdate, onOpen }: Props) {
  const queue = serviceQueue(prospects)
  if (queue.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">Serviço</h2>
        <span className="font-mono text-xs text-seal">{queue.length}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">Suspensões pendentes, cobranças e renovações.</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {queue.map((p) => (
          <ClienteRow key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Ligar no `Hoje.tsx`**

Importar depois de `import { ProspectCard } from './ProspectCard'`:

```ts
import { ServicoFila } from './ServicoFila'
```

Dentro de `<div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">`, como primeiro filho (antes de `<Section title="Atrasados" …>`):

```tsx
        <ServicoFila prospects={prospects} onUpdate={onUpdate} onOpen={onOpen} />

```

- [ ] **Step 3: Documentar no README**

Em `README.md`, ao final da seção "O funil" (depois do parágrafo que termina em "avança sozinho pra `finalizado`."), acrescentar:

```markdown

### Depois de finalizado: o ciclo do serviço

`finalizado` abre o ciclo do serviço (`service_started_at`): **6 meses de
mensalidade isenta** (`free_until`) e, se o cliente optar por continuar,
mensalidade (`monthly_fee`) cobrada por Pix manual. O estado — `isento`,
`renovacao` (30 dias antes do fim da isenção), `ativo`, `a_cobrar`,
`suspender` (mais de 7 dias de atraso), `suspenso`, `encerrado` — é **derivado
das datas** em `src/lib/service.ts` (`serviceState`), nunca gravado.

- "Vai continuar" define a mensalidade; "Pix recebido" soma 1 mês a `paid_until`;
  "Lembrei o cliente" só marca `last_reminded_at`.
- Aos 7 dias de atraso o cliente vira `suspender`: o sistema só avisa. "Suspender
  site" (confirmação dupla) grava `suspended_at` e chama `encerrar-hospedagem`.
  "Reativar" só limpa a marca: depois é preciso rodar o deploy manual no
  `agent-okaisites`.
- Aba **Clientes** lista tudo por urgência; a aba **Hoje** mostra a seção
  "Serviço" com renovações, cobranças e suspensões pendentes.
```

- [ ] **Step 4: Verificação final e commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: tudo verde.

Verificação manual (`npm run dev`): cliente com atraso de mais de 7 dias aparece em Hoje → "Serviço" com botão "Suspender site"; confirmar pede o checkbox e depois o `confirm` do navegador; ao confirmar, o cliente vai para "Suspensos e encerrados" e o botão "Reativar" mostra o lembrete de redeploy. Cliente `finalizado` sem `landing_page_url` apenas grava a data (nenhuma chamada de hospedagem).

```bash
git add src/components/ServicoFila.tsx src/components/Hoje.tsx README.md
git commit -m "feat: mostra a fila de serviço na aba Hoje e documenta o ciclo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Cobertura do spec:**
- Colunas e backfill (conferir antes de aplicar) → Task 1.
- Estado derivado e regras de fronteira (7 dias, 30 dias, 6 meses, isento mesmo após optar, vencimento em `free_until` sem decisão) → Tasks 2–3.
- Abrir ciclo ao finalizar, vai continuar, Pix (soma a partir do vencimento), lembrete, suspender, encerrar, reativar → Tasks 4 e 6.
- Suspender/encerrar derruba o site só se houver `landing_page_url`, não repete se já derrubado, falha de rede mostra erro → Task 2 (`closesHostedSite`) + comportamento já existente de `update`.
- Aba Clientes, resumo `ativos · isentos · pagantes · R$/mês`, recolhimento dos inativos → Task 8. Seção "Serviço" em Hoje → Task 9. Bloco na ficha → Task 7.
- Testes dos limites (último dia, 30 dias, atraso 0/1/7/8, suspenso/encerrado, soma de meses 31/01 e bissexto) → Tasks 2, 3, 5.
- Fora de escopo respeitado: sem cobrança automática, sem tabela de pagamentos, sem página de suspensão, sem agendamento.

**Desvios do spec (já refletidos nele):** a lógica mora em `src/lib/service.ts` (não em `domain.ts`) e o teste em `service.test.ts`.

**Consistência de tipos:** `ServiceInput`, `ServiceState`, `serviceState`, `serviceStartPatch`, `continuePatch`, `pixReceivedPatch`, `serviceGroups`, `serviceSummary`, `serviceQueue`, `serviceDateLabel`, `reminderLabel`, `SERVICE_LABEL`, `SERVICE_TONE`, `ServiceGroupKey` têm a mesma grafia em todas as tarefas. `ServiceCloseModal.onConfirm` aceita `Promise<unknown>` para receber o `Promise<boolean>` de `onUpdate`.
