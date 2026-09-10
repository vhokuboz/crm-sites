-- Mensalidade de hospedagem/manutenção: opcional, porque o cliente pode
-- comprar só o site e hospedar por conta própria (sem contrato recorrente
-- com a gente).
alter table public.prospects
  add column monthly_fee numeric;
