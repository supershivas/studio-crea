// Liens de recherche sur les références citées dans un débat.
//
// Aucun appel d'API : on repère les noms propres et les titres dans le texte
// déjà reçu, et on les transforme en liens vers une recherche Google. Gratuit,
// instantané, et sans rien envoyer de plus à qui que ce soit.
//
// RÈGLE : ce fichier construit des nœuds DOM (createElement + textContent).
// Jamais d'innerHTML — le texte vient du modèle, donc d'ailleurs.

const ENABLED_STORAGE = 'studio-links';
const SEARCH_URL = 'https://www.google.com/search?q=';

/** Un lien est utile entre ces deux bornes : plus court, c'est du bruit. */
const MIN_LENGTH = 3;
const MAX_LENGTH = 60;

// Articles et déterminants : ils peuvent ouvrir un titre (« Le Monde »,
// « Une saison en enfer »), donc on ne les arrache jamais d'une suite.
const ARTICLES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'l', 'd',
]);

// Mots français qui prennent une majuscule en début de phrase sans être des
// noms propres. Ils ne sont écartés que seuls, ou en tête d'une suite quand
// la phrase commence — « Chez Gallimard » donne « Gallimard », pas les deux.
const FUNCTION_WORDS = new Set([
  ...ARTICLES,
  'ce', 'cet', 'cette', 'ces',
  'il', 'elle', 'on', 'ils', 'elles', 'je', 'tu', 'nous', 'vous', 'mon', 'ma',
  'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'votre', 'leur', 'leurs',
  'et', 'ou', 'mais', 'or', 'donc', 'car', 'ni', 'si', 'que', 'qui', 'quoi',
  'dont', 'quand', 'comme', 'comment', 'pourquoi', 'parce', 'puisque', 'lorsque',
  'pour', 'par', 'dans', 'sur', 'sous', 'avec', 'sans', 'vers', 'chez', 'contre',
  'entre', 'selon', 'malgré', 'sauf', 'depuis', 'pendant', 'avant', 'après',
  'afin', 'jusqu', 'alors', 'ainsi', 'aussi', 'enfin', 'bref', 'puis', 'ensuite',
  'pourtant', 'cependant', 'toutefois', 'néanmoins', 'surtout', 'plutôt',
  'tout', 'tous', 'toute', 'toutes', 'chaque', 'même', 'autre', 'autres',
  'plus', 'moins', 'très', 'bien', 'mal', 'trop', 'peu', 'beaucoup', 'tant',
  'autant', 'rien', 'personne', 'quelque', 'quelques', 'certains', 'certaines',
  'oui', 'non', 'ici', 'là', 'voilà', 'voici', 'attention', 'première',
  'premier', 'deuxième', 'troisième', 'dernier', 'dernière', 'faire', 'être',
]);

/* ══════════════ Réglage ══════════════ */

export function linksEnabled() {
  try {
    return localStorage.getItem(ENABLED_STORAGE) !== 'off';
  } catch (_) {
    return true;
  }
}

export function setLinksEnabled(on) {
  try {
    localStorage.setItem(ENABLED_STORAGE, on ? 'on' : 'off');
    return true;
  } catch (_) {
    return false;
  }
}

/* ══════════════ Repérage ══════════════ */

