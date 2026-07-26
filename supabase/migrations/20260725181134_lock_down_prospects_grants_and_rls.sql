-- CRM de usuario unico: so o dono enxerga e escreve em prospects.
-- A identidade vem do e-mail dentro do JWT, entao nao ha UUID hardcoded
-- e a policy ja vale mesmo antes do usuario existir em auth.users.

-- 1. anon nao deve tocar em nada. O RLS ja barraria, isto e defesa em profundidade:
--    sem GRANT, a chave publicavel recebe "permission denied" antes de avaliar policy.
revoke all on table public.prospects from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- 2. authenticated recebe apenas o CRUD necessario (sem TRUNCATE/REFERENCES/TRIGGER).
revoke all on table public.prospects from authenticated;
grant select, insert, update, delete on table public.prospects to authenticated;

-- 3. RLS. FORCE faz o RLS valer tambem para o dono da tabela;
--    service_role/postgres continuam passando por terem BYPASSRLS.
alter table public.prospects enable row level security;
alter table public.prospects force row level security;

drop policy if exists "owner_select_prospects" on public.prospects;
drop policy if exists "owner_insert_prospects" on public.prospects;
drop policy if exists "owner_update_prospects" on public.prospects;
drop policy if exists "owner_delete_prospects" on public.prospects;

-- auth.jwt() vai dentro de (select ...) para o planner avaliar uma vez por query
-- em vez de uma vez por linha.
create policy "owner_select_prospects" on public.prospects
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'vitor.okubo@outlook.com');

create policy "owner_insert_prospects" on public.prospects
  for insert to authenticated
  with check ((select auth.jwt() ->> 'email') = 'vitor.okubo@outlook.com');

create policy "owner_update_prospects" on public.prospects
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'vitor.okubo@outlook.com')
  with check ((select auth.jwt() ->> 'email') = 'vitor.okubo@outlook.com');

create policy "owner_delete_prospects" on public.prospects
  for delete to authenticated
  using ((select auth.jwt() ->> 'email') = 'vitor.okubo@outlook.com');
