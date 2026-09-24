// Mises à jour et « À propos » des réglages : surveillance de version.json,
// toast « Mis à jour en vX.Y.Z » au chargement qui suit une mise à jour,
// nouveautés (5 dernières versions de CHANGELOG.md), export JSON.

import * as db from './supabase.js';
import * as ui from './ui.js';
import { state, fail } from './state.js';
import { startVersionCheck, currentVersion } from './version.js';
import { loadChangelog, downloadJSON } from './app-update.js';

const { $, show, toast } = ui;

/**
 * Un rechargement au mauvais moment coupe la parole à un agent ou ferme une
 * feuille en cours de saisie. On ne recharge que quand rien n'est en train de
 * se faire ; sinon la mise à jour attend le prochain passage.
 */
function busyNow() {
  if (state.controller) return true;                       // un débat tourne
  if (state.resolveRemark) return true;                    // « Ma remarque » ouvert
  return !!document.querySelector('dialog[open]');         // une feuille est ouverte
}

/**
 * Une nouvelle version est en ligne : on le dit, puis on recharge.
 *
 * Le délai laisse le temps de lire le numéro. Les débats sont déjà enregistrés
 * au fil de l'eau dans Supabase, donc rien ne se perd — et de toute façon on
 * ne passe ici que si aucun débat ne tourne.
 */
const RELOAD_DELAY = 2600;

const UPDATED_FLAG = 'studio:updated-to';

function onUpdate(version) {
  toast(`Mise à jour ${version} — la page se recharge…`, RELOAD_DELAY);
  try { sessionStorage.setItem(UPDATED_FLAG, version); } catch (_) {}
  setTimeout(() => window.location.reload(), RELOAD_DELAY);
}

/** Après le rechargement d'une mise à jour : « Mis à jour en vX.Y.Z ». */
function announceUpdate(flag) {
  let version = null;
  try {
    version = sessionStorage.getItem(flag);
    sessionStorage.removeItem(flag);
  } catch (_) {}
  if (version) toast(`Mis à jour en v${version}`);
}

async function renderChangelog() {
  const entries = await loadChangelog();
  const list = $('changelog-list');
  list.replaceChildren(...entries.map(entry => {
    const item = ui.el('li');
    item.append(ui.el('strong', null, `v${entry.version}`), document.createTextNode(entry.date ? ` · ${entry.date}` : ''));
    const changes = ui.el('ul');
    changes.append(...entry.changes.map(change => ui.el('li', null, change)));
    item.append(changes);
    return item;
  }));
  show($('changelog'), entries.length > 0);
}

async function exportData() {
  try {
    const data = await db.exportAllData();
    const day = new Date().toISOString().slice(0, 10);
    downloadJSON(
      { app: 'studio-crea', version: currentVersion(), exported_at: new Date().toISOString(), ...data },
      `studio-crea_${day}.json`,
    );
  } catch (error) {
    fail(error);
  }
}

/** Démarre la surveillance des mises à jour et remplit « À propos ». */
export async function startUpdates() {
  announceUpdate(UPDATED_FLAG);
  $('btn-export-data').addEventListener('click', exportData);
  // Une version indisponible ne doit jamais empêcher l'app de s'ouvrir.
  const version = await startVersionCheck({ isBusy: busyNow, onUpdate });
  $('app-version').textContent = version ? `Version ${version}` : '';
  renderChangelog();
}
