-- ============================================================================
-- Mon petit studio créa — profils de personas enrichis (v2, étape 1)
-- Date : 2026-09-22
--
-- ⚠️  PAS ENCORE APPLIQUÉE. Ne pas se fier au mot « Success » de l'éditeur :
--    lire le tableau de vérification à la fin.
--
-- Ajoute des colonnes à NOS tables. Aucune colonne existante n'est modifiée,
-- aucun persona déjà enregistré n'est écrasé : les nouvelles colonnes naissent
-- vides, et l'app propose « Mettre à jour vers les nouveaux profils ».
--
-- studio_personas
--   default_id   : identifiant du persona par défaut dont il est issu, pour
--                  retrouver les castings après copie en base (les id deviennent
--                  des uuid). Null pour un persona créé de toutes pièces.
--   identity     : qui est ce persona, son parcours, en quelques phrases
--   expertise    : domaines où il est précis et technique (tableau)
--   canon        : références qu'il cite volontiers (tableau)
--   voice        : sa façon de parler, ses tics, son registre
--   blind_spots  : ce qu'il néglige — c'est ce qui rend le débat vivant
--   never_says   : ce qu'il ne dit jamais (tableau)
--   domain_notes : nuances par type de projet, injectées seulement si le type
--                  correspond — { "edition": "…", "web": "…" }
--   sliders      : réglages de comportement, avec leurs cinq niveaux rédigés
--   model        : modèle propre à ce persona, null = celui des réglages
--
-- studio_sessions
--   personas_snapshot : copie figée des personas et réglages utilisés, pour
--                       qu'un débat archivé reste compréhensible même après
--                       modification des personas
--   project_type      : type de projet (édition, web, identité, événement…)
--   audience          : public visé, texte libre
--
-- `never_says` plutôt que `never` : moins de risque de collision avec un mot
-- réservé, ici ou dans un futur PostgreSQL.
--
-- Ne touche QUE des objets préfixés studio_. Idempotent : rejouable sans risque.
-- ============================================================================

alter table public.studio_personas add column if not exists default_id   text;
alter table public.studio_personas add column if not exists identity     text;
alter table public.studio_personas add column if not exists expertise    jsonb not null default '[]'::jsonb;
alter table public.studio_personas add column if not exists canon        jsonb not null default '[]'::jsonb;
alter table public.studio_personas add column if not exists voice        text;
alter table public.studio_personas add column if not exists blind_spots  text;
alter table public.studio_personas add column if not exists never_says   jsonb not null default '[]'::jsonb;
alter table public.studio_personas add column if not exists domain_notes jsonb not null default '{}'::jsonb;
alter table public.studio_personas add column if not exists sliders      jsonb not null default '[]'::jsonb;
alter table public.studio_personas add column if not exists model        text;

alter table public.studio_sessions add column if not exists personas_snapshot jsonb;
alter table public.studio_sessions add column if not exists project_type      text;
alter table public.studio_sessions add column if not exists audience          text;

notify pgrst, 'reload schema';

-- =============================================================================
-- VÉRIFICATION — c'est CE TABLEAU qui fait foi, pas le mot « Success ».
-- 13 lignes attendues : 10 sur studio_personas, 3 sur studio_sessions.
-- =============================================================================

select table_name as "table", column_name as "colonne", data_type as "type"
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'studio_personas' and column_name in
       ('default_id','identity','expertise','canon','voice','blind_spots',
        'never_says','domain_notes','sliders','model'))
     or
     (table_name = 'studio_sessions' and column_name in
       ('personas_snapshot','project_type','audience'))
   )
 order by table_name, column_name;
