# Ciclo de vida do serviço: controle de clientes ativos (isenção, mensalidade, suspensão)

Data: 2026-10-07
Status: rascunho, aguardando revisão

## Contexto

O funil do CRM termina em `finalizado` (pagamento final recebido). Depois disso o cliente
sai do radar: `isOpen` exclui `finalizado`, o Kanban não o mostra e nada indica quem segue
ativo, pagando ou hospedado.

O modelo comercial atual é uma promoção: o cliente compra a página e tem **6 meses de
mensalidade isenta**. Depois disso, **se optar por continuar**, paga mensalidade. As
cobranças são manuais, via Pix. Se o cliente não pagar, o site cai **7 dias após o
vencimento**, mas por decisão do usuário isso é sempre confirmado com um clique, nunca
automático (a derrubada é destrutiva).

Objetivo: dar visibilidade e controle de quem é cliente ativo, quando a isenção acaba, quem
precisa ser cobrado e quem passou do prazo de suspensão, sem criar um novo status de funil
que dependa de ser movido à mão.

## Decisões já tomadas

- **Status derivado, não armazenado.** O estado do serviço é calculado por função pura a
  partir de datas. O enum `prospect_status` não muda. Evita o estado desatualizado que um
  status manual teria.
- **Suspensão e encerramento só com confirmação** (confirmação dupla, padrão do
  `DiscardModal`). Nenhum agendamento derruba site sozinho.
- **Suspender = derrubar o site**, reusando a function `encerrar-hospedagem` (apaga o
  projeto Cloudflare Pages), sem página de "serviço suspenso". **Reativar** apenas limpa a
  marca no CRM e exibe o lembrete de rodar o redeploy no repo `agent-okaisites`
  (workflow manual, por regra daquele repo). Suspensão com página de aviso foi descartada:
  mais ruído e exigiria mudança no outro repositório.
- **"Lembrei o cliente" é ação distinta do "Cobrei de novo".** O "Cobrei de novo" atual é
  follow-up da mensagem de apresentação (prospect `contatado` com `next_action_at`
  vencendo) e reagenda `next_action_at`. O lembrete de mensalidade não toca em
  `next_action_at` nem em `pago_ate`.
- **Aba nova "Clientes"**, em lista agrupada por urgência, em vez de filtro na Base.

## Dados

Migration única em `public.prospects`. `monthly_fee` **já existe** (migration
`20260910120000`, opcional, nulo quando o cliente hospeda por conta própria) e é reaproveitada.

| Coluna | Tipo | Significado |
|---|---|---|
| `service_started_at` | date | Início do serviço. Preenchida ao virar `finalizado`. |
| `free_until` | date | Fim da isenção: `service_started_at` + 6 meses. |
| `paid_until` | date | Coberto até. Nulo durante a isenção; ao optar por continuar vira `free_until`; cada Pix recebido soma 1 mês. |
| `last_reminded_at` | date | Data do último "Lembrei o cliente". |
| `suspended_at` | date | Preenchida ao confirmar a suspensão. |
| `service_ended_at` | date | Preenchida ao encerrar o cliente (definitivo). |

Nomes em inglês, no padrão das colunas existentes (`next_action_at`, `monthly_fee`).

**Backfill:** prospects já `finalizado` recebem `service_started_at = updated_at::date`.
É aproximação (não há carimbo de finalização), então `free_until` pode ficar alguns dias
fora do real. Ajustável pela ficha. Conferir os poucos casos existentes antes de aplicar.

## Estado derivado

`serviceState(p, hoje = todayISO())` em `src/lib/domain.ts`, função pura com testes em
`domain.test.ts`. Só se aplica a `status === 'finalizado'` com `service_started_at`.
Ordem de avaliação (a primeira regra que bater vence):

1. `service_ended_at` preenchida → `encerrado`
2. `suspended_at` preenchida → `suspenso`
3. `paid_until` nulo e `hoje <= free_until` → `isento`, ou `renovacao` se faltarem 30 dias
   ou menos para `free_until`
