// Débats passés : la liste (simple : un titre, une date), la relecture d'un
// fil, et les gestes rares (archiver, supprimer) rangés dans le débat ouvert.
//
// Les sous-discussions s'affichent sous leur débat d'origine. Un débat sans
// titre (d'avant les titres, ou dont le titre a échoué) en reçoit un au
// passage, avec le modèle le moins cher, si une clé est enregistrée.

import * as db from './supabase.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import { makeTitle } from './debate.js';
import { showMessage, showSynthesis, showHeading } from './thread.js';

const { $, el, show, toast } = ui;

const RECENT = 3;

/* ══════════════ Liste ══════════════ */

export async function openHistory() {
  screen('history');
  await refreshHistory();
}

export async function refreshHistory() {
  try {
    const archived = $('history-archived').checked;
    const debates = await db.listDebates(state.projectId, { archived });
    renderList($('history-list'), debates);
  } catch (error) {
    fail(error);
  }
}

/** Les derniers débats sur l'accueil : rien du tout s'il n'y en a pas. */
export async function refreshRecent() {
  try {
    const debates = await db.listDebates(state.projectId);
    const roots = debates.filter((d) => !d.parent_id).slice(0, RECENT);
    show($('home-recent'), roots.length > 0);
    renderList($('home-recent-list'), roots, { nested: false });
  } catch (_) {
    show($('home-recent'), false);
  }
}

function row(debate, { child = false } = {}) {
  const button = el('button', child ? 'history-row history-child' : 'history-row');
  button.type = 'button';
  const title = el('span', 'history-title', debate.title || debate.focus || debate.brief || 'Sans titre');
  const meta = [
    ui.formatShortDate(debate.created_at),
    Array.isArray(debate.participants) ? `${debate.participants.length} participants` : '',
    debate.synthesis ? '' : 'inachevé',
  ].filter(Boolean).join(' · ');
  button.append(title, el('span', 'history-meta', meta));
  button.addEventListener('click', () => openDebate(debate));
  return { button, title };
}

/**
 * Une ligne par débat, ses sous-discussions en retrait dessous. Une
 * sous-discussion dont l'origine n'est pas dans la liste (archivée, filtrée)
 * s'affiche à plat plutôt que de disparaître.
 */
function renderList(container, debates, { nested = true } = {}) {
  container.replaceChildren();
  if (!debates.length) {
    container.append(el('p', 'status', 'Aucun débat ici.'));
    return;
  }
  const ids = new Set(debates.map((d) => d.id));
  const children = new Map();
  for (const d of debates) {
    if (nested && d.parent_id && ids.has(d.parent_id)) {
      if (!children.has(d.parent_id)) children.set(d.parent_id, []);
      children.get(d.parent_id).unshift(d);
    }
  }
  const titles = new Map();
  for (const debate of debates) {
    if (nested && debate.parent_id && ids.has(debate.parent_id)) continue;
    const item = row(debate);
    titles.set(debate.id, item.title);
    container.append(item.button);
    for (const child of children.get(debate.id) || []) {
      const sub = row(child, { child: true });
      titles.set(child.id, sub.title);
      container.append(sub.button);
    }
  }
  fillMissingTitles(debates, titles);
}

/* ══════════════ Titres manquants ══════════════ */

const titling = new Set();

/**
 * Les débats d'avant les titres en reçoivent un, un par un, sans bloquer la
 * liste. Rien sans clé : on ne réclame pas une clé pour afficher une liste.
 */
async function fillMissingTitles(debates, titles) {
  if (!api.hasApiKey()) return;
  for (const debate of debates) {
    if (debate.title || titling.has(debate.id)) continue;
    titling.add(debate.id);
    try {
      const title = await makeTitle(debate.focus || debate.brief, { context: debate.synthesis || '' });
      await db.saveTitle(debate.id, title);
      debate.title = title;
      const node = titles.get(debate.id);
      if (node) node.textContent = title;
    } catch (_) {
      // Sans titre, la ligne garde le brief : rien de grave.
    } finally {
      titling.delete(debate.id);
    }
  }
}

