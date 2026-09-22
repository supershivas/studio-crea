# Mon petit studio créa

App web de brainstorming multi-agents : des personas IA (graphiste, DA, management, éditeur, lecteurs, modératrice) débattent d'un sujet créatif, tour par tour, puis une synthèse est produite. Prolongement de l'app de gestion de projet **Source** : un débat peut être lancé depuis un projet. Usage personnel, en français.

## Stack

- HTML / CSS / JavaScript vanilla, modules ES. Aucun framework, aucun build, aucune dépendance npm.
- Supabase JS chargé en UMD depuis un CDN, **version épinglée** (`@supabase/supabase-js@2.45.0`, alignée sur celle de Source). Jamais de `@2` flottant.
- Déploiement : GitHub Pages, depuis la racine de `main`.
- API : Anthropic Messages API, appelée directement depuis le navigateur.

## Relation avec Source (RÈGLES ABSOLUES)

**Source** (`supershivas/source`, https://source-sigma-kohl.vercel.app/app) est l'app de gestion de projet. C'est une app Next.js / React / TypeScript / Tailwind déployée sur Vercel.

> Le dépôt `supershivas/La-fabrique` est l'ancêtre de Source (même app, ancien nom, ancienne stack vanilla). Il est **mort** : ne jamais s'y référer pour connaître le comportement réel de l'app.

- Le studio partage le projet Supabase de Source (base + auth).
- Le studio **LIT** les tables de Source (`projects`, `subprojects`, `notes`), il n'y **ÉCRIT JAMAIS**.
- Aucune migration ne modifie, renomme ou supprime une table, colonne, policy ou fonction existante de Source. Uniquement des créations préfixées `studio_`.
- Toute migration est un fichier SQL daté dans `supabase/migrations/`, relu avant exécution. La base fait tourner Source en production : rappeler de faire une sauvegarde avant d'exécuter quoi que ce soit.
- Point d'entrée depuis Source : `index.html?project=<uuid>`. Sans paramètre, le studio fonctionne en débat libre.
- Le studio et Source sont sur des hôtes différents : le lien depuis Source est un lien externe.
- Côté Source (autre repo, autre session Claude Code) : un bouton « Faire discuter le studio » et un onglet en lecture seule des synthèses. Ne pas le coder ici.

## Données (Supabase)

Projet Supabase partagé avec Source (ref `mrivfwlxnmtgkifjucvd`).

### Tables lues (appartiennent à Source — lecture seule)

- `projects` : `id`, `user_id`, `number`, `name`, `cat` (`pro`|`perso`), `year`, `status`, `progress`, `importance`, `editor`, `client`, `date`, `deadline`, `ended`, `archived`, `trashed`, `sort_order`, `updated_at`.
- `subprojects` : `id`, `parent_id`, `number`, `name`, `status`, `progress`, `deadline`, `ended`, `archived`, `trashed`, `updated_at`.
- `notes` : `id`, `project_id`, `subproject_id`, `text`, `date`, `created_at`.

Ignorer les projets `trashed`. Le champ `cat` sert à **proposer** la sensibilité du projet (voir Confidentialité) — jamais à la décider.

### Tables du studio (toutes avec RLS activée, toutes préfixées `studio_`)

- `studio_personas` : personas de l'utilisateur (id, user_id, name, role, emoji, color, prompt, is_moderator, position).
- `studio_sessions` : un débat (id, user_id, project_id nullable, sensitivity, brief, context_sent, participants, rounds, synthesis, created_at). `project_id` référence le projet de Source avec `on delete set null`.
- `studio_messages` : interventions (id, session_id on delete cascade, agent_id, author_type agent|user, content, round, created_at).
- `studio_project_settings` : réglages par projet (project_id, user_id, sensitivity `pro`|`perso`, default_fields).

### RLS

Les projets de Source ne sont **pas partagés entre utilisateurs** : les policies existantes sont `auth.uid() = user_id` sur `projects`, et un `EXISTS` sur le projet parent pour `subprojects` et `notes`. Nos policies suivent la même règle simple : `auth.uid() = user_id`, déclarées **par verbe**, avec un `with_check` explicite sur INSERT et UPDATE.

`user_id` prend `default auth.uid()` au niveau de la colonne, comme `projects` chez Source : le client n'envoie jamais `user_id`.

Au premier lancement, si `studio_personas` est vide, y copier les personas par défaut de `js/agents.js`. La colonne `default_id` garde le lien avec le profil d'origine, pour que les castings par type de projet survivent à la copie.

Les personas sont **transversaux** : aucune mention de livre, de croquis ou d'impression hors `domain_notes`. Leur expertise se transpose au type de projet de la session. Le prompt système n'est jamais écrit à la main : il est assemblé par `buildSystemPrompt` dans `js/prompt.js`, et le modèle ne reçoit jamais la valeur d'un curseur, seulement la phrase du niveau correspondant.

## Confidentialité : projets pro et perso

Source contient des projets professionnels et personnels. Le contexte d'un projet envoyé à l'IA quitte l'infrastructure : c'est l'utilisateur qui décide, en connaissance de cause.

- Chaque projet a une sensibilité `pro` ou `perso` (table `studio_project_settings`). Si elle n'est pas définie, la demander au lancement du premier débat, en **pré-sélectionnant** la valeur de `projects.cat` sans jamais la valider d'office.
- **Projet pro** : aucun champ du projet n'est pré-coché. Le brief est saisi ou réécrit à la main. Bandeau visible « Projet pro : n'envoie que ce qui peut sortir de l'institution ».
- **Projet perso** : les champs utiles sont pré-cochés (titre, brief, notes).
- Toujours : un écran « Ce qui sera envoyé à l'IA » avec les champs cochables et l'aperçu exact du texte, validé avant le lancement.
- Le texte réellement envoyé est enregistré dans `studio_sessions.context_sent` (traçabilité).
- Rien du projet n'est envoyé automatiquement, jamais.

## Clé API Anthropic

- La clé est saisie une fois par appareil et stockée en localStorage. Jamais dans Supabase, jamais dans le code ni les commits.
- Le modèle est choisi dans les réglages, parmi la liste `MODELS` de `js/api.js`, et mémorisé par appareil. Les modèles n'acceptent pas les mêmes paramètres : `effort` échoue sur Haiku 4.5, `fallbacks` ne vise que la famille Opus. Ces différences sont déclarées par modèle, jamais devinées.
- En-têtes : `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`.
- Bouton « Oublier ma clé ». Toutes les lectures/écritures localStorage dans un try/catch.

## Auth

**E-mail + mot de passe**, comme Source : `signInWithPassword`, `signUp`, `resetPasswordForEmail`. Pas de magic link — en PWA ajoutée à l'écran d'accueil sur iPhone, le lien s'ouvre dans Safari, dont le stockage est séparé de celui de la PWA : la session atterrit au mauvais endroit et l'app reste déconnectée.

Le studio a **son propre écran de connexion et sa propre session** :

- Source utilise `@supabase/ssr`, qui stocke la session dans des **cookies host-only**. Le studio est sur un autre hôte : la session n'est pas partagée et ne peut pas l'être. Il n'y a pas de `storageKey` à aligner.
- Le studio utilise `supabase-js` en UMD, avec sa propre session en localStorage.
- Même compte, mêmes identifiants, une connexion par appareil en plus de celle de Source.
- Gérer le retour de réinitialisation : intercepter le hash `type=recovery` au chargement et ouvrir l'écran de nouveau mot de passe.
- La clé `anon` peut être dans le code ; la sécurité repose sur la RLS.

## Structure

```
index.html
css/style.css          Tokens de design en variables CSS sur :root
css/mobile.css         Copie de design-system/mobile.css (ne pas éditer à la main)
js/app.js              Point d'entrée, UI, état
js/supabase.js         Seule porte d'entrée vers Supabase (ré-exporte js/db/)
js/db/client.js        Le client Supabase et lui seul
js/db/auth.js          Connexion, inscription, mot de passe
js/db/projects.js      Tables de Source en lecture seule + studio_project_settings
js/db/personas.js      studio_personas
js/db/debates.js       studio_sessions et studio_messages
js/api.js              Appels Anthropic (liste MODELS, choix dans les réglages)
js/debate.js           Orchestration des tours, historique, synthèse
js/context.js          Lecture du projet, choix des champs, aperçu, résumé
js/agents.js           Personas qui fabriquent le projet (profils enrichis)
js/agents-views.js     Personas regards extérieurs (garde-fou, com, presse, publics)
js/castings.js         Types de projet et castings proposés
js/prompt.js           Assemblage du prompt système, curseurs globaux
js/sliders.js          Rendu des curseurs, préréglages, mémoire locale
js/personas.js         Écran d'édition des personas
js/session.js          Déroulé d'un débat : casting, lancement, prolongation
js/context-screen.js   Écran « Ce qui sera envoyé à l'IA »
js/history.js          Débats passés : liste, actions, relecture
js/thread.js           Rendu du fil (message, synthèse, politesse du scroll)
js/state.js            État de l'app et routage entre écrans
js/ui.js               Rendu DOM (aucun innerHTML)
design-tokens.json     Copie de design-system (ne pas éditer à la main)
scripts/sync-tokens.sh Récupère design-tokens.json et mobile.css
supabase/migrations/   SQL daté
```

Fichiers courts : découper au-delà de ~300 lignes. L'accès aux données est
découpé par domaine dans `js/db/`, mais **aucun module hors de `js/db/` ne
touche au client** : tout le reste de l'app importe `js/supabase.js`, et lui
seul.

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

Un atelier, pas un tableau de bord SaaS. Chaque agent a sa couleur et son emoji ; les interventions s'affichent comme des bulles ou des fiches. Typo soignée (Google Fonts + fallback), responsive iPhone/iPad/desktop, cibles tactiles ≥ 44px, contrastes AA.

### Cohérence avec Source

Source de vérité canonique des valeurs partagées : `supershivas/design-system` (`design-tokens.json` + `mobile.css`), récupérée via `./scripts/sync-tokens.sh`. Ne jamais modifier une valeur partagée seulement ici.

- **Accent cramoisi fixe** `#C0392B`, hover `#9B2D22`. Pas de sélecteur d'accent (Source n'en a plus).
- **Thème clair/sombre par classe `html.dark` + réglage en localStorage**, pas `prefers-color-scheme` : sinon les deux apps n'affichent pas le même thème au même moment sur le même appareil.
- Si le studio a une sidebar, elle est **toujours sombre** (`#1C1C1E`), identique en clair et en sombre.
- Fontes : Inter (texte), Playfair Display (titres), DM Mono. Largeur de contenu 680px.
- Les six paires de couleurs de statut de Source (`ready`, `ongoing`, `review`, `sent`, `done`, `hold`) sont déjà accordées entre elles et testées en clair et en sombre : y piocher pour les couleurs de personas plutôt que d'en inventer.
- `css/mobile.css` est importé dès le départ : il neutralise le pull-to-refresh, force `font-size:16px` sur les champs sous 768px (sinon iOS zoome au focus), gère les safe-areas et le feedback tactile.

## Conventions de code

- Code en anglais, interface en français.
- État de l'app dans un objet unique.
- Jamais de `innerHTML` avec du contenu issu de l'API ou de la base sans échappement.
