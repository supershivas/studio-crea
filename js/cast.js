// Le casting d'un débat, modifiable à tout moment : pendant qu'il tourne,
// à la fin d'un tour, ou avant de le prolonger.
//
// Le moteur (debate.js) relit castNow() avant chaque prise de parole : il
// suffit donc de changer state.selected. La modératrice reste cochée tant que
// le débat tourne — c'est elle qui rédigera la synthèse.

import * as db from './supabase.js';
import * as ui from './ui.js';
import { state } from './state.js';

const { $, toast } = ui;

/** Les participants tels qu'ils sont cochés à l'instant, dans l'ordre de parole. */
export function castNow() {
  return state.personas.filter((p) => state.selected.has(p.id));
}

function running() {
  return !!(state.controller || state.resolveRemark);
}

export function openCast() {
  const locked = running() && state.moderatorId ? new Set([state.moderatorId]) : new Set();
  $('cast-hint').textContent = running()
    ? 'Les changements valent dès la prochaine prise de parole.'
    : 'Les changements valent pour la suite : prolongation ou sous-discussion.';
  ui.renderPersonas($('cast-list'), state.personas, state.selected, (id, on) => {
    if (on) state.selected.add(id); else state.selected.delete(id);
  }, { locked });
  $('cast-dialog').showModal();
}

/**
 * Enregistre le casting du débat affiché. Le cliché garde aussi ceux qui
 * sont partis : leurs interventions restent dans le fil, signées.
 */
export async function rememberCast() {
  if (!state.debateId) return;
  const byId = new Map(state.castSnapshot.map((p) => [p.id, p]));
  for (const persona of castNow()) byId.set(persona.id, persona);
  state.castSnapshot = [...byId.values()];
  try {
    await db.saveParticipants(state.debateId, [...state.selected], state.castSnapshot);
  } catch (_) {
    // Le débat continue avec le bon casting ; seul l'enregistrement a échoué.
    toast('Casting changé, mais pas enregistré.');
  }
}

export function wireCast() {
  $('btn-cast').addEventListener('click', openCast);
  $('remark-cast').addEventListener('click', openCast);
  $('cast-close').addEventListener('click', () => $('cast-dialog').close());
  $('cast-dialog').addEventListener('close', () => {
    if (!state.selected.size && !running()) toast('Plus personne autour de la table.');
    rememberCast();
  });
}