4. Demais casos: vencimento = `paid_until ?? free_until` (cliente que não respondeu à
   renovação vence em `free_until`); dias de atraso = `hoje - vencimento`
   - atraso ≤ 0 → `ativo`
   - 1 a 7 → `a_cobrar`
   - maior que 7 → `suspender` (aguardando o clique do usuário)

Constante nomeada para o prazo (`SUSPEND_AFTER_DAYS = 7`) e para a janela de renovação (30).

## Transições e ações

Todas as escritas passam por `useProspects.ts::update`, e as automáticas pela mesma função
de patch usada em `statusTransitionPatch`, para disparar igual venha da ficha ou de outro
ponto.

- **Virar `finalizado`** (já ocorre ao preencher "Pagamento final" na ficha): preenche
  `service_started_at = hoje` e `free_until = hoje + 6 meses`. Não sobrescreve se já
  preenchidos.
- **Cliente vai continuar:** exige `monthly_fee`; define `paid_until = free_until`.
- **Pix recebido:** `paid_until = paid_until + 1 mês` (a partir do vencimento anterior, não
  da data do pagamento, para não deslocar o ciclo). Soma de meses preserva o dia
  (31 → último dia do mês seguinte).
- **Lembrei o cliente:** `last_reminded_at = hoje`.
- **Suspender site:** confirmação dupla; grava `suspended_at` e chama
  `encerrar-hospedagem` com o slug (mesmo fire-and-forget do fluxo de desistência).
- **Encerrar cliente:** igual à suspensão, mas grava `service_ended_at` (definitivo).
  Vale também para o cliente que decide não continuar ao fim da isenção.
- **Reativar:** limpa `suspended_at`; exibe o lembrete de redeploy manual. Se
  `paid_until` ainda estiver vencido, o cliente reaparece em "a cobrar" até o Pix.

## Interface

**Aba "Clientes"** (nova): só `finalizado` com `service_started_at`. Grupos, por urgência:
`suspender`, `a_cobrar`, `renovacao`, `ativo` (inclui `isento`), e `suspenso`/`encerrado`
recolhidos por padrão. Resumo no topo: `N ativos · N isentos · N pagantes · R$ X/mês`
(soma de `monthly_fee` dos pagantes em dia). Cada linha: nome, badge do estado, data
relevante ("isento até 12/03", "vence em 5 dias", "venceu há 3 dias"), "lembrado há N
dias" quando houver, e as ações rápidas do estado.

**Aba Hoje:** seção "Serviço" separada da fila de venda, com `renovacao`, `a_cobrar` e
`suspender` ordenados por dias. Cada item abre a ficha.

**Ficha (Drawer):** bloco "Serviço" visível só para quem tem `service_started_at`: datas,
valor, estado e as ações acima.

Kanban e "Cobrei de novo" não mudam.

## Erros e casos de borda

- Falha na chamada de `encerrar-hospedagem`: a marca (`suspended_at`/`service_ended_at`)
  fica gravada e a UI avisa que a derrubada falhou, para o usuário tentar de novo. Sem
  retry automático (mesma decisão do spec de encerramento).
- Cliente sem `slug`/`landing_page_url`: suspender/encerrar só grava a data, sem chamada de
  hospedagem.
- Cliente `finalizado` sem `monthly_fee` que passa do `free_until` sem optar: aparece como
  vencido; a ficha exige informar o valor ou encerrar.
- Datas sempre em string ISO `AAAA-MM-DD`, com os helpers existentes de `domain.ts`,
  nunca `new Date(string)`.

## Testes

Testes unitários (`npm test`, `node --test`) para `serviceState` cobrindo cada fronteira:
último dia da isenção, 30 dias para renovar, atraso de 0, 1, 7 e 8 dias, suspenso e
encerrado. Teste de soma de meses (31 de janeiro, ano bissexto). Sem testes de UI, como no
restante do projeto.

## Fora de escopo

- Cobrança, envio de mensagem ou conciliação de Pix automáticos.
- Tabela de histórico de pagamentos (migrar para ela se um dia precisar de relatório).
- Suspensão com página de aviso e reativação automática do site.
- Alertas fora do CRM (e-mail, push).
- Suspensão ou derrubada automática por agendamento.
