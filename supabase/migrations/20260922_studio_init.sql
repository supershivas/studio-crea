-- ============================================================================
-- Mon petit studio créa — migration initiale
-- Date : 2026-09-22
--
-- ✅ APPLIQUÉE, vérifiée le 2026-09-23 sur information_schema : les quatre tables studio_ existent.
--    Idempotente, rejouable sans risque.
--
-- Le contrôle de transaction explicite a été retiré : l'éditeur SQL de
-- Supabase gère déjà la sienne. Le script est idempotent, rejouable.
--
-- Ce script ne crée QUE des objets préfixés `studio_`.
-- Il ne modifie, ne renomme et ne supprime AUCUN objet existant de Source
-- (`projects`, `subprojects`, `notes`, `auth.*`).
--
-- Seul point de contact avec Source : la clé étrangère
-- `studio_sessions.project_id -> public.projects(id) on delete set null`.
-- Elle est portée par NOTRE table. Elle n'ajoute ni colonne ni contrainte à
-- `projects`. Conséquence à connaître : `projects` ne peut plus être
-- supprimée ni renommée sans traiter d'abord ces clés étrangères.
--
-- Le script est idempotent (`if not exists` / `drop policy if exists`) :
-- il peut être rejoué sans risque, y compris après un échec partiel.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- studio_personas — les personas de l'utilisateur
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_personas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  role          text not null default '',
  emoji         text not null default '',
  color         text not null default '#C0392B',
  prompt        text not null default '',
  is_moderator  boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists studio_personas_user_position_idx
  on public.studio_personas (user_id, position);

-- ─────────────────────────────────────────────────────────────────────────────
-- studio_sessions — un débat
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Projet Source à l'origine du débat. `on delete set null` : si le projet
  -- disparaît, le débat et sa synthèse restent lisibles.
  project_id    uuid references public.projects (id) on delete set null,

  -- Sensibilité retenue POUR CE DÉBAT, figée au moment du lancement.
  -- Null en débat libre (aucun contexte projet envoyé).
  sensitivity   text check (sensitivity in ('pro', 'perso')),

  brief         text not null default '',

  -- Traçabilité : le texte EXACT envoyé à l'IA, tel que validé sur l'écran
  -- « Ce qui sera envoyé à l'IA ». Vide si rien du projet n'a été envoyé.
  context_sent  text not null default '',

  -- Identifiants des personas participants, dans l'ordre de parole.
  participants  jsonb not null default '[]'::jsonb,

  rounds        integer not null default 2 check (rounds between 1 and 5),
  synthesis     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists studio_sessions_user_created_idx
  on public.studio_sessions (user_id, created_at desc);

