-- Funil pós-contato: adiciona os 7 status novos que substituem o trecho
-- genérico 'respondeu'/'negociando'/'fechado'. Um valor novo de enum não pode
-- ser usado na mesma transação em que é criado, por isso esta migração só
-- adiciona valores — nada mais (mesmo padrão de
-- 20260725210000_add_prototipado_status.sql).
alter type public.prospect_status add value if not exists 'briefing' after 'contatado';
alter type public.prospect_status add value if not exists 'aguardando_pendencias' after 'briefing';
alter type public.prospect_status add value if not exists 'refinamento' after 'aguardando_pendencias';
alter type public.prospect_status add value if not exists 'em_analise' after 'refinamento';
alter type public.prospect_status add value if not exists 'entrega' after 'em_analise';
alter type public.prospect_status add value if not exists 'aguardando_pagamento' after 'entrega';
alter type public.prospect_status add value if not exists 'finalizado' after 'aguardando_pagamento';
