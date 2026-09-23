// Débats passés : la liste (simple : un titre, une date, un menu « ⋯ ») et la
// relecture d'un fil. Les gestes du menu vivent dans debate-menu.js.
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
import { openDebateMenu } from './debate-menu.js';

const { $, el, show } = ui;

// L'accueil montre les débats par paquets : assez pour retrouver ceux de la
// semaine, sans noyer les deux boutons d'action.
const PAGE = 8;
let recentShown = PAGE;
let recentDebates = [];

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

/**
 * Les derniers débats sur l'accueil, leurs sous-discussions dessous.
 * Rien du tout s'il n'y en a pas ; « Charger plus » tant qu'il en reste.
 */
export async function refreshRecent() {
  recentShown = PAGE;
  try {
    recentDebates = await db.listDebates(state.projectId);
  } catch (_) {
    recentDebates = [];
  }
  renderRecent();
}

function renderRecent() {
  show($('home-recent'), recentDebates.length > 0);
  if (!recentDebates.length) return;
  const total = renderList($('home-recent-list'), recentDebates, { limit: recentShown, from: 'home' });
  show($('home-more'), total > recentShown);
}

function loadMore() {
  recentShown += PAGE;
  renderRecent();
}

/** Après un geste du menu sur une ligne : on redessine les listes visibles. */
function onRowChange(debate, change) {
  if (change === 'deleted') recentDebates = recentDebates.filter((d) => d.id !== debate.id);
  if (!$('screen-home').hidden) renderRecent();
  if (!$('screen-history').hidden) refreshHistory();
  if (!$('screen-debate').hidden && state.debateId) showFamily({ id: state.debateId, parent_id: state.parentId });
}

/* ══════════════ Cartes, au style des projets de Source ══════════════
   Une carte par débat, un liseré à gauche couleur de statut, un compteur de
   sous-discussions et un chevron qui les déplie — comme ProjectCard chez
   Source, pour qu'on passe d'une app à l'autre sans réapprendre à lire. */

// Le statut d'un débat, dans les paires de couleurs de Source.
function status(debate) {
  if (debate.archived) return { key: 'hold', label: 'Archivé' };
  if (debate.synthesis) return { key: 'done', label: 'Terminé' };
  return { key: 'ongoing', label: 'Inachevé' };
}

const expanded = new Set();   // débats dont les sous-discussions sont dépliées

function titleNode(debate, className) {
  const title = el('span', className);
  if (debate.favorite) title.append(el('span', 'history-star', '★ '));
  title.append(document.createTextNode(debate.title || debate.focus || debate.brief || 'Sans titre'));
  return title;
}

function moreButton(debate) {
  const more = el('button', 'history-more', '⋯');
  more.type = 'button';
  more.setAttribute('aria-label', 'Options du débat');
  more.addEventListener('click', () => openDebateMenu(debate, onRowChange));
  return more;
}

/** Une sous-discussion : une ligne bordée, titre, statut, date. */
function subRow(debate, from) {
  const line = el('div', 'sub-row');
  const open = el('button', 'sub-open');
  open.type = 'button';
  const title = titleNode(debate, 'sub-title');
  const st = status(debate);
  open.append(title, el('span', 'status-badge s-' + st.key, st.label),
    el('span', 'sub-date', ui.formatShortDate(debate.created_at)));
  open.addEventListener('click', () => openDebate(debate, from));
  line.append(open, moreButton(debate));
  return { node: line, title };
}

