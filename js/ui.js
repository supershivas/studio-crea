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

export function renderHistory(container, debates, onOpen) {
  container.replaceChildren();
  if (!debates.length) {
    container.append(el('p', 'status', 'Aucun débat pour le moment.'));
    return;
  }
  for (const debate of debates) {
    const item = el('button', 'history-item');
    item.type = 'button';
    item.append(
      el('div', null, debate.brief || 'Sans sujet'),
      el('div', 'history-date', formatDateTime(debate.created_at))
    );
    item.addEventListener('click', () => onOpen(debate));
    container.append(item);
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

export function toMarkdown({ brief, contextSent, messages, synthesis, createdAt }) {
  const out = ['# ' + (brief || 'Débat du studio'), ''];
  if (createdAt) out.push('*' + formatDateTime(createdAt) + '*', '');

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
