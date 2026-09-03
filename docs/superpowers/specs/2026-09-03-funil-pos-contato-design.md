# Funil pós-contato: de "contatado" até "finalizado"

Data: 2026-09-03
Status: aprovado, pronto para plano de implementação

## Contexto

O funil hoje é genérico a partir de `contatado`: `contatado → respondeu → negociando → fechado`.
Isso não reflete o processo real de venda/entrega do site, que tem etapas concretas
(briefing, coleta de pendências e sinal, refinamento, revisão do cliente, entrega técnica,
pagamento final). O objetivo desta mudança é substituir esse trecho genérico do funil por
um funil detalhado, com regras automáticas de acompanhamento (próxima ação, avanço de
status) nos pontos em que isso já é previsível.

`novo` e `prototipado` continuam exatamente como estão hoje — não fazem parte deste escopo.

## Funil novo

```
FUNNEL = [novo, prototipado, contatado, briefing, aguardando_pendencias,
          refinamento, em_analise, entrega, aguardando_pagamento, finalizado]
CLOSED = [perdido, descartado]
```

- `perdido` = o cliente desistiu. `descartado` = eu desisti do cliente. Mesmo significado de
  hoje, sem mudança.
- Como hoje, `perdido`/`descartado` são alcançáveis manualmente a partir de **qualquer**
  status aberto (via seletor na ficha, ou seletor mobile no card do funil) — o Kanban não
  ganha colunas próprias pra eles, continuam agrupados na seção "Encerrados" abaixo do
  quadro, como já é hoje.

Os status `respondeu`, `negociando`, `fechado` saem do vocabulário ativo do app (não
aparecem mais em `FUNNEL`, `ALL_STATUS`, `STATUS_LABEL`, `STATUS_TONE`).

### Significado de cada etapa nova

- **contatado** — mensagem inicial enviada, aguardando resposta. Transição de `prototipado`
  pra cá é manual (o vendedor decide quando mandou a mensagem).
- **briefing** — cliente respondeu; conversa pra alinhar escopo, entender o que será
  entregue e o que falta o cliente enviar. Transição de `contatado` é manual.
- **aguardando_pendencias** — cliente decidiu seguir (não desistiu no briefing); aguardando
  ele enviar documentos/material pendente e pagar o sinal (25%). Transição de `briefing` é
  manual (reflete a decisão "tem interesse" do briefing). Se o cliente desistir no
  briefing, vai manualmente pra `perdido`.
- **refinamento** — produção/ajuste do site com base no que foi recebido. Alcançável de
  duas formas: automaticamente a partir de `aguardando_pendencias` (ver regras
  automáticas) ou manualmente a partir de `em_analise` (quando o cliente pede alteração).
- **em_analise** — cliente revisando o resultado. Pode pedir até duas alterações (limite
  informativo, não bloqueado pelo sistema — ver `revision_count` abaixo); cada pedido volta
  pra `refinamento` manualmente.
- **entrega** — trabalho técnico de finalização (deploy, SEO, GA4 etc.), depois que o
  cliente aprovou em `em_analise`. Transição manual.
- **aguardando_pagamento** — aguardando o pagamento final do cliente. Transição de
  `entrega` é manual.
- **finalizado** — site entregue e pago. Alcançável automaticamente a partir de
  `aguardando_pagamento` (ver regras automáticas), ou manualmente.

### Rótulos (STATUS_LABEL)

| status | rótulo |
|---|---|
| `briefing` | Briefing |
| `aguardando_pendencias` | Aguardando cliente |
| `refinamento` | Refinamento |
| `em_analise` | Em análise |
| `entrega` | Entrega |
| `aguardando_pagamento` | Aguardando pagamento |
| `finalizado` | Finalizado |

(demais rótulos hoje existentes continuam iguais)

## Modelo de dados

### Enum `prospect_status`

É um enum do Postgres (`ALTER TYPE ... ADD VALUE`, mesmo padrão usado pra adicionar
`prototipado` em `20260725210000_add_prototipado_status.sql`). Um valor novo de enum não
pode ser usado na mesma transação em que foi criado, então a adição dos 7 valores novos
precisa estar em uma migração própria, comitada antes de qualquer migração que os use.

