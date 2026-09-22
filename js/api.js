// Appels à l'API Messages d'Anthropic, directement depuis le navigateur.
//
// La clé API ne quitte jamais l'appareil : elle vit en localStorage, jamais
// dans Supabase, jamais dans le code, jamais dans un commit.

// Les trois modèles n'acceptent pas les mêmes paramètres : `effort` déclenche
// une erreur sur Haiku 4.5, et `fallbacks` ne vise que la famille Opus.
// Changer d'identifiant ne suffit donc pas, d'où ces capacités déclarées.
//
// `price` est le tarif public d'Anthropic en dollars par million de tokens,
// entrée et sortie. Il sert à l'estimation de js/cost.js : si les tarifs
// bougent, c'est ici qu'on les corrige, à un seul endroit.
// `cost` reste l'ordre de grandeur affiché dans les réglages : un débat de
// 7 personas sur 2 tours.
export const MODELS = [
  {
    id: 'claude-opus-5',
    label: 'Opus 5 — le plus fin',
    cost: '≈ 0,22 $ le débat',
    price: { input: 5, output: 25 },
    effort: true,
    fallbacks: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5 — équilibré',
    cost: '≈ 0,09 $ le débat',
    price: { input: 2, output: 10 },
    effort: true,
    fallbacks: false,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5 — le plus économique',
    cost: '≈ 0,04 $ le débat',
    price: { input: 1, output: 5 },
    effort: false,
    fallbacks: false,
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

const API_URL = 'https://api.anthropic.com/v1/messages';
const KEY_STORAGE = 'studio-anthropic-key';
const MODEL_STORAGE = 'studio-model';
const SYNTHESIS_STORAGE = 'studio-synthesis-model';

// Si l'API refuse une requête (classificateurs de sécurité), elle la rejoue
// côté serveur sur un autre modèle au lieu de renvoyer le refus.
//
// Si la console affiche une erreur CORS mentionnant « anthropic-beta »,
// passe cette constante à false : les débats repartiront, au prix de la
// reprise automatique en cas de refus.
const USE_FALLBACKS = true;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/* ══════════════════════════════════════════════════════════════════════════
   Clé API — toutes les lectures/écritures localStorage sous try/catch.
   ══════════════════════════════════════════════════════════════════════════ */

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch (_) {
    return '';
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
    return true;
  } catch (_) {
    return false;
  }
}

export function forgetApiKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch (_) {
    return false;
  }
}

