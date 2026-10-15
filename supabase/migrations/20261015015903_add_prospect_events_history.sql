-- Historico de eventos dos prospects: mudancas de status e contatos, com data.
--
-- Hoje o banco guarda so o estado atual (status, ultimo contato). Sem historico
-- nao da para saber em que semana um prospect respondeu, quanto tempo levou
-- ate fechar, nem o que aconteceu com quem acabou "perdido". Esta tabela e
-- preenchida por um gatilho: o app nao muda para gravar.
--
-- O historico comeca na data desta migracao. Os prospects que ja existem
-- recebem um evento-ancora (backfilled = true) com o estado de hoje e, quando
-- ha, o ultimo contato registrado. O caminho que percorreram antes disso nao
-- existe em lugar nenhum e nao e inventado.

create table public.prospect_events (
  id bigint generated always as identity primary key,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  -- 'status': o status mudou. 'contato': houve um novo contato (last_contacted_at avancou).
  kind text not null check (kind in ('status', 'contato')),
  -- Status antes e depois. Em 'contato', os dois valem o status do momento.
  -- Nulos so no evento de criacao (from) e nos contatos recuperados do passado (to).
  from_status public.prospect_status,
  to_status public.prospect_status,
  at timestamptz not null default now(),
  -- true: veio da migracao, nao de um fato observado quando aconteceu.
  backfilled boolean not null default false
);

comment on table public.prospect_events is
  'Historico append-only de status e contatos dos prospects. Preenchido pelo gatilho prospects_record_events; o app so le.';

create index prospect_events_prospect_idx on public.prospect_events (prospect_id, at);
create index prospect_events_kind_at_idx on public.prospect_events (kind, at);

-- ---------------------------------------------------------------- gatilho ---
-- security definer: o gatilho grava mesmo sem o usuario ter INSERT na tabela,
-- entao ninguem edita o historico pelo app nem pela chave publicavel.
-- search_path vazio: tudo qualificado, como nas outras funcoes do projeto.
create or replace function private.record_prospect_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  last_status public.prospect_events%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into public.prospect_events (prospect_id, kind, from_status, to_status)
    values (new.id, 'status', null, new.status);
    return new;
  end if;

  -- Mudanca de status.
  if new.status is distinct from old.status then
    select * into last_status
    from public.prospect_events
    where prospect_id = new.id and kind = 'status' and not backfilled
    order by id desc
    limit 1;

    -- "Desfazer" no app regrava o valor anterior segundos depois. Se a mudanca
    -- inverte exatamente o ultimo evento, recente, ela o cancela em vez de
    -- registrar um vai-e-volta que nunca foi uma decisao.
    if found
       and last_status.from_status is not distinct from new.status
       and last_status.to_status is not distinct from old.status
       and last_status.at > now() - interval '10 minutes' then
      delete from public.prospect_events where id = last_status.id;
    else
      insert into public.prospect_events (prospect_id, kind, from_status, to_status)
      values (new.id, 'status', old.status, new.status);
    end if;
  end if;

  -- Contato: last_contacted_at avancou (ou foi preenchido pela primeira vez).
  if new.last_contacted_at is not null
     and new.last_contacted_at > coalesce(old.last_contacted_at, '-infinity'::timestamptz) then
    insert into public.prospect_events (prospect_id, kind, from_status, to_status)
    values (new.id, 'contato', new.status, new.status);

  -- last_contacted_at voltou para tras (Desfazer): cancela o contato recem-registrado.
  elsif old.last_contacted_at is not null
        and new.last_contacted_at is distinct from old.last_contacted_at
        and (new.last_contacted_at is null or new.last_contacted_at < old.last_contacted_at) then
    delete from public.prospect_events
    where id = (
      select id from public.prospect_events
      where prospect_id = new.id and kind = 'contato' and not backfilled
        and at > now() - interval '10 minutes'
      order by id desc
      limit 1
    );
  end if;

  return new;
end;
$fn$;

revoke all on function private.record_prospect_events() from public;
revoke all on function private.record_prospect_events() from anon;
revoke all on function private.record_prospect_events() from authenticated;

drop trigger if exists prospects_record_events on public.prospects;
create trigger prospects_record_events
  after insert or update of status, last_contacted_at on public.prospects
  for each row execute function private.record_prospect_events();

-- --------------------------------------------------------------- acesso ---
-- Leitura so para o dono. Sem INSERT/UPDATE/DELETE para authenticated: o
-- historico e append-only e quem escreve e o gatilho.
revoke all on table public.prospect_events from anon;
revoke all on table public.prospect_events from authenticated;
grant select on table public.prospect_events to authenticated;

alter table public.prospect_events enable row level security;
alter table public.prospect_events force row level security;

drop policy if exists "owner_select_prospect_events" on public.prospect_events;
create policy "owner_select_prospect_events" on public.prospect_events
  for select to authenticated
  using ((select private.is_owner()));

-- -------------------------------------------------------------- backfill ---
-- Ancora: o estado de cada prospect no momento em que o historico comeca.
insert into public.prospect_events (prospect_id, kind, from_status, to_status, at, backfilled)
select id, 'status', null, status, now(), true
from public.prospects;

-- Ultimo contato conhecido, na data em que de fato aconteceu. O status da epoca
-- nao e conhecido, entao to_status fica nulo.
insert into public.prospect_events (prospect_id, kind, from_status, to_status, at, backfilled)
select id, 'contato', null, null, last_contacted_at, true
from public.prospects
where last_contacted_at is not null;

-- ------------------------------------------------------------- reverter ---
-- Para desfazer esta migracao:
--   drop trigger if exists prospects_record_events on public.prospects;
--   drop function if exists private.record_prospect_events();
--   drop table if exists public.prospect_events;
