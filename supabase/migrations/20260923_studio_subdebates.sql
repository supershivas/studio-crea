-- ============================================================================
-- Mon petit studio créa — sous-discussions
-- Date : 2026-09-23
--
-- ✅ APPLIQUÉE le 2026-09-23 : le tableau de vérification a renvoyé
--    focus (text) et parent_id (uuid). Rejouable sans risque.
--
-- Ajoute deux colonnes à NOTRE table studio_sessions :
--   parent_id : le débat d'origine d'une sous-discussion. `on delete set null` :
--               supprimer le débat d'origine laisse la sous-discussion lisible.
--   focus     : le point précis qu'elle creuse. Null = reprise en général.
--
-- Ne touche QUE des objets préfixés studio_. Aucun objet de Source n'est
-- modifié. Idempotent : rejouable sans risque. Les policies existantes
-- (auth.uid() = user_id) couvrent déjà ces colonnes.
--
-- Tant qu'elle n'est pas appliquée, le studio fonctionne : seules les
-- sous-discussions refusent de se créer, avec un message qui le dit.
-- ============================================================================

alter table public.studio_sessions add column if not exists parent_id uuid
  references public.studio_sessions (id) on delete set null;
alter table public.studio_sessions add column if not exists focus text;

create index if not exists studio_sessions_parent_idx
  on public.studio_sessions (parent_id)
  where parent_id is not null;

notify pgrst, 'reload schema';

-- =============================================================================
-- VÉRIFICATION — c'est CE TABLEAU qui fait foi.
-- Deux lignes attendues : focus (text) et parent_id (uuid).
-- =============================================================================

select column_name as "colonne", data_type as "type"
  from information_schema.columns
 where table_schema = 'public' and table_name = 'studio_sessions'
   and column_name in ('parent_id', 'focus')
 order by column_name;
