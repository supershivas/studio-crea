// Orchestration d'un débat : qui parle, dans quel ordre, avec quel historique.
//
// Ce fichier ne touche ni au DOM ni à Supabase. Il reçoit ses dépendances en
// paramètres (`call`, `persist`, `onMessage`, `askUser`), ce qui le rend
// testable sans réseau et laisse app.js seul maître de l'affichage.

import { callClaude, modelFor, getSynthesisModel, MODELS } from './api.js';
import { buildSystemPrompt } from './prompt.js';
import { speakingOrder } from './order.js';

export const AUTHOR_AGENT = 'agent';
export const AUTHOR_USER = 'user';

/**
 * Le prompt système est toujours assemblé, profil enrichi ou non.
 * buildSystemPrompt sait se contenter d'un ancien prompt libre.
 */
function buildSystem(agent, session) {
  return buildSystemPrompt(agent, session);
}

/**
 * L'historique tel que le voit un agent : qui a dit quoi, dans l'ordre.
 * Les interventions de l'utilisateur sont attribuées à « Jérôme » pour que
 * les agents puissent y répondre nommément.
 */
export function buildTranscript(history, userLabel = 'Jérôme') {
  return history
    .map((entry) => {
      if (entry.authorType === AUTHOR_USER) {
        return `${userLabel} (qui pilote la réunion) : ${entry.content}`;
      }
      const who = entry.role ? `${entry.name} (${entry.role})` : entry.name;
      return `${who} : ${entry.content}`;
    })
    .join('\n\n');
}

function speakInstruction(agent, history, isOpening, firstName = '') {
  if (isOpening) {
    const hand = firstName ? `puis donne la parole à ${firstName}.` : 'puis donne la parole.';
    return `Tu ouvres la réunion. Reformule le sujet en une phrase, dis ce qu'on cherche à trancher, ${hand}`;
  }
  if (!history.length) {
    return `Tu parles le premier. Donne ton point de vue sur le sujet.`;
  }
  return [
    'Voici ce qui a été dit jusqu\'ici :',
    '',
    buildTranscript(history),
    '',
    `C'est à toi, ${agent.name}. Réagis à ce qui vient d'être dit et apporte ton point de vue.`,
  ].join('\n');
}

const SYNTHESIS_INSTRUCTION = [
  'La réunion est terminée. Voici l\'intégralité des échanges :',
  '',
  '%TRANSCRIPT%',
  '',
  'Fais la synthèse, en Markdown, avec exactement cette structure (pour ce',
  'texte, et lui seul, les titres sont permis) :',
  '',
  '## Les pistes',
  '### 1. Nom court de la piste la plus prometteuse',
  'Sa justification en une ou deux phrases, ce qui la rend forte en **gras**.',
  '### 2. …',
  '### 3. …',
  '',
  '## Les désaccords',
  '- **Le point de désaccord** : qui s\'oppose à qui, et pourquoi ce n\'est pas tranché.',
  '',
  '## Prochaine étape',
  'Une action concrète, en une ou deux phrases.',
  '',
  '## Sources et références',
  '- [[Auteur ou studio, œuvre (année)]] : ce qu\'elle apporte au projet — cité par Prénom.',
  '',
  'Pour cette dernière section, reprends UNIQUEMENT les références réellement',
  'citées dans les échanges ci-dessus, une par ligne, sans doublon, avec',
  'l\'année si elle a été donnée, entre doubles crochets comme dans les',
  'échanges. N\'en ajoute aucune, n\'en corrige aucune.',
  'S\'il n\'y en a pas, écris « Aucune référence citée. »',
  '',
  'Ne commence ni par un titre général ni par le mot « Synthèse » : l\'interface',
  'l\'affiche déjà. Pas d\'introduction, pas de conclusion.',
].join('\n');

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw new DOMException('Débat interrompu', 'AbortError');
  }
}

