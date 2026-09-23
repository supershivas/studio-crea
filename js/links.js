// Liens de recherche sur les références citées dans un débat.
//
// Aucun appel d'API. Deux chemins :
// - Les personas balisent désormais chaque référence entière entre doubles
//   crochets, [[Pentagram, identité des JO de Los Angeles (1984)]] : c'est
//   markdown.js qui en fait UN lien, dont la recherche est la référence
//   complète. C'est le chemin fiable.
// - Les débats d'avant le balisage passent par le repérage ci-dessous (noms
//   propres, titres). Chaque lien y cherche toute sa phrase — ses noms et ses
//   années — et non le seul nom cliqué : « Pentagram » seul n'apprend rien.
// Un clic ouvre le menu de js/ref-menu.js (Google Images, Google, Wikipédia,
// Pinterest, copier).
//
// RÈGLE : ce fichier construit des nœuds DOM (createElement + textContent).
// Jamais d'innerHTML — le texte vient du modèle, donc d'ailleurs.

const ENABLED_STORAGE = 'studio-links';
// Le href d'un lien de référence, pour un clic du milieu ou un appui long :
// Google Images, la recherche la plus utile à un graphiste. Le clic simple,
// lui, ouvre le menu.
export const IMAGE_URL = 'https://www.google.com/search?tbm=isch&q=';

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
    found.push({ start, end, label: clean, url: href || null });
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

// Une année plausible pour une référence : elle précise la recherche.
const YEAR_RE = /\b(1[5-9]\d\d|20\d\d)\b/g;

/**
 * La recherche d'un lien repéré : les noms et les années de toute sa phrase.
 * « Quand Pentagram a dessiné l'identité des Jeux olympiques de Los Angeles
 * en 1984 » donne « Pentagram Jeux olympiques de Los Angeles 1984 » sur
 * chacun de ses liens.
 */
function sentenceQueries(source, refs) {
  const bounds = [...source.matchAll(/[^.!?…\n]+[.!?…]*/g)].map((m) => [m.index, m.index + m[0].length]);
  return refs.map((ref) => {
    if (ref.url) return null;
    const [from, to] = bounds.find(([a, b]) => ref.start >= a && ref.start < b) || [ref.start, ref.end];
    const inside = refs.filter((r) => !r.url && r.start >= from && r.end <= to).map((r) => r.label);
    const years = [...source.slice(from, to).matchAll(YEAR_RE)].map((m) => m[1]);
    return [...new Set([...inside, ...years])].join(' ');
  });
}

/** Un lien de référence : son href mène à Google Images, son clic au menu. */
export function refLink(text, query) {
  const link = document.createElement('a');
  link.className = 'ref-link';
  link.href = IMAGE_URL + encodeURIComponent(query);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.query = query;
  link.textContent = text;
  return link;
}

/**
 * Écrit `text` dans `node`, les références transformées en liens.
 * Tout passe par des nœuds de texte : rien n'est interprété comme du HTML.
 * `heuristic: false` quand le message balise ses références lui-même : le
 * repérage deviné n'ajouterait alors que du bruit.
 */
export function linkifyInto(node, text, { skip = [], heuristic = true } = {}) {
  const source = text || '';
  if (!linksEnabled() || !heuristic) {
    node.textContent = source;
    return 0;
  }

  const refs = findReferences(source, { skip });
  if (!refs.length) {
    node.textContent = source;
    return 0;
  }

  const queries = sentenceQueries(source, refs);
  let cursor = 0;
  refs.forEach((ref, i) => {
    if (ref.start > cursor) {
      node.append(document.createTextNode(source.slice(cursor, ref.start)));
    }
    const shown = source.slice(ref.start, ref.end);
    if (ref.url) {
      // Une URL en clair mène à elle-même, sans menu.
      const link = document.createElement('a');
      link.className = 'ref-link';
      link.href = ref.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = shown;
      node.append(link);
    } else {
      node.append(refLink(shown, queries[i]));
    }
    cursor = ref.end;
  });
  if (cursor < source.length) node.append(document.createTextNode(source.slice(cursor)));
  return refs.length;
}
