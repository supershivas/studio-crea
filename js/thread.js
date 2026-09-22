// Rendu du fil de discussion, partagé entre un débat en cours et un débat
// relu depuis l'historique.

import * as ui from './ui.js';

const { $, show } = ui;

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
  ui.renderMessage($('messages'), message);
  if (follow) ui.scrollToBottom();
  else show($('btn-newmsg'), true);
}

/** La synthèse ferme le fil : son propre séparateur, sa propre fiche. */
export function showSynthesis(text) {
  ui.renderRound($('messages'), ui.ROUND_SYNTHESIS);
  ui.renderMessage($('messages'), { name: 'Synthèse', content: text }, { synthesis: true });
}
