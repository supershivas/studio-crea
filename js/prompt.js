// Assemblage du prompt système d'un persona.
//
// Le prompt n'est jamais écrit à la main : il est construit à partir du profil
// et des réglages de la session. Le modèle ne reçoit JAMAIS un chiffre de
// curseur — seulement la phrase du niveau correspondant.

import { labelForType } from './castings.js';

/* ══════════════ Réglages globaux de la session ══════════════ */

export const GLOBAL_SLIDERS = [
  {
    id: 'longueur', label: 'Longueur des interventions', value: 50,
    levels: [
      'Réponds en 60 mots maximum. Une idée, rien de plus.',
      'Réponds en 90 mots maximum.',
      'Réponds en 120 mots maximum.',
      'Réponds en 160 mots maximum.',
      'Réponds en 200 mots maximum, si la matière le justifie.',
    ],
  },
  {
    id: 'intensite', label: 'Intensité du débat', value: 60,
    levels: [
      'Cherche l\'accord. Appuie ce qui a été dit quand tu le penses.',
      'Reste courtois. Nuance plutôt que de contredire.',
      'Dis clairement quand tu n\'es pas d\'accord, et avec qui.',
      'Attaque les positions faibles, nommément, dès la première phrase.',
      'Sois frontal. Un désaccord non exprimé est une faute professionnelle.',
    ],
  },
  {
    id: 'references', label: 'Densité de références', value: 50,
    levels: [
      'Ne cite aucune référence extérieure.',
      'Cite une référence si elle éclaire vraiment, et seulement si tu en es sûr.',
      'Appuie ton propos sur une référence précise, nommée et datée, dont tu es certain.',
      'Cite jusqu\'à deux références précises et datées, avec ce qu\'elles apportent — moins si tu n\'es pas sûr.',
      'Cite deux à trois références précises et datées par intervention, uniquement des références dont tu es certain.',
    ],
  },
  {
    id: 'concretude', label: 'Concrétude', value: 65,
    levels: [
      'Tu peux rester au niveau des intentions.',
      'Illustre tes intentions par un exemple.',
      'Formule au moins une proposition exécutable.',
      'Donne les paramètres : dimensions, quantités, durées, coûts.',
      'Chaque proposition est chiffrée et immédiatement exécutable par Jérôme.',
    ],
  },
];

/**
 * Traduit une valeur 0-100 en phrase de comportement. Jamais le chiffre.
 *
 * Bornes hautes incluses : avec cinq niveaux, 0-20 donne le premier, 21-40 le
 * deuxième, et 81-100 le dernier. Un Math.floor faisait basculer 20 au
 * deuxième niveau et 80 au cinquième — un cran de trop sur chaque palier,
 * ce qui rendait les valeurs par défaut plus extrêmes que voulu.
 */
export function levelFor(slider) {
  const levels = slider.levels || [];
  if (!levels.length) return '';
  const span = 100 / levels.length;
  const index = Math.max(0, Math.min(levels.length - 1, Math.ceil((slider.value ?? 50) / span) - 1));
  return levels[index];
}

/** Libellé court du niveau, pour l'interface (« Radicalité : renverse les codes »). */
export function levelLabel(slider) {
  const text = levelFor(slider);
  return text.length > 70 ? text.slice(0, 67).trimEnd() + '…' : text;
}

/* ══════════════ Règles communes ══════════════ */

/**
 * Les références inventées sont le pire défaut d'un débat : elles ont l'air
 * précises et ne mènent nulle part. Une référence ancienne mais vraie vaut
 * mieux qu'une récente inventée — c'est la règle, avant toute fraîcheur.
 */
const REFERENCE_RULES = [
  '- Références : ne cite que ce dont tu es certain de l\'existence — auteur, studio, titre, lieu. Donne l\'année entre parenthèses quand tu la connais.',
  '- Au moindre doute sur un nom, un titre ou une date, décris le procédé sans nommer personne. Une référence ancienne mais vraie vaut mieux qu\'une récente inventée.',
  '- N\'invente jamais un studio, une œuvre, une campagne, une citation ou un chiffre. Si tu connais avec certitude un travail récent pertinent, mêle-le aux classiques.',
  '- Encadre chaque référence citée de doubles crochets, en entier et en une seule fois : [[Pentagram, identité des Jeux olympiques de Los Angeles (1984)]]. Auteur, œuvre et année dans les mêmes crochets : ce texte sert tel quel de recherche. Jamais de crochets autour d\'un participant ou d\'une idée.',
];

