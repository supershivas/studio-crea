// Rendu DOM. Aucun appel réseau ici.
//
// RÈGLE : tout contenu venant de l'API ou de la base passe par textContent,
// ou par renderMarkdown, qui ne construit lui aussi que des nœuds.
// Il n'y a pas un seul innerHTML dans ce fichier, et il ne doit pas y en avoir.

import { renderMarkdown } from './markdown.js';

export const $ = (id) => document.getElementById(id);

export function show(element, visible = true) {
  if (element) element.hidden = !visible;
}

export function setMsg(element, text, kind = 'error') {
  if (!element) return;
  element.textContent = text || '';
  element.className = `msg ${kind}`;
  element.hidden = !text;
}

let toastTimer = null;
export function toast(text, duration = 3200) {
  const box = $('toast');
  if (!box) return;
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, duration);
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ── Confirmation ─────────────────────────────────────────────────────────────
   Jamais window.confirm : le dialogue du navigateur ignore le thème, la typo
   et les cibles tactiles de l'app, et sur iPhone il affiche le nom de domaine.
   --------------------------------------------------------------------------*/

/**
 * Demande confirmation. Résout à true si l'utilisateur confirme.
 * Fermer au clavier (Échap) ou par le fond équivaut à annuler.
 */
export function confirmDialog({
  title,
  message = '',
  confirmLabel = 'Confirmer',
  danger = false,
} = {}) {
  const dialog = $('confirm');
  $('confirm-title').textContent = title || 'Confirmer';
  $('confirm-message').textContent = message;

  const okButton = $('confirm-ok');
  okButton.textContent = confirmLabel;
  okButton.className = danger ? 'btn-primary btn-danger' : 'btn-primary';

  return new Promise((resolve) => {
    let answer = false;
    const onOk = () => { answer = true; dialog.close(); };
    const onCancel = () => dialog.close();
    const onClose = () => {
      okButton.removeEventListener('click', onOk);
      $('confirm-cancel').removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      resolve(answer);
    };
    okButton.addEventListener('click', onOk);
    $('confirm-cancel').addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

/* ── Participants ── */

/** `locked` : identifiants cochés d'office, non décochables (la modératrice
 *  d'un débat en cours, qui doit rester pour la synthèse). */
export function renderPersonas(container, personas, selected, onToggle, { locked = new Set() } = {}) {
  container.replaceChildren();
  for (const persona of personas) {
    const label = el('label', 'persona');

    const box = el('input');
    box.type = 'checkbox';
    box.checked = selected.has(persona.id) || locked.has(persona.id);
    box.disabled = locked.has(persona.id);
    box.addEventListener('change', () => onToggle(persona.id, box.checked));

    const text = el('div', 'persona-text');
    text.append(
      el('div', 'persona-name', persona.isModerator ? `${persona.name} — anime` : persona.name),
      el('div', 'persona-role', persona.role || '')
    );

    const dot = el('span', 'persona-dot');
    dot.style.background = persona.color || 'var(--accent)';

    label.append(box, el('span', 'persona-emoji', persona.emoji || '•'), text, dot);
    container.append(label);
  }
}

/* ── Champs du contexte ── */

export function renderContextFields(container, fields, selected, onToggle) {
  container.replaceChildren();
  for (const field of fields) {
    const label = el('label', 'field-inline');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = selected.has(field.key);
    box.addEventListener('change', () => onToggle(field.key, box.checked));
    label.append(box, el('span', null, field.label));
    container.append(label);
  }
}

/* ── Le débat ── */

export const ROUND_SYNTHESIS = -1;

export function roundLabel(round) {
  return round === ROUND_SYNTHESIS ? 'Synthèse' : round === 0 ? 'Ouverture' : `Tour ${round}`;
}

export function renderRound(container, round) {
  const sep = el('div', 'round-sep', roundLabel(round));
  sep.dataset.round = String(round);
  container.append(sep);
  return sep;
}

export function renderMessage(container, message, { synthesis = false, skip = [] } = {}) {
  const bubble = el('article', 'bubble');
  if (message.authorType === 'user') bubble.classList.add('from-user');
  if (synthesis) bubble.classList.add('synthesis');
  if (message.color) bubble.style.setProperty('--bubble', message.color);

  const head = el('div', 'bubble-head');
  if (message.emoji) head.append(el('span', 'bubble-emoji', message.emoji));
  head.append(el('span', 'bubble-name', message.name || 'Moi'));
  if (message.role) head.append(el('span', 'bubble-role', message.role));

  // Le corps passe par renderMarkdown, qui n'ajoute que des nœuds (texte,
  // gras, titres, listes, <a>) : le modèle n'écrit jamais de HTML ici.
  const body = el('div', 'bubble-body');
  renderMarkdown(body, message.content, { skip });

  bubble.append(head, body);
  container.append(bubble);
  return bubble;
}

/* ── Défilement ──────────────────────────────────────────────────────────────
   Le fil ne suit le bas que si l'utilisateur y est déjà. Sinon il reste où il
   lit, et un bouton discret l'avertit qu'il s'est dit des choses plus bas.
   --------------------------------------------------------------------------*/

export function isNearBottom(margin = 160) {
  const doc = document.documentElement;
  return window.innerHeight + window.scrollY >= doc.scrollHeight - margin;
}

export function scrollToBottom(smooth = true) {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

/** Date courte pour une liste : « 12 sept. », l'année seulement si elle diffère. */
export function formatShortDate(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Remplit un <select>. `options` est une liste de { value, label }.
 * `fallback` ajoute une première entrée vide, pour les endroits où ne rien
 * choisir est un choix valable (« celui des réglages »).
 */
export function fillSelect(select, options, current, fallback = null) {
  select.replaceChildren();
  const entries = fallback ? [{ value: '', label: fallback }, ...options] : options;
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = entry.value === (current || '');
    select.append(option);
  }
}
