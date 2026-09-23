// L'ordre de parole d'un tour.
//
// Celui qui parle en premier cadre le débat (effet d'ancrage) ; le dernier
// n'a plus grand-chose à contredire. L'ordre de la liste des personas, le
// même à chaque tour quel que soit le projet, figeait donc toujours les mêmes
// voix aux mêmes places. Règle :
//
// 1. Par rôle : ceux qui PROPOSENT, puis ceux qui CHALLENGENT, puis ceux qui
//    ANCRENT dans le réel (fabrication, faisabilité), puis le PUBLIC en
//    dernier — il réagit à ce qui a été mis sur la table.
// 2. Le premier proposeur dépend du type de projet : l'édition s'ouvre sur
//    la graphiste, une campagne sur la conceptrice rédactrice…
// 3. Aux tours suivants, ceux qui ont été nommés par les autres au tour
//    précédent — donc contredits ou interpellés — répondent en premier, et
//    l'ordre de chaque groupe tourne d'un cran pour que personne n'ouvre
//    toujours.
//
// Ce fichier ne touche ni au DOM, ni au réseau : il trie des personas.

const PHASES = {
  graphiste: 0, da: 0, conceptrice: 0,
  'garde-fou': 1, communication: 1, journaliste: 1,
  producteur: 2, faisabilite: 2,
  'public-sensible': 3, 'public-presse': 3,
};
// Un persona créé à la main n'a pas de profil d'origine : il propose.
const DEFAULT_PHASE = 0;

/** Qui ouvre les propositions, selon le type de projet. */
export const LEADERS = {
  edition: 'graphiste',
  identite: 'graphiste',
  web: 'da',
  campagne: 'conceptrice',
  exposition: 'da',
  jeu: 'graphiste',
  evenement: 'conceptrice',
  video: 'da',
  autre: 'da',
};

function phaseOf(persona) {
  const phase = PHASES[persona.defaultId];
  return phase === undefined ? DEFAULT_PHASE : phase;
}

/** Fait tourner une liste de `n` crans : [a, b, c] → [b, c, a]. */
function rotate(list, n) {
  if (list.length < 2) return list;
  const k = ((n % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** L'ordre de base : par rôle, le meneur du type en tête des proposeurs. */
function baseOrder(speakers, projectType) {
  const leader = LEADERS[projectType] || LEADERS.autre;
  return [...speakers].sort((a, b) =>
    phaseOf(a) - phaseOf(b)
    || Number(b.defaultId === leader) - Number(a.defaultId === leader)
    || (a.position || 0) - (b.position || 0));
}

/**
 * Les participants nommés par un AUTRE participant au tour précédent, du
 * plus interpellé au moins interpellé. Un nom cité, c'est presque toujours un
 * désaccord ou une question : la personne visée répond d'abord.
 */
function challenged(speakers, history, previousRound) {
  const said = history.filter((m) => m.round === previousRound && m.authorType !== 'user');
  const counts = new Map();
  for (const persona of speakers) {
    if (!persona.name) continue;
    const pattern = new RegExp(`(^|[^\\p{L}])${persona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u');
    const hits = said.filter((m) => m.agentId !== persona.id && pattern.test(m.content || '')).length;
    if (hits) counts.set(persona.id, hits);
  }
  return speakers
    .filter((p) => counts.has(p.id))
    .sort((a, b) => counts.get(b.id) - counts.get(a.id));
}

/**
 * L'ordre de parole d'un tour.
 *
 * - `speakers` : les participants du tour, modératrice exclue.
 * - `turn` : 0 pour le premier tour joué, 1 pour le suivant… (la rotation).
 * - `history` et `previousRound` : pour repérer qui a été interpellé.
 */
export function speakingOrder(speakers, { projectType = 'autre', turn = 0, history = [], previousRound = null } = {}) {
  const base = baseOrder(speakers, projectType);
  // Chaque groupe tourne sur lui-même : le public reste en dernier, les
  // proposeurs restent devant, mais pas toujours le même en tête.
  const groups = new Map();
  for (const persona of base) {
    const phase = phaseOf(persona);
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(persona);
  }
  const rotated = [...groups.keys()].sort((a, b) => a - b)
    .flatMap((phase) => rotate(groups.get(phase), turn));

  if (!turn || previousRound === null) return rotated;

  // Les interpellés d'abord — sauf le public, qui reste le dernier mot.
  const first = challenged(speakers, history, previousRound).filter((p) => phaseOf(p) !== 3);
  const firstIds = new Set(first.map((p) => p.id));
  return [...first, ...rotated.filter((p) => !firstIds.has(p.id))];
}
