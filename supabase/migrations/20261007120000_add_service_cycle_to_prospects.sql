-- Ciclo de vida do serviço depois de 'finalizado': 6 meses de mensalidade
-- isenta e, a partir daí, mensalidade paga por Pix manual. O estado (isento,
-- a cobrar, suspender...) é derivado dessas datas no app, não é guardado.
alter table public.prospects
  add column service_started_at date,
  add column free_until date,
  add column paid_until date,
  add column last_reminded_at date,
  add column suspended_at date,
  add column service_ended_at date;

-- Aproximação: não existe carimbo de quando o prospect virou 'finalizado',
-- então updated_at é o melhor palpite. Ajustável pela ficha.
update public.prospects
set service_started_at = updated_at::date,
    free_until = (updated_at::date + interval '6 months')::date
where status = 'finalizado';
