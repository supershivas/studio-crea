// Le client Supabase, et lui seul.
//
// Base partagée avec Source (l'app de gestion de projet). La clé anon est
// publique : la sécurité repose entièrement sur la RLS. user_id n'est jamais
// envoyé, la colonne a un default auth.uid().

const SUPABASE_URL = 'https://mrivfwlxnmtgkifjucvd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yaXZmd2x4bm10Z2tpZmp1Y3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMTYzMjQsImV4cCI6MjA5Mzc5MjMyNH0.6u1Ki6MTH14tlIUsegfNKo7BuVceBDgUhTnLUcirdVk';

let client = null;

/** Client Supabase, créé à la première demande. */
export function db() {
  if (client) return client;
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    throw new Error(
      "Le SDK Supabase n'est pas chargé. Vérifie le <script> dans index.html."
    );
  }
  client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

/** Déballe une réponse Supabase, en relayant l'erreur plutôt qu'en l'avalant. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
