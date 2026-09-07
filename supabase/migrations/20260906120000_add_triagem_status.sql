-- Etapa entre 'novo' e 'prototipado': o agente joga tudo em 'novo' sem
-- curadoria nenhuma, o que misturava, na mesma coluna, prospects nunca vistos
-- com prospects já revisados e aprovados mas ainda não escolhidos para
-- prototipagem. 'triagem' vira a fila curada, deixando 'novo' só com o que
-- realmente ainda falta olhar.
--
-- Fica sozinho nesta migração de propósito: um valor novo de enum só pode ser
-- usado depois que a transação que o criou fez commit.
alter type public.prospect_status add value if not exists 'triagem' before 'prototipado';
