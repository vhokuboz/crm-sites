-- As policies de storage.objects criadas em
-- 20260904140100_add_contracts_storage_bucket.sql não tinham `drop policy if
-- exists` antes do `create policy` (diferente do padrão já usado em
-- 20260725183000_add_is_owner_helper_and_rewrite_policies.sql) -- reexecutar
-- a migration original num ambiente que já tem essas policies dá erro.
drop policy if exists "owner_select_contracts" on storage.objects;
drop policy if exists "owner_insert_contracts" on storage.objects;
drop policy if exists "owner_update_contracts" on storage.objects;

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
