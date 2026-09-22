// Tables de Source (projects, subprojects, notes) — LECTURE SEULE, jamais
// d'écriture — et nos réglages par projet (studio_project_settings).

import { db, unwrap } from './client.js';

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