Enums do Postgres **não suportam remover valor** sem recriar o tipo inteiro (trocar a
coluna pra um novo tipo, dropar o antigo — operação com risco desnecessário pra este
projeto). Decisão: `respondeu`, `negociando`, `fechado` continuam existindo no enum do
banco, mas nunca mais são usados nem referenciados pelo app (saem de `ProspectStatus`'s
listas ativas no código, embora o TypeScript `Database['public']['Enums']['prospect_status']`
gerado automaticamente ainda os liste — isso é cosmético, não afeta o app pois ele só
itera sobre `FUNNEL`/`ALL_STATUS`, nunca sobre o enum bruto).

### Colunas novas em `prospects`

| coluna | tipo | default | uso |
|---|---|---|---|
| `contact_attempts` | integer | `0` | tentativas de contato registradas em `contatado` |
| `docs_received` | boolean | `false` | documentos/material pendente recebido, em `aguardando_pendencias` |
| `deposit_paid_amount` | numeric | `null` | valor do sinal (25%) efetivamente recebido |
| `final_paid_amount` | numeric | `null` | valor do pagamento final efetivamente recebido |
| `revision_count` | integer | `0` | quantas vezes o card voltou de `em_analise` pra `refinamento` |
| `deal_value` | numeric | `null` | valor total combinado com o cliente |

### Migração dos 2 registros reais existentes

Levantado via query no banco (`negociando`: 1 registro, `fechado`: 1 registro; `respondeu`:
0). Status corrigido caso a caso com o usuário:

- `Rafael Iglesias Fotografia` (id `71c8f749-5850-4cf5-aa22-bd05ec6e7296`), estava
  `negociando` → vira `refinamento` (site local pronto, deploy pendente, pendências do
  cliente ainda em aberto).
- `Noélle Garcia ADVOCACIA` (id `fccade1b-96c9-4d96-824f-d89eeb41b2e0`), estava `fechado`
  → vira `finalizado` (site entregue e pago).

## Regras automáticas

### Centralização: `statusTransitionPatch`

Hoje a única regra automática existente (`novo` + `landing_page_url` preenchido →
`prototipado`) mora só dentro de `Drawer.tsx::saveText()`. Isso é insuficiente pro funil
novo porque status muda em 3 lugares — arrastar no Kanban (`Funil.tsx`), seletor mobile no
card (`Funil.tsx::Card`) e seletor na ficha (`Drawer.tsx`) — e todos os três chamam
`onUpdate` (= `update` de `useProspects.ts`) como único ponto em comum.

Nova função pura em `domain.ts`. Cobre só as regras que dependem exclusivamente da
mudança de status (a regra `novo`→`prototipado` continua fora daqui — ver nota abaixo):

```ts
export function statusTransitionPatch(
  previous: Prospect,
  patch: ProspectUpdate,
): ProspectUpdate {
  if (!patch.status || patch.status === previous.status) return patch
  const extra: ProspectUpdate = {}
  if (patch.status === 'contatado') extra.next_action_at = addBusinessDaysISO(3)
  if (patch.status === 'aguardando_pendencias') extra.next_action_at = addDaysISO(2)
  if (previous.status === 'em_analise' && patch.status === 'refinamento') {
    extra.revision_count = (previous.revision_count ?? 0) + 1
  }
  return { ...extra, ...patch }
}
```

Chamada de dentro de `useProspects.ts::update(id, patch)`, antes de aplicar o patch tanto
no estado otimista quanto no `supabase.from('prospects').update(...)`:

```ts
setState((s) => {
  previous = s.prospects.find((p) => p.id === id)
  const finalPatch = previous ? statusTransitionPatch(previous, patch) : patch
  return { ...s, prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...finalPatch } : p)) }
})
```

(o mesmo `finalPatch` computado aqui é reusado na chamada ao Supabase logo abaixo, seguindo
o mesmo idioma já usado pra capturar `previous` nesta função.)