function card(debate, subs, from) {
  const st = status(debate);
  const node = el('article', 'debate-card');
  node.style.borderLeftColor = `var(--s-${st.key}-fg)`;
  const head = el('div', 'debate-card-row');

  const toggle = el('button', 'debate-toggle', expanded.has(debate.id) ? '▾' : '▸');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Sous-discussions');
  toggle.setAttribute('aria-expanded', String(expanded.has(debate.id)));
  toggle.disabled = !subs.length;

  const open = el('button', 'debate-open');
  open.type = 'button';
  const line1 = el('span', 'debate-line');
  if (subs.length) {
    line1.append(el('span', 'subs-bubble', '⧉ ' + subs.length));
  }
  const title = titleNode(debate, 'debate-title');
  line1.append(title);
  const n = Array.isArray(debate.participants) ? debate.participants.length : 0;
  const meta = [
    ui.formatShortDate(debate.created_at),
    n ? `${n} participant${n > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  const line2 = el('span', 'debate-line');
  line2.append(el('span', 'status-badge s-' + st.key, st.label), el('span', 'debate-meta', meta));
  open.append(line1, line2);
  open.addEventListener('click', () => openDebate(debate, from));

  head.append(toggle, open, moreButton(debate));
  node.append(head);

  const titles = [[debate, title]];
  if (subs.length) {
    const box = el('div', 'debate-subs');
    box.hidden = !expanded.has(debate.id);
    box.append(el('span', 'section-label', 'Sous-discussions'));
    for (const sub of subs) {
      const item = subRow(sub, from);
      titles.push([sub, item.title]);
      box.append(item.node);
    }
    toggle.addEventListener('click', () => {
      const on = box.hidden;
      box.hidden = !on;
      if (on) expanded.add(debate.id); else expanded.delete(debate.id);
      toggle.textContent = on ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(on));
    });
    node.append(box);
  }
  return { node, titles };
}

/**
 * Une carte par débat, ses sous-discussions repliées dedans. Une
 * sous-discussion dont l'origine n'est pas dans la liste (archivée, filtrée)
 * a sa propre carte plutôt que de disparaître.
 */
function renderList(container, debates, { limit = Infinity, from = 'history' } = {}) {
  container.replaceChildren();
  if (!debates.length) {
    container.append(el('p', 'status', 'Aucun débat ici.'));
    return 0;
  }
  const ids = new Set(debates.map((d) => d.id));
  const children = new Map();
  for (const d of debates) {
    if (d.parent_id && ids.has(d.parent_id)) {
      if (!children.has(d.parent_id)) children.set(d.parent_id, []);
      children.get(d.parent_id).unshift(d);
    }
  }
  const titles = new Map();
  const shown = [];
  // Les favoris d'abord, puis l'ordre chronologique inverse, intact.
  const roots = debates
    .filter((d) => !(d.parent_id && ids.has(d.parent_id)))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  for (const debate of roots.slice(0, limit)) {
    const item = card(debate, children.get(debate.id) || [], from);
    for (const [d, t] of item.titles) { titles.set(d.id, t); shown.push(d); }
    container.append(item.node);
  }
  fillMissingTitles(shown, titles);
  return roots.length;
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
      if (node) node.lastChild.textContent = title;
    } catch (_) {
      // Sans titre, la ligne garde le brief : rien de grave.
    } finally {
      titling.delete(debate.id);
    }
  }
}

/* ══════════════ Relecture ══════════════ */

export async function openDebate(item, from = 'history') {
  try {
    const debate = (await db.getDebate(item.id)) || item;
    state.returnTo = from;
    const rows = await db.listMessages(debate.id);
    // Les personas actuels d'abord, puis le cliché du débat : un persona
    // supprimé depuis garde son nom et sa couleur dans le fil.
    const snapshot = Array.isArray(debate.personas_snapshot) ? debate.personas_snapshot : [];
    const byId = new Map([...snapshot, ...state.personas].map((p) => [p.id, p]));

    state.debateId = debate.id;
    state.parentId = debate.parent_id || null;
    state.debateFlags = { archived: !!debate.archived, favorite: !!debate.favorite };
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

    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    show($('btn-newmsg'), false);
    $('debate-status').hidden = true;
    screen('debate');
    showFamily(debate);
  } catch (error) {
    fail(error);
  }
}

/* ══════════════ Famille : débat d'origine et sous-discussions ══════════════ */

/**
 * En tête du débat : d'où il vient (s'il est une sous-discussion), et les
 * sous-discussions qui en sont parties. Appelé aussi au lancement d'une
 * sous-discussion, pour qu'on voie tout de suite à quoi elle se rattache.
 */
export async function showFamily({ id, parent_id: parentId = null }) {
  show($('debate-parent'), false);
  show($('debate-children'), false);
  let family;
  try {
    family = await db.listFamily(id, parentId);
  } catch (_) {
    return;
  }
  if (state.debateId !== id) return;

  if (family.parent) {
    const parent = family.parent;
    $('debate-parent').textContent = '↰ Sous-discussion de « ' +
      (parent.title || parent.brief || 'Sans titre').slice(0, 80) + ' »';
    $('debate-parent').onclick = () => openDebate(parent, state.returnTo);
    show($('debate-parent'), true);
  }
  const list = $('debate-children-list');
  list.replaceChildren();
  for (const child of family.children) {
    list.append(subRow(child, state.returnTo).node);
  }
  show($('debate-children-empty'), !family.children.length);
  show(list, family.children.length > 0);
  // Le bloc sert aussi d'entrée « + Nouvelle sous-discussion », au-dessus du
  // sommaire : visible dès que le débat ne tourne plus, même sans enfant.
  show($('debate-children'), !state.controller);
}

/** Le débat vient de s'arrêter : l'entrée des sous-discussions réapparaît. */
export function showBranchEntry() {
  if (state.debateId) show($('debate-children'), true);
}

/* ══════════════ Le menu, depuis le débat ouvert ══════════════ */

function openCurrentMenu() {
  if (!state.debateId) return;
  const current = { id: state.debateId, title: state.title, brief: state.brief, ...state.debateFlags };
  openDebateMenu(current, (debate, change) => {
    state.debateFlags = { archived: !!debate.archived, favorite: !!debate.favorite };
    if (change === 'title') {
      state.title = debate.title;
      showHeading(debate.title, state.brief);
    }
    if (change === 'deleted') {
      state.debateId = null;
      openHistory();
    }
  });
}

export function wireHistory() {
  $('btn-history').addEventListener('click', openHistory);
  $('home-history').addEventListener('click', openHistory);
  $('home-more').addEventListener('click', loadMore);
  $('history-archived').addEventListener('change', refreshHistory);
  $('btn-debate-menu').addEventListener('click', openCurrentMenu);
}
