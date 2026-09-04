# Geração de contrato (crm-sites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão na ficha do prospect que sobe um `.docx` com placeholders, dispara a Edge
Function `generate-contract` (repositório separado `contract-service`, ver
`docs/superpowers/plans/2026-09-04-contrato-service.md`) e, quando o PDF já existe,
oferece baixar ou refazer.

**Architecture:** `contract_generated_at` em `prospects` é a fonte da verdade de "existe
contrato?" (evita checar o Storage a cada render). `src/lib/contract.ts` monta o mapa
`{{placeholder}}: valor` a partir do prospect + do formulário do modal — esse mapa já
pronto é o que viaja pra Edge Function, que não precisa saber nada do schema de
`prospects`. Download não passa pela Edge Function: signed URL direto do Storage.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (Postgres/RLS/Storage). Testes com
`node:test`/`node:assert/strict` (mesmo padrão de `domain.test.ts`).

## Global Constraints

- Projeto Supabase: `brwfbyxthuqwwwzlzbwj` — mesmo projeto de todas as migrações
  anteriores, aplicadas via MCP `mcp__claude_ai_Supabase__apply_migration` e verificadas
  via `mcp__claude_ai_Supabase__execute_sql` (mesmo padrão do plano
  `2026-09-03-funil-pos-contato.md`).
- `src/lib/database.types.ts` é editado à mão (não é gerado automaticamente neste fluxo) —
  seguir a ordem alfabética já usada no arquivo, mesmo padrão do plano anterior.
- Toda string visível ao usuário (rótulos, textos de UI, mensagens de erro) em português
  do Brasil.
- Sem framework de teste novo — `node:test`/`node:assert/strict`, zero dependência.
- Sem dependência nova neste repo (`docxtemplater`/`pizzip` vivem só no `contract-service`,
  em Deno).
- Segue os tokens de estilo já usados no Drawer: classes Tailwind `rounded-sm border
  border-rule bg-card`, `font-mono text-[11px]`, `eyebrow`, cores `ink`/`paper`/`muted`/
  `seal`/`deep` — sem introduzir um novo padrão visual.
- Este plano depende do `contract-service` existir e estar deployado pra ser testado de
  ponta a ponta (Task 5 assume isso); as Tasks 1-4 são testáveis isoladamente sem ele.

---

## Task 1: Migração — colunas novas em `prospects`

**Files:**
- Create: `supabase/migrations/20260904140000_add_contract_fields_to_prospects.sql`

**Interfaces:**
- Produces: colunas `cpf_cnpj text`, `legal_name text`, `rg text`, `cep text`,
  `contract_generated_at timestamptz` em `public.prospects`, todas nullable.

- [ ] **Step 1: Escrever a migração**

Conteúdo de `supabase/migrations/20260904140000_add_contract_fields_to_prospects.sql`:

```sql
-- Campos extras exigidos pelo contrato (CPF/CNPJ, nome legal, RG, CEP) e o
-- carimbo de quando o contrato foi gerado pela última vez -- é a fonte da
-- verdade de "existe contrato?" pro botão da ficha, sem bater no Storage a
-- cada render.
alter table public.prospects
  add column cpf_cnpj text,
  add column legal_name text,
  add column rg text,
  add column cep text,
  add column contract_generated_at timestamptz;
```

- [ ] **Step 2: Aplicar a migração**

Use `mcp__claude_ai_Supabase__apply_migration` com:
- `project_id`: `brwfbyxthuqwwwzlzbwj`
- `name`: `add_contract_fields_to_prospects`
- `query`: o conteúdo SQL do Step 1 (só o bloco `alter table`, sem o comentário)

- [ ] **Step 3: Verificar as colunas**

Use `mcp__claude_ai_Supabase__execute_sql` com `project_id` `brwfbyxthuqwwwzlzbwj`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'prospects'
  and column_name in ('cpf_cnpj', 'legal_name', 'rg', 'cep', 'contract_generated_at')
