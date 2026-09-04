# Serviço de geração de contrato (contract-service) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repositório separado com a Edge Function `generate-contract` (preenche o
`.docx` recebido, converte pra PDF, salva no Storage) e a infra do servidor caseiro
(Gotenberg + Caddy + Cloudflare Tunnel) que faz a conversão. Ver
`docs/superpowers/specs/2026-09-04-geracao-contrato-design.md` (no repo `crm-sites`) pro
desenho completo, e `docs/superpowers/plans/2026-09-04-contrato-crm-sites.md` pro lado do
CRM que chama esta function.

**Architecture:** A Edge Function recebe o `.docx` + um mapa `{{placeholder}}: valor` já
pronto (montado pelo `crm-sites`, que é quem conhece o schema de `prospects`) — ela não
sabe nada de nome de coluna, só faz substituição de texto. `docxtemplater`/`pizzip`
preenchem o `.docx` em memória; o resultado é enviado por HTTP pro Gotenberg (rodando no
servidor caseiro, atrás de Cloudflare Tunnel + Caddy) que devolve o PDF convertido.

**Tech Stack:** Deno (Supabase Edge Functions), imports via esm.sh (mesmo padrão de
`supabase/functions/add-prospect` no crm-sites). Docker Compose + Gotenberg + Caddy +
`cloudflared` no servidor caseiro. Testes com `Deno.test` + assert padrão.

## Global Constraints

- Caminho do repositório assumido nas instruções abaixo: `~/contract-service`. Ajuste os
  comandos se preferir outro lugar — não afeta nada no `crm-sites`.
- Mesmo projeto Supabase do `crm-sites`: `brwfbyxthuqwwwzlzbwj`.
- Imports Deno via `https://esm.sh/<pacote>@<versão>`, nunca `npm:` specifiers — segue o
  padrão já usado em `add-prospect/index.ts`.
- Testes com `Deno.test` + `https://deno.land/std@0.224.0/assert/mod.ts` (mesmo padrão de
  `add-prospect/parsing.test.ts`) — sem framework novo.
- Toda mensagem de erro e comentário em português do Brasil.
- Gotenberg exposto só na rota `/forms/libreoffice/convert` — o Caddy bloqueia qualquer
  outro caminho com 403. Não é opcional: existem CVEs recentes reais no Gotenberg
  (RCE não-autenticado via endpoint de metadados ExifTool, bypass de autenticação, SSRF) e
  o único jeito de neutralizá-los sem depender de qual versão está rodando é nunca deixar
  o Caddy repassar essas rotas.
- Imagem do Gotenberg fixada em versão explícita no `docker-compose.yml` — nunca `latest`.
  Confira a release estável mais recente em https://github.com/gotenberg/gotenberg/releases
  no momento do deploy (Task 6) antes de fixar o número.
- Sem porta pública aberta no roteador/firewall do servidor caseiro — todo tráfego chega
  via Cloudflare Tunnel (conexão de saída), nunca via port forwarding.
- Depende das migrações do plano `2026-09-04-contrato-crm-sites.md` (colunas em
  `prospects` + bucket `contracts`) já aplicadas antes da Task 8 (verificação de ponta a
  ponta).

---

## Task 1: Estrutura do repositório

**Files:**
- Create: `~/contract-service/.gitignore`
- Create: `~/contract-service/supabase/config.toml` (via `supabase init`)
- Create dirs: `~/contract-service/supabase/functions/generate-contract/`,
  `~/contract-service/home-server/`

**Interfaces:**
- Produces: repositório git inicializado, linkado ao projeto Supabase
  `brwfbyxthuqwwwzlzbwj`, com a estrutura de pastas que as próximas tasks preenchem.

- [ ] **Step 1: Criar o repositório e inicializar o Supabase CLI**

```bash
mkdir -p ~/contract-service && cd ~/contract-service
git init
supabase init
supabase link --project-ref brwfbyxthuqwwwzlzbwj
mkdir -p supabase/functions/generate-contract home-server
```