create index if not exists studio_sessions_project_idx
  on public.studio_sessions (project_id)
  where project_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- studio_messages — les interventions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_messages (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.studio_sessions (id) on delete cascade,

  -- Persona auteur. Texte libre et non contraint par une FK : un débat archivé
  -- doit rester lisible même si le persona a été renommé ou supprimé depuis.
  -- Null quand author_type = 'user'.
  agent_id     text,

  author_type  text not null check (author_type in ('agent', 'user')),
  content      text not null,
  round        integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists studio_messages_session_created_idx
  on public.studio_messages (session_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- studio_project_settings — réglages par projet
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.studio_project_settings (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,

  -- Décidée explicitement par l'utilisateur, jamais devinée.
  sensitivity    text not null check (sensitivity in ('pro', 'perso')),

  -- Champs du projet cochés par défaut sur l'écran de contexte.
  default_fields jsonb not null default '[]'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, project_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
--
-- Les projets de Source ne sont pas partagés entre utilisateurs : chaque ligne
-- n'appartient qu'à son `user_id`. Policies déclarées par verbe, avec un
-- `with_check` explicite sur INSERT et UPDATE pour qu'une ligne ne puisse pas
-- être déplacée vers un autre utilisateur.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.studio_personas         enable row level security;
alter table public.studio_sessions         enable row level security;
alter table public.studio_messages         enable row level security;
alter table public.studio_project_settings enable row level security;

-- ── studio_personas ──────────────────────────────────────────────────────────
drop policy if exists studio_personas_select on public.studio_personas;
create policy studio_personas_select on public.studio_personas
  for select using (auth.uid() = user_id);

drop policy if exists studio_personas_insert on public.studio_personas;
create policy studio_personas_insert on public.studio_personas
  for insert with check (auth.uid() = user_id);

drop policy if exists studio_personas_update on public.studio_personas;
create policy studio_personas_update on public.studio_personas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists studio_personas_delete on public.studio_personas;
create policy studio_personas_delete on public.studio_personas
  for delete using (auth.uid() = user_id);

-- ── studio_sessions ──────────────────────────────────────────────────────────
-- `project_id` n'est pas vérifié ici : la RLS de `projects` empêche déjà de
-- lire un projet qui n'est pas le sien, donc un id étranger ne donnerait accès
-- à aucun contenu.
drop policy if exists studio_sessions_select on public.studio_sessions;
create policy studio_sessions_select on public.studio_sessions
  for select using (auth.uid() = user_id);

drop policy if exists studio_sessions_insert on public.studio_sessions;
create policy studio_sessions_insert on public.studio_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists studio_sessions_update on public.studio_sessions;
create policy studio_sessions_update on public.studio_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists studio_sessions_delete on public.studio_sessions;
create policy studio_sessions_delete on public.studio_sessions
  for delete using (auth.uid() = user_id);

-- ── studio_messages ──────────────────────────────────────────────────────────
-- Pas de `user_id` propre : l'accès passe par la session parente, comme les
-- policies de `subprojects` et `notes` chez Source.
drop policy if exists studio_messages_select on public.studio_messages;
create policy studio_messages_select on public.studio_messages
  for select using (
    exists (
      select 1 from public.studio_sessions s
      where s.id = studio_messages.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists studio_messages_insert on public.studio_messages;
create policy studio_messages_insert on public.studio_messages
  for insert with check (
    exists (
      select 1 from public.studio_sessions s
      where s.id = studio_messages.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists studio_messages_update on public.studio_messages;
create policy studio_messages_update on public.studio_messages
  for update using (
    exists (
      select 1 from public.studio_sessions s
      where s.id = studio_messages.session_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.studio_sessions s
      where s.id = studio_messages.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists studio_messages_delete on public.studio_messages;
create policy studio_messages_delete on public.studio_messages
  for delete using (
    exists (
      select 1 from public.studio_sessions s
      where s.id = studio_messages.session_id and s.user_id = auth.uid()
    )
  );

-- ── studio_project_settings ──────────────────────────────────────────────────
drop policy if exists studio_project_settings_select on public.studio_project_settings;
create policy studio_project_settings_select on public.studio_project_settings
  for select using (auth.uid() = user_id);

drop policy if exists studio_project_settings_insert on public.studio_project_settings;
create policy studio_project_settings_insert on public.studio_project_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists studio_project_settings_update on public.studio_project_settings;
create policy studio_project_settings_update on public.studio_project_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists studio_project_settings_delete on public.studio_project_settings;
create policy studio_project_settings_delete on public.studio_project_settings
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- DROITS
--
-- RLS et GRANT sont deux barrières distinctes, toutes les deux nécessaires :
-- le GRANT ouvre la table au rôle, la policy décide quelles lignes il voit.
-- Sans GRANT, PostgREST n'expose pas la table et renvoie « Could not find the
-- table ... in the schema cache », ce qui ressemble à tort à une table absente.
--
-- `anon` ne reçoit rien : le studio exige une connexion.
-- =============================================================================

grant select, insert, update, delete on table public.studio_personas         to authenticated;
grant select, insert, update, delete on table public.studio_sessions         to authenticated;
grant select, insert, update, delete on table public.studio_messages         to authenticated;
grant select, insert, update, delete on table public.studio_project_settings to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- VÉRIFICATION — c'est CE TABLEAU qui fait foi, pas le mot « Success ».
-- Quatre lignes attendues, chacune avec rls = true, policies = 4, droits = 4.
-- Zéro ligne signifie que rien n'a été créé.
-- =============================================================================

select
  c.relname        as "table",
  c.relrowsecurity as "rls",
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as "policies",
  (select count(distinct g.privilege_type) from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = c.relname
       and g.grantee = 'authenticated') as "droits"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'studio\_%'
order by c.relname;