// Une URL écrite en clair : on la lie telle quelle, sans passer par Google.
const URL_RE = /https?:\/\/[^\s<>«»"')\]]+/gu;

// Un titre entre guillemets français ou courbes. Volontairement PAS les
// guillemets droits : ils servent à tout, y compris à citer du code ou un
// attribut HTML, et on se retrouverait à proposer une recherche sur
// « window.__pwned=1 ». En français soigné, un titre prend des « ».
const QUOTED_RE = /[«\u201C]\s*([^«»\u201C\u201D\n]{3,60}?)\s*[»\u201D]/gu;

// Une suite de mots capitalisés, avec les particules qui les relient :
// « Massimo Vignelli », « Le Monde », « Fondation Cartier pour l'art ».
const PROPER_RE =
  /\p{Lu}[\p{L}’'-]*(?:[ ](?:de|du|des|d’|d'|la|le|les|von|van|et)?[ ]?\p{Lu}[\p{L}’'-]*)*/gu;

/** Le caractère qui précède annonce-t-il un début de phrase ? */
function startsSentence(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const char = text[i];
    if (char === ' ' || char === '\t') continue;
    return '.!?:;…\n'.includes(char);
  }
  return true;
}

function normalize(word) {
  return word.toLowerCase().replace(/[’']/g, '');
}

/**
 * Les références d'un texte, dans l'ordre, sans chevauchement.
 *
 * `skip` reçoit les noms des participants et celui de Jérôme : personne n'a
 * envie d'un lien Google sur le prénom de sa propre modératrice.
 */
export function findReferences(text, { skip = [] } = {}) {
  const source = text || '';
  const ignored = new Set(skip.map(normalize).filter(Boolean));
  const found = [];
  const taken = [];
  const seen = new Set();

  const free = (start, end) => !taken.some((s) => start < s.end && end > s.start);
  const push = (start, end, label, href) => {
    const clean = label.trim();
    if (clean.length < MIN_LENGTH || clean.length > MAX_LENGTH) return;
    if (!free(start, end)) return;
    // Une même référence n'est liée qu'à sa première apparition : la lier
    // cinq fois dans un paragraphe le rend illisible.
    const key = normalize(clean);
    if (seen.has(key)) return;
    seen.add(key);
    taken.push({ start, end });
    found.push({ start, end, label: clean, href: href || SEARCH_URL + encodeURIComponent(clean) });
  };

  for (const m of source.matchAll(URL_RE)) {
    // La ponctuation qui suit une URL appartient à la phrase, pas à l'adresse.
    const url = m[0].replace(/[.,;:!?»]+$/u, '');
    push(m.index, m.index + url.length, url, url);
  }

  for (const m of source.matchAll(QUOTED_RE)) {
    // Un mot courant entre guillemets n'est pas une référence : dans
    // « l'angle « voyage » », chercher « voyage » n'apprend rien. On ne
    // retient que ce qui ressemble à un titre — une majuscule, ou plusieurs
    // mots.
    const quoted = m[1];
    const titrable = /\p{Lu}/u.test(quoted) || /\s/u.test(quoted.trim());
    if (!titrable) continue;
    const start = m.index + m[0].indexOf(quoted);
    push(start, start + quoted.length, quoted);
  }

  for (const m of source.matchAll(PROPER_RE)) {
    let run = m[0];
    let offset = 0;

    // En tête de phrase, la majuscule d'un mot outil ne prouve rien : elle
    // vient de la ponctuation. « Chez Gallimard » ne doit pas être cherché
    // tel quel. Les articles font exception, parce qu'un titre peut commencer
    // par « Le » ou « Une ».
    if (startsSentence(source, m.index)) {
      const first = run.split(/\s+/)[0] || '';
      const head = normalize(first);
      if (FUNCTION_WORDS.has(head) && !ARTICLES.has(head)) {
        const cut = run.slice(first.length).replace(/^\s+/, '');
        offset = run.length - cut.length;
        run = cut;
      }
    }

    const start = m.index + offset;
    const words = run.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    // Un seul mot : c'est là que se cachent les faux positifs. On écarte les
    // mots outils, les noms des participants, et les débuts de phrase douteux.
    if (words.length === 1) {
      const word = normalize(run);
      if (FUNCTION_WORDS.has(word) || ignored.has(word)) continue;
      if (word.length < MIN_LENGTH) continue;
    } else if (words.every((w) => ignored.has(normalize(w)))) {
      continue;
    }
    // Un mot seul en début de phrase est presque toujours un impératif — les
    // personas tutoient Jérôme sans arrêt (« Regarde… », « Prends… »). On y
    // renonce : ça coûte un « Bauhaus a inventé… » de temps en temps, ça
    // évite de souligner un verbe sur deux. Un mot dégagé de son mot outil
    // (« Chez Gallimard » → « Gallimard ») n'ouvre plus la phrase, lui.
    if (words.length === 1 && !offset && startsSentence(source, m.index)) continue;
    push(start, start + run.length, run);
  }

  return found.sort((a, b) => a.start - b.start);
}

/* ══════════════ Rendu ══════════════ */

/**
 * Écrit `text` dans `node`, les références transformées en liens.
 * Tout passe par des nœuds de texte : rien n'est interprété comme du HTML.
 */
export function linkifyInto(node, text, { skip = [] } = {}) {
  const source = text || '';
  if (!linksEnabled()) {
    node.textContent = source;
    return 0;
  }

  const refs = findReferences(source, { skip });
  if (!refs.length) {
    node.textContent = source;
    return 0;
  }

  let cursor = 0;
  for (const ref of refs) {
    if (ref.start > cursor) {
      node.append(document.createTextNode(source.slice(cursor, ref.start)));
    }
    const link = document.createElement('a');
    link.className = 'ref-link';
    link.href = ref.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `Chercher « ${ref.label} »`;
    link.textContent = source.slice(ref.start, ref.end);
    node.append(link);
    cursor = ref.end;
  }
  if (cursor < source.length) node.append(document.createTextNode(source.slice(cursor)));
  return refs.length;
}
