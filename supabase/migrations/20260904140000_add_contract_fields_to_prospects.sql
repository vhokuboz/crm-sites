-- Campos extras exigidos pelo contrato (CPF/CNPJ, nome legal, RG, CEP) e o
-- carimbo de quando o contrato foi gerado pela última vez -- é a fonte da
-- verdade de "existe contrato?" pro botão da ficha, sem bater no Storage a
-- cada render.
alter table public.prospects
  add column cpf_cnpj text,
  add column legal_name text,
  add column rg text,
  add column cep text,
  add column contract_generated_at timestamptz;