- [ ] **Step 2: `.gitignore`**

Conteúdo de `~/contract-service/.gitignore`:

```
.env
.branches/
.temp/
```

- [ ] **Step 3: Verificar o link com o projeto**

Run: `supabase projects list` (dentro de `~/contract-service`)
Expected: `brwfbyxthuqwwwzlzbwj` aparece marcado como linkado.

- [ ] **Step 4: Commit**

```bash
git add .gitignore supabase
git commit -m "chore: inicializa contract-service e linka ao projeto Supabase"
```

---

## Task 2: `fill-docx.ts` — preenchimento dos placeholders

**Depends on:** Task 1.

**Files:**
- Create: `~/contract-service/supabase/functions/generate-contract/fill-docx.ts`
- Test: `~/contract-service/supabase/functions/generate-contract/fill-docx.test.ts`

**Interfaces:**
- Produces: `function fillPlaceholders(docxBytes: Uint8Array, fields: Record<string, string>): Uint8Array`

- [ ] **Step 1: Escrever o teste (falhando)**

Conteúdo de `fill-docx.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import PizZip from 'https://esm.sh/pizzip@3'
import { fillPlaceholders } from './fill-docx.ts'

function fakeDocx(bodyXml: string): Uint8Array {
  const zip = new PizZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  )
  return zip.generate({ type: 'uint8array' })
}

Deno.test('fillPlaceholders - substitui um placeholder conhecido', () => {
  const docx = fakeDocx('<w:p><w:r><w:t>Contrato de {{nome_completo}}</w:t></w:r></w:p>')
  const out = fillPlaceholders(docx, { nome_completo: 'Fulano de Tal' })
  const zip = new PizZip(out)
  const xml = zip.file('word/document.xml')!.asText()
  assertEquals(xml.includes('Contrato de Fulano de Tal'), true)
  assertEquals(xml.includes('{{nome_completo}}'), false)
})

Deno.test('fillPlaceholders - placeholder sem valor no mapa vira string vazia, sem lançar erro', () => {
  const docx = fakeDocx('<w:p><w:r><w:t>RG: {{rg}}</w:t></w:r></w:p>')
  const out = fillPlaceholders(docx, { nome_completo: 'Fulano' })
  const zip = new PizZip(out)
  const xml = zip.file('word/document.xml')!.asText()
  assertEquals(xml.includes('RG: '), true)
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `deno test --allow-read supabase/functions/generate-contract/fill-docx.test.ts`
Expected: FALHA — `fill-docx.ts` ainda não existe.

- [ ] **Step 3: Escrever `fill-docx.ts`**

```ts
import PizZip from 'https://esm.sh/pizzip@3'
import Docxtemplater from 'https://esm.sh/docxtemplater@3'

/**
 * Tag do vocabulário ausente no mapa (ex.: o .docx enviado tem um {{campo}} que o
 * crm-sites não mandou) não pode derrubar a geração inteira -- nullGetter troca por
 * string vazia em vez do comportamento padrão do docxtemplater, que lança erro.
 */
export function fillPlaceholders(docxBytes: Uint8Array, fields: Record<string, string>): Uint8Array {
  const zip = new PizZip(docxBytes)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  })
  doc.render(fields)
  return doc.getZip().generate({ type: 'uint8array' })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `deno test --allow-read supabase/functions/generate-contract/fill-docx.test.ts`