/**
 * Déroule un débat complet.
 *
 * - `participants` : personas dans l'ordre de parole, modératrice comprise.
 * - `askUser(round)` : appelé entre deux tours, renvoie une remarque ou rien.
 * - `persist(message)` : sauvegarde au fil de l'eau, pour reprendre ailleurs.
 *
 * Les messages déjà produits sont sauvegardés avant toute erreur : une coupure
 * réseau au troisième tour ne fait pas perdre les deux premiers.
 */
export async function runDebate({
  brief,
  contextSummary = '',
  session = {},
  participants,
  rounds = 2,
  signal,
  call = callClaude,
  onMessage = () => {},
  persist = async () => {},
  askUser = async () => null,

  // Prolongation d'un débat existant : l'historique déjà tenu, le numéro du
  // dernier tour, et pas de nouvelle ouverture — la modératrice a déjà ouvert.
  history: earlier = [],
  roundOffset = 0,
  opening = true,

  // Le casting peut changer en cours de route : relu avant chaque prise de
  // parole. Un persona retiré ne parle plus ; un persona ajouté parle dès
  // que vient son tour, dans ce tour-ci s'il n'est pas déjà passé.
  currentCast = null,
  ordering = speakingOrder,
}) {
  if (!brief || !brief.trim()) throw new Error('Le sujet du débat est vide.');
  if (!participants || !participants.length) {
    throw new Error('Aucun participant sélectionné.');
  }

  const moderator = participants.find((p) => p.isModerator) || participants[0];
  const speakers = () =>
    (currentCast ? currentCast() : participants).filter((p) => p.id !== moderator.id);
  const history = [...earlier];
  // La dernière remarque de Jérôme est prioritaire au tour suivant.
  let lastRemark = (earlier.filter((m) => m.authorType === AUTHOR_USER).pop() || {}).content || '';

  const record = async (agent, content, round, authorType = AUTHOR_AGENT) => {
    const message = {
      agentId: agent ? agent.id : null,
      name: agent ? agent.name : null,
      role: agent ? agent.role : null,
      color: agent ? agent.color : null,
      emoji: agent ? agent.emoji : null,
      authorType,
      content,
      round,
    };
    history.push(message);
    await persist(message);
    onMessage(message);
    return message;
  };

  // L'ordre de parole d'un tour (js/order.js) : par rôle, le meneur du type
  // de projet en tête, puis rotation et interpellés d'abord aux tours suivants.
  const planFor = (round) => ordering(speakers(), {
    projectType: session.projectType,
    turn: round - 1,
    history,
    previousRound: round > 1 ? round - 1 : null,
  });

  const speak = async (agent, round, isOpening = false, firstName = '') => {
    throwIfAborted(signal);
    const content = await call({
      system: buildSystem(agent, { ...session, brief, contextSummary, lastRemark }),
      messages: [{ role: 'user', content: speakInstruction(agent, history, isOpening, firstName) }],
      maxTokens: 1024,
      effort: 'medium',
      // Chaque persona peut avoir son modèle : un regard secondaire n'a pas
      // besoin du même que celui qui porte le projet.
      model: modelFor(agent),
      signal,
    });
    return record(agent, content, round);
  };

  // 1. La modératrice ouvre, sauf si l'on prolonge un débat déjà ouvert.
  // Elle passe la parole à celui qui parlera vraiment le premier.
  if (opening) {
    const first = planFor(roundOffset + 1)[0];
    await speak(moderator, roundOffset, true, first ? first.name : '');
  }

  // 2. Les tours de parole.
  for (let index = 1; index <= rounds; index += 1) {
    const round = roundOffset + index;
    const plan = planFor(round);
    const spoken = new Set();
    for (;;) {
      // Le casting a pu changer depuis le début du tour : les retirés sautent,
      // les ajoutés prennent leur place dans l'ordre, derrière le plan prévu.
      const cast = speakers();
      const ids = new Set(cast.map((a) => a.id));
      const planned = plan.filter((a) => ids.has(a.id));
      const added = ordering(cast.filter((a) => !plan.some((p) => p.id === a.id)), {
        projectType: session.projectType,
      });
      const next = [...planned, ...added].find((agent) => !spoken.has(agent.id));
      if (!next) break;
      spoken.add(next.id);
      await speak(next, round);
    }

    // 3. Intervention de l'utilisateur entre deux tours, jamais après le dernier.
    if (index < rounds) {
      throwIfAborted(signal);
      const remark = await askUser(round);
      if (remark && remark.trim()) {
        lastRemark = remark.trim();
        await record(null, lastRemark, round, AUTHOR_USER);
      }
    }
  }

  // 4. Synthèse finale de la modératrice.
  throwIfAborted(signal);
  const synthesis = await call({
    system: buildSystem(moderator, { ...session, brief, contextSummary }),
    messages: [
      {
        role: 'user',
        content: SYNTHESIS_INSTRUCTION.replace('%TRANSCRIPT%', buildTranscript(history)),
      },
    ],
    maxTokens: 2048,
    effort: 'high',
    // La synthèse a son propre réglage ; à défaut, celui de la modératrice.
    model: getSynthesisModel() || modelFor(moderator),
    signal,
  });

  return { messages: history, synthesis };
}

