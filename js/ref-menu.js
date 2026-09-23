// Le menu d'une référence : où la chercher.
//
// Un clic sur une référence ouvre ce menu au lieu d'une recherche imposée :
// Google Images pour voir, Google pour lire, Wikipédia pour situer, Pinterest
// pour les déclinaisons, ou copier le texte pour chercher ailleurs.
//
// À la souris, il s'ouvre aussi au survol, sous le lien. Au doigt (pas de
// survol, écran étroit), c'est une feuille collée en bas, sous le pouce.
// Un seul élément pour toute l'app, câblé par délégation : les liens sont
// créés par milliers au fil des débats, aucun n'a son propre écouteur.

import { $, toast } from './ui.js';

export const SEARCHES = [
  { label: 'Google Images', url: 'https://www.google.com/search?tbm=isch&q=' },
  { label: 'Google', url: 'https://www.google.com/search?q=' },
  { label: 'Wikipédia', url: 'https://fr.wikipedia.org/w/index.php?search=' },
  { label: 'Pinterest', url: 'https://www.pinterest.com/search/pins/?q=' },
];

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 300;
const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let current = null;     // le lien dont le menu est ouvert
let timer = null;

/** La recherche : le texte de la référence, sans la ponctuation qui gêne. */
export function cleanQuery(text) {
  return (text || '').replace(/[()[\]«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
}

function place(menu, link) {
  const asSheet = !canHover() || window.innerWidth < 560;
  menu.classList.toggle('as-sheet', asSheet);
  if (asSheet) {
    menu.style.left = '';
    menu.style.top = '';
    return;
  }
  const rect = link.getBoundingClientRect();
  const width = menu.offsetWidth;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = rect.bottom + 6;
  const top = below + menu.offsetHeight > window.innerHeight - 8
    ? rect.top - menu.offsetHeight - 6
    : below;
  menu.style.left = left + window.scrollX + 'px';
  menu.style.top = top + window.scrollY + 'px';
}

export function openRefMenu(link) {
  const menu = $('ref-menu');
  const query = cleanQuery(link.dataset.query || link.textContent);
  $('ref-menu-query').textContent = query;
  const list = $('ref-menu-links');
  list.replaceChildren();
  for (const search of SEARCHES) {
    const a = document.createElement('a');
    a.className = 'ref-menu-item';
    a.href = search.url + encodeURIComponent(query);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = search.label;
    a.addEventListener('click', () => closeRefMenu());
    list.append(a);
  }
  $('ref-menu-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(query);
      toast('Référence copiée.');
    } catch (_) {
      toast('Copie refusée par le navigateur.');
    }
    closeRefMenu();
  };
  current = link;
  menu.hidden = false;
  place(menu, link);
}

export function closeRefMenu() {
  clearTimeout(timer);
  $('ref-menu').hidden = true;
  current = null;
}

function refFrom(target) {
  const link = target && target.closest ? target.closest('a.ref-link[data-query]') : null;
  return link;
}

export function wireRefMenu() {
  const menu = $('ref-menu');

  document.addEventListener('click', (event) => {
    const link = refFrom(event.target);
    if (link) {
      // Le clic simple ouvre le menu ; clic du milieu et Cmd-clic gardent
      // le href (Google Images), comme n'importe quel lien.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      if (current === link && !menu.hidden) closeRefMenu();
      else openRefMenu(link);
      return;
    }
    if (!menu.hidden && !menu.contains(event.target)) closeRefMenu();
  });

  // Survol : seulement à la souris, avec un temps d'arrêt pour ne pas ouvrir
  // un menu à chaque passage du pointeur sur le texte.
  document.addEventListener('mouseover', (event) => {
    if (!canHover()) return;
    const link = refFrom(event.target);
    if (link) {
      clearTimeout(timer);
      if (current !== link) timer = setTimeout(() => openRefMenu(link), HOVER_OPEN_MS);
    } else if (menu.contains(event.target)) {
      clearTimeout(timer);
    }
  });
  document.addEventListener('mouseout', (event) => {
    if (!canHover()) return;
    const leaving = refFrom(event.target) || (menu.contains(event.target) ? menu : null);
    if (!leaving) return;
    const to = event.relatedTarget;
    if (to && (menu.contains(to) || refFrom(to) === current)) return;
    clearTimeout(timer);
    if (!menu.hidden) timer = setTimeout(closeRefMenu, HOVER_CLOSE_MS);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) closeRefMenu();
  });
  // Un menu posé sous un lien n'a plus de sens quand le lien défile ailleurs.
  window.addEventListener('scroll', () => {
    if (!menu.hidden && !menu.classList.contains('as-sheet')) closeRefMenu();
  }, { passive: true });
  $('ref-menu-close').addEventListener('click', closeRefMenu);
}
