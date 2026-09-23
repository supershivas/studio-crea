// Déroulé d'un débat : casting, ton de la réunion, lancement, prolongation.
//
// L'écran de contexte vit dans context-screen.js, les débats passés dans
// history.js, le rendu du fil dans thread.js, le casting en cours de route
// dans cast.js, et les sous-discussions dans branch.js.

import * as db from './supabase.js';
import * as api from './api.js';
import { summarizeContext } from './context.js';
import { refreshContext } from './context-screen.js';
import { runDebate, makeTitle } from './debate.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import { PROJECT_TYPES, suggestedCast, MAX_COMFORTABLE } from './castings.js';
import { renderSliders, loadGlobalSliders, saveGlobalSliders } from './sliders.js';
import { estimateDebate, formatEstimate } from './cost.js';
import { showMessage, showSynthesis, showHeading } from './thread.js';
import { castNow, rememberCast } from './cast.js';
import { showFamily } from './history.js';

const { $, show, setMsg, toast } = ui;

/* ══════════════ Ton de la réunion ══════════════ */

/** Curseurs globaux, mémorisés sur l'appareil et appliqués à tous les agents. */
export function initGlobalSliders() {
  state.globalSliders = loadGlobalSliders();
  renderSliders($('global-sliders'), state.globalSliders, (sliders) => {
    saveGlobalSliders(sliders);
    // La longueur des interventions pèse sur la facture : l'estimation suit.
    refreshEstimate();
  });
}

/**
 * Coût indicatif du débat tel qu'il est réglé à l'instant.
 *
 * Affiché avant le lancement, parce que c'est le seul moment où l'on peut
 * encore enlever un participant ou un tour.
 */
export function refreshEstimate() {
  const participants = state.personas.filter((p) => state.selected.has(p.id));
  const estimate = estimateDebate({
    participants,
    rounds: Number($('rounds').value) || 1,
    globalSliders: state.globalSliders,
    // Quatre caractères pour un token : l'ordre de grandeur suffit ici.
    contextTokens: Math.round((state.contextSent || '').length / 4),
  });
  const text = formatEstimate(estimate);
  $('cost-estimate').textContent = text;
  show($('cost-estimate'), !!text);
}

/* ══════════════ Type de projet et casting ══════════════ */

/** Remplit la liste des types et applique le casting proposé à chaque choix. */
export function initProjectType() {
  const select = $('project-type');
  select.replaceChildren();
  for (const type of PROJECT_TYPES) {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.label;
    option.selected = type.id === state.projectType;
    select.append(option);
  }
  select.addEventListener('change', (event) => {
    state.projectType = event.target.value;
    applyCast();
  });
}

/** Le casting n'est qu'une proposition : tout reste décochable ensuite. */
export function applyCast() {
  state.selected = new Set(suggestedCast(state.projectType, state.personas));
  renderCast();
}

/** Affiche la sélection en cours sur l'écran de préparation. */
export function renderCast() {
  ui.renderPersonas($('participants'), state.personas, state.selected, (id, on) => {
    if (on) state.selected.add(id); else state.selected.delete(id);
    warnIfCrowded();
  });
  warnIfCrowded();
}

function warnIfCrowded() {
  refreshEstimate();
  const n = state.selected.size;
  const box = $('cast-warning');
  if (n > MAX_COMFORTABLE) {
    box.textContent = `${n} participants : le débat se dilue, s'allonge et coûte plus cher. Sept est un bon maximum.`;
    show(box, true);
  } else {
    show(box, false);
  }
}

/* ══════════════ Lancement ══════════════ */

export function onSetupSubmit(event) {
  event.preventDefault();
  const msg = $('setup-msg');
  if (!$('brief').value.trim()) return setMsg(msg, 'Le sujet est vide.');
  if (!state.selected.size) return setMsg(msg, 'Choisis au moins un participant.');
  setMsg(msg, '');

  if (state.projectId && state.projectContext) {
    refreshContext();
    screen('context');
  } else {
    state.contextSent = '';
    launch(fromSetup());
  }
}

/** Ce que l'écran de préparation a réglé. */
function fromSetup() {
  state.audience = $('audience').value.trim();
  state.axes = $('axes').value.trim();
  return {
    brief: $('brief').value.trim(),
    rounds: Number($('rounds').value),
    participants: state.personas.filter((p) => state.selected.has(p.id)),
    contextSent: state.contextSent,
  };
}

