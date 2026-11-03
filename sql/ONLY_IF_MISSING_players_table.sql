-- RUN THIS ONLY IF public.players DOES NOT EXIST!
-- The server accesses the table with a server-side Supabase secret.
-- DO NOT drop, truncate or reset an existing table of player accounts.
create table if not exists public.players (
  id text primary key,
  data jsonb not null
);
alter table public.players enable row level security;
-- No public SELECT/INSERT/UPDATE policies: game data is handled by the server
-- using a privileged Supabase key. Do not expose this key to browser JS.
