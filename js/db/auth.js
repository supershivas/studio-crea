// Auth — e-mail + mot de passe, comme Source.
//
// Pas de magic link : en PWA sur l'écran d'accueil iOS, le lien s'ouvre dans
// Safari, dont le stockage est séparé de celui de la PWA.

import { db, unwrap } from './client.js';

export async function signIn(email, password) {
  return unwrap(await db().auth.signInWithPassword({ email, password }));
}

/** Renvoie true si le compte demande une confirmation par e-mail. */
export async function signUp(email, password) {
  const data = unwrap(await db().auth.signUp({ email, password }));
  return !data.session;
}

export async function sendPasswordReset(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  return unwrap(await db().auth.resetPasswordForEmail(email, { redirectTo }));
}

export async function updatePassword(password) {
  return unwrap(await db().auth.updateUser({ password }));
}

export async function signOut() {
  return unwrap(await db().auth.signOut());
}

export async function getCurrentUser() {
  const { data } = await db().auth.getSession();
  return data.session ? data.session.user : null;
}

/** Appelle cb(event, session) à chaque changement d'état d'authentification. */
export function onAuthChange(cb) {
  return db().auth.onAuthStateChange(cb);
}

/**
 * Détecte le retour d'un lien de réinitialisation de mot de passe.
 * Le jeton arrive dans le hash ; Supabase l'échange contre une session,
 * à l'app d'ouvrir l'écran de nouveau mot de passe.
 */
export function isPasswordRecovery() {
  const hash = window.location.hash || '';
  return hash.includes('access_token') && hash.includes('type=recovery');
}
