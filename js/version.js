// Détection d'une mise à jour déployée, et rechargement de la page.
//
// Pas de build, pas de service worker : l'app relit version.json de temps en
// temps et compare avec celui qu'elle a lu au démarrage. Ce fichier est la
// SEULE source de vérité — le numéro n'est écrit nulle part dans le code, donc
// il n'y a rien à maintenir en double et aucune boucle de rechargement
// possible : après un rechargement, la version lue devient la version de
// référence.

const FILE = 'version.json';

// Cinq minutes : assez pour ne pas laisser traîner une vieille version tout
// un après-midi, assez peu pour que ça ne se voie pas.
const INTERVAL = 5 * 60 * 1000;

let booted = null;    // la version au démarrage
let pending = null;   // une mise à jour vue, en attente d'un moment tranquille
let timer = null;
let notify = () => {};
let busy = () => false;

/** Lit version.json en contournant tous les caches. */
async function readVersion() {
  const url = new URL(FILE, window.location.href);
  url.searchParams.set('t', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('version.json indisponible');
  const data = await response.json();
  const version = String((data && data.version) || '').trim();
  if (!version) throw new Error('version.json sans numéro');
  return version;
}

/**
 * Une vérification. Si une nouvelle version est là, on prévient — sauf si un
 * débat tourne ou qu'une feuille est ouverte : recharger à ce moment-là
 * couperait la parole à quelqu'un. On garde alors la nouvelle sous le coude.
 */
async function check() {
  try {
    const current = pending || (await readVersion());
    if (!booted || current === booted) return;
    if (busy()) { pending = current; return; }
    // On récupère le callback avant d'arrêter, parce qu'arrêter le remet à
    // sa valeur par défaut.
    const announce = notify;
    stopVersionCheck();
    announce(current);
  } catch (_) {
    // Hors ligne, ou déploiement en cours : on réessaiera au prochain tour.
  }
}

/**
 * Démarre la surveillance.
 * `isBusy()` dit si le moment est mal choisi, `onUpdate(version)` fait le reste.
 */
export async function startVersionCheck({ isBusy, onUpdate } = {}) {
  // Idempotent, et sans aucun effet de bord : un second appel ne réécrit ni la
  // version de référence — une mise à jour déjà repérée passerait pour la
  // version courante et serait oubliée — ni les callbacks, sous peine de
  // débrancher silencieusement le premier appelant.
  if (booted) return booted;

  if (typeof isBusy === 'function') busy = isBusy;
  if (typeof onUpdate === 'function') notify = onUpdate;

  try {
    booted = await readVersion();
  } catch (_) {
    // Sans version de référence, il n'y a rien à comparer : on s'abstient
    // plutôt que de recharger au hasard.
    return null;
  }

  timer = setInterval(check, INTERVAL);
  // Revenir sur l'onglet est le moment le plus probable pour découvrir une
  // mise à jour, et le moins coûteux pour recharger.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  return booted;
}

/**
 * Arrête la surveillance et remet tout à zéro : plus de version de référence,
 * plus de callbacks. Un startVersionCheck suivant repart donc de rien — c'est
 * ce qu'on veut après un rechargement, et ce qui rend le module testable.
 */
export function stopVersionCheck() {
  if (timer) clearInterval(timer);
  timer = null;
  booted = null;
  pending = null;
  notify = () => {};
  busy = () => false;
}

/** La version qui tourne, pour l'afficher dans les réglages. */
export function currentVersion() {
  return booted;
}

/** Exporté pour les tests : rejoue une vérification à la demande. */
export const checkNow = check;