/* ══════════════════════════════════════════════════════════════════════════
   Titre du débat
   ══════════════════════════════════════════════════════════════════════════ */

const CHEAP_MODEL = MODELS[MODELS.length - 1].id;

const TITLE_SYSTEM = `Tu nommes une réunion de travail à partir de son sujet.
Réponds par un titre de trois à six mots, en français, sans guillemets,
sans point final, sans article inutile. Rien d'autre que le titre.`;

/**
 * Titre court pour l'écran des débats, où le brief entier est illisible.
 * Un appel bref et bon marché. En cas d'échec, on se rabat sur le brief
 * tronqué plutôt que de faire échouer la fin du débat.
 */
export async function makeTitle(brief, { call = callClaude, signal, context = '' } = {}) {
  const fallback = (brief || 'Débat').trim().slice(0, 60);
  const text = [(brief || '').trim(), context ? 'Ce qui en est ressorti :\n' + context.slice(0, 1200) : '']
    .filter(Boolean).join('\n\n');
  try {
    const title = await call({
      system: TITLE_SYSTEM,
      messages: [{ role: 'user', content: text }],
      maxTokens: 64,
      effort: 'low',
      // Trois à six mots : le modèle le moins cher suffit largement.
      model: CHEAP_MODEL,
      signal,
    });
    return title.replace(/^["\u00ab\s#*]+|["\u00bb\s.*]+$/g, '').slice(0, 80) || fallback;
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    return fallback;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Sous-discussion : le débat d'origine, condensé une fois
   ══════════════════════════════════════════════════════════════════════════ */

const RECAP_SYSTEM = `On te donne le compte rendu d'une réunion de travail.
Condense-le en 150 mots maximum : le sujet, qui a défendu quoi (par prénom),
les pistes retenues et ce qui reste ouvert. Écris en français, sans
introduction. N'ajoute rien qui ne soit pas dans le texte.`;

/** Le texte du débat d'origine, tel qu'il sera envoyé pour être condensé. */
export function recapSource({ brief, contextSent = '', messages, synthesis = '' }) {
  return [
    'Sujet : ' + (brief || '').trim(),
    contextSent.trim() ? 'Contexte du projet :\n' + contextSent.trim() : '',
    'Échanges :\n' + buildTranscript(messages),
    synthesis.trim() ? 'Synthèse :\n' + synthesis.trim() : '',
  ].filter(Boolean).join('\n\n');
}

/**
 * Condense le débat d'origine en un rappel court, UNE fois : c'est ce rappel,
 * jamais le fil brut, que reçoivent ensuite les participants à chaque tour.
 */
export async function recapDebate(source, focus, { call = callClaude, signal } = {}) {
  const angle = focus && focus.trim()
    ? `\n\nInsiste sur tout ce qui touche à ce point : ${focus.trim()}`
    : '';
  return call({
    system: RECAP_SYSTEM,
    messages: [{ role: 'user', content: source + angle }],
    maxTokens: 512,
    effort: 'low',
    signal,
  });
}
