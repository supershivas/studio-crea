// Sommaire du débat : un débat de cinq tours à sept voix fait vite trente
// bulles. Le sommaire liste les tours et, dans chacun, qui a parlé ; un clic
// y amène.
//
// Il se construit à partir du fil affiché, et se tient à jour tout seul
// (MutationObserver) : aucun des chemins qui ajoutent une bulle — débat en
// cours, prolongation, relecture — n'a à y penser.

import { $, el, show } from './ui.js';

let pending = false;

function jump(target) {
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function build() {
  pending = false;
  const list = $('toc-list');
  list.replaceChildren();
  let item = null;
  let voices = null;
  let rounds = 0;

  for (const node of $('messages').children) {
    if (node.classList.contains('round-sep')) {
      rounds += 1;
      item = el('li', 'toc-item');
      const link = el('button', 'toc-round', node.textContent);
      link.type = 'button';
      link.addEventListener('click', () => jump(node));
      voices = el('div', 'toc-voices');
      item.append(link, voices);
      list.append(item);
    } else if (node.classList.contains('bubble') && voices && !node.classList.contains('synthesis')) {
      const name = node.querySelector('.bubble-name');
      const emoji = node.querySelector('.bubble-emoji');
      const chip = el('button', 'toc-voice',
        (emoji ? emoji.textContent + ' ' : '') + (name ? name.textContent : ''));
      chip.type = 'button';
      chip.addEventListener('click', () => jump(node));
      voices.append(chip);
    }
  }
  // L'ouverture et un premier tour se lisent d'un coup d'œil : pas de sommaire.
  show($('debate-toc'), rounds > 2);
}

export function watchToc() {
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(build);
  }).observe($('messages'), { childList: true });
  $('toc-top').addEventListener('click', () => {
    $('debate-toc').open = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