**Nota:** a regra existente `novo`→`prototipado` continua vivendo no `Drawer.tsx` (é
condicional a um campo de texto sendo preenchido no mesmo salvamento, não só ao status
mudar), mas isso significa que arrastar um card `novo` no Kanban direto pra `prototipado`
sem ter uma `landing_page_url` não vai preencher nada extra — comportamento correto, já que
não há URL pra registrar nesse caminho.

### Auto-avanço condicional (mora no `Drawer.tsx`, mesmo padrão da regra do protótipo)

Dispara dentro de `saveText()`, avaliando os campos que acabaram de ser editados:

```ts
if (status === 'aguardando_pendencias' && docsReceived && depositPaidAmount) {
  patch.status = 'refinamento'
}
if (status === 'aguardando_pagamento' && finalPaidAmount) {
  patch.status = 'finalizado'
}
```

Como esse `patch.status` segue pro mesmo `onUpdate` → `update` → `statusTransitionPatch`,
nenhuma duplicação de regra é necessária.

### addBusinessDaysISO (nova função em `domain.ts`)

Mesma assinatura de `addDaysISO`, pulando sábado e domingo ao contar os `days` úteis:

```ts
export function addBusinessDaysISO(days: number, from = todayISO()): string {
  let date = from
  let remaining = days
  while (remaining > 0) {
    date = addDaysISO(1, date)
    const dow = new Date(date + 'T00:00:00').getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return date
}
```

## UI — Drawer (`Drawer.tsx`)

- Campo **"Valor combinado (R$)"** (`deal_value`) — input numérico, sempre editável,
  segue o mesmo padrão de `dirty`/"Salvar alterações" dos demais campos de texto.
- Nova seção **"Pagamento e documentos"**:
  - checkbox "Documentos recebidos" (`docs_received`)
  - campo "Sinal recebido (R$)" (`deposit_paid_amount`)
  - campo "Pagamento final (R$)" (`final_paid_amount`)
- Nova seção **"Cobrei de novo"**, renderizada só quando `status` (local, antes de salvar)
  é `contatado` ou `aguardando_pendencias`:
  - botão único que dispara update imediato (fora do fluxo dirty/salvar, é um registro de
    ação, não uma edição de rascunho):
    - se `contatado`: `{ next_action_at: addBusinessDaysISO(3), contact_attempts: p.contact_attempts + 1 }`
    - se `aguardando_pendencias`: `{ next_action_at: addDaysISO(2) }`
  - mostra `contact_attempts` (só quando `status === 'contatado'`, sem alerta/cor de
    limiar — só o número)

## UI — Funil (`Funil.tsx`)

- Grid de colunas passa de `grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6` (6 colunas
  fixas) para um contêiner `flex overflow-x-auto` com colunas de largura mínima fixa —
  rolagem horizontal em vez de espremer 10 colunas na tela.
- Card em status `refinamento` com `revision_count > 0` ganha um badge pequeno, ex.
  "2ª rodada" (rotulagem: `revision_count + 1`ª rodada, já que a primeira vez em
  `refinamento` não veio de `em_analise` e tem `revision_count === 0`).

## Fora de escopo (decidido explicitamente durante o brainstorm)

- Sem alerta visual/cor por limiar de tentativas ou de rodadas de revisão — só o número.
- Sem trava automática que impeça um 3º retorno de `em_analise` pra `refinamento` — é
  informativo, a decisão de cobrar extra é do vendedor.
- Sem KPI agregado de "pipeline em negociação" (soma de `deal_value`) na aba Hoje — só o
  campo em si, por enquanto.
- Botão "cobrei de novo" e contador de tentativas não aparecem no card do Kanban/fila,
  só na ficha (Drawer) — exceto `revision_count`, que foi pedido explicitamente no card.

## Testes

- `addBusinessDaysISO`: pular fim de semana (ex. sexta + 1 dia útil = segunda, não
  sábado); soma de múltiplos dias cruzando um fim de semana.
- `statusTransitionPatch`: os três gatilhos automáticos (`contatado`, `aguardando_pendencias`,
  `em_analise → refinamento`) e o caso neutro (mudança de status sem regra associada não
  deve alterar mais nada no patch).

Mesmo estilo dos testes já existentes em `supabase/functions/add-prospect/parsing.test.ts`
(sem framework, `assert` simples).
