# Mon petit studio créa

App web de brainstorming multi-agents : des personas IA (graphiste, DA, management, éditeur, lecteurs, modératrice) débattent d'un sujet créatif, tour par tour, puis une synthèse est produite. Prolongement de l'app de gestion de projet **La Fabrique** : un débat peut être lancé depuis un projet. Usage personnel, en français.

## Stack

- HTML / CSS / JavaScript vanilla, modules ES. Aucun framework, aucun build, aucune dépendance npm.
- Supabase JS chargé en UMD depuis un CDN, version épinglée.
- Déploiement : GitHub Pages, depuis la racine de `main`, sur le même compte GitHub que La Fabrique (même origine = session Supabase partagée).
- API : Anthropic Messages API, appelée directement depuis le navigateur.

## Relation avec La Fabrique (RÈGLES ABSOLUES)

- Le studio partage le projet Supabase de La Fabrique (base + auth).
- Le studio **LIT** les tables de La Fabrique (projets), il n'y **ÉCRIT JAMAIS**.
- Aucune migration ne modifie, renomme ou supprime une table, colonne, policy ou fonction existante de La Fabrique. Uniquement des créations préfixées `studio_`.
- Toute migration est un fichier SQL daté dans `supabase/migrations/`, relu avant exécution. Rappeler de faire une sauvegarde avant la première.
- Point d'entrée depuis La Fabrique : `index.html?project=<uuid>`. Sans paramètre, le studio fonctionne en débat libre.
- Côté La Fabrique (autre repo, autre session Claude Code) : un bouton « Faire discuter le studio » et un onglet en lecture seule des synthèses. Ne pas le coder ici.

## Données (Supabase)

Tables, toutes avec RLS activée :
- `studio_personas` : personas de l'utilisateur (id, user_id, name, role, emoji, color, prompt, is_moderator, position).
- `studio_sessions` : un débat (id, user_id, project_id nullable, sensitivity, brief, context_sent, participants, rounds, synthesis, created_at). `project_id` référence le projet de La Fabrique avec `on delete set null`.
- `studio_messages` : interventions (id, session_id on delete cascade, agent_id, author_type agent|user, content, round, created_at).
- `studio_project_settings` : réglages par projet (project_id, user_id, sensitivity `pro`|`perso`, default_fields).

RLS : chaque ligne n'est accessible qu'à son `user_id` (`auth.uid()`). Si les projets de La Fabrique sont partagés entre utilisateurs, les sessions liées à un projet suivent les mêmes droits de lecture que le projet ; à vérifier dans les policies existantes avant d'écrire les nôtres.

Au premier lancement, si `studio_personas` est vide, y copier les personas par défaut de `js/agents.js`.

## Confidentialité : projets pro et perso

La Fabrique contient des projets professionnels et personnels. Le contexte d'un projet envoyé à l'IA quitte l'infrastructure : c'est l'utilisateur qui décide, en connaissance de cause.

- Chaque projet a une sensibilité `pro` ou `perso` (table `studio_project_settings`). Si elle n'est pas définie, la demander au lancement du premier débat ; ne jamais la deviner.
- **Projet pro** : aucun champ du projet n'est pré-coché. Le brief est saisi ou réécrit à la main. Bandeau visible « Projet pro : n'envoie que ce qui peut sortir de l'institution ».
- **Projet perso** : les champs utiles sont pré-cochés (titre, brief, notes).
- Toujours : un écran « Ce qui sera envoyé à l'IA » avec les champs cochables et l'aperçu exact du texte, validé avant le lancement.
- Le texte réellement envoyé est enregistré dans `studio_sessions.context_sent` (traçabilité).
- Rien du projet n'est envoyé automatiquement, jamais.

## Clé API Anthropic

- Seul usage du localStorage : la clé, saisie une fois par appareil. Jamais dans Supabase, jamais dans le code ni les commits.
- En-têtes : `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`.
- Bouton « Oublier ma clé ». Toutes les lectures/écritures localStorage dans un try/catch.

## Auth

- Magic link Supabase (e-mail). Réutiliser la session existante de La Fabrique si elle est présente.
- Utiliser la même config de client Supabase que La Fabrique (même `storageKey`) pour que la session soit commune.
- La clé `anon` peut être dans le code ; la sécurité repose sur la RLS.

## Structure

```
index.html
css/style.css          Tokens de design en variables CSS sur :root
js/app.js              Point d'entrée, UI, état
js/supabase.js         Client et accès données (seul fichier qui parle à Supabase)
js/api.js              Appels Anthropic (constante MODEL unique)
js/debate.js           Orchestration des tours, historique, synthèse
js/context.js          Lecture du projet, choix des champs, aperçu, résumé
js/agents.js           Personas par défaut
supabase/migrations/   SQL daté
```

Fichiers courts : découper au-delà de ~300 lignes.

## Déroulé d'une session

1. Sujet : saisi librement, ou venant d'un projet (écran de contexte, voir Confidentialité).
2. Choix des participants et du nombre de tours (1 à 5, défaut 2).
3. Le contexte projet est d'abord condensé en un résumé court (un seul appel), réutilisé par tous les agents : ne jamais renvoyer le contenu brut à chaque tour.
4. La modératrice ouvre, chaque participant parle à son tour en réagissant aux autres.
5. Entre deux tours, l'utilisateur peut intervenir (« Ma remarque »).
6. Synthèse finale de la modératrice : 3 pistes classées, désaccords, prochaine étape.
7. Tout est sauvegardé au fil de l'eau dans Supabase (reprise possible sur un autre appareil). Export Markdown.
8. Bouton stop à tout moment.

## Workflow Git

- Travailler directement sur `main`, pas de branches.
- Commit + push sur `main` après chaque changement fonctionnel qui marche.
- Messages de commit en français, à l'impératif.
- Pas de push d'une migration SQL non exécutée ou non relue : le signaler.

## Design

Un atelier, pas un tableau de bord SaaS. Chaque agent a sa couleur et son emoji ; les interventions s'affichent comme des bulles ou des fiches. Typo soignée (Google Fonts + fallback), clair/sombre selon `prefers-color-scheme`, responsive iPhone/iPad/desktop, cibles tactiles ≥ 44px, contrastes AA. Rester cohérent visuellement avec La Fabrique.

## Conventions de code

- Code en anglais, interface en français.
- État de l'app dans un objet unique.
- Jamais de `innerHTML` avec du contenu issu de l'API ou de la base sans échappement.