order by column_name;
```

Esperado: 5 linhas, todas com `is_nullable = 'YES'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904140000_add_contract_fields_to_prospects.sql
git commit -m "feat: adiciona campos de contrato (cpf/cnpj, nome legal, rg, cep) em prospects"
```

---

## Task 2: Migração — bucket `contracts` e policies de Storage

**Depends on:** nenhuma (independente da Task 1, mas roda antes da Task 5).

**Files:**
- Create: `supabase/migrations/20260904140100_add_contracts_storage_bucket.sql`

**Interfaces:**
- Produces: bucket privado `contracts` em `storage.buckets`; policies de select/insert/
  update em `storage.objects` restritas a `bucket_id = 'contracts'` e
  `private.is_owner()`.

- [ ] **Step 1: Escrever a migração**

Conteúdo de `supabase/migrations/20260904140100_add_contracts_storage_bucket.sql`:

```sql
-- Bucket privado pro PDF do contrato gerado -- leitura/escrita restrita ao
-- dono do CRM, mesmo padrão de private.is_owner() já usado em prospects
-- (ver 20260725183000_add_is_owner_helper_and_rewrite_policies.sql).
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

create policy "owner_select_contracts" on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and (select private.is_owner()));

create policy "owner_insert_contracts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contracts' and (select private.is_owner()));

create policy "owner_update_contracts" on storage.objects
  for update to authenticated
  using (bucket_id = 'contracts' and (select private.is_owner()))
  with check (bucket_id = 'contracts' and (select private.is_owner()));
```

- [ ] **Step 2: Aplicar a migração**

Use `mcp__claude_ai_Supabase__apply_migration` com:
- `project_id`: `brwfbyxthuqwwwzlzbwj`
- `name`: `add_contracts_storage_bucket`
- `query`: o conteúdo SQL do Step 1 (sem os comentários)

- [ ] **Step 3: Verificar bucket e policies**

Use `mcp__claude_ai_Supabase__execute_sql` com `project_id` `brwfbyxthuqwwwzlzbwj`:

```sql
select id, public from storage.buckets where id = 'contracts';

select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'owner_%_contracts';
```

Esperado: bucket com `public = false`; 3 policies (`owner_select_contracts` = SELECT,
`owner_insert_contracts` = INSERT, `owner_update_contracts` = UPDATE).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904140100_add_contracts_storage_bucket.sql
git commit -m "feat: cria bucket privado contracts com policies de dono"
```

---

## Task 3: Tipos — `database.types.ts`

**Depends on:** Task 1 (as colunas precisam existir pro tipo refletir a realidade).

**Files:**
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `Prospect` (= `Row`) e `ProspectUpdate` (= `Partial<Insert>`) ganham
  `cpf_cnpj: string | null`, `legal_name: string | null`, `rg: string | null`,
  `cep: string | null`, `contract_generated_at: string | null`.

- [ ] **Step 1: Adicionar os campos novos em `Row`**

Em `src/lib/database.types.ts`, dentro de `prospects.Row`, inserir mantendo a ordem
alfabética já usada no arquivo. Primeiro bloco (`business_status` → `city` → `contact`):

```ts
          business_status: string | null
          cep: string | null
          city: string
          contact: string | null
          contact_attempts: number
          contract_generated_at: string | null
          cpf_cnpj: string | null
          created_at: string
```

Segundo bloco (`landing_page_url` → `link_bio`):

```ts
          landing_page_url: string | null
          last_contacted_at: string | null
          legal_name: string | null
          link_bio: string | null
```

Terceiro bloco (`prospected_at` → `segment`):

```ts
          prospected_at: string
          revision_count: number
          rg: string | null
          segment: string
```

- [ ] **Step 2: Adicionar os mesmos campos em `Insert`**

Mesma posição, dentro de `prospects.Insert`, como opcionais (todas nullable no banco):

```ts
          business_status?: string | null
          cep?: string | null
          city?: string
          contact?: string | null
          contact_attempts?: number
          contract_generated_at?: string | null
          cpf_cnpj?: string | null
          created_at?: string
```

```ts
          landing_page_url?: string | null
          last_contacted_at?: string | null
          legal_name?: string | null
          link_bio?: string | null
```

```ts
          prospected_at?: string
          revision_count?: number
          rg?: string | null
          segment: string
```

