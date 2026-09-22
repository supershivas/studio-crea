// Estimation du coût d'un débat, avant de le lancer.
//
// Le calcul rejoue le déroulé de js/debate.js appel par appel : ouverture,
// tours de parole, synthèse, titre. L'entrée domine largement la sortie,
// parce que tout le fil est renvoyé à chaque prise de parole — c'est
// justement ce que cette estimation rend visible.
//
// Les tarifs vivent dans MODELS (js/api.js), en dollars par million de
// tokens. Le résultat reste un ORDRE DE GRANDEUR : la longueur réelle des
// réponses varie, et le contexte projet n'est pas connu d'avance.

import { MODELS, getModel, getSynthesisModel, modelFor } from './api.js';
import { levelFor } from './prompt.js';

// Mesuré sur un débat réel en français : un mot pèse environ 1,6 token.
const TOKENS_PER_WORD = 1.6;

// Le prompt système assemblé d'un persona v2 (identité, expertise, canon,
// curseurs, règles communes, bloc de session).
const SYSTEM_TOKENS = 900;

// Le nom et le rôle qui précèdent chaque intervention dans le fil relu.
const SPEAKER_OVERHEAD = 15;

// Plafonds de sortie déclarés dans debate.js, tempérés : un modèle atteint
// rarement son max_tokens.
const SYNTHESIS_TOKENS = 600;
const TITLE_IN = 150;
const TITLE_OUT = 25;

/** Longueur visée d'une intervention, lue sur le curseur « Longueur ». */
export function turnTokens(globalSliders) {
  const slider = (globalSliders || []).find((s) => s.id === 'longueur');
  const phrase = slider ? levelFor(slider) : '';
  const words = Number((phrase.match(/(\d+)\s*mots/) || [])[1]) || 120;
  return Math.round(words * TOKENS_PER_WORD);
}

function priceOf(modelId) {
  const model = MODELS.find((m) => m.id === modelId) || MODELS[0];
  return model.price;
}

/** Coût en dollars d'un appel, tarif du modèle appliqué à ses deux volumes. */
export function callCost(modelId, inputTokens, outputTokens) {
  const price = priceOf(modelId);
  return (inputTokens * price.input + outputTokens * price.output) / 1e6;
}

/**
 * Estime un débat complet.
 *
 * `participants` : les personas retenus, modératrice comprise.
 * `contextTokens` : le contexte projet déjà validé, 0 en débat libre.
 *
 * Renvoie { dollars, calls, inputTokens, outputTokens, models }, où `models`
 * liste les modèles réellement sollicités — utile pour dire « dont Opus pour
 * la synthèse » sans que l'utilisateur ait à le déduire.
 */
export function estimateDebate({
  participants = [],
  rounds = 1,
  globalSliders = null,
  contextTokens = 0,
} = {}) {
  if (!participants.length) {
    return { dollars: 0, calls: 0, inputTokens: 0, outputTokens: 0, models: [] };
  }

  const moderator = participants.find((p) => p.isModerator) || participants[0];
  const speakers = participants.filter((p) => p !== moderator);
  const turn = turnTokens(globalSliders);
  const fallback = getModel();
  const synthesisModel = getSynthesisModel() || modelFor(moderator);

  let dollars = 0;
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let transcript = 0;
  const models = new Set();

  const account = (modelId, tin, tout) => {
    dollars += callCost(modelId, tin, tout);
    calls += 1;
    inputTokens += tin;
    outputTokens += tout;
    models.add(modelId);
  };

  // 1. Le contexte projet est condensé une seule fois, puis réutilisé.
  //    Sans projet, cet appel n'a pas lieu du tout.
  const summary = contextTokens ? Math.min(400, Math.round(contextTokens / 3)) : 0;
  if (contextTokens) account(fallback, contextTokens + 150, summary);

  const speak = (persona) => {
    account(modelFor(persona) || fallback, SYSTEM_TOKENS + summary + transcript, turn);
    transcript += turn + SPEAKER_OVERHEAD;
  };

  // 2. L'ouverture de la modératrice, puis les tours de parole.
  speak(moderator);
  for (let round = 0; round < rounds; round += 1) {
    for (const persona of speakers) speak(persona);
  }

  // 3. La synthèse relit tout le fil, et le titre est un appel minuscule.
  account(synthesisModel, SYSTEM_TOKENS + summary + transcript, SYNTHESIS_TOKENS);
  account(fallback, TITLE_IN, TITLE_OUT);

  return { dollars, calls, inputTokens, outputTokens, models: [...models] };
}

/** « ≈ 0,18 $ — 14 appels » : une ligne, lisible d'un coup d'œil. */
export function formatEstimate(estimate) {
  if (!estimate.calls) return '';
  const amount = estimate.dollars < 0.01
    ? 'moins de 0,01 $'
    : `${estimate.dollars.toFixed(2).replace('.', ',')} $`;
  const mixed = estimate.models.length > 1 ? ', modèles mélangés' : '';
  return `≈ ${amount} — ${estimate.calls} appels${mixed}`;
}