export function validateContext() {
  if (!state.sensitivity) {
    toast('Choisis d\'abord pro ou perso.');
    return;
  }
  db.saveProjectSettings(state.projectId, state.sensitivity, [...state.contextKeys]).catch(() => {});
  launch(fromSetup());
}

/** « Ma remarque » : la promesse se dénoue au clic, ou au bouton stop. */
export function askRemark(label = 'Ma remarque') {
  $('remark-label').textContent = label;
  $('remark').value = '';
  show($('remark-box'), true);
  $('debate-status').hidden = true;
  return new Promise((resolve) => {
    state.resolveRemark = (value) => {
      show($('remark-box'), false);
      state.resolveRemark = null;
      resolve(value);
    };
  });
}

/** Les réglages de séance, identiques à chaque appel du moteur de débat. */
function sessionSettings() {
  return {
    projectType: state.projectType,
    audience: state.audience,
    axes: state.axes,
    sensitivity: state.debateOrigin.sensitivity,
    globalSliders: state.globalSliders,
  };
}

function persistMessage(message) {
  return db.addMessage({
    debateId: state.debateId,
    agentId: message.agentId,
    authorType: message.authorType,
    content: message.content,
    round: message.round,
  });
}

function statusSetter() {
  const status = $('debate-status');
  return (text) => { status.textContent = text; status.hidden = !text; };
}

/**
 * Donne un titre au débat dès son ouverture, sans retenir le débat : le
 * titre arrive pendant que la modératrice parle. Un échec garde le brief.
 */
function nameDebate(debateId, brief) {
  makeTitle(brief)
    .then(async (title) => {
      if (state.debateId !== debateId) return;
      state.title = title;
      showHeading(title, state.brief);
      await db.saveTitle(debateId, title);
    })
    .catch(() => {});
}

/**
 * Lance un débat.
 *
 * - `contextSent` : le texte exact validé, enregistré pour la traçabilité.
 * - `condense(signal)` : produit le résumé réinjecté à chaque tour. Par
 *   défaut, celui du contexte projet ; pour une sous-discussion, le rappel
 *   du débat d'origine.
 * - `parentId`, `focus` : une sous-discussion et le point qu'elle creuse.
 */
export async function launch({
  brief, rounds, participants, contextSent = '',
  condense = (signal) => summarizeContext(contextSent, { signal }),
  parentId = null, focus = null,
  projectId = state.projectId, sensitivity = state.sensitivity,
}) {
  if (!api.hasApiKey()) {
    toast('Enregistre ta clé API dans les réglages.');
    $('settings').showModal();
    return;
  }

  state.controller = new AbortController();
  state.messages = [];
  state.synthesis = '';
  state.title = '';
  state.brief = brief;
  state.contextSent = contextSent;
  state.selected = new Set(participants.map((p) => p.id));
  const moderator = participants.find((p) => p.isModerator) || participants[0];
  state.moderatorId = moderator ? moderator.id : null;
  state.castSnapshot = [...participants];
  state.debateOrigin = { projectId, sensitivity };
  state.returnTo = 'home';
  state.parentId = parentId;
  state.debateFlags = { archived: false, favorite: false };
  show($('debate-parent'), false);
  show($('debate-children'), false);
  $('messages').replaceChildren();
  showHeading('', brief);
  show($('debate-actions'), false);
  show($('btn-stop'), true);
  screen('debate');

  const setStatus = statusSetter();
  const shownRound = { value: null };

  try {
    setStatus(parentId ? 'Rappel du débat d\'origine…' : 'Préparation du contexte…');
    const summary = await condense(state.controller.signal);

    const debate = await db.createDebate({
      projectId,
      sensitivity,
      brief,
      contextSent,
      participants: participants.map((p) => p.id),
      rounds,
      projectType: state.projectType,
      audience: state.audience,
      // Copie figée : un débat archivé reste compréhensible même si les
      // personas changent ensuite.
      personasSnapshot: participants,
      parentId,
      focus,
    });
    state.debateId = debate.id;
    nameDebate(debate.id, brief);
    // Une sous-discussion affiche tout de suite le débat dont elle part.
    if (parentId) showFamily({ id: debate.id, parent_id: parentId });
    setStatus('La réunion commence…');

    const { synthesis } = await runDebate({
      brief,
      contextSummary: parentId && summary ? 'Rappel du débat d\'origine : ' + summary : summary,
      session: sessionSettings(),
      participants,
      rounds,
      currentCast: castNow,
      signal: state.controller.signal,
      persist: persistMessage,
      onMessage: (message) => {
        state.messages.push(message);
        showMessage(message, shownRound);
        setStatus('Au tour suivant…');
      },
      askUser: () => askRemark('Ma remarque'),
    });

    state.synthesis = synthesis;
    await db.saveSynthesis(state.debateId, synthesis);
    showSynthesis(synthesis);
    setStatus('');
  } catch (error) {
    if (error && error.name === 'AbortError') setStatus('Débat interrompu.');
    else { setStatus(''); fail(error); }
  } finally {
    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    state.controller = null;
    rememberCast();
  }
}

