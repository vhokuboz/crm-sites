# Geração automática de contrato

Data: 2026-09-04
Status: aprovado, pronto para plano de implementação

## Contexto

Hoje o contrato pro cliente é preenchido manualmente a cada venda. O objetivo é ter um
botão na ficha do prospect que, a partir de um `.docx` com placeholders (ex. `{{cpf_cnpj}}`)
e dos dados já salvos do prospect, gera o PDF preenchido, guarda no Supabase Storage e
disponibiliza pra download — sem precisar editar o contrato manualmente pra cada cliente.

A ideia original era manter um template fixo salvo no Storage. Foi trocada por **upload do
`.docx` a cada geração**, porque resolve de graça o caso de contrato com cláusula
customizada pra um cliente específico: a edição de texto acontece no Word, fora do sistema,
antes do upload — o script só substitui variáveis, nunca edita texto corrido.

Este projeto (`crm-sites`) fica só com o pedaço inseparável do CRM: o botão/modal na ficha e
as colunas novas em `prospects`. Tudo que é backend do contrato — Edge Function e infra de
conversão — vai para um repositório novo, **`contract-service`**, com deploy e versionamento
próprios.

## Arquitetura

```
crm-sites (este repo)
  Drawer.tsx
    status >= aguardando_pendencias
      sem contrato → botão "Gerar contrato"
      com contrato → "Baixar contrato" + "Refazer contrato"
           │
           ▼
    ContractModal: upload .docx + form dos campos que faltam
           │ fetch multipart, autenticado
           ▼
contract-service (repo novo)
  edge-function/generate-contract  (deploy via Supabase CLI no MESMO projeto Supabase do crm-sites)
    1. valida sessão do usuário (mesmo projeto/tabela `prospects`)
    2. lê dados do prospect (nome, endereço, valores)
    3. mescla com os campos extras enviados no form; se "salvar" marcado, faz UPDATE em prospects
    4. preenche os placeholders do .docx (docxtemplater + pizzip, via npm: no Deno)
    5. POST do .docx preenchido pro Gotenberg (só a rota /forms/libreoffice/convert)
    6. recebe o PDF de volta
    7. salva em Storage: bucket `contracts`, path `{prospect_id}.pdf` (upsert)
    8. grava `contract_generated_at = now()` no prospect
  home-server/ (docker-compose.yml, Caddyfile, cloudflared config)
    Cloudflare Tunnel → Caddy (HTTPS, valida header secreto, allowlist só da rota
    /forms/libreoffice/convert) → Gotenberg (Docker, imagem fixada numa versão, LibreOffice)
```

Download não passa pela Edge Function: o frontend pede direto ao Supabase Storage uma
signed URL de curta duração — a policy do bucket já permite leitura pro dono autenticado.

## Modelo de dados (`crm-sites`, migração nova)

Colunas novas em `prospects`, todas nullable:

| coluna | tipo | uso |
|---|---|---|
| `cpf_cnpj` | text | documento do cliente/empresa, pedido pelo contrato |
| `legal_name` | text | nome completo / razão social, pode diferir de `name` |
| `rg` | text | RG, quando o contrato pedir |
| `cep` | text | complementa `address`/`city` já existentes |
| `contract_generated_at` | timestamptz | `null` = nunca gerado → botão mostra "Gerar contrato"; preenchido → mostra "Baixar" + "Refazer" |

`contract_generated_at` é a fonte da verdade do estado do botão (evita checar o Storage a
cada render — já vem junto no fetch que o React Query faz da lista de prospects).

## Vocabulário de placeholders

Nomes fixos que o `.docx` enviado pode conter (o script ignora silenciosamente qualquer
placeholder ausente no template — não é erro):

