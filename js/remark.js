// La boîte « Ma remarque » : entre deux tours, ou avant de prolonger.
//
// La promesse se dénoue au clic, ou au bouton stop (qui renvoie CANCELLED).

import { $, show } from './ui.js';
import { state } from './state.js';

/** Ce que renvoie « Ma remarque » quand on renonce (Annuler, ou Arrêter). */
export const CANCELLED = Symbol('cancelled');

/**
 * La boîte « Ma remarque », dite dans les mots du moment : entre deux tours,
 * on lance le tour suivant ; pour prolonger, on relance le débat. Les mêmes
 * « Transmettre » et « Continuer sans rien dire » pour les deux cas ne
 * disaient pas ce qui allait se passer.
 */
export function askRemark({
  label, hint = '', skipLabel, sendLabel, cancellable = false,
}) {
  $('remark-label').textContent = label;
  $('remark-hint').textContent = hint;
  show($('remark-hint'), !!hint);
  $('remark-skip').textContent = skipLabel;
  $('remark-send').textContent = sendLabel;
  show($('remark-cancel'), cancellable);
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