Expected: PASS nos 2 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-contract/fill-docx.ts supabase/functions/generate-contract/fill-docx.test.ts
git commit -m "feat: preenche placeholders de um .docx com docxtemplater"
```

---

## Task 3: `convert-to-pdf.ts` — chamada ao Gotenberg

**Depends on:** Task 1.

**Files:**
- Create: `~/contract-service/supabase/functions/generate-contract/convert-to-pdf.ts`

**Interfaces:**
- Produces: `function convertToPdf(docxBytes: Uint8Array): Promise<Uint8Array>`.
- Consumes: env vars `GOTENBERG_URL` (URL pública completa até
  `/forms/libreoffice/convert`, definida na Task 8 depois que o túnel existir) e
  `GOTENBERG_SECRET`.

Sem teste automatizado nesta task — depende do Gotenberg real, rodando atrás do túnel
(Tasks 6/7). Verificação é manual, na Task 8.

- [ ] **Step 1: Escrever `convert-to-pdf.ts`**

```ts
const GOTENBERG_URL = Deno.env.get('GOTENBERG_URL')!
const GOTENBERG_SECRET = Deno.env.get('GOTENBERG_SECRET')!

/** Converte um .docx (já preenchido) em PDF via Gotenberg, atrás do Caddy do servidor caseiro. */
export async function convertToPdf(docxBytes: Uint8Array): Promise<Uint8Array> {
  const form = new FormData()
  form.append(
    'files',
    new Blob([docxBytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'contrato.docx',
  )

  const res = await fetch(GOTENBERG_URL, {
    method: 'POST',
    headers: { 'X-Gotenberg-Secret': GOTENBERG_SECRET },
    body: form,
  })

  if (!res.ok) {
    throw new Error(`Conversor de PDF indisponível (${res.status}): ${await res.text()}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/generate-contract/convert-to-pdf.ts
git commit -m "feat: adiciona chamada ao Gotenberg pra converter docx em pdf"
```

---

## Task 4: `index.ts` — handler da Edge Function

**Depends on:** Task 2, Task 3.

**Files:**
- Create: `~/contract-service/supabase/functions/generate-contract/index.ts`

**Interfaces:**
- Consumes: `fillPlaceholders` (Task 2), `convertToPdf` (Task 3).
- Produces: endpoint HTTP que recebe `multipart/form-data` com `file` (.docx), `prospect_id`
  (string), `fields` (JSON de `Record<string,string>`), `save` (`"true"`/`"false"`),
  `save_fields` (JSON opcional, só quando `save === "true"`). Responde
  `{ ok: true }` (200) ou `{ error: string }` (400).

- [ ] **Step 1: Escrever `index.ts`**

```ts
// Recebe um .docx com placeholders + um mapa {{placeholder}}: valor já pronto (montado
// pelo crm-sites, que é quem conhece o schema de prospects), preenche, converte pra PDF
// via Gotenberg e salva no Storage. Esta function não sabe nada de nome de coluna de
// prospects além do que vier explicitamente em `save_fields`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fillPlaceholders } from './fill-docx.ts'
import { convertToPdf } from './convert-to-pdf.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  try {
    const form = await req.formData()
    const file = form.get('file')
    const prospectId = form.get('prospect_id')
    const fieldsRaw = form.get('fields')
    const save = form.get('save') === 'true'
    const saveFieldsRaw = form.get('save_fields')

    if (!(file instanceof File)) throw new Error('Arquivo .docx obrigatório.')
    if (typeof prospectId !== 'string' || !prospectId) throw new Error('prospect_id obrigatório.')
    if (typeof fieldsRaw !== 'string') throw new Error('fields obrigatório.')

    const fields: Record<string, string> = JSON.parse(fieldsRaw)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )

    if (save && typeof saveFieldsRaw === 'string') {
      const saveFields = JSON.parse(saveFieldsRaw)
      const { error } = await supabase.from('prospects').update(saveFields).eq('id', prospectId)
      if (error) throw new Error(`Não foi possível salvar os dados do cliente: ${error.message}`)
    }

    const docxBytes = new Uint8Array(await file.arrayBuffer())
    const filledDocx = fillPlaceholders(docxBytes, fields)
    const pdfBytes = await convertToPdf(filledDocx)

    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(`${prospectId}.pdf`, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw new Error(`Não foi possível salvar o PDF: ${uploadError.message}`)

    const { error: updateError } = await supabase
      .from('prospects')
      .update({ contract_generated_at: new Date().toISOString() })
      .eq('id', prospectId)
    if (updateError) throw new Error(`Não foi possível atualizar o prospect: ${updateError.message}`)

    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})
```

- [ ] **Step 2: Verificar sintaxe**

Run: `deno check supabase/functions/generate-contract/index.ts`
Expected: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-contract/index.ts
git commit -m "feat: adiciona handler da edge function generate-contract"
```

---

## Task 5: Deploy da Edge Function

**Depends on:** Task 4.

**Files:** nenhum arquivo novo — só comandos.

- [ ] **Step 1: Deploy**

```bash
cd ~/contract-service
supabase functions deploy generate-contract --project-ref brwfbyxthuqwwwzlzbwj
```

Expected: saída confirmando deploy bem-sucedido da function `generate-contract`.

- [ ] **Step 2: Verificar que a function aparece no projeto**

Use `mcp__claude_ai_Supabase__list_edge_functions` com `project_id` `brwfbyxthuqwwwzlzbwj`.
Expected: `generate-contract` na lista, junto de `add-prospect`.

(Secrets `GOTENBERG_URL`/`GOTENBERG_SECRET` ainda não existem — a function vai falhar se
chamada agora. Isso é esperado: são configurados na Task 8, depois que o túnel da Task 7
existir.)

---

## Task 6: Servidor caseiro — Gotenberg + Caddy

**Depends on:** Task 1 (só a pasta `home-server/`).

**Files:**
- Create: `~/contract-service/home-server/docker-compose.yml`
- Create: `~/contract-service/home-server/Caddyfile`
- Create: `~/contract-service/home-server/.env.example`

**Interfaces:**
- Produces: Gotenberg rodando na rede interna do Docker Compose (`gotenberg:3000`), Caddy
  na frente validando `X-Gotenberg-Secret` e só repassando `/forms/libreoffice/convert`.

- [ ] **Step 1: Conferir a versão estável mais recente do Gotenberg**

Consulte https://github.com/gotenberg/gotenberg/releases e anote a tag mais recente (ex.
`8.x.y`) — não usar `latest`.

- [ ] **Step 2: `docker-compose.yml`**

Conteúdo de `home-server/docker-compose.yml` (troque `<VERSAO>` pela tag do Step 1):

```yaml
services:
  gotenberg:
    image: gotenberg/gotenberg:<VERSAO>
    restart: always

  caddy:
    image: caddy:2.9
    restart: always
    environment:
      - GOTENBERG_SECRET=${GOTENBERG_SECRET}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - gotenberg

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: always
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - caddy
```

- [ ] **Step 3: `Caddyfile`**

Conteúdo de `home-server/Caddyfile` — só a rota de conversão passa, qualquer outro
caminho (incluindo o endpoint do CVE de RCE via ExifTool) recebe 403 antes de chegar no
Gotenberg:

```
:80 {
  @convert {
    path /forms/libreoffice/convert
    header X-Gotenberg-Secret {$GOTENBERG_SECRET}
  }
  handle @convert {
    reverse_proxy gotenberg:3000
  }
  handle {
    respond 403
  }
}
```

- [ ] **Step 4: `.env.example`**

Conteúdo de `home-server/.env.example`:

```
GOTENBERG_SECRET=troque-por-um-segredo-longo-aleatorio
CLOUDFLARE_TUNNEL_TOKEN=cole-o-token-do-dashboard-cloudflare-aqui-na-task-7
```

- [ ] **Step 5: Commit**

```bash
git add home-server/docker-compose.yml home-server/Caddyfile home-server/.env.example
git commit -m "feat: adiciona docker-compose do gotenberg + caddy do servidor caseiro"
```

---

## Task 7: Cloudflare Tunnel

**Depends on:** Task 6.

**Files:**
- Create: `~/contract-service/home-server/.env` (local, fora do git — veja `.gitignore`
  da Task 1)

- [ ] **Step 1: Criar o túnel no dashboard Cloudflare Zero Trust**

No painel Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel → escolha o tipo
"Cloudflared" → dê um nome (ex. `contract-service`) → copie o token exibido (começa com
`ey...`).

- [ ] **Step 2: Configurar o Public Hostname**

Na tela de configuração do túnel, adicione um "Public Hostname": subdomínio à sua escolha
(ex. `contratos.seudominio.com`) apontando pro serviço `http://caddy:80` (nome do serviço
Docker Compose, não `localhost` — os containers estão na mesma rede).

- [ ] **Step 3: Criar `home-server/.env` no servidor caseiro**

```bash
cd ~/contract-service/home-server
cp .env.example .env
```

Edite `.env`: cole o token da Task 7 Step 1 em `CLOUDFLARE_TUNNEL_TOKEN`, e gere o
segredo do Gotenberg:

```bash
openssl rand -hex 32
```

Cole o resultado em `GOTENBERG_SECRET`.

- [ ] **Step 4: Subir os containers**

```bash
cd ~/contract-service/home-server
docker compose up -d
docker compose ps
```

Expected: os 3 serviços (`gotenberg`, `caddy`, `cloudflared`) com status `running`.

- [ ] **Step 5: Validar a conversão manualmente**

Crie um `.docx` de teste qualquer (`teste.docx`) e rode, do seu computador (não precisa
ser o servidor caseiro):

```bash
curl -X POST https://contratos.seudominio.com/forms/libreoffice/convert \
  -H "X-Gotenberg-Secret: <valor do GOTENBERG_SECRET>" \
  -F "files=@teste.docx" \
  -o teste.pdf
```

Expected: `teste.pdf` gerado e abrível.

- [ ] **Step 6: Validar o bloqueio de outras rotas**

```bash
curl -i https://contratos.seudominio.com/forms/pdfengines/metadata/write
```

Expected: `403` — o Caddy nunca repassa essa rota pro Gotenberg, mesmo sem o header
secreto (que nem faria diferença aqui, já que o path não bate com o `@convert` matcher).

---

## Task 8: Secrets da Edge Function + verificação de ponta a ponta

**Depends on:** Task 5, Task 7. E das migrações do plano `2026-09-04-contrato-crm-sites.md`
(Tasks 1 e 2 lá) já aplicadas.

- [ ] **Step 1: Configurar os secrets**

```bash
cd ~/contract-service
supabase secrets set \
  GOTENBERG_URL=https://contratos.seudominio.com/forms/libreoffice/convert \
  GOTENBERG_SECRET=<o mesmo valor do home-server/.env> \
  --project-ref brwfbyxthuqwwwzlzbwj
```

- [ ] **Step 2: Verificação de ponta a ponta pelo crm-sites**

Com o plano `2026-09-04-contrato-crm-sites.md` já implementado (Task 6 dele concluída):
abrir a ficha de um prospect real em `aguardando_pendencias` no dev server do `crm-sites`,
clicar "Gerar contrato", subir um `.docx` de teste com pelo menos um placeholder
conhecido (ex. `{{nome_completo}}`), preencher os campos extras pedidos, marcar "salvar" e
enviar.

Expected: o botão vira "Baixar contrato" + "Refazer contrato"; "Baixar contrato" abre um
PDF com o placeholder substituído pelo nome do prospect; os campos marcados pra salvar
aparecem preenchidos na ficha depois de recarregar.

- [ ] **Step 3: Verificar o registro no banco**

Use `mcp__claude_ai_Supabase__execute_sql` com `project_id` `brwfbyxthuqwwwzlzbwj`:

```sql
select id, name, contract_generated_at, cpf_cnpj, legal_name, rg, cep
from public.prospects
where contract_generated_at is not null
order by contract_generated_at desc
limit 1;
```

Expected: o prospect usado no Step 2, com `contract_generated_at` recente e os campos
extras que foram marcados "salvar" preenchidos.
