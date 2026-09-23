// Le menu « ⋯ » d'un débat : favori, renommer, archiver, supprimer.
//
// Le même menu sert partout — une ligne de l'accueil, une ligne des débats
// précédents, le débat ouvert — pour qu'un geste se trouve toujours au même
// endroit. C'est une feuille (<dialog class="sheet">), pas un menu flottant :
// sous le pouce sur iPhone, lisible au clavier, fermée par Échap.

import * as db from './supabase.js';
import * as ui from './ui.js';
import { state, fail } from './state.js';

const { $, show, toast } = ui;

let target = null;     // le débat visé : { id, title, brief, archived, favorite }
let after = null;      // appelé après un changement, avec ce qui a changé

function label(debate) {
  return (debate.title || debate.focus || debate.brief || 'Sans titre').slice(0, 90);
}

/**
 * Ouvre le menu pour `debate`. `onChange(debate, change)` reçoit le débat
 * modifié et la nature du changement : 'favorite', 'title', 'archived',
 * 'deleted'. À l'appelant de rafraîchir ce qu'il affiche.
 */
export function openDebateMenu(debate, onChange = () => {}) {
  target = debate;
  after = onChange;
  $('menu-title').textContent = label(debate);
  $('menu-favorite').textContent = debate.favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris';
  $('menu-archive').textContent = debate.archived ? 'Désarchiver' : 'Archiver';
  show($('menu-rename-form'), false);
  show($('menu-actions'), true);
  $('debate-menu').showModal();
}

async function act(change, run, message) {
  if (!target) return;
  if (state.controller && target.id === state.debateId) {
    toast('Le débat tourne encore : attends la synthèse.');
    return;
  }
  try {
    await run();
    $('debate-menu').close();
    if (message) toast(message);
    after(target, change);
  } catch (error) {
    fail(error);
  }
}

function toggleFavorite() {
  const value = !target.favorite;
  act('favorite', async () => {
    await db.setFavorite(target.id, value);
    target.favorite = value;
  }, value ? 'Ajouté aux favoris.' : 'Retiré des favoris.');
}

function toggleArchive() {
  const value = !target.archived;
  act('archived', async () => {
    await db.setArchived(target.id, value);
    target.archived = value;
  }, value ? 'Débat archivé.' : 'Débat désarchivé.');
}

function startRename() {
  $('menu-rename').value = target.title || '';
  show($('menu-actions'), false);
  show($('menu-rename-form'), true);
  $('menu-rename').focus();
}

function saveRename(event) {
  event.preventDefault();
  const title = $('menu-rename').value.trim().slice(0, 80);
  if (!title) return;
  act('title', async () => {
    await db.saveTitle(target.id, title);
    target.title = title;
  }, 'Débat renommé.');
}

async function remove() {
  const debate = target;
  $('debate-menu').close();
  const sure = await ui.confirmDialog({
    title: 'Supprimer ce débat ?',
    message: `« ${label(debate)} » et toutes ses interventions seront effacés. Ses sous-discussions restent. C'est définitif.`,
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!sure) return;
  target = debate;
  act('deleted', () => db.deleteDebate(debate.id), 'Débat supprimé.');
}

export function wireDebateMenu() {
  $('menu-favorite').addEventListener('click', toggleFavorite);
  $('menu-rename-start').addEventListener('click', startRename);
  $('menu-rename-form').addEventListener('submit', saveRename);
  $('menu-rename-cancel').addEventListener('click', () => {
    show($('menu-rename-form'), false);
    show($('menu-actions'), true);
  });
  $('menu-archive').addEventListener('click', toggleArchive);
  $('menu-delete').addEventListener('click', remove);
  $('menu-close').addEventListener('click', () => $('debate-menu').close());
}