/**
 * Prolonge le débat dans le même fil, à partir de la synthèse.
 *
 * La synthèse précédente entre dans l'historique comme un rappel, l'éventuelle
 * relance est enregistrée comme une intervention, et un tour de plus est joué.
 * La nouvelle synthèse remplace l'ancienne : c'est le même débat, poursuivi.
 */
export async function extendDebate() {
  if (!state.debateId || state.controller) return;

  const relance = await askRemark('Sur quoi veux-tu qu\'ils creusent ?');
  const participants = castNow();
  if (!participants.length) return toast('Aucun participant sélectionné.');

  const lastRound = state.messages.reduce((max, m) => Math.max(max, m.round), 0);
  const moderator = participants.find((p) => p.id === state.moderatorId)
    || participants.find((p) => p.isModerator) || participants[0];
  state.moderatorId = moderator.id;

  // Rappel de là où le débat s'était arrêté. Non persisté : la synthèse vit
  // dans studio_sessions, la réenregistrer en message la dupliquerait.
  const earlier = [...state.messages];
  if (state.synthesis) {
    earlier.push({
      agentId: moderator.id, name: moderator.name, role: moderator.role,
      authorType: 'agent', round: lastRound,
      content: 'Synthèse de la première partie :\n' + state.synthesis,
    });
  }

  state.controller = new AbortController();
  show($('debate-actions'), false);
  show($('btn-stop'), true);
  const setStatus = statusSetter();
  const shownRound = { value: lastRound };

  try {
    if (relance && relance.trim()) {
      const mine = {
        agentId: null, authorType: 'user', content: relance.trim(), round: lastRound,
      };
      earlier.push(mine);
      state.messages.push(mine);
      await persistMessage(mine);
      showMessage(mine, shownRound);
    }

    setStatus('On reprend…');
    const { synthesis } = await runDebate({
      brief: state.brief,
      session: sessionSettings(),
      // La modératrice d'abord : c'est elle que le moteur retient pour la synthèse.
      participants: [moderator, ...participants.filter((p) => p !== moderator)],
      currentCast: castNow,
      rounds: 1,
      history: earlier,
      roundOffset: lastRound,
      opening: false,
      signal: state.controller.signal,
      persist: persistMessage,
      onMessage: (message) => {
        state.messages.push(message);
        showMessage(message, shownRound);
        setStatus('Au tour suivant…');
      },
    });

    state.synthesis = synthesis;
    await db.saveSynthesis(state.debateId, synthesis);
    showSynthesis(synthesis);
    if (ui.isNearBottom()) ui.scrollToBottom();
    setStatus('');
  } catch (error) {
    if (error && error.name === 'AbortError') setStatus('Débat interrompu.');
    else { setStatus(''); fail(error); }
  } finally {
    show($('btn-stop'), false);
    show($('debate-actions'), true);
    state.controller = null;
    rememberCast();
  }
}

/** Repart d'un sujet vierge, sans toucher au débat enregistré. */
export function newDebate() {
  $('brief').value = '';
  state.debateId = null;
  state.messages = [];
  state.synthesis = '';
  state.title = '';
  state.contextSent = '';
  applyCast();
  show($('btn-newmsg'), false);
  screen('setup');
}

export function stopDebate() {
  if (state.controller) state.controller.abort();
  if (state.resolveRemark) state.resolveRemark(null);
}
