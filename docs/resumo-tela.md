# Aba "Resumo" do CRM: como ela funciona

Documento para quem precisa entender os números da aba **Resumo** do CRM (repositório `crm-sites`) sem ler o código. Escrito para um agente de outro repositório cujo job roda quando o status de um cliente muda.

## 1. Contexto

- App web de uma pessoa só (React + Supabase), usado para prospectar e atender clientes da **Okai** (sites para negócios locais de Bauru/SP e região).
- A fonte de dados é uma única tabela, **`public.prospects`**. Cada linha é um negócio que passa por um funil: de lead até cliente pagante.
- O app grava **direto do navegador no Supabase** (não há servidor próprio). O Resumo **só lê**: não grava nada e não tem estado próprio. Todo número é calculado no navegador a partir das linhas de `prospects`.
- Código: `src/components/Resumo.tsx` (tela), `src/lib/stats.ts` (conversão e semanas), `src/lib/service.ts` (clientes e receita), `src/lib/domain.ts` (status e fila). Todas as regras abaixo têm teste em `src/lib/*.test.ts`.

## 2. Vocabulário de status

O campo `prospects.status` é um enum do Postgres (`prospect_status`).

| Grupo | Status | Significado |
|---|---|---|
| Início | `novo`, `triagem`, `prototipado` | Ainda não houve contato. `triagem` = em avaliação. `prototipado` = protótipo (preview) pronto. |
| Contato | `contatado` | Foi abordado, aguarda resposta. |
| Negociação | `briefing`, `aguardando_pendencias`, `refinamento`, `em_analise`, `entrega`, `aguardando_pagamento` | O cliente respondeu e está no processo de produção. |
| Cliente | `finalizado` | Site entregue e pago. Abre o ciclo do serviço (ver seção 5). |
| Encerrados | `perdido`, `descartado` | Ver abaixo. |
| Legados | `respondeu`, `negociando`, `fechado` | Existem no enum mas **nenhuma linha usa mais**. Tratados como equivalentes às etapas atuais. |

**Definição de `perdido` e `descartado` (regra do dono, usada em todo o Resumo):**

- **`perdido`**: o cliente **respondeu** e não quis continuar.
- **`descartado`**: **escolha do dono**, por qualquer motivo, inclusive quando o cliente **não respondeu**.

## 3. O que a aba mostra

A aba tem três blocos, de cima para baixo.

### 3.1 Panorama

- **Faixa de fila:** `N atrasados · M para hoje · P propostas para enviar · K de serviço`, com botão "Abrir a Hoje".
  - **Atrasados:** prospects em aberto com `next_action_at` anterior a hoje.
  - **Para hoje:** `next_action_at` igual a hoje.
  - **Propostas para enviar:** status `prototipado` **e** `approach_message` não vazia **e** `landing_page_url` preenchida. Quem está pronto para enviar aparece só nesse grupo, e não em atrasados ou hoje.
  - **De serviço:** clientes que exigem ação (renovação, cobrança ou suspensão).
  - "Em aberto" = status fora de `finalizado`, `perdido` e `descartado`.
- **Seis totais:**
  - **Prospects na base:** total de linhas.
  - **Em aberto:** conforme acima.
  - **Já contatados:** ver seção 4.
  - **Clientes no ar:** clientes `finalizado` com serviço ativo, isento ou em renovação (exclui `suspenso` e `encerrado`).
  - **Receita mensal:** soma de `monthly_fee` dos clientes **pagantes em dia** (estado `ativo`). Quem está na isenção **não entra**.
  - **A entrar após a isenção:** soma de `monthly_fee` de quem está `isento` ou em `renovacao` (é o que passará a pagar).

### 3.2 Semana a semana

Tabela das **últimas 4 semanas** (segunda a domingo, data local do navegador). Cada célula traz o número e uma barra proporcional ao maior valor da linha.

| Linha | Campo contado | Observação |
|---|---|---|
| Novos prospects | `prospected_at` na semana | Confiável. |
| Contatados | `last_contacted_at` na semana | **Só a semana atual é mostrada.** O banco guarda apenas o **último** contato de cada prospect, então semanas anteriores subcontariam. |
| Contratos gerados | `contract_generated_at` na semana | Confiável. |
| Fechamentos | `service_started_at` na semana | Confiável. É gravado quando o status vira `finalizado` pela primeira vez. |

Na coluna "Esta semana" aparece a variação sobre a semana anterior (`+2`, `−1`, `igual`) para novos, contratos e fechamentos. Contatados não tem variação.

### 3.3 Onde vale prospectar

Taxas de conversão agrupadas por **segmento**, **cidade**, **presença digital** ou **lacuna**. A seção abre com uma frase do funil: `total → descartou X → contatou Y → Z responderam e recusaram → W fecharam`.

Para cada grupo: prospects, descartados, contatados, responderam, perderam, fecharam, mais:

- **Taxa de resposta** = responderam ÷ contatados (barra).
- **Taxa de fecho** = fecharam ÷ contatados (número).
- **"Amostra pequena"** quando o grupo tem **menos de 5 contatados**. Esses grupos ficam em cinza e no fim da lista.
- Ordenação: grupos com amostra suficiente primeiro, pela taxa de resposta; depois por volume. Mostra os 8 primeiros, com "Mostrar todos".

**Agrupamentos:**

