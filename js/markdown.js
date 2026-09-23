// Mise en forme des réponses : un sous-ensemble de Markdown, rendu en nœuds.
//
// Titres (#, ##, ###), listes (-, *, 1.), gras (**…**), italique (*…*),
// filet (---), et les références balisées [[…]], chacune UN lien dont la
// recherche est la référence entière. Rien d'autre : pas de HTML, pas de
// lien Markdown, pas d'image.
// Chaque morceau de texte passe par linkifyInto, qui ne crée que des nœuds de
// texte et des <a> : le contenu du modèle n'est jamais interprété comme du
// HTML, et il n'y a pas un seul innerHTML ici.

import { linkifyInto, linksEnabled, refLink } from './links.js';
import { cleanQuery } from './ref-menu.js';

const HEADING = /^(#{1,4})\s+(.+?)\s*#*$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.+)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

// [[référence]], **gras**, puis *italique* ou _italique_ (sans espace collé
// à l'intérieur).
const MARKED = /\[\[([^\[\]\n]{2,160})\]\]/;
const INLINE = /\[\[([^\[\]\n]{2,160})\]\]|\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g;

/** Écrit une ligne de texte, gras et italique compris, dans `node`. */
function renderInline(node, text, options) {
  let cursor = 0;
  const plain = (part) => {
    if (!part) return;
    const span = document.createDocumentFragment();
    linkifyInto(span, part, options);
    node.append(span);
  };
  for (const m of text.matchAll(INLINE)) {
    plain(text.slice(cursor, m.index));
    cursor = m.index + m[0].length;
    if (m[1] != null) {
      // Une référence balisée : un seul lien, la référence entière pour recherche.
      node.append(linksEnabled() ? refLink(m[1], cleanQuery(m[1])) : document.createTextNode(m[1]));
      continue;
    }
    const strong = m[2] != null;
    const inner = document.createElement(strong ? 'strong' : 'em');
    renderInline(inner, strong ? m[2] : (m[3] ?? m[4]), options);
    node.append(inner);
  }
  plain(text.slice(cursor));
}

/**
 * Découpe le texte en blocs : titre, liste, filet, paragraphe.
 * Exporté pour être testable sans DOM.
 */
export function parseBlocks(text) {
  const blocks = [];
  let para = null;
  let list = null;
  const close = () => { para = null; list = null; };

  for (const line of (text || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) { close(); continue; }
    let m;
    if (RULE.test(line)) {
      close();
      blocks.push({ type: 'rule' });
    } else if ((m = line.match(HEADING))) {
      close();
      blocks.push({ type: 'heading', level: m[1].length, text: m[2] });
    } else if ((m = line.match(NUMBERED)) || (m = line.match(BULLET))) {
      const ordered = m.length === 3;
      const item = ordered ? m[2] : m[1];
      if (!list || list.ordered !== ordered) {
        para = null;
        list = { type: 'list', ordered, start: ordered ? Number(m[1]) : 1, items: [] };
        blocks.push(list);
      }
      list.items.push(item);
    } else if (list && /^\s{2,}\S/.test(line)) {
      // Suite d'un élément de liste sur la ligne d'après, indentée.
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      list = null;
      if (!para) { para = { type: 'para', lines: [] }; blocks.push(para); }
      para.lines.push(line.trim());
    }
  }
  return blocks;
}

/** Remplit `container` avec le texte mis en forme. */
export function renderMarkdown(container, text, options = {}) {
  container.replaceChildren();
  // Un message qui balise ses références n'a pas besoin du repérage deviné.
  if (MARKED.test(text || '')) options = { ...options, heuristic: false };
  for (const block of parseBlocks(text)) {
    if (block.type === 'rule') {
      container.append(document.createElement('hr'));
    } else if (block.type === 'heading') {
      // Dans une bulle, # et ## valent le même niveau : la bulle est déjà
      // sous le titre de la page, deux niveaux suffisent à la hiérarchie.
      const tag = block.level <= 2 ? 'h3' : 'h4';
      const heading = document.createElement(tag);
      heading.className = 'md-heading';
      renderInline(heading, block.text, options);
      container.append(heading);
    } else if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      if (block.ordered && block.start !== 1) list.start = block.start;
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(li, item, options);
        list.append(li);
      }
      container.append(list);
    } else {
      const p = document.createElement('p');
      block.lines.forEach((line, index) => {
        if (index) p.append(document.createElement('br'));
        renderInline(p, line, options);
      });
      container.append(p);
    }
  }
}

/**
 * Retire une première ligne « Synthèse de la réunion » : l'interface affiche
 * déjà « Synthèse » juste au-dessus. Seulement si elle a l'allure d'un titre.
 */
export function stripSynthesisHeading(text) {
  const source = (text || '').replace(/^\s+/, '');
  const [first, ...rest] = source.split('\n');
  const looksLikeTitle =
    /^#{1,4}\s/.test(first) || /^\*\*.*\*\*:?\s*$/.test(first.trim()) || /:\s*$/.test(first);
  if (looksLikeTitle && /synth[eè]se/i.test(first) && first.length < 90) {
    return rest.join('\n').replace(/^\s+/, '');
  }
  return source;
}
