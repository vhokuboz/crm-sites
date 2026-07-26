-- Rede de seguranca para as proximas tabelas (clientes, projetos, tarefas):
-- toda tabela criada em public nasce com RLS ligado, mesmo que alguem esqueca.
-- Sem isto, uma tabela nova fica legivel por qualquer um com a chave publicavel do front.
--
-- Equivalente ao botao "Set up trigger" do painel, mas versionado aqui.
--
-- ATENCAO: RLS ligado e SEM policy bloqueia tudo. Ao criar uma tabela nova,
-- lembre de criar as policies usando private.is_owner().

create or replace function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_catalog.pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
    raise notice 'RLS habilitado automaticamente em %', obj.object_identity;
  end loop;
end;
$$;

comment on function private.enable_rls_on_new_tables() is
  'Event trigger: liga RLS em qualquer tabela criada no schema public. Lembre-se de que RLS sem policy bloqueia tudo -- crie as policies com private.is_owner().';

drop event trigger if exists enable_rls_on_new_tables;

-- CREATE TABLE AS e SELECT INTO entram na lista porque geram tabelas reais
-- e sao justamente os caminhos mais faceis de esquecer.
create event trigger enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_tables();
