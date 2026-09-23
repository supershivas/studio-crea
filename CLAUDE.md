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

- `studio_personas` : personas de l'utilisateur. Identité : `id`, `user_id`, `name`, `role`, `emoji`, `color`, `is_moderator`, `position`. Profil v2 : `default_id` (lien vers le profil d'origine), `identity`, `expertise`, `canon`, `voice`, `blind_spots`, `never_says`, `domain_notes`, `sliders`, `model`. `prompt` reste pour les consignes libres, en plus du profil.
- `studio_sessions` : un débat (`id`, `user_id`, `project_id` nullable, `sensitivity`, `brief`, `context_sent`, `participants`, `rounds`, `synthesis`, `title`, `archived`, `favorite`, `personas_snapshot`, `project_type`, `audience`, `parent_id`, `focus`, `created_at`). `favorite` vient de `20260923_studio_favorites.sql` : sans elle, seul le geste « favori » refuse, la liste se relit sans la colonne. `project_id` référence le projet de Source avec `on delete set null`. `personas_snapshot` fige le casting : un débat archivé reste lisible même si les personas changent ensuite ; quand le casting change en cours de route, ceux qui sont partis y restent. `parent_id` rattache une sous-discussion à son débat d'origine (`on delete set null`), `focus` est le point qu'elle creuse (null : en général). Ces deux colonnes viennent de `20260923_studio_subdebates.sql` : sans elle, seules les sous-discussions refusent de se créer.
- `studio_messages` : interventions (`id`, `session_id` on delete cascade, `agent_id`, `author_type` `agent`|`user`, `content`, `round`, `created_at`).
- `studio_project_settings` : réglages par projet (`project_id`, `user_id`, `sensitivity` `pro`|`perso`, `default_fields`). Clé primaire `(user_id, project_id)` : l'enregistrement se fait en update-puis-insert, jamais en upsert, puisque le client n'envoie pas `user_id`.

### RLS

Les projets de Source ne sont **pas partagés entre utilisateurs** : les policies existantes sont `auth.uid() = user_id` sur `projects`, et un `EXISTS` sur le projet parent pour `subprojects` et `notes`. Nos policies suivent la même règle simple : `auth.uid() = user_id`, déclarées **par verbe**, avec un `with_check` explicite sur INSERT et UPDATE.

`user_id` prend `default auth.uid()` au niveau de la colonne, comme `projects` chez Source : le client n'envoie jamais `user_id`.

Au premier lancement, si `studio_personas` est vide, y copier les onze personas par défaut de `js/agents.js`. La colonne `default_id` garde le lien avec le profil d'origine, pour que les castings par type de projet survivent à la copie. Un profil par défaut ajouté plus tard (liste `ADDED_DEFAULTS`, aujourd'hui la conceptrice rédactrice) est inséré **une fois par appareil** en fin de liste chez qui ne l'a pas, sans toucher aux autres : supprimé ensuite, il ne revient pas.

Les personas sont **transversaux** : aucune mention de livre, de croquis ou d'impression hors `domain_notes`.

