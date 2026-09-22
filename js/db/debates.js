// studio_sessions (un débat) et studio_messages (les interventions).

import { db, unwrap } from './client.js';

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
  projectType = null,
  audience = '',
  personasSnapshot = null,
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
        project_type: projectType,
        audience,
        personas_snapshot: personasSnapshot,
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
