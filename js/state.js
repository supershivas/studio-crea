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
  controller: null,
  resolveRemark: null,
  authMode: 'signin',
  projectType: 'autre',
  audience: '',
  axes: '',
  globalSliders: null,
};

const SCREENS = ['auth', 'newpass', 'setup', 'context', 'debate', 'history', 'agents'];

export function screen(name) {
  for (const id of SCREENS) show($('screen-' + id), id === name);
  window.scrollTo({ top: 0 });
}

/** Une interruption volontaire n'est pas une erreur : on ne l'affiche pas. */
export function fail(error, msgEl) {
  if (error && error.name === 'AbortError') return;
  const text = (error && error.message) || 'Une erreur est survenue.';
  if (msgEl) setMsg(msgEl, text);
  else toast(text);
}
