// Contexte projet : quels champs partent à l'IA, sous quelle forme, et le
// résumé court réutilisé par tous les agents.
//
// RÈGLE : rien d'un projet ne part automatiquement. L'app construit un aperçu
// avec buildContextText(), l'utilisateur le valide, et c'est ce texte-là —
// exactement celui-là — qui est envoyé puis archivé dans context_sent.

import { callClaude } from './api.js';

const STATUS_LABELS = {
  ready: 'À démarrer',
  ongoing: 'En cours',
  review: 'En relecture',
  sent: 'Envoyé au client',
  done: 'Terminé',
  hold: 'En pause',
};

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

/**
 * Champs cochables de l'écran « Ce qui sera envoyé à l'IA ».
 * `extract` renvoie le texte du champ, ou '' si le champ est vide — un champ
 * vide n'apparaît jamais dans l'aperçu, même coché.
 */
export const CONTEXT_FIELDS = [
  {
    key: 'name',
    label: 'Titre du projet',
    extract: ({ project }) => project.name || '',
  },
  {
    key: 'number',
    label: 'Numéro',
    extract: ({ project }) => project.number || '',
  },
  {
    key: 'client',
    label: 'Client',
    extract: ({ project }) => project.client || '',
  },
  {
    key: 'editor',
    label: 'Éditeur',
    extract: ({ project }) => project.editor || '',
  },
  {
    key: 'status',
    label: 'Statut',
    extract: ({ project }) => STATUS_LABELS[project.status] || '',
  },
  {
    key: 'deadline',
    label: 'Échéance',
    extract: ({ project }) => formatDate(project.deadline),
  },
  {
    key: 'subprojects',
    label: 'Sous-projets',
    extract: ({ subprojects }) =>
      (subprojects || [])
        .map((sub) => {
          const status = STATUS_LABELS[sub.status];
          return `- ${sub.name}${status ? ` (${status})` : ''}`;
        })
        .join('\n'),
  },
  {
    key: 'notes',
    label: 'Notes',
    extract: ({ notes, subprojects }) => {
      const all = [
        ...(notes || []).map((note) => ({ ...note, from: '' })),
        ...(subprojects || []).flatMap((sub) =>
          (sub.notes || []).map((note) => ({ ...note, from: sub.name }))
        ),
      ];
      return all
        .filter((note) => note.text && note.text.trim())
        .map((note) => {
          const when = formatDate(note.date || note.created_at);
          const head = [when, note.from].filter(Boolean).join(' — ');
          return `- ${head ? head + ' : ' : ''}${note.text.trim()}`;
        })
        .join('\n');
    },
  },
];

const MULTILINE_KEYS = new Set(['subprojects', 'notes']);

/**
 * Champs pré-cochés selon la sensibilité.
 *
 * Projet pro : rien. Le brief est écrit à la main, en conscience.
 * Projet perso : le titre et les notes, c'est-à-dire la matière utile.
 */
export function defaultSelection(sensitivity) {
  return sensitivity === 'perso' ? ['name', 'notes'] : [];
}

/**
 * Construit le texte EXACT envoyé à l'IA. Aucun champ non coché n'y figure,
 * aucun champ vide non plus. Renvoie '' si rien n'est retenu — auquel cas
 * rien du projet ne part, ce qui est un résultat valide.
 */
export function buildContextText(projectContext, selectedKeys) {
  if (!projectContext) return '';
  const selected = new Set(selectedKeys || []);
  const lines = [];

  for (const field of CONTEXT_FIELDS) {
    if (!selected.has(field.key)) continue;
    const value = field.extract(projectContext);
    if (!value || !value.trim()) continue;

    if (MULTILINE_KEYS.has(field.key)) {
      lines.push(`### ${field.label}`, value.trim(), '');
    } else {
      lines.push(`- ${field.label} : ${value.trim()}`);
    }
  }

  if (!lines.length) return '';
  return ['## Contexte du projet', '', ...lines].join('\n').trim();
}

/** Liste des champs réellement retenus, pour l'affichage de l'écran de validation. */
export function describeSelection(projectContext, selectedKeys) {
  const selected = new Set(selectedKeys || []);
  return CONTEXT_FIELDS.filter((field) => selected.has(field.key)).map((field) => {
    const value = projectContext ? field.extract(projectContext) : '';
    return {
      key: field.key,
      label: field.label,
      isEmpty: !value || !value.trim(),
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Résumé — un seul appel, réutilisé par tous les agents à chaque tour.
   ══════════════════════════════════════════════════════════════════════════ */

const SUMMARY_SYSTEM = `Tu prépares une note de cadrage pour une réunion de brainstorming.
On te donne les informations d'un projet. Condense-les en un paragraphe court
(80 mots maximum) qui dit de quoi il s'agit et ce qui compte.
Écris en français, sans introduction ni conclusion, sans listes à puces.
Ne rajoute aucune information qui ne soit pas dans le texte fourni.`;

/**
 * Condense le contexte en un résumé court.
 *
 * Appelé UNE fois au lancement du débat : c'est ce résumé, et jamais le
 * contexte brut, qui est réinjecté à chaque tour de chaque agent.
 * Renvoie '' si rien n'a été envoyé — il n'y a alors rien à résumer.
 */
export async function summarizeContext(contextText, { signal } = {}) {
  const text = (contextText || '').trim();
  if (!text) return '';

  return callClaude({
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: text }],
    maxTokens: 512,
    effort: 'low',
    signal,
  });
}