(`Update` não precisa de mudança — já é `Partial<Insert>`.)

- [ ] **Step 3: Rodar o typecheck**

Run: `npm run typecheck`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "feat: adiciona campos de contrato aos tipos de prospects"
```

---

## Task 4: `src/lib/contract.ts` — mapa de placeholders

**Depends on:** Task 3 (usa os campos novos do tipo `Prospect`).

**Files:**
- Create: `src/lib/contract.ts`
- Test: `src/lib/contract.test.ts`

**Interfaces:**
- Produces:
  - `type ContractExtraField = 'legal_name' | 'cpf_cnpj' | 'rg' | 'cep'`
  - `const CONTRACT_EXTRA_FIELDS: { key: ContractExtraField; label: string }[]`
  - `type ContractFormValues = Partial<Record<ContractExtraField, string>>`
  - `function missingContractFields(p: Prospect): ContractExtraField[]`
  - `function buildContractFieldMap(p: Prospect, form: ContractFormValues): Record<string, string>`
    — chaves: `nome_completo`, `cpf_cnpj`, `rg`, `endereco`, `cidade`, `cep`,
    `valor_total`, `valor_sinal`, `valor_final`, `data_hoje` (vocabulário fixo da spec).
- Consumes: `todayISO` de `./domain.ts`, `Prospect` de `./database.types.ts`.

- [ ] **Step 1: Escrever os testes (falhando)**

Conteúdo de `src/lib/contract.test.ts`:

```ts
/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContractFieldMap, missingContractFields } from './contract.ts'
import type { Prospect } from './database.types.ts'

function fakeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    address: 'Rua Tal, 123',
    city: 'Bauru',
    deal_value: 1500,
    deposit_paid_amount: 375,
    final_paid_amount: null,
    legal_name: null,
    cpf_cnpj: null,
    rg: null,
    cep: null,
    ...overrides,
  } as unknown as Prospect
}

test('missingContractFields - devolve só os campos ainda vazios na ficha', () => {
  const p = fakeProspect({ legal_name: 'Fulano de Tal Ltda' })
  assert.deepEqual(missingContractFields(p), ['cpf_cnpj', 'rg', 'cep'])
})

test('missingContractFields - nenhum campo faltando devolve lista vazia', () => {
  const p = fakeProspect({ legal_name: 'x', cpf_cnpj: 'x', rg: 'x', cep: 'x' })
  assert.deepEqual(missingContractFields(p), [])
})

test('buildContractFieldMap - formulário tem prioridade sobre o que já está salvo', () => {
  const p = fakeProspect({ cpf_cnpj: '000.000.000-00' })
  const map = buildContractFieldMap(p, { cpf_cnpj: '111.111.111-11' })
  assert.equal(map.cpf_cnpj, '111.111.111-11')
})

test('buildContractFieldMap - usa o que já está salvo quando o formulário não traz o campo', () => {
  const p = fakeProspect({ legal_name: 'Fulano de Tal Ltda' })
  const map = buildContractFieldMap(p, {})
  assert.equal(map.nome_completo, 'Fulano de Tal Ltda')
})

test('buildContractFieldMap - campo ausente (form vazio e não salvo) vira string vazia', () => {
  const p = fakeProspect()
  const map = buildContractFieldMap(p, {})
  assert.equal(map.rg, '')
})

test('buildContractFieldMap - valores monetários em formato brasileiro', () => {
  const p = fakeProspect({ deal_value: 1500, deposit_paid_amount: 375, final_paid_amount: null })
  const map = buildContractFieldMap(p, {})
  assert.equal(map.valor_total, '1.500,00')
  assert.equal(map.valor_sinal, '375,00')
  assert.equal(map.valor_final, '')
})

