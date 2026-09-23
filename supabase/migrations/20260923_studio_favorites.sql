-- ============================================================================
-- Mon petit studio créa — débats favoris
-- Date : 2026-09-23
--
-- ⚠️  PAS ENCORE APPLIQUÉE. Faire une sauvegarde de la base avant : elle fait
--    tourner Source en production. Ne pas se fier au mot « Success » de
--    l'éditeur : lire le tableau de vérification à la fin.
--
-- Ajoute une colonne à NOTRE table studio_sessions :
--   favorite : un débat marqué d'une étoile, remonté en tête des listes.
--
-- Ne touche QUE des objets préfixés studio_. Aucun objet de Source n'est
-- modifié. Idempotent : rejouable sans risque. Les policies existantes
-- (auth.uid() = user_id) couvrent déjà cette colonne.
--
-- Tant qu'elle n'est pas appliquée, le studio fonctionne : seul le geste
-- « Ajouter aux favoris » refuse, avec un message qui le dit.
-- ============================================================================

alter table public.studio_sessions add column if not exists favorite boolean not null default false;

notify pgrst, 'reload schema';

-- =============================================================================
-- VÉRIFICATION — c'est CE TABLEAU qui fait foi.
-- Une ligne attendue : favorite (boolean, défaut false).
-- =============================================================================

select column_name as "colonne", data_type as "type", column_default as "défaut"
  from information_schema.columns
 where table_schema = 'public' and table_name = 'studio_sessions'
   and column_name = 'favorite';
