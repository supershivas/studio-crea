// Fermeture d'un tiroir au glissement.
//
// Le tiroir sort par la droite : on le referme en poussant vers la droite.
// Le panneau suit le doigt, et ne se ferme que si le geste est franc — sinon
// il revient en place. Un geste hésitant ne doit jamais fermer quelque chose.

// Part de la largeur au-delà de laquelle le geste vaut fermeture.
const CLOSE_RATIO = 0.35;

// Vitesse (px/ms) qui ferme même sur un geste court : un coup sec est une
// intention claire, même s'il ne parcourt pas le tiers du panneau. 1 px/ms,
// soit 1000 px/s — à 500, un simple à-coup de trente pixels en refermait un,
// ce qui donne l'impression d'un panneau qui part tout seul.
const FLICK_SPEED = 1;

// ...mais un coup sec doit quand même être un geste : sous cette distance,
// c'est un tremblement, quelle que soit sa vitesse.
const FLICK_MIN_PX = 40;

// Tant qu'on n'a pas dépassé ce seuil, on ne sait pas si le doigt veut faire
// glisser le panneau ou faire défiler son contenu. On ne décide qu'après.
const DECISION_PX = 10;

const SLIDE_MS = 200;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** Referme en faisant sortir le panneau, plutôt qu'en le faisant disparaître. */
export function closeDrawer(dialog) {
  if (!dialog || !dialog.open) return;
  if (reducedMotion()) { dialog.close(); return; }

  dialog.style.transition = `transform ${SLIDE_MS}ms ease-in`;
  dialog.style.transform = 'translateX(100%)';
  window.setTimeout(() => {
    dialog.style.transition = '';
    dialog.style.transform = '';
    dialog.close();
  }, SLIDE_MS);
}

/**
 * Rend un tiroir refermable au glissement vers la droite.
 *
 * `passive: false` sur touchmove : il faut pouvoir appeler preventDefault()
 * pour empêcher la page de défiler pendant qu'on tire le panneau. Tant que la
 * direction n'est pas tranchée, on ne bloque rien — le défilement vertical du
 * contenu doit rester intact.
 */
export function enableSwipeToClose(dialog) {
  if (!dialog) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let dragging = false;
  let decided = false;
  let delta = 0;

  const reset = () => {
    dragging = false;
    decided = false;
    delta = 0;
    dialog.style.transition = '';
    dialog.style.transform = '';
  };

  dialog.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    dragging = false;
    decided = false;
    delta = 0;
  }, { passive: true });

  dialog.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;

    if (!decided) {
      if (Math.abs(dx) < DECISION_PX && Math.abs(dy) < DECISION_PX) return;
      decided = true;
      // Vers la droite et plus horizontal que vertical : c'est un glissement.
      dragging = dx > 0 && Math.abs(dx) > Math.abs(dy);
      if (dragging) dialog.style.transition = 'none';
    }
    if (!dragging) return;

    event.preventDefault();
    delta = Math.max(0, dx);
    dialog.style.transform = `translateX(${delta}px)`;
  }, { passive: false });

  const finish = () => {
    if (!dragging) { reset(); return; }
    const width = dialog.getBoundingClientRect().width || 1;
    const elapsed = Math.max(1, Date.now() - startTime);
    const franc =
      delta > width * CLOSE_RATIO ||
      (delta >= FLICK_MIN_PX && delta / elapsed > FLICK_SPEED);

    if (franc) {
      reset();
      closeDrawer(dialog);
      return;
    }
    // Geste hésitant : le panneau revient, pour montrer qu'il a compris
    // le geste mais ne l'a pas suivi.
    dialog.style.transition = `transform ${SLIDE_MS}ms ease-out`;
    dialog.style.transform = 'translateX(0)';
    window.setTimeout(reset, SLIDE_MS);
  };

  dialog.addEventListener('touchend', finish, { passive: true });
  dialog.addEventListener('touchcancel', () => { reset(); }, { passive: true });

  // Échap ferme comme le reste : en glissant, pas en disparaissant.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDrawer(dialog);
  });

  // Un clic à côté du panneau ferme aussi. La cible n'est le <dialog>
  // lui-même que pour le fond : un clic dans le contenu vise un enfant.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDrawer(dialog);
  });
}
