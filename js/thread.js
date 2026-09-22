// Rendu du fil de discussion, partagé entre un débat en cours et un débat
// relu depuis l'historique.

import * as ui from './ui.js';
import { state } from './state.js';

const { $, show } = ui;

/**
 * Les noms à ne jamais transformer en lien de recherche : les participants du
 * débat et Jérôme. Ils s'interpellent sans arrêt par leur prénom.
 */
function ownNames() {
  return ['Jérôme', ...state.personas.map((p) => p.name)].filter(Boolean);
}

/**
 * Ajoute un message SANS déplacer la lecture.
 *
 * Le fil ne rejoint le bas que si l'utilisateur y était déjà. S'il lit plus
 * haut, rien ne bouge sous ses yeux et un bouton discret l'avertit.
 */
export function showMessage(message, shownRound) {
  const follow = ui.isNearBottom();
  if (message.round !== shownRound.value) {
    shownRound.value = message.round;
    ui.renderRound($('messages'), message.round);
  }
  ui.renderMessage($('messages'), message, { skip: ownNames() });
  if (follow) ui.scrollToBottom();
  else show($('btn-newmsg'), true);
}

/** La synthèse ferme le fil : son propre séparateur, sa propre fiche. */
export function showSynthesis(text) {
  ui.renderRound($('messages'), ui.ROUND_SYNTHESIS);
  ui.renderMessage(
    $('messages'),
    { name: 'Synthèse', content: text },
    { synthesis: true, skip: ownNames() }
  );
}
