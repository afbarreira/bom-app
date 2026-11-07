-- =========================================================
-- BOM! — banco de dados no Supabase (PostgreSQL)
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- (versão sem funções: só tabelas, índices e regras de segurança)
--
-- Modelo de dados do documento:
--   usuarios (1) ── (N) dispositivos
--   usuarios (1) ── (N) logs_acesso
-- E-mail e senha ficam no Supabase Auth (a senha nunca vai para estas tabelas).
-- =========================================================

-- ---------- Tabelas ----------
create table if not exists public.usuarios (
  uid            uuid primary key references auth.users(id) on delete cascade,
  nome           text not null,
  email          text not null,
  perfil         text not null default 'usuario' check (perfil in ('usuario', 'admin')),
  data_cadastro  timestamptz not null default now(),
  ativo          boolean not null default true
);

create table if not exists public.dispositivos (
  uid               uuid not null references public.usuarios(uid) on delete cascade,
  id_dispositivo    text not null,
  nome_dispositivo  text not null,
  plataforma        text not null,
  ultimo_acesso     timestamptz not null default now(),
  primary key (uid, id_dispositivo)
);

create table if not exists public.logs_acesso (
  id_log            uuid primary key default gen_random_uuid(),
  uid               uuid not null references public.usuarios(uid) on delete cascade,
  nome_usuario      text not null,
  id_dispositivo    text not null,
  nome_dispositivo  text,
  data_login        timestamptz not null default now(),
  hora_logout       timestamptz,
  situacao          text not null default 'ativa' check (situacao in ('ativa', 'encerrada'))
);

create index if not exists logs_acesso_uid_data on public.logs_acesso (uid, data_login desc);
create index if not exists logs_acesso_data on public.logs_acesso (data_login desc);

-- ---------- Regras de segurança (Row Level Security) ----------
-- Quem é administrador fica marcado no próprio Supabase Auth (app_metadata.perfil = 'admin').
-- Esse campo não pode ser alterado pelo app, só pelo painel/SQL.
alter table public.usuarios     enable row level security;
alter table public.dispositivos enable row level security;
alter table public.logs_acesso  enable row level security;

-- usuarios: cada um lê o próprio perfil; o admin lê todos
drop policy if exists usuarios_ler on public.usuarios;
create policy usuarios_ler on public.usuarios for select to authenticated
  using (uid = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin');

-- cadastro: cada um cria só o próprio perfil, sempre como "usuario" e ativo
drop policy if exists usuarios_criar on public.usuarios;
create policy usuarios_criar on public.usuarios for insert to authenticated
  with check (uid = auth.uid() and perfil = 'usuario' and ativo = true);

-- o admin ativa/desativa outras contas (só o campo "ativo", ver permissões abaixo)
drop policy if exists usuarios_admin_altera on public.usuarios;
create policy usuarios_admin_altera on public.usuarios for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin' and uid <> auth.uid())
  with check ((auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin');

-- dispositivos: cada um registra e lê os próprios; o admin lê todos
drop policy if exists dispositivos_ler on public.dispositivos;
create policy dispositivos_ler on public.dispositivos for select to authenticated
  using (uid = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin');

drop policy if exists dispositivos_inserir on public.dispositivos;
create policy dispositivos_inserir on public.dispositivos for insert to authenticated
  with check (uid = auth.uid());

drop policy if exists dispositivos_atualizar on public.dispositivos;
create policy dispositivos_atualizar on public.dispositivos for update to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- logs_acesso: cada um lê o próprio histórico; o admin lê o de todos
drop policy if exists logs_ler on public.logs_acesso;
create policy logs_ler on public.logs_acesso for select to authenticated
  using (uid = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin');

-- login: só cria registro da própria conta ativa, como sessão "ativa" e sem logout
drop policy if exists logs_abrir on public.logs_acesso;
create policy logs_abrir on public.logs_acesso for insert to authenticated
  with check (
    uid = auth.uid() and situacao = 'ativa' and hora_logout is null
    and exists (select 1 from public.usuarios u where u.uid = auth.uid() and u.ativo)
  );

-- logout: só preenche hora_logout e situacao (o admin também, ao desativar uma conta)
drop policy if exists logs_fechar on public.logs_acesso;
create policy logs_fechar on public.logs_acesso for update to authenticated
  using (uid = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin')
  with check (uid = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'perfil') = 'admin');

-- ---------- Permissões por coluna ----------
revoke all on public.usuarios from anon, authenticated;
grant select on public.usuarios to authenticated;
grant insert (uid, nome, email) on public.usuarios to authenticated;
grant update (ativo) on public.usuarios to authenticated;

revoke all on public.dispositivos from anon;
grant select, insert, update on public.dispositivos to authenticated;

revoke all on public.logs_acesso from anon, authenticated;
grant select, insert on public.logs_acesso to authenticated;
grant update (hora_logout, situacao) on public.logs_acesso to authenticated;

-- =========================================================
-- Depois de se cadastrar no app, torne sua conta administradora
-- (troque o e-mail nas DUAS linhas, rode, e depois saia e entre de novo no app):
--
-- update public.usuarios set perfil = 'admin' where email = 'seu-email@exemplo.com';
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"perfil":"admin"}' where email = 'seu-email@exemplo.com';
-- =========================================================
