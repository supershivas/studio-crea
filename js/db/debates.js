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
  parentId = null,
  focus = null,
}) {
  const row = {
    project_id: projectId,
    sensitivity,
    brief,
    context_sent: contextSent,
    participants,
    rounds,
    project_type: projectType,
    audience,
    personas_snapshot: personasSnapshot,
  };
  // Colonnes d'une sous-discussion, envoyées seulement quand elles servent :
  // un débat ordinaire se crée même si leur migration n'est pas passée.
  if (parentId) {
    row.parent_id = parentId;
    row.focus = focus || null;
  }
  const { data, error } = await db().from('studio_sessions').insert(row).select().single();
  if (error && parentId && /parent_id|focus/.test(error.message || '')) {
    throw new Error('Les sous-discussions attendent la migration 20260923_studio_subdebates.sql.');
  }
  return unwrap({ data, error });
}

/**
 * Le casting a changé en cours de route. `snapshot` garde aussi ceux qui sont
 * partis : leurs interventions restent dans le fil et doivent rester signées.
 */
export async function saveParticipants(debateId, participants, snapshot) {
  return unwrap(
    await db()
      .from('studio_sessions')
      .update({ participants, personas_snapshot: snapshot })
      .eq('id', debateId)
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

const LIST_COLUMNS = 'id, project_id, title, brief, synthesis, participants, archived, created_at';

/**
 * Débats de l'utilisateur, les archivés seulement si on les demande.
 * Sans la migration des sous-discussions, on relit sans leurs colonnes
 * plutôt que de laisser la liste vide.
 */
export async function listDebates(projectId, { archived = false } = {}) {
  const run = (columns) => {
    let query = db()
      .from('studio_sessions')
      .select(columns)
      .eq('archived', archived)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    return query;
  };
  const first = await run(LIST_COLUMNS + ', parent_id, focus');
  if (!first.error) return first.data || [];
  return unwrap(await run(LIST_COLUMNS)) || [];
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

/**
 * Le débat d'origine d'une sous-discussion, et les sous-discussions d'un
 * débat. Colonnes légères : on n'affiche qu'un titre et une date.
 */
export async function listFamily(debateId, parentId = null) {
  const cols = 'id, title, focus, brief, created_at, participants, synthesis, parent_id';
  const [parent, children] = await Promise.all([
    parentId
      ? db().from('studio_sessions').select(cols).eq('id', parentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db().from('studio_sessions').select(cols).eq('parent_id', debateId)
      .order('created_at', { ascending: true }),
  ]);
  // Sans la migration des sous-discussions, il n'y a simplement pas de famille.
  return { parent: parent.error ? null : parent.data, children: children.error ? [] : children.data || [] };
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