- **Presença digital** (a partir de `website_quality` e `website`): Sem site · Só rede social ou site quebrado · Site datado ou genérico · Site ok · Não avaliado.
- **Lacuna** = nota do Google (`google_rating`) menos o score de presença (0 a 4). Faixas: Grande (3 ou mais) · Média (1,5 a 3) · Pequena (menos de 1,5) · Sem nota ou presença.

## 4. Como cada métrica de conversão é decidida

Esta é a parte que depende do status, e a que um job de mudança de status pode afetar.

- **Contatado** = tem `last_contacted_at`, **ou** `contact_attempts > 0`, **ou** o status é `contatado`, **ou** é um status de "respondeu" (abaixo).
- **Respondeu** = status em `briefing`, `aguardando_pendencias`, `refinamento`, `em_analise`, `entrega`, `aguardando_pagamento`, `finalizado`, **`perdido`**, ou os legados `respondeu`, `negociando`, `fechado`.
  - `perdido` conta como respondeu e como contatado **mesmo sem registro de contato**, porque o cliente chegou a decidir.
- **Fechou** = status `finalizado` (ou o legado `fechado`).
- **Perdeu** = status `perdido`.
- **Descartado** = status `descartado`. **Nunca** conta como respondeu. Só conta como contatado se houver registro de contato (`last_contacted_at` ou `contact_attempts`). Quem foi descartado sem nunca ser abordado fica **fora do denominador** das taxas.

Consequência: mudar um prospect para `perdido` ou `descartado` **altera as taxas**. Escolher o status errado distorce o Resumo, então a distinção da seção 2 precisa ser respeitada por qualquer automação que mude status.

## 5. Efeitos colaterais de uma mudança de status

Toda mudança de status feita pelo app passa por regras automáticas (em `useProspects.ts` → `update`). Um job externo que mude status **deve reproduzi-las ou chamar o mesmo caminho**, senão os campos ficam inconsistentes:

- Entrar em `contatado`: `next_action_at` = hoje + **3 dias úteis**.
- Entrar em `aguardando_pendencias`: `next_action_at` = hoje + **2 dias corridos**.
- Voltar de `em_analise` para `refinamento`: `revision_count` + 1.
- Entrar em `perdido` ou `descartado`: `next_action_at` = `null` e `last_reminded_at` = `null` (sai da fila).
- Entrar em `finalizado` **pela primeira vez**: grava `service_started_at` = hoje e `free_until` = hoje + **6 meses** (isenção). Isso abre o ciclo do cliente e é o que o Resumo conta como "fechamento".
- Se `landing_page_url` existir e o status passar a `perdido`/`descartado`, ou o serviço for suspenso/encerrado: o app pede confirmação e chama a Edge Function **`encerrar-hospedagem`**, que apaga o site no Cloudflare Pages (irreversível).
- Se o dono clica em **Desfazer**, o app regrava os valores anteriores dos campos tocados.

### Ciclo do cliente (`finalizado`)

Estado derivado das datas, nunca guardado: `isento` → `renovacao` (faltam 30 dias ou menos para `free_until` e sem `paid_until`) → `ativo` (pagante em dia) → `a_cobrar` (até 7 dias de atraso) → `suspender` (mais de 7 dias de atraso, o dono confirma) → `suspenso` / `encerrado`. Campos: `service_started_at`, `free_until`, `paid_until`, `last_reminded_at`, `suspended_at`, `service_ended_at`, `monthly_fee`.

## 6. Limites conhecidos

- **Sem histórico de mudanças.** O banco guarda só o estado atual, então não é possível saber quando um prospect respondeu, em que etapa foi perdido, nem quanto tempo levou para fechar. As semanas anteriores de "Contatados" não existem pelo mesmo motivo.
- **Existe uma migração pronta, ainda não aplicada:** `supabase/migrations/20261014190000_add_prospect_events_history.sql`. Ela cria `public.prospect_events` (uma linha por mudança de status ou contato, preenchida por gatilho no banco, com leitura só para o dono). Foi testada em Postgres local (13 cenários), mas **não está no banco de produção**. Quando for aplicada, é a fonte natural para um job que reage a mudanças de status, e destravaria os números que hoje faltam. Verifique antes se ela já existe: `select to_regclass('public.prospect_events')`.
- **Base pequena:** na data deste documento há 354 prospects, cerca de 29 contatados, 8 perdidos, 42 descartados e 1 fechado. A maioria dos grupos aparece como "amostra pequena".
- **Origem do lead não é critério:** quase todos vêm do Google (`source_url`).
- **Datas** usam o fuso do navegador. Campos de data pura (`date`) são comparados como texto `AAAA-MM-DD`; timestamps são convertidos para a data local.

## 7. Se o job muda status ou lê esses dados

- Para **ler**: `select * from public.prospects` (RLS: só o dono, identificado por e-mail no JWT; a `service_role` ignora o RLS).
- Para **gravar status**: use o mesmo conjunto de regras da seção 5, e respeite a diferença entre `perdido` (cliente respondeu e recusou) e `descartado` (escolha do dono). Não preencha `last_contacted_at`, `prospected_at` ou `service_started_at` retroativamente sem necessidade, porque alimentam diretamente o "Semana a semana".
- **Não há webhook nem fila:** a tela lê o estado atual a cada carregamento. Para reagir a uma mudança de status, as opções são: um gatilho no banco, o Supabase Realtime ou polling. O gatilho de `prospect_events` (quando aplicado) é o ponto mais limpo.
