-- Como falar com o lead nas mensagens: 'singular' (pessoa) ou 'plural' (espaço/clínica).
-- Nulo = ainda não classificado; o botão "Copiar cobrança" não aparece nesse caso.
alter table public.prospects
  add column tratamento text check (tratamento in ('singular', 'plural'));

-- Backfill só de quem já foi contatado. Ficam de fora, para classificar à mão,
-- "Bianca Calles e Juliana Buzatto" e "Camila Covolan - Studio Postural" (ambíguos).
update public.prospects
set tratamento = case
  when name ~* '^(clinica|espaço|instituto)\y' or name ~* 'associados' then 'plural'
  else 'singular'
end
where status = 'contatado'
  and name not in ('Bianca Calles e Juliana Buzatto', 'Camila Covolan - Studio Postural');
