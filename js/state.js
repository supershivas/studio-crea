// L'état de l'app, en un seul objet, plus le routage entre écrans.

import { $, show, setMsg, toast } from './ui.js';

export const state = {
  user: null,
  personas: [],
  selected: new Set(),
  projectId: null,
  projectContext: null,
  sensitivity: null,
  contextKeys: new Set(),
  contextSent: '',
  debateId: null,
  messages: [],
  synthesis: '',
  title: '',
  brief: '',
  // Le débat affiché : sa modératrice (fixe tant qu'il tourne), et tous ceux
  // qui y ont parlé, pour que le fil reste signé même après un changement.
  moderatorId: null,
  castSnapshot: [],
  debateOrigin: { projectId: null, sensitivity: null },
  // L'écran d'où l'on est venu au débat : c'est là que ramène « Retour ».
  returnTo: 'home',
  parentId: null,
  debateFlags: { archived: false, favorite: false },
  controller: null,
  resolveRemark: null,
  authMode: 'signin',
  projectType: 'autre',
  audience: '',
  axes: '',
  globalSliders: null,
};

const SCREENS = ['auth', 'newpass', 'home', 'setup', 'context', 'debate', 'history', 'agents'];

// Écrans où le fil d'Ariane (« ← Accueil ») n'a pas de sens.
const NO_CRUMBS = ['auth', 'newpass', 'home'];

export function screen(name) {
  for (const id of SCREENS) show($('screen-' + id), id === name);
  show($('crumbs'), !NO_CRUMBS.includes(name));
  // Depuis un débat ouvert à partir de la liste, un second lien y ramène.
  show($('crumb-history'), name === 'debate' && state.returnTo === 'history');
  window.scrollTo({ top: 0 });
}

/** Une interruption volontaire n'est pas une erreur : on ne l'affiche pas. */
export function fail(error, msgEl) {
  if (error && error.name === 'AbortError') return;
  const text = (error && error.message) || 'Une erreur est survenue.';
  if (msgEl) setMsg(msgEl, text);
  else toast(text);
}