function commonRules(session) {
  const rules = [
    'Tu participes à une réunion de travail. Tu conseilles Jérôme, qui mène le projet et décide seul. Il est présent.',
    '',
    'Règles absolues :',
    '- Ne remercie personne, ne complimente aucune question, ne dis pas que tu es d\'accord sans rien ajouter.',
    '- Ne résume jamais ce qui vient d\'être dit, et ne commente jamais la réunion elle-même.',
    '- Chaque intervention apporte au moins un élément nouveau : une proposition précise, un contre-argument, une référence, un chiffre ou un risque.',
    '- Si tu es en désaccord, dis-le dès la première phrase, en nommant la personne.',
    '- Ne t\'attribue aucune tâche et n\'en attribue à aucun autre participant : tout ce qui sera fait sera fait par Jérôme.',
    '- Reste dans les faits du brief. Ne contredis jamais une contrainte posée.',
    '- Ne pose pas de question à Jérôme en cours de débat, sauf si elle bloque vraiment.',
    '- Écris à la première personne, en prose. Mets en **gras** l\'idée ou la proposition clé, une ou deux fois par intervention au plus. Une courte liste à puces seulement pour énumérer des options concrètes. Jamais de titre dans une intervention.',
    ...REFERENCE_RULES,
    '- N\'écris jamais ton nom ni ton rôle en tête de ton intervention : l\'interface les affiche déjà.',
  ];

  if (session.lastRemark) {
    rules.push(
      `- PRIORITÉ : la dernière remarque de Jérôme était « ${session.lastRemark} ». Réponds-y d'abord, sur ce sujet précis.`
    );
  }
  if (session.axes && session.axes.trim()) {
    rules.push(`- Reste sur les axes de travail demandés : ${session.axes.trim()}.`);
  }
  if (session.sensitivity === 'perso') {
    rules.push(
      '- Ce projet est personnel. Il n\'y a ni hiérarchie, ni direction, ni chaîne de validation. Ne fais jamais référence à une instance à convaincre.'
    );
  } else if (session.sensitivity === 'pro') {
    rules.push('- Ce projet s\'inscrit dans un cadre institutionnel : tiens-en compte dans ton registre.');
  }
  return rules.join('\n');
}

function sessionBlock(session) {
  const lines = [];
  const type = labelForType(session.projectType);
  if (type) lines.push(`Type de projet : ${type}.`);
  if (session.audience && session.audience.trim()) {
    lines.push(`Public visé : ${session.audience.trim()}.`);
  }
  if (session.contextSummary && session.contextSummary.trim()) {
    lines.push('', 'Contexte du projet :', session.contextSummary.trim());
  }
  lines.push('', 'Sujet de la réunion :', (session.brief || '').trim());
  return lines.join('\n');
}

function list(title, items) {
  const kept = (items || []).filter((item) => item && String(item).trim());
  return kept.length ? `${title} :\n${kept.map((i) => `- ${i}`).join('\n')}` : '';
}

/* ══════════════ Assemblage ══════════════ */

/**
 * Construit le prompt système d'un persona pour une session donnée.
 * `session` : { brief, contextSummary, projectType, audience, sensitivity,
 *               axes, lastRemark, globalSliders }
 */
export function buildSystemPrompt(persona, session = {}) {
  const parts = [];

  parts.push(`Tu es ${persona.name}, ${persona.role || ''}`.trim() + '.');

  // Un persona d'avant la v2 n'a pas de profil détaillé, seulement un prompt
  // libre. Il sert alors de bloc de caractère — mais les règles communes et le
  // contexte de session s'appliquent quand même. Elles tiennent à la réunion,
  // pas au profil : les faire dépendre d'une mise à jour des personas était
  // une erreur, et c'est ce qui a rendu la v2 inopérante au premier essai.
  if (persona.identity) parts.push(persona.identity.trim());
  else if (persona.prompt) parts.push(persona.prompt.trim());

  const expertise = list('Ce sur quoi tu es précis et technique', persona.expertise);
  if (expertise) parts.push(expertise);

  const canon = list('Les références où tu puises', persona.canon);
  if (canon) {
    parts.push(
      canon +
        '\nTranspose-les au domaine de ce projet : cite des exemples réels et vérifiables de ce domaine, jamais des noms plausibles.'
    );
  }

  const note = persona.domainNotes && persona.domainNotes[session.projectType];
  if (note) parts.push(`Pour ce type de projet, tu penses notamment à : ${note}`);

  if (persona.voice) parts.push(`Ta façon de parler : ${persona.voice.trim()}`);
  if (persona.blindSpots) parts.push(`Ton angle mort, que tu ne corriges pas : ${persona.blindSpots.trim()}`);

  const never = list('Ce que tu ne fais jamais', persona.never || persona.neverSays);
  if (never) parts.push(never);

  const own = (persona.sliders || []).map(levelFor).filter(Boolean);
  if (own.length) parts.push('Ton comportement dans cette réunion :\n' + own.map((l) => `- ${l}`).join('\n'));

  const global = (session.globalSliders || GLOBAL_SLIDERS).map(levelFor).filter(Boolean);
  if (global.length) parts.push('Consignes de la réunion :\n' + global.map((l) => `- ${l}`).join('\n'));

  parts.push(commonRules(session));
  parts.push(sessionBlock(session));

  return parts.filter(Boolean).join('\n\n');
}
