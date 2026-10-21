-- city caía em 'Bauru/SP' para todo prospect inserido sem cidade; vazio é
-- tratado como "Sem cidade" no app (stats.ts).
alter table public.prospects alter column city set default '';
