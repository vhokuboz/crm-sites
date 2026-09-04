-- Bucket privado pro PDF do contrato gerado -- leitura/escrita restrita ao
-- dono do CRM, mesmo padrão de private.is_owner() já usado em prospects
-- (ver 20260725183000_add_is_owner_helper_and_rewrite_policies.sql).
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

create policy "owner_select_contracts" on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and (select private.is_owner()));

create policy "owner_insert_contracts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contracts' and (select private.is_owner()));

create policy "owner_update_contracts" on storage.objects
  for update to authenticated
  using (bucket_id = 'contracts' and (select private.is_owner()))
  with check (bucket_id = 'contracts' and (select private.is_owner()));