| placeholder | origem |
|---|---|
| `{{nome_completo}}` | `legal_name` (formulário, se ainda não salvo) |
| `{{cpf_cnpj}}` | `cpf_cnpj` (formulário, se ainda não salvo) |
| `{{rg}}` | `rg` (formulário, se ainda não salvo) |
| `{{endereco}}` | `address` |
| `{{cidade}}` | `city` |
| `{{cep}}` | `cep` (formulário, se ainda não salvo) |
| `{{valor_total}}` | `deal_value` |
| `{{valor_sinal}}` | `deposit_paid_amount` |
| `{{valor_final}}` | `final_paid_amount` |
| `{{data_hoje}}` | data da geração, formato `dd/mm/aaaa` |

## UI — Drawer (`Drawer.tsx`)

Nova seção, visível apenas quando `status` é `aguardando_pendencias`, `refinamento`,
`em_analise`, `entrega`, `aguardando_pagamento` ou `finalizado` (fora do fluxo aberto antes
de `aguardando_pendencias`, e fora de `perdido`/`descartado` — não faz sentido gerar
contrato pra negócio morto):

- `contract_generated_at` vazio → botão único **"Gerar contrato"**, abre `ContractModal`.
- `contract_generated_at` preenchido → **"Baixar contrato"** (signed URL direto do Storage)
  + **"Refazer contrato"** (abre o mesmo `ContractModal`, sobrescreve o PDF existente).

`ContractModal`:

- input de arquivo, aceita só `.docx` (validado por extensão/mimetype antes de enviar).
- formulário com apenas os campos que **ainda não estão preenchidos** no prospect entre
  `legal_name`, `cpf_cnpj`, `rg`, `cep` (os já preenchidos não aparecem de novo).
- checkbox "salvar esses dados na ficha do cliente" — controla se a Edge Function faz o
  UPDATE em `prospects` com os valores digitados.
- estado de loading enquanto aguarda a Edge Function; erro mostra mensagem e não fecha o
  modal (ex. "conversor indisponível, tente de novo").

## Segurança

- Bucket `contracts` privado, policy de leitura/escrita restrita ao dono autenticado (mesmo
  padrão `is_owner` já usado nas migrações de `prospects`).
- Caddy, na frente do Gotenberg, exige um header secreto (env var compartilhada entre a
  Edge Function e o `contract-service/home-server`) e só repassa a rota
  `/forms/libreoffice/convert` — qualquer outro path (incluindo o endpoint do CVE de RCE via
  ExifTool) recebe 403 antes de chegar no Gotenberg.
- Imagem do Gotenberg fixada em versão explícita no `docker-compose.yml`, com processo
  manual de checar releases/CVEs periodicamente (sem automação de update nesta v1).

## Erros esperados

- Servidor caseiro offline ou Gotenberg fora do ar → Edge Function retorna erro, modal exibe
  mensagem, resto do CRM continua funcionando normalmente.
- Upload que não é `.docx` → bloqueado no frontend, nem chega a chamar a Edge Function.
- Placeholder do vocabulário ausente no `.docx` enviado → ignorado, não é erro.

## Testes

- Função pura que monta o mapa `{{placeholder}}: valor` a partir do prospect + campos do
  formulário (`src/lib/contract.ts` neste repo) — testada com `node --test`, mesmo padrão de
  `domain.test.ts`: cada placeholder resolvido a partir da coluna certa, e formulário
  sobrescrevendo quando a coluna do banco está vazia.
- Preenchimento do `.docx` via `docxtemplater` e a chamada ao Gotenberg vivem no
  `contract-service` (repo separado) — sem harness de teste automatizado nesta v1; validação
  é manual (gerar um contrato de teste de ponta a ponta antes de considerar pronto).

## Fora de escopo (decidido explicitamente durante o brainstorm)

- Suporte a contrato em formato diferente de `.docx` de entrada / PDF de saída.
- Versionamento de contratos gerados (só existe o último; "Refazer" sobrescreve).
- Atualização automática da imagem do Gotenberg (watchtower ou similar) — fica manual por
  enquanto.
- Qualquer editor de cláusula dentro do CRM — customização de texto acontece no Word, fora
  do sistema, antes do upload.
