// Seul fichier qui parle à Supabase.
//
// Base partagée avec Source (l'app de gestion de projet). Les tables de Source
// — projects, subprojects, notes — sont en LECTURE SEULE : aucune écriture
// depuis ce fichier. Nos tables sont toutes préfixées studio_.
//
// La clé anon est publique : la sécurité repose entièrement sur la RLS.
// user_id n'est jamais envoyé, la colonne a un default auth.uid().

const SUPABASE_URL = 'https://mrivfwlxnmtgkifjucvd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yaXZmd2x4bm10Z2tpZmp1Y3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMTYzMjQsImV4cCI6MjA5Mzc5MjMyNH0.6u1Ki6MTH14tlIUsegfNKo7BuVceBDgUhTnLUcirdVk';

let client = null;

/** Client Supabase, créé à la première demande. */
function db() {
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
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/* ══════════════════════════════════════════════════════════════════════════
   Auth — e-mail + mot de passe, comme Source.
   ══════════════════════════════════════════════════════════════════════════ */

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

/* ══════════════════════════════════════════════════════════════════════════
   Tables de Source — LECTURE SEULE. Ne jamais y écrire.
   ══════════════════════════════════════════════════════════════════════════ */

/** Projets non supprimés de l'utilisateur, les plus récents d'abord. */
export async function listProjects() {
  const rows = unwrap(
    await db()
      .from('projects')
      .select('id, number, name, cat, year, status, client, editor, deadline')
      .eq('trashed', false)
      .order('year', { ascending: false })
      .order('sort_order', { ascending: true })
  );
  return rows || [];
}

/** Un projet et son contexte : sous-projets et notes actives. */
export async function getProjectContext(projectId) {
  const project = unwrap(
    await db()
      .from('projects')
      .select('id, number, name, cat, year, status, client, editor, deadline')
      .eq('id', projectId)
      .maybeSingle()
  );
  if (!project) return null;

  const subprojects =
    unwrap(
      await db()
        .from('subprojects')
        .select('id, number, name, status, deadline')
        .eq('parent_id', projectId)
        .eq('trashed', false)
        .order('number', { ascending: true })
    ) || [];

  // Deux requêtes, parce que les notes de sous-projet ont project_id à null
  // chez Source : un filtre sur project_id seul les laisserait de côté.
  const notes =
    unwrap(
      await db()
        .from('notes')
        .select('id, text, date, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
    ) || [];

  const subIds = subprojects.map((sub) => sub.id);
  const subNotes = subIds.length
    ? unwrap(
        await db()
          .from('notes')
          .select('id, subproject_id, text, date, created_at')
          .in('subproject_id', subIds)
          .order('created_at', { ascending: true })
      ) || []
    : [];

  return {
    project,
    notes,
    subprojects: subprojects.map((sub) => ({
      ...sub,
      notes: subNotes.filter((note) => note.subproject_id === sub.id),
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   studio_personas
   ══════════════════════════════════════════════════════════════════════════ */

function toPersona(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    emoji: row.emoji,
    color: row.color,
    prompt: row.prompt,
    isModerator: row.is_moderator,
    position: row.position,
  };
}

function fromPersona(persona) {
  return {
    name: persona.name,
    role: persona.role || '',
    emoji: persona.emoji || '',
    color: persona.color || '#C0392B',
    prompt: persona.prompt || '',
    is_moderator: !!persona.isModerator,
    position: persona.position || 0,
  };
}

export async function listPersonas() {
  const rows = unwrap(
    await db()
      .from('studio_personas')
      .select('*')
      .order('position', { ascending: true })
  );
  return (rows || []).map(toPersona);
}

/**
 * Copie les personas par défaut si l'utilisateur n'en a aucun.
 * Renvoie la liste finale, dans tous les cas.
 */
export async function seedPersonasIfEmpty(defaults) {
  const existing = await listPersonas();
  if (existing.length) return existing;

  const rows = defaults.map((persona, index) =>
    fromPersona({ ...persona, position: index })
  );
  unwrap(await db().from('studio_personas').insert(rows));
  return listPersonas();
}

export async function savePersona(persona) {
  const row = fromPersona(persona);
  const query = persona.id
    ? db().from('studio_personas').update(row).eq('id', persona.id)
    : db().from('studio_personas').insert(row);
  const saved = unwrap(await query.select().single());
  return toPersona(saved);
}

export async function deletePersona(id) {
  return unwrap(await db().from('studio_personas').delete().eq('id', id));
}

/* ══════════════════════════════════════════════════════════════════════════
   studio_sessions — un débat
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Crée un débat. `contextSent` est le texte EXACT validé par l'utilisateur sur
 * l'écran « Ce qui sera envoyé à l'IA » — vide si rien du projet n'est envoyé.
 */
export async function createDebate({
  projectId = null,
  sensitivity = null,
  brief = '',
  contextSent = '',
  participants = [],
  rounds = 2,
}) {
  return unwrap(
    await db()
      .from('studio_sessions')
      .insert({
        project_id: projectId,
        sensitivity,
        brief,
        context_sent: contextSent,
        participants,
        rounds,
      })
      .select()
      .single()
  );
}

export async function saveSynthesis(debateId, synthesis) {
  return unwrap(
    await db()
      .from('studio_sessions')
      .update({ synthesis, updated_at: new Date().toISOString() })
      .eq('id', debateId)
  );
}

/** Débats de l'utilisateur, les archivés seulement si on les demande. */
export async function listDebates(projectId, { archived = false } = {}) {
  let query = db()
    .from('studio_sessions')
    .select('id, project_id, title, brief, synthesis, rounds, participants, archived, created_at')
    .eq('archived', archived)
    .order('created_at', { ascending: false });
  if (projectId) query = query.eq('project_id', projectId);
  return unwrap(await query) || [];
}

export async function saveTitle(debateId, title) {
  return unwrap(
    await db().from('studio_sessions').update({ title }).eq('id', debateId)
  );
}

export async function setArchived(debateId, archived) {
  return unwrap(
    await db()
      .from('studio_sessions')
      .update({ archived, updated_at: new Date().toISOString() })
      .eq('id', debateId)
  );
}

/** Supprime un débat. Ses messages suivent par la cascade de la clé étrangère. */
export async function deleteDebate(debateId) {
  return unwrap(await db().from('studio_sessions').delete().eq('id', debateId));
}

export async function getDebate(debateId) {
  return unwrap(
    await db().from('studio_sessions').select('*').eq('id', debateId).maybeSingle()
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   studio_messages — les interventions
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `agentId` est l'identifiant du persona, stocké en texte libre : un débat
 * archivé reste lisible même si le persona a été renommé ou supprimé depuis.
 * Null quand l'intervention vient de l'utilisateur.
 */
export async function addMessage({
  debateId,
  agentId = null,
  authorType,
  content,
  round = 0,
}) {
  return unwrap(
    await db()
      .from('studio_messages')
      .insert({
        session_id: debateId,
        agent_id: agentId,
        author_type: authorType,
        content,
        round,
      })
      .select()
      .single()
  );
}

export async function listMessages(debateId) {
  return (
    unwrap(
      await db()
        .from('studio_messages')
        .select('*')
        .eq('session_id', debateId)
        .order('created_at', { ascending: true })
    ) || []
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   studio_project_settings — sensibilité et champs par défaut d'un projet
   ══════════════════════════════════════════════════════════════════════════ */

/** Null si la sensibilité n'a jamais été décidée : l'app doit alors la demander. */
export async function getProjectSettings(projectId) {
  const row = unwrap(
    await db()
      .from('studio_project_settings')
      .select('project_id, sensitivity, default_fields')
      .eq('project_id', projectId)
      .maybeSingle()
  );
  if (!row) return null;
  return {
    projectId: row.project_id,
    sensitivity: row.sensitivity,
    defaultFields: row.default_fields || [],
  };
}

// Volontairement en update-puis-insert plutôt qu'en upsert : la clé primaire
// est (user_id, project_id) et le client n'envoie jamais user_id, qui vient du
// default auth.uid(). Un on_conflict portant sur une colonne absente du
// payload dépend du comportement de PostgREST — ici on ne parie sur rien.
export async function saveProjectSettings(projectId, sensitivity, defaultFields) {
  const payload = {
    sensitivity,
    default_fields: defaultFields || [],
    updated_at: new Date().toISOString(),
  };

  const updated = unwrap(
    await db()
      .from('studio_project_settings')
      .update(payload)
      .eq('project_id', projectId)
      .select()
  );
  const row = updated && updated.length
    ? updated[0]
    : unwrap(
        await db()
          .from('studio_project_settings')
          .insert({ project_id: projectId, ...payload })
          .select()
          .single()
      );

  return {
    projectId: row.project_id,
    sensitivity: row.sensitivity,
    defaultFields: row.default_fields || [],
  };
}
