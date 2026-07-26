-- Etapa entre 'novo' e 'contatado': o protótipo do site já foi gerado, mas o
-- prospect ainda não foi abordado. Separa quem está pronto para a conversa de
-- quem ainda depende do agente de prototipagem.
--
-- Fica sozinho nesta migração de propósito: um valor novo de enum só pode ser
-- usado depois que a transação que o criou fez commit.
alter type public.prospect_status add value if not exists 'prototipado' before 'contatado';