**Références : la justesse avant la fraîcheur.** Une référence ancienne mais vraie vaut mieux qu'une récente inventée (demande explicite de l'utilisateur, qui constatait des références hallucinées). Les règles `REFERENCE_RULES` de `js/prompt.js` s'appliquent à tous : ne citer que ce dont on est certain, dater entre parenthèses, décrire le procédé sans nommer au moindre doute, mêler un travail récent aux classiques seulement s'il est connu avec certitude. Aucun curseur ne pousse à citer « ce que personne ne connaît » sans l'exigence de vérifiabilité. Leur expertise se transpose au type de projet de la session. Le prompt système n'est jamais écrit à la main : il est assemblé par `buildSystemPrompt` dans `js/prompt.js`, et le modèle ne reçoit jamais la valeur d'un curseur, seulement la phrase du niveau correspondant.

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
- Elle n'est enregistrée **qu'après un appel de vérification réel** (`verifyApiKey`) : un token de sortie sur le modèle le moins cher, où seul le code HTTP compte. Une clé refusée (401/403) n'est pas stockée ; une clé **sans crédit (402) ou limitée (429) est valide** et l'est donc — la refuser ferait ressaisir une clé correcte. Une panne réseau ne conclut rien.
- Une fois validée, le champ se replie en une ligne compacte qui n'affiche que `sk-ant-…q4Xa`. « Changer » rouvre un champ **vide** : l'ancienne clé n'est jamais réaffichée en entier.
- **Le crédit restant n'est pas récupérable** : aucun endpoint ne l'expose. Les rapports d'usage et de coût vivent sous `/v1/organizations/*`, exigent une clé **admin** (`sk-ant-admin…`) qui gère aussi les membres et les clés de l'organisation, et donnent la dépense, pas le solde. Une telle clé n'a rien à faire dans un navigateur. Ne pas réessayer.
- Le modèle est choisi dans les réglages, parmi la liste `MODELS` de `js/api.js`, et mémorisé par appareil. Un persona peut avoir le sien (colonne `model`), et la synthèse aussi : sans choix explicite, chacun retombe sur le réglage de l'appareil, et un identifiant périmé n'interrompt jamais un débat.
- Les tarifs vivent dans `MODELS.price`, en dollars par million de tokens, entrée et sortie. `js/cost.js` rejoue le déroulé de `js/debate.js` appel par appel pour afficher un ordre de grandeur avant le lancement — jamais un prix ferme. Les modèles n'acceptent pas les mêmes paramètres : `effort` échoue sur Haiku 4.5, `fallbacks` ne vise que la famille Opus. Ces différences sont déclarées par modèle, jamais devinées.
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
js/api.js              Appels Anthropic (liste MODELS, tarifs, choix du modèle)
js/cost.js             Estimation du coût d'un débat avant lancement
js/debate.js           Orchestration des tours, historique, synthèse, titre, rappel
js/context.js          Lecture du projet, choix des champs, aperçu, résumé
js/agents.js           Personas qui fabriquent le projet (profils enrichis)
js/agents-writer.js    Persona conceptrice rédactrice
js/agents-views.js     Personas regards extérieurs (garde-fou, com, presse, publics)
js/castings.js         Types de projet et castings proposés
js/prompt.js           Assemblage du prompt système, curseurs globaux
js/sliders.js          Rendu des curseurs, préréglages, mémoire locale
js/personas.js         Écran d'édition des personas
js/session.js          Déroulé d'un débat : casting, lancement, prolongation
js/cast.js             Casting modifiable pendant le débat
js/remark.js           Boîte « Ma remarque », dite dans les mots du moment
js/branch.js           Sous-discussions et « Relancer autrement »
js/context-screen.js   Écran « Ce qui sera envoyé à l'IA »
js/history.js          Débats précédents : liste, titres manquants, relecture, famille
js/debate-menu.js      Menu « ⋯ » d'un débat : favori, renommer, archiver, supprimer
js/thread.js           Rendu du fil (message, synthèse, politesse du scroll)
js/toc.js              Sommaire du débat, tenu à jour à partir du fil affiché
js/export.js           Export : tout le débat, synthèse seule, points clés
js/state.js            État de l'app et routage entre écrans
js/ui.js               Rendu DOM (aucun innerHTML)
js/markdown.js         Mise en forme des réponses (Markdown restreint, en nœuds)
js/links.js            Liens de recherche sur les références citées
js/version.js          Détection d'une mise à jour déployée
js/drawer.js           Fermeture du tiroir au glissement
design-tokens.json     Copie de design-system (ne pas éditer à la main)
scripts/sync-tokens.sh Récupère design-tokens.json et mobile.css
scripts/release.sh     Incrémente version.json, commit, push
scripts/check-claude-md.mjs  Vérifie que CLAUDE.md dit la vérité sur le code
version.json           Numéro de version — seule source de vérité
supabase/migrations/   SQL daté
```

Fichiers courts : découper au-delà de ~300 lignes. L'accès aux données est
découpé par domaine dans `js/db/`, mais **aucun module hors de `js/db/` ne
touche au client** : tout le reste de l'app importe `js/supabase.js`, et lui
seul.

## Mises à jour

`version.json` à la racine est la **seule source de vérité** du numéro : il n'est écrit nulle part dans le code, donc rien à maintenir en double. L'app le lit au démarrage (c'est sa référence), puis toutes les cinq minutes, au retour sur l'onglet et à la reprise du focus.

- Publier : `./scripts/release.sh [patch|mineure|majeure|X.Y.Z]`. Le script refuse de tourner si des modifications ne sont pas commitées.
- Quand le numéro a changé, l'app affiche « Mise à jour X.Y.Z — la page se recharge… » puis recharge.
- **Jamais pendant un débat**, ni avec « Ma remarque » ouvert, ni avec une feuille ouverte : la mise à jour est mise de côté et appliquée au prochain moment tranquille.
- `version.json` injoignable (hors ligne, déploiement en cours) : on s'abstient, on ne recharge jamais au hasard.
- Pas de boucle possible : la référence vient du fichier, pas du code, donc après un rechargement la nouvelle version devient la référence.

## Déroulé d'une session

0. Accueil : deux vrais boutons, « Nouveau débat » et « Débats précédents », puis les derniers débats par paquets de huit (« Charger plus »), chacun avec ses sous-discussions à déplier. Le titre de la barre y ramène.
1. Sujet : saisi librement, ou venant d'un projet (écran de contexte, voir Confidentialité).
2. Choix des participants et du nombre de tours (1 à 5, défaut 1 — on prolonge si le débat mérite d'être poussé).
3. Le contexte projet est d'abord condensé en un résumé court (un seul appel), réutilisé par tous les agents : ne jamais renvoyer le contenu brut à chaque tour.
4. Dès la création du débat, un titre de trois à six mots est demandé au modèle le moins cher, sans retenir le débat ; il s'affiche en tête du fil quand il arrive. Les débats sans titre en reçoivent un à l'affichage de la liste, un par un, si une clé est enregistrée.
5. La modératrice ouvre, chaque participant parle à son tour en réagissant aux autres.
6. **Le casting se change à tout moment** (bouton « Participants », ou depuis « Ma remarque » en fin de tour). Le moteur relit le casting avant chaque prise de parole : un retiré ne parle plus, un ajouté parle dès que vient son tour. La modératrice reste cochée tant que le débat tourne.
7. Entre deux tours, l'utilisateur peut intervenir (« Ma remarque »). La boîte parle **dans les mots du moment** (`askRemark` reçoit libellé, explication et textes des boutons) : entre deux tours, « Tour suivant, sans remarque » / « Envoyer et lancer le tour suivant » ; pour prolonger, « Prolonger sans consigne » / « Prolonger avec cette consigne » et un « Annuler ». Des boutons génériques (« Transmettre », « Continuer sans rien dire ») ne disaient pas ce qui allait se passer.
8. Synthèse finale de la modératrice, en Markdown hiérarchisé : `## Les pistes` (trois `###` classés), `## Les désaccords`, `## Prochaine étape`, `## Sources et références`. Cette dernière reprend **uniquement** les références réellement citées dans les échanges, avec qui les a citées : la modératrice n'en ajoute ni n'en corrige aucune, sans quoi elle réintroduirait les références inventées que `REFERENCE_RULES` combat. Jamais de titre « Synthèse » en tête (l'interface l'affiche déjà ; `stripSynthesisHeading` le retire au besoin).
9. Tout est sauvegardé au fil de l'eau dans Supabase (reprise possible sur un autre appareil). Export Markdown.
10. Bouton stop à tout moment.

