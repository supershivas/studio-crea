// Repartir d'un débat déjà tenu.
//
// - Sous-discussion : un nouveau débat, rattaché au premier (parent_id), sur
//   un point précis ou en général, avec d'autres personas. Le débat d'origine
//   est condensé UNE fois en un rappel court ; c'est ce rappel, jamais le fil
//   brut, que reçoivent les participants à chaque tour.
// - Relancer autrement : l'écran de préparation, pré-rempli avec le sujet et
//   le casting du débat, pour changer les réglages avant de relancer.

import * as ui from './ui.js';
import { state, screen } from './state.js';
import { recapSource, recapDebate } from './debate.js';
import { launch, renderCast } from './session.js';

const { $, setMsg, toast } = ui;

let branchCast = new Set();

export function openBranch() {
  if (!state.debateId || state.controller) return;
  $('branch-focus').value = '';
  $('branch-rounds').value = '1';
  setMsg($('branch-msg'), '');
  // Le casting du débat, à ajuster : c'est tout l'intérêt de l'exercice.
  branchCast = new Set(state.selected);
  const locked = state.moderatorId ? new Set([state.moderatorId]) : new Set();
  if (state.moderatorId) branchCast.add(state.moderatorId);
  ui.renderPersonas($('branch-cast'), state.personas, branchCast, (id, on) => {
    if (on) branchCast.add(id); else branchCast.delete(id);
  }, { locked });
  $('branch-dialog').showModal();
}

function startBranch(event) {
  event.preventDefault();
  const participants = state.personas.filter((p) => branchCast.has(p.id));
  if (participants.length < 2) {
    setMsg($('branch-msg'), 'Il faut au moins la modératrice et un participant.');
    return;
  }
  const focus = $('branch-focus').value.trim();
  const origin = state.title || state.brief.slice(0, 60);
  const source = recapSource({
    brief: state.brief,
    contextSent: state.contextSent,
    messages: state.messages,
    synthesis: state.synthesis,
  });
  $('branch-dialog').close();

  launch({
    brief: focus || `Reprendre « ${origin} » en général, avec un regard neuf.`,
    rounds: Number($('branch-rounds').value) || 1,
    participants,
    // Traçabilité : c'est ce texte-là qui part à l'IA pour être condensé.
    contextSent: source,
    condense: (signal) => recapDebate(source, focus, { signal }),
    parentId: state.debateId,
    focus: focus || null,
    // Même projet et même sensibilité que le débat d'origine.
    projectId: state.debateOrigin.projectId,
    sensitivity: state.debateOrigin.sensitivity,
  });
}

/** Rouvre l'écran de préparation avec le sujet et le casting de ce débat. */
export function relaunch() {
  if (state.controller) return;
  $('brief').value = state.brief;
  $('audience').value = state.audience || '';
  $('axes').value = state.axes || '';
  $('project-type').value = state.projectType;
  renderCast();
  state.debateId = null;
  screen('setup');
  toast('Sujet et casting repris : change ce que tu veux, puis relance.');
}

export function wireBranch() {
  $('btn-branch').addEventListener('click', openBranch);
  $('btn-relaunch').addEventListener('click', relaunch);
  $('branch-form').addEventListener('submit', startBranch);
  $('branch-cancel').addEventListener('click', () => $('branch-dialog').close());
}