export function hasApiKey() {
  return getApiKey().length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Choix du modèle
   ══════════════════════════════════════════════════════════════════════════ */

/** Le modèle retenu, ou le défaut si le réglage est absent ou périmé. */
export function getModel() {
  let stored = null;
  try { stored = localStorage.getItem(MODEL_STORAGE); } catch (_) {}
  return MODELS.some((m) => m.id === stored) ? stored : DEFAULT_MODEL;
}

export function setModel(id) {
  if (!MODELS.some((m) => m.id === id)) return false;
  try {
    localStorage.setItem(MODEL_STORAGE, id);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Modèle de la synthèse, ou null pour « le même que le reste ».
 *
 * La synthèse est le seul texte qu'on relit vraiment : elle mérite parfois un
 * modèle plus fin que les tours de parole, et c'est un appel sur quatorze.
 */
export function getSynthesisModel() {
  let stored = null;
  try { stored = localStorage.getItem(SYNTHESIS_STORAGE); } catch (_) {}
  return MODELS.some((m) => m.id === stored) ? stored : null;
}

export function setSynthesisModel(id) {
  try {
    if (!id) localStorage.removeItem(SYNTHESIS_STORAGE);
    else if (MODELS.some((m) => m.id === id)) localStorage.setItem(SYNTHESIS_STORAGE, id);
    else return false;
    return true;
  } catch (_) {
    return false;
  }
}

/** Le modèle retenu pour un persona : le sien s'il en a un, sinon le défaut. */
export function modelFor(persona) {
  const own = persona && persona.model;
  return MODELS.some((m) => m.id === own) ? own : getModel();
}

/**
 * Corps de requête adapté aux capacités du modèle.
 * Exporté pour être testable sans réseau.
 */
export function buildRequest(modelId, { system, messages, maxTokens, effort }) {
  const model = MODELS.find((m) => m.id === modelId) || MODELS[0];
  const body = { model: model.id, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (model.effort) body.output_config = { effort };
  if (model.fallbacks && USE_FALLBACKS) body.fallbacks = 'default';
  return { body, beta: model.fallbacks && USE_FALLBACKS ? FALLBACK_BETA : null };
}

/* ══════════════════════════════════════════════════════════════════════════
   Appel
   ══════════════════════════════════════════════════════════════════════════ */

/** Erreur portant assez d'informations pour que l'UI dise quoi faire. */
export class ApiError extends Error {
  constructor(message, { kind = 'unknown', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

function extractText(payload) {
  return (payload.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

async function readError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = (body && body.error && body.error.message) || '';
  } catch (_) {
    // Corps illisible : le statut suffira.
  }
  return detail;
}

/**
 * Un tour de parole. Renvoie le texte de la réponse.
 * `signal` permet au bouton stop d'interrompre un débat en cours.
 */
export async function callClaude({
  system,
  messages,
  maxTokens = 1024,
  effort = 'medium',
  signal,
  // Modèle explicite (celui d'un persona, ou celui de la synthèse). Un
  // identifiant inconnu retombe sur le réglage de l'appareil plutôt que
  // de faire échouer le tour de parole.
  model = null,
  // Clé explicite : sert à vérifier une clé AVANT de l'enregistrer.
  apiKey = null,
}) {
  const key = apiKey || getApiKey();
  if (!key) {
    throw new ApiError("Aucune clé API enregistrée sur cet appareil.", {
      kind: 'no-key',
    });
  }

  const chosen = MODELS.some((m) => m.id === model) ? model : getModel();
  const { body, beta } = buildRequest(chosen, {
    system,
    messages,
    maxTokens,
    effort,
  });

  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (beta) headers['anthropic-beta'] = beta;

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      "Impossible de joindre l'API. Vérifie ta connexion réseau.",
      { kind: 'network' }
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError('Clé API refusée. Vérifie-la dans les réglages.', {
      kind: 'bad-key',
      status: response.status,
    });
  }
  if (response.status === 402) {
    throw new ApiError(
      'Crédit Anthropic épuisé. Recharge le compte sur console.anthropic.com.',
      { kind: 'billing', status: 402 }
    );
  }
  if (response.status === 429) {
    throw new ApiError('Trop de requêtes. Attends quelques secondes.', {
      kind: 'rate-limit',
      status: 429,
    });
  }
  if (!response.ok) {
    const detail = await readError(response);
    throw new ApiError(
      `Erreur ${response.status}${detail ? ' : ' + detail : ''}`,
      { kind: 'http', status: response.status }
    );
  }

  const payload = await response.json();

  // Toujours avant de lire content : un refus renvoie un HTTP 200 avec un
  // content vide. Lire content[0] sans regarder stop_reason casserait ici.
  if (payload.stop_reason === 'refusal') {
    throw new ApiError(
      "L'API a refusé de répondre sur ce sujet. Reformule le brief.",
      { kind: 'refusal' }
    );
  }

  const text = extractText(payload);
  if (!text) {
    throw new ApiError('Réponse vide.', { kind: 'empty' });
  }
  return text;
}

/* ══════════════════════════════════════════════════════════════════════════
   Vérification d'une clé
   ══════════════════════════════════════════════════════════════════════════ */

// Le plus petit appel possible : le modèle le moins cher, une sortie d'un
// token. Ce qui nous intéresse n'est pas la réponse, c'est le code HTTP.
const PROBE_MODEL = MODELS[MODELS.length - 1].id;

/**
 * Vérifie qu'une clé est acceptée par l'API, sans l'enregistrer.
 *
 * Nuance importante : une clé sans crédit (402) est une clé VALIDE. La
 * refuser reviendrait à faire ressaisir une clé correcte à quelqu'un qui n'a
 * qu'à recharger son compte. Même chose pour une limite de débit (429).
 *
 * Renvoie { ok, reason, message }.
 */
export async function verifyApiKey(key, { signal } = {}) {
  const trimmed = (key || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty', message: 'Le champ est vide.' };

  try {
    await callClaude({
      messages: [{ role: 'user', content: 'ok' }],
      maxTokens: 1,
      effort: 'low',
      model: PROBE_MODEL,
      apiKey: trimmed,
      signal,
    });
    return { ok: true, reason: 'ok', message: 'Clé validée.' };
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    const kind = (error && error.kind) || 'unknown';

    // La réponse est vide parce qu'on a demandé un seul token : c'est un
    // succès du point de vue de l'autorisation.
    if (kind === 'empty') return { ok: true, reason: 'ok', message: 'Clé validée.' };
    if (kind === 'billing') {
      return { ok: true, reason: 'billing',
               message: 'Clé valide, mais le crédit Anthropic est épuisé.' };
    }
    if (kind === 'rate-limit') {
      return { ok: true, reason: 'rate-limit',
               message: 'Clé valide (limite de débit atteinte à l\'instant).' };
    }
    if (kind === 'bad-key') {
      return { ok: false, reason: 'bad-key',
               message: 'Clé refusée par Anthropic. Vérifie-la sur console.anthropic.com.' };
    }
    if (kind === 'network') {
      return { ok: false, reason: 'network',
               message: 'Impossible de joindre l\'API. Clé non vérifiée, donc non enregistrée.' };
    }
    return { ok: false, reason: kind, message: (error && error.message) || 'Vérification impossible.' };
  }
}

/** « sk-ant-…q4Xa » : de quoi reconnaître la clé sans jamais la réafficher. */
export function maskApiKey(key) {
  const k = (key || '').trim();
  if (!k) return '';
  if (k.length <= 12) return '••••';
  return k.slice(0, 7) + '…' + k.slice(-4);
}
