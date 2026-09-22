// Point d'entrée : thème, authentification, préparation, câblage.

import * as db from './supabase.js';
import * as api from './api.js';
import { DEFAULT_AGENTS } from './agents.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import * as session from './session.js';
import { wirePersonas } from './personas.js';

const { $, show, setMsg, toast } = ui;
const THEME_KEY = 'studio-theme';

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

  state.personas = await db.seedPersonasIfEmpty(DEFAULT_AGENTS);
  session.initProjectType();
  session.applyCast();

  state.projectId = new URLSearchParams(window.location.search).get('project');
  if (state.projectId) await loadProject(state.projectId);
  else show($('project-banner'), false);

  $('setup-submit').textContent = state.projectId
    ? 'Choisir ce qui part à l\'IA'
    : 'Lancer le débat';
  screen('setup');
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

function wireDebate() {
  $('form-setup').addEventListener('submit', session.onSetupSubmit);
  $('rounds').addEventListener('input', (event) => {
    const n = Number(event.target.value);
    $('rounds-out').textContent =
      n === 1 ? '1 tour — tu pourras prolonger' : n + ' tours';
  });

  $('sens-pro').addEventListener('click', () => session.chooseSensitivity('pro'));
  $('sens-perso').addEventListener('click', () => session.chooseSensitivity('perso'));
  $('context-back').addEventListener('click', () => screen('setup'));
  $('context-go').addEventListener('click', session.validateContext);

  $('btn-stop').addEventListener('click', session.stopDebate);
  $('remark-send').addEventListener('click', () => {
    if (state.resolveRemark) state.resolveRemark($('remark').value);
  });
  $('remark-skip').addEventListener('click', () => {
    if (state.resolveRemark) state.resolveRemark(null);
  });

  $('btn-new').addEventListener('click', session.newDebate);
  $('btn-extend').addEventListener('click', session.extendDebate);
  $('btn-newmsg').addEventListener('click', () => {
    ui.scrollToBottom();
    show($('btn-newmsg'), false);
  });
  window.addEventListener('scroll', () => {
    if (ui.isNearBottom()) show($('btn-newmsg'), false);
  }, { passive: true });
  $('btn-export').addEventListener('click', exportMarkdown);
  $('btn-history').addEventListener('click', session.openHistory);
  $('history-back').addEventListener('click', () => screen('setup'));
  $('history-archived').addEventListener('change', session.refreshHistory);
}

/** Remplit la liste des modèles et affiche le coût indicatif du modèle retenu. */
function initModelChoice() {
  const select = $('model-select');
  const current = api.getModel();
  select.replaceChildren();
  for (const model of api.MODELS) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    option.selected = model.id === current;
    select.append(option);
  }
  showModelCost(current);
  select.addEventListener('change', (event) => {
    api.setModel(event.target.value);
    showModelCost(event.target.value);
  });
}

function showModelCost(id) {
  const model = api.MODELS.find((m) => m.id === id);
  $('model-cost').textContent = model
    ? `${model.cost}, pour 7 personas sur 2 tours.`
    : '';
}

function wireSettings() {
  initModelChoice();
  $('btn-settings').addEventListener('click', () => {
    $('api-key').value = api.getApiKey();
    setMsg($('settings-msg'), '');
    $('settings').showModal();
  });
  $('key-save').addEventListener('click', () => {
    const saved = api.setApiKey($('api-key').value);
    setMsg(
      $('settings-msg'),
      saved ? 'Clé enregistrée sur cet appareil.' : 'Stockage local indisponible.',
      saved ? 'ok' : 'error'
    );
  });
  $('key-forget').addEventListener('click', () => {
    api.forgetApiKey();
    $('api-key').value = '';
    setMsg($('settings-msg'), 'Clé oubliée.', 'ok');
  });
  $('dark-toggle').addEventListener('change', (event) => applyTheme(event.target.checked));
  $('btn-logout').addEventListener('click', async () => {
    await db.signOut();
    window.location.reload();
  });
}

function exportMarkdown() {
  const brief = $('debate-brief').textContent;
  ui.download(
    ui.slugify(brief) + '.md',
    ui.toMarkdown({
      brief,
      contextSent: state.contextSent,
      messages: state.messages,
      synthesis: state.synthesis,
      createdAt: new Date().toISOString(),
    })
  );
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
}

main();
