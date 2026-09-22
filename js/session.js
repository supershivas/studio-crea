// Déroulé d'un débat : écran de contexte, lancement, reprise d'un débat passé.

import * as db from './supabase.js';
import * as api from './api.js';
import { CONTEXT_FIELDS, defaultSelection, buildContextText, summarizeContext } from './context.js';
import { runDebate, makeTitle } from './debate.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import { PROJECT_TYPES, suggestedCast, MAX_COMFORTABLE } from './castings.js';

const { $, show, setMsg, toast } = ui;

/* ══════════════ Écran « Ce qui sera envoyé à l'IA » ══════════════ */

export function refreshContext() {
  const known = !!state.sensitivity;
  show($('sensitivity-ask'), !known);
  show($('context-card'), known);

  const banner = $('context-banner');
  if (state.sensitivity === 'pro') {
    banner.textContent = 'Projet pro : n\'envoie que ce qui peut sortir de l\'institution.';
    banner.className = 'banner pro';
  } else if (state.sensitivity === 'perso') {
    banner.textContent = 'Projet perso : les champs utiles sont pré-cochés, à toi de trancher.';
    banner.className = 'banner perso';
  }
  show(banner, known);

  ui.renderContextFields($('context-fields'), CONTEXT_FIELDS, state.contextKeys, (key, on) => {
    if (on) state.contextKeys.add(key); else state.contextKeys.delete(key);
    refreshPreview();
  });
  refreshPreview();
}

/** L'aperçu EST le texte envoyé : il est reconstruit à chaque changement. */
function refreshPreview() {
  state.contextSent = buildContextText(state.projectContext, [...state.contextKeys]);
  $('context-preview').textContent = state.contextSent;
}

export async function chooseSensitivity(value) {
  state.sensitivity = value;
  state.contextKeys = new Set(defaultSelection(value));
  refreshContext();
  try {
    await db.saveProjectSettings(state.projectId, value, [...state.contextKeys]);
  } catch (error) {
    fail(error);
  }
}

export function validateContext() {
  if (!state.sensitivity) {
    toast('Choisis d\'abord pro ou perso.');
    return;
  }
  db.saveProjectSettings(state.projectId, state.sensitivity, [...state.contextKeys]).catch(() => {});
  launch();
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
  const ids = suggestedCast(state.projectType, state.personas);
  state.selected = new Set(ids);
  ui.renderPersonas($('participants'), state.personas, state.selected, (id, on) => {
    if (on) state.selected.add(id); else state.selected.delete(id);
    warnIfCrowded();
  });
  warnIfCrowded();
}

function warnIfCrowded() {
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
    launch();
  }
}