test('buildContractFieldMap - data_hoje no formato dd/mm/aaaa com ano completo', () => {
  const p = fakeProspect()
  const map = buildContractFieldMap(p, {})
  assert.match(map.data_hoje, /^\d{2}\/\d{2}\/\d{4}$/)
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FALHA com "Cannot find module './contract.ts'" (ou equivalente) — o arquivo
ainda não existe.

- [ ] **Step 3: Escrever `src/lib/contract.ts`**

```ts
import type { Prospect } from './database.types'
import { todayISO } from './domain'

export type ContractExtraField = 'legal_name' | 'cpf_cnpj' | 'rg' | 'cep'

export const CONTRACT_EXTRA_FIELDS: { key: ContractExtraField; label: string }[] = [
  { key: 'legal_name', label: 'Nome completo / razão social' },
  { key: 'cpf_cnpj', label: 'CPF ou CNPJ' },
  { key: 'rg', label: 'RG' },
  { key: 'cep', label: 'CEP' },
]

export type ContractFormValues = Partial<Record<ContractExtraField, string>>

/** Só os campos extras ainda não salvos na ficha -- são os únicos que aparecem no formulário do modal. */
export function missingContractFields(p: Prospect): ContractExtraField[] {
  return CONTRACT_EXTRA_FIELDS.map((f) => f.key).filter((key) => !p[key])
}

const money = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatMoney(value: number | null): string {
  return value == null ? '' : money.format(value)
}

/** dd/mm/aaaa com ano completo -- diferente de formatDateBR (domain.ts), que trunca o ano pra exibição na tela. */
function todayBR(): string {
  const [y, m, d] = todayISO().split('-')
  return `${d}/${m}/${y}`
}

/**
 * Monta o mapa {{placeholder}}: valor que a Edge Function `generate-contract` usa pra
 * preencher o .docx. Campo do formulário (ainda não salvo) tem prioridade sobre o que já
 * está na ficha, porque é o valor mais recente digitado pelo usuário.
 */
export function buildContractFieldMap(p: Prospect, form: ContractFormValues): Record<string, string> {
  return {
    nome_completo: form.legal_name ?? p.legal_name ?? '',
    cpf_cnpj: form.cpf_cnpj ?? p.cpf_cnpj ?? '',
    rg: form.rg ?? p.rg ?? '',
    endereco: p.address ?? '',
    cidade: p.city,
    cep: form.cep ?? p.cep ?? '',
    valor_total: formatMoney(p.deal_value),
    valor_sinal: formatMoney(p.deposit_paid_amount),
    valor_final: formatMoney(p.final_paid_amount),
    data_hoje: todayBR(),
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: todos os testes de `contract.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract.ts src/lib/contract.test.ts
git commit -m "feat: adiciona mapa de placeholders do contrato"
```

---

## Task 5: `ContractModal` — upload e formulário dos campos que faltam

**Depends on:** Task 4 (usa `missingContractFields`, `CONTRACT_EXTRA_FIELDS`,
`ContractFormValues`).

**Files:**
- Create: `src/components/ContractModal.tsx`

**Interfaces:**
- Consumes: `missingContractFields`, `CONTRACT_EXTRA_FIELDS`, `ContractFormValues` de
  `../lib/contract`; `Prospect` de `../lib/database.types`.
- Produces: componente `ContractModal({ prospect, onSubmit, onClose })`, onde
  `onSubmit: (file: File, form: ContractFormValues, save: boolean) => Promise<void>`.
  Erros lançados por `onSubmit` são capturados e exibidos no próprio modal (não fecha).

- [ ] **Step 1: Escrever o componente**

Conteúdo de `src/components/ContractModal.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CONTRACT_EXTRA_FIELDS, missingContractFields, type ContractFormValues } from '../lib/contract'
import type { Prospect } from '../lib/database.types'

type Props = {
  prospect: Prospect
  onSubmit: (file: File, form: ContractFormValues, save: boolean) => Promise<void>
  onClose: () => void
}

export function ContractModal({ prospect, onSubmit, onClose }: Props) {
  const fields = missingContractFields(prospect)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<ContractFormValues>({})
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && !f.name.toLowerCase().endsWith('.docx')) {
      setError('Selecione um arquivo .docx.')
      setFile(null)
      return
    }
    setError(null)
    setFile(f)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Selecione o arquivo do contrato (.docx).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(file, form, save)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gerar contrato"
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Contrato</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Gerar contrato de {prospect.name}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">Arquivo do contrato (.docx) *</span>
            <input
              type="file"
              accept=".docx"
              required
              onChange={handleFileChange}
              className="mt-1.5 w-full font-mono text-xs"
            />
          </label>

          {fields.map((key) => {
            const meta = CONTRACT_EXTRA_FIELDS.find((f) => f.key === key)!
            return (
              <label key={key} className="block">
                <span className="eyebrow">{meta.label}</span>
                <input
                  type="text"
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-xs"
                />
              </label>
            )
          })}

          {fields.length > 0 && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
              Salvar esses dados na ficha do cliente
            </label>
          )}

          {error && (
            <p role="alert" className="border-l-2 border-seal pl-3 text-sm text-seal">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-ink px-4 py-2.5 font-display text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Gerando…' : 'Gerar contrato'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npm run typecheck`
Expected: 0 erros.

- [ ] **Step 3: Verificação manual no dev server**

Run: `npm run dev`, abrir a ficha de um prospect em `aguardando_pendencias` (ver Task 6 —
sem ela o botão que abre este modal ainda não existe; renderize o `ContractModal`
temporariamente numa página de teste se quiser validar isolado antes da Task 6).
Expected: só os campos entre `legal_name`/`cpf_cnpj`/`rg`/`cep` que estiverem vazios no
prospect aparecem no formulário; selecionar um arquivo que não seja `.docx` mostra o erro
e não deixa enviar.

- [ ] **Step 4: Commit**

```bash
git add src/components/ContractModal.tsx
git commit -m "feat: adiciona modal de upload/preenchimento do contrato"
```

---

## Task 6: Seção "Contrato" no Drawer + disparo da Edge Function

**Depends on:** Task 4, Task 5.

**Files:**
- Modify: `src/lib/domain.ts` (nova constante `CONTRACT_ELIGIBLE_STATUS`)
- Modify: `src/components/Drawer.tsx`
- Modify: `src/App.tsx` (nova prop `onReload` pro Drawer)

**Interfaces:**
- Produces: `CONTRACT_ELIGIBLE_STATUS: Set<ProspectStatus>` em `domain.ts`. `Drawer` passa
  a receber `onReload: () => Promise<void>`.
- Consumes: `supabase.functions.invoke('generate-contract', { body: FormData })` (mesmo
  padrão de `AddProspectModal.tsx::invokeAddProspect`); `supabase.storage.from('contracts')
  .createSignedUrl(...)`.

- [ ] **Step 1: Adicionar `CONTRACT_ELIGIBLE_STATUS` em `domain.ts`**

Logo abaixo de `ALL_STATUS` (perto de `STATUS_LABEL`), em `src/lib/domain.ts`:

```ts
/** Da negociação em diante -- antes disso não faz sentido gerar contrato, e negócios mortos (perdido/descartado) ficam de fora. */
export const CONTRACT_ELIGIBLE_STATUS = new Set<ProspectStatus>([
  'aguardando_pendencias',
  'refinamento',
  'em_analise',
  'entrega',
  'aguardando_pagamento',
  'finalizado',
])
```

- [ ] **Step 2: Passar `onReload` pro `Drawer` em `App.tsx`**

Em `src/App.tsx`, na linha que renderiza o Drawer:

```tsx
{selected && (
  <Drawer prospect={selected} onUpdate={update} onReload={reload} onClose={() => setOpen(null)} />
)}
```

- [ ] **Step 3: Adicionar `onReload` ao tipo `Props` do `Drawer`**

Em `src/components/Drawer.tsx`, no `type Props`:

```ts
type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onReload: () => Promise<void>
  onClose: () => void
}
```

E na assinatura da função:

```ts
export function Drawer({ prospect: p, onUpdate, onReload, onClose }: Props) {
```

- [ ] **Step 4: Imports novos em `Drawer.tsx`**

Adicionar ao bloco de imports existente:

```ts
import { ContractModal } from './ContractModal'
import { buildContractFieldMap, type ContractFormValues } from '../lib/contract'
import { supabase } from '../lib/supabase'
```

E em `CONTRACT_ELIGIBLE_STATUS` junto do import já existente de `domain.ts` (adicionar
`CONTRACT_ELIGIBLE_STATUS` à lista de nomes importados de `'../lib/domain'`).

- [ ] **Step 5: Estado e handlers do contrato**

Logo após a declaração de `previewIndex`/`socialDrafts` (por volta da linha 94-96),
adicionar:

```ts
const [contractModalOpen, setContractModalOpen] = useState(false)
const [downloadingContract, setDownloadingContract] = useState(false)
const [contractError, setContractError] = useState<string | null>(null)
```

E, junto das outras funções do componente (antes do `return`):

```ts
async function handleDownloadContract() {
  setDownloadingContract(true)
  setContractError(null)
  const { data, error } = await supabase.storage.from('contracts').createSignedUrl(`${p.id}.pdf`, 60)
  setDownloadingContract(false)
  if (error || !data) {
    setContractError(`Não foi possível baixar o contrato: ${error?.message ?? 'erro desconhecido'}`)
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener')
}

async function handleGenerateContract(file: File, form: ContractFormValues, save: boolean) {
  const body = new FormData()
  body.append('file', file)
  body.append('prospect_id', p.id)
  body.append('fields', JSON.stringify(buildContractFieldMap(p, form)))
  body.append('save', String(save))
  if (save) {
    const saveFields = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value?.trim()),
    )
    body.append('save_fields', JSON.stringify(saveFields))
  }

  const { error } = await supabase.functions.invoke('generate-contract', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const errBody = await context?.json().catch(() => null)
    throw new Error(errBody?.error ?? error.message)
  }
  await onReload()
}
```

- [ ] **Step 6: Seção "Contrato" no JSX**

Logo após a `section` "Negócio" (depois do `</section>` que fecha os campos de
sinal/pagamento final, por volta da linha 423), adicionar:

```tsx
{CONTRACT_ELIGIBLE_STATUS.has(p.status) && (
  <section className="space-y-2">
    <h3 className="eyebrow">Contrato</h3>
    <div className="flex flex-wrap items-center gap-3">
      {p.contract_generated_at ? (
        <>
          <button
            type="button"
            onClick={handleDownloadContract}
            disabled={downloadingContract}
            className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card disabled:opacity-40"
          >
            {downloadingContract ? 'Abrindo…' : 'Baixar contrato'}
          </button>
          <button
            type="button"
            onClick={() => setContractModalOpen(true)}
            className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
          >
            Refazer contrato
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setContractModalOpen(true)}
          className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
        >
          Gerar contrato
        </button>
      )}
    </div>
    {p.contract_generated_at && (
      <p className="font-mono text-[11px] text-muted">
        Gerado em {formatDateBR(p.contract_generated_at)}
      </p>
    )}
    {contractError && (
      <p role="alert" className="border-l-2 border-seal pl-3 text-sm text-seal">
        {contractError}
      </p>
    )}
  </section>
)}

{contractModalOpen && (
  <ContractModal
    prospect={p}
    onSubmit={handleGenerateContract}
    onClose={() => setContractModalOpen(false)}
  />
)}
```

- [ ] **Step 7: Rodar o typecheck**

Run: `npm run typecheck`
Expected: 0 erros.

- [ ] **Step 8: Verificação manual no dev server**

Run: `npm run dev`. Abrir a ficha de um prospect em `aguardando_pendencias` (ou posterior)
→ deve aparecer a seção "Contrato" com o botão "Gerar contrato". Abrir a ficha de um
prospect em `novo`/`contatado`/`briefing`/`perdido`/`descartado` → seção não deve
aparecer. Clicar em "Gerar contrato" abre o modal da Task 5.

Se o `contract-service` (plano separado) já estiver deployado, completar o fluxo até o
fim e confirmar que, após gerar, o botão vira "Baixar contrato" + "Refazer contrato", e
que "Baixar contrato" abre o PDF numa aba nova. Se ainda não estiver deployado, esperar um
erro de rede ao submeter — comportamento correto, valida sem o backend.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain.ts src/components/Drawer.tsx src/App.tsx
git commit -m "feat: adiciona botão de gerar/baixar/refazer contrato na ficha"
```
