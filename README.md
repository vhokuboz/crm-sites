# CRM · Prospecção

CRM de uso pessoal para o negócio de criação de sites. Uma fonte de dados: o
projeto Supabase `brwfbyxthuqwwwzlzbwj`, tabela `public.prospects`.

## Rodar

```bash
cp .env.example .env.local   # preencha a chave publicável
npm install
npm run dev                  # http://localhost:5173
```

`npm run build` gera `dist/`, que é estático e pode ir para Vercel, Netlify ou
Cloudflare Pages sem servidor nenhum.

## Como está organizado

- `src/lib/domain.ts` — regras de negócio puras: leitura da presença digital,
  cálculo da lacuna, parsing de telefone e Instagram, montagem da fila do dia.
  É onde a maior parte das decisões mora, e é testável sem React.
- `src/lib/useProspects.ts` — carga e escrita otimista contra o Supabase.
- `src/components/` — as três abas (Hoje, Funil, Base), a ficha lateral, o
  medidor de lacuna e os atalhos de contato (`QuickActions`).

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

## Ações rápidas

Cada card (Hoje, Funil, Base e a ficha lateral) traz os atalhos de
`src/components/QuickActions.tsx`: abrir o protótipo, abrir o WhatsApp já com a
mensagem de abordagem, abrir o Instagram, copiar o e-mail para a área de
transferência e abrir o site atual do cliente. O que não tem dado cadastrado não
aparece.

O e-mail tem coluna própria (`prospects.email`) porque a interface age sobre ele;
registros antigos que traziam o endereço dentro de `contact` continuam
funcionando, já que `readEmail` cai para o texto livre quando a coluna está
vazia.

## A lacuna digital

O argumento de venda deste negócio é a distância entre reputação e presença: um
comércio com nota 5,0 no Google e nenhum site é um alvo melhor do que um sem
avaliação e com site razoável. A interface calcula isso colocando as duas coisas
na mesma escala de 0 a 5:

| `website_quality` contém | presença |
| ------------------------ | -------- |
| "sem site"               | 0        |
| "facebook", "problemático", "página em branco" | 1 |
| "fraco", "datado", "genérico", "básico"        | 2 |
| outro texto preenchido   | 3        |
| tem `website`, sem avaliação | 4    |

`lacuna = google_rating − presença`. Quem não tem nota do Google não recebe
lacuna estimada — aparece ordenado apenas pela presença, porque inventar uma
reputação média seria fabricar dado que não existe.

Se você passar a usar outros termos em `website_quality`, ajuste `readPresence`
em `src/lib/domain.ts`.

## Segurança

O RLS já barra tudo que não seja o dono (ver `supabase/migrations/`). A chave
publicável no `.env.local` é pública por design: vai no bundle e não dá acesso a
nada sem um login válido. A `service_role` key nunca deve entrar neste projeto.
# crm-sites
