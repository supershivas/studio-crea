-- ============================================================================
-- Mon petit studio créa — droits sur les tables studio_ et rechargement du
-- cache de schéma de PostgREST.
-- Date : 2026-09-22
--
-- Corrige : « Could not find the table 'public.studio_personas' in the
-- schema cache » (PGRST205) au premier lancement.
--
-- La migration initiale créait les tables et leurs policies RLS, mais aucun
-- GRANT. Sans privilège pour le rôle `authenticated`, PostgREST n'expose pas
-- la table : elle n'apparaît pas dans son cache de schéma, d'où l'erreur, qui
-- ressemble à tort à une table manquante.
--
-- RLS et GRANT sont deux barrières distinctes, toutes les deux nécessaires :
-- le GRANT ouvre la table au rôle, la policy décide quelles lignes il voit.
-- Les policies restent inchangées : chacun ne voit que ses propres lignes.
--
-- `anon` ne reçoit rien : le studio exige une connexion.
--
-- Ne touche QUE des objets préfixés studio_. Idempotent.
-- ============================================================================

begin;

grant select, insert, update, delete on table public.studio_personas         to authenticated;
grant select, insert, update, delete on table public.studio_sessions         to authenticated;
grant select, insert, update, delete on table public.studio_messages         to authenticated;
grant select, insert, update, delete on table public.studio_project_settings to authenticated;

commit;

-- Demande à PostgREST de relire le schéma. Hors transaction : le signal doit
-- partir même si la transaction ci-dessus a déjà été validée.
notify pgrst, 'reload schema';
