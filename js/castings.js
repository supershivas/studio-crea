// Types de projet et castings proposés.
//
// Les castings ne sont que des propositions : l'utilisateur coche et décoche
// librement. Au-delà de sept participants, le débat se dilue et le coût grimpe.

export const MAX_COMFORTABLE = 7;

export const PROJECT_TYPES = [
  { id: 'edition',    label: 'Édition / livre' },
  { id: 'identite',   label: 'Identité visuelle' },
  { id: 'web',        label: 'Web / app' },
  { id: 'campagne',   label: 'Campagne de communication' },
  { id: 'exposition', label: 'Exposition / signalétique' },
  { id: 'jeu',        label: 'Jeu' },
  { id: 'evenement',  label: 'Événement' },
  { id: 'video',      label: 'Vidéo / motion' },
  { id: 'autre',      label: 'Autre' },
];

/**
 * Qui participe, selon le type de projet. Identifiants des personas par
 * défaut ; un persona absent de la liste de l'utilisateur est simplement
 * ignoré, et un casting vide retombe sur le casting « autre ».
 */
export const CASTINGS = {
  edition:    ['moderatrice', 'graphiste', 'da', 'producteur', 'public-sensible', 'public-presse', 'journaliste'],
  identite:   ['moderatrice', 'graphiste', 'da', 'conceptrice', 'communication', 'garde-fou', 'public-presse'],
  web:        ['moderatrice', 'graphiste', 'da', 'conceptrice', 'faisabilite', 'producteur', 'public-presse'],
  campagne:   ['moderatrice', 'da', 'conceptrice', 'communication', 'journaliste', 'garde-fou', 'public-presse'],
  exposition: ['moderatrice', 'graphiste', 'da', 'producteur', 'faisabilite', 'public-sensible'],
  jeu:        ['moderatrice', 'graphiste', 'da', 'faisabilite', 'public-presse'],
  evenement:  ['moderatrice', 'da', 'conceptrice', 'producteur', 'communication', 'garde-fou', 'public-presse'],
  video:      ['moderatrice', 'graphiste', 'da', 'conceptrice', 'producteur', 'public-presse'],
  autre:      ['moderatrice', 'graphiste', 'da', 'producteur', 'public-presse'],
};

export function labelForType(typeId) {
  const type = PROJECT_TYPES.find((t) => t.id === typeId);
  return type ? type.label : '';
}

/**
 * Identifiants des personas proposés pour un type, limités à ceux qui
 * existent réellement chez l'utilisateur. On compare sur le nom autant que sur
 * l'identifiant : un persona renommé ou recréé garde sa place au casting.
 */
export function suggestedCast(typeId, personas) {
  const wanted = CASTINGS[typeId] || CASTINGS.autre;
  const byDefaultId = new Map();
  for (const persona of personas) {
    if (persona.defaultId) byDefaultId.set(persona.defaultId, persona.id);
  }
  const ids = wanted.map((key) => byDefaultId.get(key)).filter(Boolean);
  return ids.length ? ids : personas.map((p) => p.id);
}