/* ══════════════ Relecture ══════════════ */

async function openDebate(item) {
  try {
    const debate = (await db.getDebate(item.id)) || item;
    const rows = await db.listMessages(debate.id);
    // Les personas actuels d'abord, puis le cliché du débat : un persona
    // supprimé depuis garde son nom et sa couleur dans le fil.
    const snapshot = Array.isArray(debate.personas_snapshot) ? debate.personas_snapshot : [];
    const byId = new Map([...snapshot, ...state.personas].map((p) => [p.id, p]));

    state.debateId = debate.id;
    state.synthesis = debate.synthesis || '';
    state.title = debate.title || '';
    state.brief = debate.brief || '';
    state.contextSent = debate.context_sent || '';
    state.castSnapshot = snapshot;
    state.debateOrigin = { projectId: debate.project_id || null, sensitivity: debate.sensitivity || null };
    if (debate.project_type) state.projectType = debate.project_type;
    state.audience = debate.audience || '';

    // Reprendre avec le casting d'origine, pas celui affiché par hasard.
    const cast = Array.isArray(debate.participants) ? debate.participants : null;
    if (cast && cast.length) {
      const known = new Set(state.personas.map((p) => p.id));
      const kept = cast.filter((id) => known.has(id));
      if (kept.length) state.selected = new Set(kept);
    }
    const moderator = state.personas.find((p) => state.selected.has(p.id) && p.isModerator);
    state.moderatorId = moderator ? moderator.id : null;

    state.messages = rows.map((r) => {
      const persona = byId.get(r.agent_id) || {};
      return {
        agentId: r.agent_id,
        authorType: r.author_type,
        content: r.content,
        round: r.round,
        name: persona.name || null,
        role: persona.role || null,
        color: persona.color || null,
        emoji: persona.emoji || null,
      };
    });

    showHeading(state.title || state.brief.slice(0, 80), state.brief);
    $('messages').replaceChildren();
    const shownRound = { value: null };
    for (const message of state.messages) showMessage(message, shownRound);
    if (state.synthesis) showSynthesis(state.synthesis);

    $('btn-archive').textContent = debate.archived ? 'Désarchiver' : 'Archiver';
    $('btn-archive').dataset.archived = debate.archived ? '1' : '';
    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    show($('btn-newmsg'), false);
    $('debate-status').hidden = true;
    screen('debate');
  } catch (error) {
    fail(error);
  }
}

/* ══════════════ Gestes rares, depuis le débat ouvert ══════════════ */

async function toggleArchive() {
  if (!state.debateId || state.controller) return;
  const value = !$('btn-archive').dataset.archived;
  try {
    await db.setArchived(state.debateId, value);
    $('btn-archive').dataset.archived = value ? '1' : '';
    $('btn-archive').textContent = value ? 'Désarchiver' : 'Archiver';
    toast(value ? 'Débat archivé.' : 'Débat désarchivé.');
  } catch (error) { fail(error); }
}

async function removeDebate() {
  if (!state.debateId || state.controller) return;
  const name = state.title || 'ce débat';
  const sure = await ui.confirmDialog({
    title: 'Supprimer ce débat ?',
    message: `« ${name} » et toutes ses interventions seront effacés. Ses sous-discussions restent. C'est définitif.`,
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!sure) return;
  try {
    await db.deleteDebate(state.debateId);
    state.debateId = null;
    toast('Débat supprimé.');
    await openHistory();
  } catch (error) { fail(error); }
}

export function wireHistory() {
  $('btn-history').addEventListener('click', openHistory);
  $('home-history').addEventListener('click', openHistory);
  $('history-back').addEventListener('click', () => screen('home'));
  $('history-archived').addEventListener('change', refreshHistory);
  $('btn-archive').addEventListener('click', toggleArchive);
  $('btn-delete').addEventListener('click', removeDebate);
}
