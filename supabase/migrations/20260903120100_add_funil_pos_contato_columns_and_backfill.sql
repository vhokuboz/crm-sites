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
