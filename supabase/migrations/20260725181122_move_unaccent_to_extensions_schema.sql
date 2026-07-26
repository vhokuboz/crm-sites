-- Tira a extensao unaccent do schema public (lint 0014_extension_in_public).
-- Nenhum indice ou coluna gerada dependia dela, entao a movimentacao e segura.
-- Depois disto, chamadas passam a ser extensions.unaccent(...).

create schema if not exists extensions;
alter extension unaccent set schema extensions;
