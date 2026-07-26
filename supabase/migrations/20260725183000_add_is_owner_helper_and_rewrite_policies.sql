-- Centraliza a definicao de "dono do CRM" em uma unica funcao, para que as
-- proximas tabelas (clientes, projetos, tarefas) nao repitam o e-mail em cada policy.

-- O schema private nao esta na lista de schemas expostos pelo PostgREST,
-- entao is_owner() nao vira um endpoint /rpc/ publico.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

-- security invoker + search_path vazio: a funcao nao eleva privilegio nenhum,
-- so le o claim do JWT. auth.jwt() precisa vir qualificado por causa do search_path.
create or replace function private.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'email'), '') = 'vitor.okubo@outlook.com';
$$;

revoke all on function private.is_owner() from public;
revoke all on function private.is_owner() from anon;
grant execute on function private.is_owner() to authenticated;

comment on function private.is_owner() is
  'Unico ponto que define quem e o dono do CRM. Toda policy de RLS chama esta funcao. Para trocar o dono, altere apenas aqui.';

-- Reescreve as policies usando o helper.
-- A chamada fica dentro de (select ...) para o planner avaliar uma vez por query
-- em vez de uma vez por linha.
drop policy if exists "owner_select_prospects" on public.prospects;
drop policy if exists "owner_insert_prospects" on public.prospects;
drop policy if exists "owner_update_prospects" on public.prospects;
drop policy if exists "owner_delete_prospects" on public.prospects;

create policy "owner_select_prospects" on public.prospects
  for select to authenticated
  using ((select private.is_owner()));

create policy "owner_insert_prospects" on public.prospects
  for insert to authenticated
  with check ((select private.is_owner()));

create policy "owner_update_prospects" on public.prospects
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "owner_delete_prospects" on public.prospects
  for delete to authenticated
  using ((select private.is_owner()));
