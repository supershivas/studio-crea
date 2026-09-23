-- ============================================================================
-- Mon petit studio créa — titre et archivage des débats
-- Date : 2026-09-22
--
-- ✅ APPLIQUÉE, vérifiée le 2026-09-23 sur information_schema : studio_sessions porte title.
--    Idempotente, rejouable sans risque.
--
-- Ajoute deux colonnes à NOTRE table studio_sessions :
--   title    : titre court produit par la modératrice en fin de débat.
--              L'écran « Débats » affichait le brief entier, souvent illisible.
--   archived : sortir un débat de la liste sans le supprimer.
--
-- Ne touche QUE des objets préfixés studio_. Aucun objet de Source n'est
-- modifié. Idempotent : rejouable sans risque.
-- ============================================================================

alter table public.studio_sessions add column if not exists title    text;
alter table public.studio_sessions add column if not exists archived boolean not null default false;

-- Les débats non archivés sont la vue courante : c'est eux qu'on liste.
create index if not exists studio_sessions_active_idx
  on public.studio_sessions (user_id, created_at desc)
  where archived = false;

notify pgrst, 'reload schema';

-- =============================================================================
-- VÉRIFICATION — c'est CE TABLEAU qui fait foi.
-- Deux lignes attendues : title (text) et archived (boolean, défaut false).
-- =============================================================================

select column_name as "colonne", data_type as "type", column_default as "défaut"
  from information_schema.columns
 where table_schema = 'public' and table_name = 'studio_sessions'
   and column_name in ('title', 'archived')
 order by column_name;
