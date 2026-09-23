// Point d'entrée : thème, authentification, préparation, câblage.

import * as db from './supabase.js';
import * as api from './api.js';
import { linksEnabled, setLinksEnabled } from './links.js';
import { startVersionCheck } from './version.js';
import { enableSwipeToClose, closeDrawer } from './drawer.js';
import { DEFAULT_AGENTS, ADDED_DEFAULTS } from './agents.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import * as session from './session.js';
import * as history from './history.js';
import { chooseSensitivity } from './context-screen.js';
import { wirePersonas } from './personas.js';
import { wireCast } from './cast.js';
import { wireBranch } from './branch.js';

const { $, show, setMsg, toast } = ui;
const THEME_KEY = 'studio-theme';
const ADDED_KEY = 'studio-defaults-added';

/* ══════════════ Thème ══════════════ */

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  $('dark-toggle').checked = dark;
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (_) {}
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (_) {}
  applyTheme(stored === 'dark');
}

/* ══════════════ Authentification ══════════════ */

function setAuthMode(mode) {
  $('btn-home').disabled = true;
  state.authMode = mode;
  const reset = mode === 'reset';
  show($('field-password'), !reset);
  $('auth-password').required = !reset;
  $('auth-submit').textContent =
    mode === 'signup' ? 'Créer le compte' : reset ? 'Envoyer le lien' : 'Se connecter';
  $('auth-toggle').textContent = mode === 'signup' ? 'J\'ai déjà un compte' : 'Créer un compte';
  setMsg($('auth-msg'), '');
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const msg = $('auth-msg');
  const button = $('auth-submit');
  button.disabled = true;
  try {
    if (state.authMode === 'reset') {
      await db.sendPasswordReset(email);
      setMsg(msg, 'Lien envoyé. Regarde tes e-mails.', 'ok');
    } else if (state.authMode === 'signup') {
      const needsConfirm = await db.signUp(email, password);
      if (needsConfirm) setMsg(msg, 'Compte créé. Confirme par e-mail puis connecte-toi.', 'ok');
      else await start();
    } else {
      await db.signIn(email, password);
      await start();
    }
  } catch (error) {
    fail(error, msg);
  } finally {
    button.disabled = false;
  }
}

/* ══════════════ Préparation ══════════════ */

/** Charge le projet passé en paramètre. Un id inconnu bascule en débat libre. */
async function loadProject(projectId) {
  state.projectContext = await db.getProjectContext(projectId);
  const banner = $('project-banner');

  if (!state.projectContext) {
    state.projectId = null;
    show(banner, false);
    toast('Projet introuvable. Le studio passe en débat libre.');
    return;
  }

  const settings = await db.getProjectSettings(projectId);
  state.sensitivity = settings ? settings.sensitivity : null;
  state.contextKeys = new Set(settings ? settings.defaultFields : []);
  banner.textContent = 'Projet : ' + state.projectContext.project.name;
  banner.className = 'banner ' + (state.sensitivity === 'pro' ? 'pro' : 'perso');
  show(banner, true);
}

async function start() {
  state.user = await db.getCurrentUser();
  if (!state.user) { screen('auth'); return; }

  show($('btn-settings'), true);
  show($('btn-history'), true);
  $('btn-home').disabled = false;

  state.personas = await addNewDefaults(await db.seedPersonasIfEmpty(DEFAULT_AGENTS));
  session.initProjectType();
  session.initGlobalSliders();
  session.applyCast();

  state.projectId = new URLSearchParams(window.location.search).get('project');
  if (state.projectId) await loadProject(state.projectId);
  else show($('project-banner'), false);

  $('setup-submit').textContent = state.projectId
    ? 'Choisir ce qui part à l\'IA'
    : 'Lancer le débat';
  showHome();
}

/** L'accueil : un nouveau débat, ou les précédents. */
function showHome() {
  screen('home');
  history.refreshRecent();
}

/**
 * Un profil par défaut apparu depuis la copie initiale est ajouté une fois
 * par appareil : si l'utilisateur le supprime ensuite, il ne revient pas à
 * chaque ouverture.
 */
async function addNewDefaults(personas) {
  let done = [];
  try { done = JSON.parse(localStorage.getItem(ADDED_KEY) || '[]'); } catch (_) {}
  const todo = ADDED_DEFAULTS.filter((id) => !done.includes(id));
  if (!todo.length) return personas;
  try {
    const list = await db.addMissingDefaults(personas, DEFAULT_AGENTS, todo);
    try { localStorage.setItem(ADDED_KEY, JSON.stringify([...done, ...todo])); } catch (_) {}
    return list;
  } catch (_) {
    return personas;
  }
}

