// Orchestration d'un débat : qui parle, dans quel ordre, avec quel historique.
//
// Ce fichier ne touche ni au DOM ni à Supabase. Il reçoit ses dépendances en
// paramètres (`call`, `persist`, `onMessage`, `askUser`), ce qui le rend
// testable sans réseau et laisse app.js seul maître de l'affichage.

import { callClaude } from './api.js';

export const AUTHOR_AGENT = 'agent';
export const AUTHOR_USER = 'user';

/** Le contexte projet est réinjecté sous forme de résumé, jamais en brut. */
function buildSystem(agent, brief, contextSummary) {
  const parts = [agent.prompt || ''];
  if (contextSummary && contextSummary.trim()) {
    parts.push(`\nContexte du projet dont il est question :\n${contextSummary.trim()}`);
  }
  parts.push(`\nSujet de la réunion :\n${brief.trim()}`);
  return parts.join('\n');
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

function speakInstruction(agent, history, isOpening) {
  if (isOpening) {
    return `Tu ouvres la réunion. Reformule le sujet en une phrase, dis ce qu'on cherche à trancher, puis donne la parole.`;
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
  'Fais la synthèse : trois pistes classées de la plus à la moins prometteuse,',
  'chacune avec sa justification en une phrase ; les désaccords qui n\'ont pas',
  'été tranchés ; une prochaine étape concrète.',
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
}) {
  if (!brief || !brief.trim()) throw new Error('Le sujet du débat est vide.');
  if (!participants || !participants.length) {
    throw new Error('Aucun participant sélectionné.');
  }

  const moderator = participants.find((p) => p.isModerator) || participants[0];
  const speakers = participants.filter((p) => p !== moderator);
  const history = [...earlier];

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

  const speak = async (agent, round, isOpening = false) => {
    throwIfAborted(signal);
    const content = await call({
      system: buildSystem(agent, brief, contextSummary),
      messages: [{ role: 'user', content: speakInstruction(agent, history, isOpening) }],
      maxTokens: 1024,
      effort: 'medium',
      signal,
    });
    return record(agent, content, round);
  };

  // 1. La modératrice ouvre, sauf si l'on prolonge un débat déjà ouvert.
  if (opening) await speak(moderator, roundOffset, true);

  // 2. Les tours de parole.
  for (let index = 1; index <= rounds; index += 1) {
    const round = roundOffset + index;
    for (const agent of speakers) {
      await speak(agent, round);
    }

    // 3. Intervention de l'utilisateur entre deux tours, jamais après le dernier.
    if (index < rounds) {
      throwIfAborted(signal);
      const remark = await askUser(round);
      if (remark && remark.trim()) {
        await record(null, remark.trim(), round, AUTHOR_USER);
      }
    }
  }

  // 4. Synthèse finale de la modératrice.
  throwIfAborted(signal);
  const synthesis = await call({
    system: buildSystem(moderator, brief, contextSummary),
    messages: [
      {
        role: 'user',
        content: SYNTHESIS_INSTRUCTION.replace('%TRANSCRIPT%', buildTranscript(history)),
      },
    ],
    maxTokens: 2048,
    effort: 'high',
    signal,
  });

  return { messages: history, synthesis };
}
