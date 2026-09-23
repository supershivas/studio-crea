// Export d'un débat, en trois découpes : tout le fil, la synthèse seule, ou
// les points clés de chacun. Téléchargé en Markdown ou copié.
//
// Les points clés ne coûtent aucun appel d'API : ce sont les passages que
// chaque participant a lui-même mis en gras (le prompt le lui demande), ou à
// défaut sa première phrase.

import * as ui from './ui.js';
import { state } from './state.js';
import { stripSynthesisHeading } from './markdown.js';

const { $, toast } = ui;

function header({ title, brief, createdAt }, suffix = '') {
  // Le titre court en tête, le brief en corps : un brief de quinze lignes
  // faisait un titre de document illisible.
  const out = ['# ' + (title || 'Débat du studio') + suffix, ''];
  if (createdAt) out.push('*' + ui.formatDateTime(createdAt) + '*', '');
  if (brief && brief.trim()) out.push('## Le sujet', '', brief.trim(), '');
  return out;
}

/** La synthèse passe sous un « ## Synthèse » : ses propres titres descendent d'un cran. */
function synthesisBody(text) {
  return stripSynthesisHeading(text || '').trim().replace(/^(#{1,5}) /gm, '#$1 ');
}

function who(message) {
  return message.authorType === 'user' ? 'Moi' : message.name || 'Agent';
}

export function toMarkdown(debate) {
  const out = header(debate);
  if (debate.contextSent && debate.contextSent.trim()) {
    out.push('## Contexte envoyé à l\'IA', '', debate.contextSent.trim(), '');
  }
  out.push('## Le débat', '');
  let round = null;
  for (const message of debate.messages) {
    if (message.round !== round) {
      round = message.round;
      out.push('### ' + ui.roundLabel(round), '');
    }
    out.push(`**${who(message)}**${message.role ? ` — *${message.role}*` : ''}`, '', message.content, '');
  }
  if (debate.synthesis && debate.synthesis.trim()) {
    out.push('## Synthèse', '', synthesisBody(debate.synthesis), '');
  }
  return out.join('\n');
}

export function synthesisMarkdown(debate) {
  const out = header(debate, ' — synthèse');
  out.push('## Synthèse', '', synthesisBody(debate.synthesis) || '*Pas encore de synthèse.*', '');
  return out.join('\n');
}

/** Ce que chacun a mis en gras ; à défaut, sa première phrase. Exporté pour les tests. */
export function keyPoints(messages) {
  const byWho = new Map();
  for (const message of messages) {
    if (message.authorType === 'user') continue;
    const bold = [...(message.content || '').matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].trim());
    const first = (message.content || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0];
    const points = bold.length ? bold : [first.slice(0, 220)];
    const name = who(message);
    if (!byWho.has(name)) byWho.set(name, { role: message.role, points: [] });
    const entry = byWho.get(name);
    for (const point of points) if (point && !entry.points.includes(point)) entry.points.push(point);
  }
  return byWho;
}

export function keyPointsMarkdown(debate) {
  const out = header(debate, ' — points clés');
  out.push('## Ce que chacun a défendu', '');
  for (const [name, { role, points }] of keyPoints(debate.messages)) {
    out.push(`### ${name}${role ? ` — *${role}*` : ''}`, '', ...points.map((p) => '- ' + p), '');
  }
  const text = synthesisBody(debate.synthesis);
  if (text) out.push('## Synthèse', '', text, '');
  return out.join('\n');
}

/* ══════════════ Téléchargement, copie ══════════════ */

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Nom de fichier sûr, dérivé du titre. */
export function slugify(text, fallback = 'debat') {
  const slug = (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 50);
  return slug || fallback;
}

const CUTS = {
  full: { build: toMarkdown, suffix: '' },
  synthesis: { build: synthesisMarkdown, suffix: '-synthese' },
  points: { build: keyPointsMarkdown, suffix: '-points-cles' },
};

function current() {
  return {
    title: state.title,
    brief: state.brief,
    contextSent: state.contextSent,
    messages: state.messages,
    synthesis: state.synthesis,
    createdAt: new Date().toISOString(),
  };
}

function chosen() {
  const picked = document.querySelector('input[name="export-cut"]:checked');
  return CUTS[picked ? picked.value : 'full'];
}

async function copy() {
  const text = chosen().build(current());
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié.');
    $('export-dialog').close();
  } catch (_) {
    toast('Copie refusée par le navigateur : télécharge plutôt.');
  }
}

function save() {
  const cut = chosen();
  download(slugify(state.title || state.brief) + cut.suffix + '.md', cut.build(current()));
  $('export-dialog').close();
}

export function wireExport() {
  $('btn-export').addEventListener('click', () => $('export-dialog').showModal());
  $('export-download').addEventListener('click', save);
  $('export-copy').addEventListener('click', copy);
  $('export-cancel').addEventListener('click', () => $('export-dialog').close());
}