Depuis un débat terminé, sous « Et maintenant ? », trois suites, **chacune expliquée par une ligne visible sous son bouton** (un `title` seul ne s'affiche pas au doigt) :

- **Prolonger** : même fil, un tour de plus à partir de la synthèse, avec le casting du moment.
- **Sous-discussion** : un nouveau débat rattaché (`parent_id`), sur un point précis ou en général, avec d'autres personas. Le débat d'origine est condensé une fois (`recapDebate`) ; le texte envoyé pour ce rappel est enregistré dans `context_sent`. Même projet et même sensibilité que l'origine.
- **Relancer autrement** : l'écran de préparation pré-rempli (sujet, type, public, casting), pour changer les réglages et lancer un nouveau débat.
- Les gestes sur un débat (favori, renommer, archiver, supprimer) vivent dans un seul menu « ⋯ » (`js/debate-menu.js`, une feuille, pas un menu flottant), le même à droite de chaque ligne de liste et en tête du débat ouvert. Les débats sont des **cartes au style des projets de Source** (`ProjectCard`) : liseré de 3px à gauche couleur de statut (paires `--s-*` copiées de Source : `done` terminé, `ongoing` inachevé, `hold` archivé), titre, badge de statut, date et participants, compteur de sous-discussions et chevron qui les déplie en lignes bordées (repliées par défaut, comme les sous-projets). Les favoris (★) remontent en tête.

**Toujours un chemin vers l'accueil** : un lien « ← Accueil » en haut de chaque écran sauf l'accueil et la connexion (`#crumbs`, affiché par `screen()`), avec la même confirmation que le titre de la barre si un débat tourne. Sur un débat ouvert depuis la liste, un second lien « Débats précédents » y ramène (`state.returnTo`).

La page d'un débat porte, de haut en bas : le fil d'Ariane, le titre et le sujet (avec « Participants » et « ⋯ »), le lien vers le débat d'origine s'il s'agit d'une sous-discussion, la liste de ses sous-discussions, puis un **sommaire** (tours et voix, cliquables) dès qu'il y a plus qu'une ouverture et un tour. Le sommaire se reconstruit seul à partir du fil (`MutationObserver`). **Export** : tout le débat, la synthèse seule, ou les points clés — ce que chacun a mis en gras, à défaut sa première phrase, sans aucun appel d'API — téléchargé en `.md` ou copié.

## Tenir ce fichier à jour

Une doc fausse est pire qu'une doc absente : elle fait travailler la session suivante sur des faits périmés. **Après tout changement fonctionnel, mettre CLAUDE.md à jour dans le même commit**, puis lancer :

```
node scripts/check-claude-md.mjs
```

Il confronte les affirmations de ce fichier au dépôt réel et sort en erreur au premier écart : bloc Structure contre les fichiers présents, colonnes des tables `studio_` contre les migrations, nombre de tours annoncé contre le curseur, version épinglée de supabase-js, absence d'`innerHTML`, en-têtes Anthropic, `[hidden]` avant toute règle `display`, `display` sur une feuille toujours sous `[open]`, client Supabase confiné à `js/db/`, aucune écriture dans les tables de Source, et longueur des modules.

Ajouter une vérification au script chaque fois qu'une règle de ce fichier devient mécaniquement vérifiable — une règle qu'aucun outil ne contrôle finit par mentir.

## Workflow Git

- Travailler directement sur `main`, pas de branches.
- Commit + push sur `main` après chaque changement fonctionnel qui marche.
- Messages de commit en français, à l'impératif.
- `node scripts/check-claude-md.mjs` doit passer avant de pousser.
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
- Les feuilles (`<dialog class="sheet">`) sont centrées dans les deux axes : `inset: 0` + `margin: auto`. Sans `inset`, le `margin: auto` d'un `<dialog>` ne centre que l'horizontale et la feuille se colle en haut — très visible sur iPhone. Hauteur en `dvh` : en `vh`, iOS compte la barre d'outils comme si elle n'existait pas et le bas de la feuille passe dessous.
- Les **réglages** sont un tiroir latéral (`class="sheet drawer"`), collé à droite, pleine hauteur, animation coupée sous `prefers-reduced-motion`. L'app reste visible derrière. Il se ferme en glissant vers la droite, par Échap, par un clic sur le fond, ou par le bouton « Fermer » — toujours en sortant par la droite, jamais en disparaissant.
- Le tiroir **ne défile pas lui-même** : c'est son `<form>` qui défile. Sinon la poignée, positionnée par rapport au tiroir, monte avec le contenu et sort de l'écran.
- **Toute règle `display` sur une feuille ou un tiroir porte `[open]`.** Un `<dialog>` fermé est masqué par un `display: none` que lui donne le navigateur ; `.drawer { display: flex }` l'écrase et le panneau reste affiché en permanence — sur desktop, on voit alors deux tiroirs. Même famille de piège que `.screen { display: flex }` contre `[hidden]`, d'où `[hidden] { display: none !important }` déclaré avant toute règle d'affichage.
- Le geste n'est tranché qu'après 10 px (`DECISION_PX`) : avant, on ne sait pas si le doigt veut tirer le panneau ou faire défiler le contenu, et on ne bloque rien. Il ferme au-delà d'un tiers de la largeur, ou sur un coup sec — **au moins 40 px** et plus de 1 px/ms. À 0,5 px/ms, un simple à-coup refermait le panneau.
- La poignée du tiroir n'est montrée qu'aux écrans tactiles : à la souris, on ne glisse pas, et elle ne serait qu'une ligne grise sans explication.
- Dans le pied du tiroir, « Fermer » est pleine largeur (l'action courante) et « Se déconnecter » est un lien discret à côté du numéro de version : c'est rare et sans retour, ça ne doit pas tomber sous le pouce.
- Le **titre de la barre est un bouton** qui ramène à l'accueil. Inactif tant qu'on n'est pas connecté ; si un débat tourne, il demande confirmation et l'interrompt franchement plutôt que de le laisser tourner derrière un écran invisible.
- `--on-err` est la couleur du **texte posé sur** l'aplat d'alerte : blanc en clair, sombre en sombre. `--err-fg` est partagé avec Source et n'est jamais modifié ici — mais du blanc sur le rose clair du thème sombre tombe à 2,65:1, sous le seuil AA.
- `css/mobile.css` est importé dès le départ : il neutralise le pull-to-refresh, force `font-size:16px` sur les champs sous 768px (sinon iOS zoome au focus), gère les safe-areas et le feedback tactile.

## Conventions de code

- Code en anglais, interface en français.
- État de l'app dans un objet unique.
- Jamais de `innerHTML` avec du contenu issu de l'API ou de la base sans échappement.
- Les réponses sont mises en forme par `js/markdown.js` : titres, listes, gras, italique, filet — rien d'autre, et tout en nœuds DOM. Les agents ont droit au gras et à une courte liste, jamais à un titre ; seule la synthèse est structurée en titres.
- Les références citées par les agents (noms propres, titres entre guillemets, URL) deviennent des liens de recherche — repérage local dans `js/links.js`, **aucun appel d'API**, donc rien de facturé et rien d'envoyé. Le texte est découpé en nœuds de texte et en `<a>` : le chemin des liens ne contourne pas la règle ci-dessus. Réglage désactivable dans les réglages.