/* ══════════════ Câblage ══════════════ */

function wireAuth() {
  $('form-auth').addEventListener('submit', onAuthSubmit);
  $('auth-toggle').addEventListener('click', () =>
    setAuthMode(state.authMode === 'signup' ? 'signin' : 'signup'));
  $('auth-forgot').addEventListener('click', () => setAuthMode('reset'));

  $('form-newpass').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await db.updatePassword($('newpass').value);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      toast('Mot de passe enregistré.');
      await start();
    } catch (error) {
      fail(error, $('newpass-msg'));
    }
  });
}

/**
 * Le titre ramène à l'accueil.
 *
 * Un débat qui tourne pose une vraie question : le laisser tourner derrière un
 * écran qu'on ne voit plus serait pire que de l'arrêter, puisque rien ne
 * permettrait d'y revenir. On demande donc, et on arrête franchement.
 */
async function goHome() {
  if (!state.user) return;
  if (state.controller || state.resolveRemark) {
    const sure = await ui.confirmDialog({
      title: 'Un débat est en cours',
      message: 'Revenir à l\'accueil l\'interrompra. Les interventions déjà produites sont enregistrées.',
      confirmLabel: 'Interrompre',
      danger: true,
    });
    if (!sure) return;
    session.stopDebate();
  }
  showHome();
}

function wireDebate() {
  $('form-setup').addEventListener('submit', session.onSetupSubmit);
  $('rounds').addEventListener('input', (event) => {
    const n = Number(event.target.value);
    $('rounds-out').textContent =
      n === 1 ? '1 tour — tu pourras prolonger' : n + ' tours';
    session.refreshEstimate();
  });

  $('sens-pro').addEventListener('click', () => chooseSensitivity('pro'));
  $('sens-perso').addEventListener('click', () => chooseSensitivity('perso'));
  $('context-back').addEventListener('click', () => screen('setup'));
  $('context-go').addEventListener('click', session.validateContext);

  $('btn-stop').addEventListener('click', session.stopDebate);
  $('remark-send').addEventListener('click', () => {
    if (state.resolveRemark) state.resolveRemark($('remark').value);
  });
  $('remark-skip').addEventListener('click', () => {
    if (state.resolveRemark) state.resolveRemark(null);
  });

  $('btn-home').addEventListener('click', goHome);
  $('home-new').addEventListener('click', session.newDebate);
  $('setup-back').addEventListener('click', showHome);
  $('btn-extend').addEventListener('click', session.extendDebate);
  $('btn-newmsg').addEventListener('click', () => {
    ui.scrollToBottom();
    show($('btn-newmsg'), false);
  });
  window.addEventListener('scroll', () => {
    if (ui.isNearBottom()) show($('btn-newmsg'), false);
  }, { passive: true });
  $('btn-export').addEventListener('click', exportMarkdown);
  history.wireHistory();
  wireCast();
  wireBranch();
}

/** Remplit la liste des modèles et affiche le coût indicatif du modèle retenu. */
const MODEL_OPTIONS = () => api.MODELS.map((m) => ({ value: m.id, label: m.label }));

function initModelChoice() {
  const select = $('model-select');
  const current = api.getModel();
  ui.fillSelect(select, MODEL_OPTIONS(), current);
  showModelCost(current);
  select.addEventListener('change', (event) => {
    api.setModel(event.target.value);
    showModelCost(event.target.value);
    session.refreshEstimate();
  });

  const synthesis = $('synthesis-select');
  ui.fillSelect(synthesis, MODEL_OPTIONS(), api.getSynthesisModel(), 'Le même que ci-dessus');
  synthesis.addEventListener('change', (event) => {
    api.setSynthesisModel(event.target.value);
    session.refreshEstimate();
  });
}

function showModelCost(id) {
  const model = api.MODELS.find((m) => m.id === id);
  $('model-cost').textContent = model
    ? `${model.cost}, pour 7 personas sur 2 tours.`
    : '';
}

/**
 * Deux états pour la clé : le champ de saisie, ou une ligne compacte une fois
 * la clé validée. Une clé qui marche n'a aucune raison d'occuper un champ de
 * saisie à chaque ouverture des réglages.
 */
function showKeyState({ editing = false } = {}) {
  const key = api.getApiKey();
  const known = !!key && !editing;
  show($('key-known'), known);
  show($('key-form'), !known);
  show($('key-cancel'), editing);
  if (known) $('key-masked').textContent = api.maskApiKey(key);
  if (!known) $('api-key').value = '';
}

