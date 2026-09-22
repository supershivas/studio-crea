// Rendu DOM. Aucun appel réseau ici.
//
// RÈGLE : tout contenu venant de l'API ou de la base passe par textContent.
// Il n'y a pas un seul innerHTML dans ce fichier, et il ne doit pas y en avoir.

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
export function toast(text) {
  const box = $('toast');
  if (!box) return;
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
}

function el(tag, className, text) {
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

export function renderPersonas(container, personas, selected, onToggle) {
  container.replaceChildren();
  for (const persona of personas) {
    const label = el('label', 'persona');

    const box = el('input');
    box.type = 'checkbox';
    box.checked = selected.has(persona.id);
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

export function renderRound(container, round) {
  const label =
    round === ROUND_SYNTHESIS ? 'Synthèse' : round === 0 ? 'Ouverture' : `Tour ${round}`;
  container.append(el('div', 'round-sep', label));
}

export function renderMessage(container, message, { synthesis = false } = {}) {
  const bubble = el('article', 'bubble');
  if (message.authorType === 'user') bubble.classList.add('from-user');
  if (synthesis) bubble.classList.add('synthesis');
  if (message.color) bubble.style.setProperty('--bubble', message.color);

  const head = el('div', 'bubble-head');
  if (message.emoji) head.append(el('span', 'bubble-emoji', message.emoji));
  head.append(el('span', 'bubble-name', message.name || 'Moi'));
  if (message.role) head.append(el('span', 'bubble-role', message.role));

  bubble.append(head, el('div', 'bubble-body', message.content));
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

/* ── Débats passés ── */

/**
 * Un débat par fiche : son titre, sa date, et ce qu'on peut en faire.
 * Le titre remplace le brief entier, souvent trop long pour une liste.
 */
export function renderHistory(container, debates, actions) {
  container.replaceChildren();
  if (!debates.length) {
    container.append(el('p', 'status', 'Aucun débat ici.'));
    return;
  }

  for (const debate of debates) {
    const card = el('article', 'debate-card');

    const open = el('button', 'debate-open');
    open.type = 'button';
    open.append(
      el('div', 'debate-title', debate.title || debate.brief || 'Sans titre'),
      el('div', 'debate-meta', [
        formatDateTime(debate.created_at),
        debate.synthesis ? 'synthèse faite' : 'sans synthèse',
      ].filter(Boolean).join(' · '))
    );
    open.addEventListener('click', () => actions.open(debate));

    const row = el('div', 'debate-actions-row');
    const button = (label, className, handler) => {
      const b = el('button', className, label);
      b.type = 'button';
      b.addEventListener('click', handler);
      return b;
    };
    row.append(
      button('Reprendre', 'chip', () => actions.resume(debate)),
      button(debate.archived ? 'Désarchiver' : 'Archiver', 'chip',
        () => actions.archive(debate, !debate.archived)),
      button('Supprimer', 'chip chip-danger', () => actions.remove(debate))
    );

    card.append(open, row);
    container.append(card);
  }
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

/* ── Export Markdown ── */

export function toMarkdown({ title, brief, contextSent, messages, synthesis, createdAt }) {
  // Le titre court en tête, le brief en corps : un brief de quinze lignes
  // faisait un titre de document illisible.
  const out = ['# ' + (title || 'Débat du studio'), ''];
  if (createdAt) out.push('*' + formatDateTime(createdAt) + '*', '');
  if (brief && brief.trim()) out.push('## Le sujet', '', brief.trim(), '');

  if (contextSent && contextSent.trim()) {
    out.push('## Contexte envoyé à l\'IA', '', contextSent.trim(), '');
  }

  out.push('## Le débat', '');
  let round = null;
  for (const message of messages) {
    if (message.round !== round) {
      round = message.round;
      out.push(`### ${round === 0 ? 'Ouverture' : 'Tour ' + round}`, '');
    }
    const who = message.authorType === 'user' ? 'Moi' : message.name || 'Agent';
    out.push(`**${who}**${message.role ? ` — *${message.role}*` : ''}`, '', message.content, '');
  }

  if (synthesis && synthesis.trim()) {
    out.push('## Synthèse', '', synthesis.trim(), '');
  }
  return out.join('\n');
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Nom de fichier sûr, dérivé du sujet. */
export function slugify(text, fallback = 'debat') {
  const slug = (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 50);
  return slug || fallback;
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