/** « Ma remarque » : la promesse se dénoue au clic, ou au bouton stop. */
function askRemark(label = 'Ma remarque') {
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

/**
 * Ajoute un message SANS déplacer la lecture.
 *
 * Le fil ne rejoint le bas que si l'utilisateur y était déjà. S'il lit plus
 * haut, rien ne bouge sous ses yeux et un bouton discret l'avertit.
 */
function showMessage(message, shownRound) {
  const follow = ui.isNearBottom();
  if (message.round !== shownRound.value) {
    shownRound.value = message.round;
    ui.renderRound($('messages'), message.round);
  }
  ui.renderMessage($('messages'), message);
  if (follow) ui.scrollToBottom();
  else show($('btn-newmsg'), true);
}

export async function launch() {
  if (!api.hasApiKey()) {
    toast('Enregistre ta clé API dans les réglages.');
    $('settings').showModal();
    return;
  }

  const brief = $('brief').value.trim();
  const rounds = Number($('rounds').value);
  const participants = state.personas.filter((p) => state.selected.has(p.id));
  state.audience = $('audience').value.trim();
  state.axes = $('axes').value.trim();

  state.controller = new AbortController();
  state.messages = [];
  state.synthesis = '';
  $('messages').replaceChildren();
  $('debate-brief').textContent = brief;
  show($('debate-actions'), false);
  show($('btn-stop'), true);
  screen('debate');

  const status = $('debate-status');
  const setStatus = (text) => { status.textContent = text; status.hidden = !text; };
  const shownRound = { value: null };

  try {
    setStatus('Préparation du contexte…');
    const summary = await summarizeContext(state.contextSent, { signal: state.controller.signal });

    const debate = await db.createDebate({
      projectId: state.projectId,
      sensitivity: state.sensitivity,
      brief,
      contextSent: state.contextSent,
      participants: participants.map((p) => p.id),
      rounds,
      projectType: state.projectType,
      audience: state.audience,
      // Copie figée : un débat archivé reste compréhensible même si les
      // personas changent ensuite.
      personasSnapshot: participants,
    });
    state.debateId = debate.id;
    setStatus('La réunion commence…');

    const { synthesis } = await runDebate({
      brief,
      contextSummary: summary,
      session: {
        projectType: state.projectType,
        audience: state.audience,
        axes: state.axes,
        sensitivity: state.sensitivity,
      },
      participants,
      rounds,
      signal: state.controller.signal,
      persist: (message) =>
        db.addMessage({
          debateId: state.debateId,
          agentId: message.agentId,
          authorType: message.authorType,
          content: message.content,
          round: message.round,
        }),
      onMessage: (message) => {
        state.messages.push(message);
        showMessage(message, shownRound);
        setStatus('Au tour suivant…');
      },
      askUser: () => askRemark('Ma remarque'),
    });

    state.synthesis = synthesis;
    await db.saveSynthesis(state.debateId, synthesis);
    ui.renderRound($('messages'), ui.ROUND_SYNTHESIS);
    ui.renderMessage($('messages'), { name: 'Synthèse', content: synthesis }, { synthesis: true });
    setStatus('');

    // Titre court pour la liste des débats, où le brief entier est illisible.
    const title = await makeTitle(brief, { signal: state.controller.signal });
    await db.saveTitle(state.debateId, title);
  } catch (error) {
    if (error && error.name === 'AbortError') setStatus('Débat interrompu.');
    else { setStatus(''); fail(error); }
  } finally {
    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    state.controller = null;
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
  const participants = state.personas.filter((p) => state.selected.has(p.id));
  if (!participants.length) return toast('Aucun participant sélectionné.');

  const lastRound = state.messages.reduce((max, m) => Math.max(max, m.round), 0);
  const moderator = participants.find((p) => p.isModerator) || participants[0];

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
  const status = $('debate-status');
  const setStatus = (t) => { status.textContent = t; status.hidden = !t; };
  const shownRound = { value: lastRound };

  const persist = (message) =>
    db.addMessage({
      debateId: state.debateId,
      agentId: message.agentId,
      authorType: message.authorType,
      content: message.content,
      round: message.round,
    });

  try {
    if (relance && relance.trim()) {
      const mine = {
        agentId: null, authorType: 'user', content: relance.trim(), round: lastRound,
      };
      earlier.push(mine);
      state.messages.push(mine);
      await persist(mine);
      showMessage(mine, shownRound);
    }

    setStatus('On reprend…');
    const { synthesis } = await runDebate({
      brief: $('debate-brief').textContent,
      session: {
        projectType: state.projectType,
        audience: state.audience,
        axes: state.axes,
        sensitivity: state.sensitivity,
      },
      participants,
      rounds: 1,
      history: earlier,
      roundOffset: lastRound,
      opening: false,
      signal: state.controller.signal,
      persist,
      onMessage: (message) => {
        state.messages.push(message);
        showMessage(message, shownRound);
        setStatus('Au tour suivant…');
      },
    });

    state.synthesis = synthesis;
    await db.saveSynthesis(state.debateId, synthesis);
    ui.renderRound($('messages'), ui.ROUND_SYNTHESIS);
    ui.renderMessage($('messages'), { name: 'Synthèse', content: synthesis }, { synthesis: true });
    if (ui.isNearBottom()) ui.scrollToBottom();
    setStatus('');
  } catch (error) {
    if (error && error.name === 'AbortError') setStatus('Débat interrompu.');
    else { setStatus(''); fail(error); }
  } finally {
    show($('btn-stop'), false);
    show($('debate-actions'), true);
    state.controller = null;
  }
}

/** Repart d'un sujet vierge, sans toucher au débat enregistré. */
export function newDebate() {
  $('brief').value = '';
  state.debateId = null;
  state.messages = [];
  state.synthesis = '';
  state.contextSent = '';
  show($('btn-newmsg'), false);
  screen('setup');
}

export function stopDebate() {
  if (state.controller) state.controller.abort();
  if (state.resolveRemark) state.resolveRemark(null);
}

/* ══════════════ Débats passés ══════════════ */

export async function openHistory() {
  await refreshHistory();
  screen('history');
}

export async function refreshHistory() {
  try {
    const archived = $('history-archived').checked;
    const debates = await db.listDebates(state.projectId, { archived });
    ui.renderHistory($('history-list'), debates, {
      open: openDebate,
      resume: openDebate,
      archive: async (debate, value) => {
        try {
          await db.setArchived(debate.id, value);
          toast(value ? 'Débat archivé.' : 'Débat désarchivé.');
          await refreshHistory();
        } catch (error) { fail(error); }
      },
      remove: async (debate) => {
        const name = debate.title || 'ce débat';
        const sure = await ui.confirmDialog({
          title: 'Supprimer ce débat ?',
          message: `« ${name} » et toutes ses interventions seront effacés. C'est définitif.`,
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!sure) return;
        try {
          await db.deleteDebate(debate.id);
          if (state.debateId === debate.id) state.debateId = null;
          toast('Débat supprimé.');
          await refreshHistory();
        } catch (error) { fail(error); }
      },
    });
  } catch (error) {
    fail(error);
  }
}

async function openDebate(debate) {
  try {
    const rows = await db.listMessages(debate.id);
    const byId = new Map(state.personas.map((p) => [p.id, p]));

    state.debateId = debate.id;
    state.synthesis = debate.synthesis || '';
    state.contextSent = '';

    // Reprendre avec le casting d'origine, pas celui affiché par hasard.
    const cast = Array.isArray(debate.participants) ? debate.participants : null;
    if (cast && cast.length) {
      const known = new Set(state.personas.map((p) => p.id));
      const kept = cast.filter((id) => known.has(id));
      if (kept.length) state.selected = new Set(kept);
    }
    state.messages = rows.map((row) => {
      const persona = byId.get(row.agent_id) || {};
      return {
        agentId: row.agent_id,
        authorType: row.author_type,
        content: row.content,
        round: row.round,
        name: persona.name || null,
        role: persona.role || null,
        color: persona.color || null,
        emoji: persona.emoji || null,
      };
    });

    $('debate-brief').textContent = debate.brief || 'Débat';
    $('messages').replaceChildren();
    const shownRound = { value: null };
    for (const message of state.messages) showMessage(message, shownRound);
    if (state.synthesis) {
      ui.renderRound($('messages'), ui.ROUND_SYNTHESIS);
      ui.renderMessage($('messages'), { name: 'Synthèse', content: state.synthesis }, { synthesis: true });
    }

    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    $('debate-status').hidden = true;
    screen('debate');
  } catch (error) {
    fail(error);
  }
}
