-- `contact` é texto livre da prospecção e sempre trouxe telefone. O e-mail ganha
-- coluna própria porque a interface age sobre ele (copiar o endereço) e precisa
-- de um valor confiável, não de um trecho garimpado em texto livre.
alter table public.prospects add column if not exists email text;

-- Quem já tem protótipo publicado e nunca foi contatado passa para a nova etapa.
update public.prospects
   set status = 'prototipado'
 where status = 'novo'
   and landing_page_url is not null;
