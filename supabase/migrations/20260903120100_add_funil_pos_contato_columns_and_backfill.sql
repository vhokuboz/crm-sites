alter table public.prospects
  add column contact_attempts integer not null default 0,
  add column docs_received boolean not null default false,
  add column deposit_paid_amount numeric,
  add column final_paid_amount numeric,
  add column revision_count integer not null default 0,
  add column deal_value numeric;

update public.prospects set status = 'refinamento'
  where id = '71c8f749-5850-4cf5-aa22-bd05ec6e7296';

update public.prospects set status = 'finalizado'
  where id = 'fccade1b-96c9-4d96-824f-d89eeb41b2e0';