/**
 * Enregistre la clé APRÈS l'avoir fait valider par un appel réel.
 *
 * Le plus petit appel possible sur le modèle le moins cher : la dépense est
 * indétectable, et on sait tout de suite si la clé est bonne — au lieu de
 * l'apprendre au milieu du premier débat.
 */
async function saveKey() {
  const button = $('key-save');
  const msg = $('settings-msg');
  const key = $('api-key').value.trim();

  button.disabled = true;
  setMsg(msg, 'Vérification de la clé…');
  try {
    const result = await api.verifyApiKey(key);
    if (!result.ok) {
      setMsg(msg, result.message, 'error');
      return;
    }
    if (!api.setApiKey(key)) {
      setMsg(msg, 'Clé valide, mais le stockage local est indisponible.', 'error');
      return;
    }
    showKeyState();
    // Une clé valide mais sans crédit est enregistrée quand même : la
    // recharger sur console.anthropic.com suffira, sans rien ressaisir.
    setMsg(msg, result.message, result.reason === 'billing' ? 'error' : 'ok');
  } catch (error) {
    fail(error, msg);
  } finally {
    button.disabled = false;
  }
}

function wireSettings() {
  initModelChoice();
  enableSwipeToClose($('settings'));
  $('btn-close-settings').addEventListener('click', () => closeDrawer($('settings')));
  $('btn-settings').addEventListener('click', () => {
    setMsg($('settings-msg'), '');
    showKeyState();
    $('settings').showModal();
  });
  $('key-save').addEventListener('click', saveKey);
  $('key-edit').addEventListener('click', () => {
    setMsg($('settings-msg'), '');
    showKeyState({ editing: true });
    $('api-key').focus();
  });
  $('key-cancel').addEventListener('click', () => {
    setMsg($('settings-msg'), '');
    showKeyState();
  });
  $('key-forget').addEventListener('click', () => {
    api.forgetApiKey();
    showKeyState();
    setMsg($('settings-msg'), 'Clé oubliée.', 'ok');
  });
  // Les liens ne changent que l'affichage : le fil déjà à l'écran est laissé
  // tel quel, le réglage vaut pour ce qui sera rendu ensuite.
  $('links-toggle').checked = linksEnabled();
  $('links-toggle').addEventListener('change', (event) => setLinksEnabled(event.target.checked));

  $('dark-toggle').addEventListener('change', (event) => applyTheme(event.target.checked));
  $('btn-logout').addEventListener('click', async () => {
    await db.signOut();
    window.location.reload();
  });
}

function exportMarkdown() {
  const brief = state.brief;
  ui.download(
    ui.slugify(state.title || brief) + '.md',
    ui.toMarkdown({
      title: state.title,
      brief,
      contextSent: state.contextSent,
      messages: state.messages,
      synthesis: state.synthesis,
      createdAt: new Date().toISOString(),
    })
  );
}

/* ══════════════ Mises à jour ══════════════ */

/**
 * Un rechargement au mauvais moment coupe la parole à un agent ou ferme une
 * feuille en cours de saisie. On ne recharge que quand rien n'est en train de
 * se faire ; sinon la mise à jour attend le prochain passage.
 */
function busyNow() {
  if (state.controller) return true;                       // un débat tourne
  if (state.resolveRemark) return true;                    // « Ma remarque » ouvert
  return !!document.querySelector('dialog[open]');         // une feuille est ouverte
}

/**
 * Une nouvelle version est en ligne : on le dit, puis on recharge.
 *
 * Le délai laisse le temps de lire le numéro. Les débats sont déjà enregistrés
 * au fil de l'eau dans Supabase, donc rien ne se perd — et de toute façon on
 * ne passe ici que si aucun débat ne tourne.
 */
const RELOAD_DELAY = 2600;

function onUpdate(version) {
  toast(`Mise à jour ${version} — la page se recharge…`, RELOAD_DELAY);
  setTimeout(() => window.location.reload(), RELOAD_DELAY);
}

/* ══════════════ Démarrage ══════════════ */

async function main() {
  initTheme();
  setAuthMode('signin');
  wireAuth();
  wireDebate();
  wireSettings();
  wirePersonas();

  // Retour d'un lien de réinitialisation : le mot de passe d'abord.
  if (db.isPasswordRecovery()) { screen('newpass'); return; }

  try {
    await start();
  } catch (error) {
    fail(error);
    screen('auth');
  }

  // Après le démarrage : une version indisponible ne doit jamais empêcher
  // l'app de s'ouvrir.
  const version = await startVersionCheck({ isBusy: busyNow, onUpdate });
  $('app-version').textContent = version ? `Version ${version}` : '';
}

main();
