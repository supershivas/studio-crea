// Écran « Ce qui sera envoyé à l'IA ».
//
// Rien du projet ne part automatiquement : l'utilisateur coche, voit le texte
// exact, puis valide. La sensibilité n'est jamais devinée — elle est demandée.

import * as db from './supabase.js';
import { CONTEXT_FIELDS, defaultSelection, buildContextText } from './context.js';
import * as ui from './ui.js';
import { state, fail } from './state.js';

const { $, show } = ui;

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
