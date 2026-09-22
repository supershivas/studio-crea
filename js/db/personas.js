// studio_personas — les personas de l'utilisateur.

import { db, unwrap } from './client.js';

function toPersona(row) {
  return {
    id: row.id,
    defaultId: row.default_id || null,
    name: row.name,
    role: row.role,
    emoji: row.emoji,
    color: row.color,
    prompt: row.prompt,
    isModerator: row.is_moderator,
    position: row.position,
    model: row.model || null,
    identity: row.identity || '',
    expertise: row.expertise || [],
    canon: row.canon || [],
    voice: row.voice || '',
    blindSpots: row.blind_spots || '',
    never: row.never_says || [],
    domainNotes: row.domain_notes || {},
    sliders: row.sliders || [],
  };
}

function fromPersona(persona) {
  return {
    default_id: persona.defaultId || null,
    name: persona.name,
    role: persona.role || '',
    emoji: persona.emoji || '',
    color: persona.color || '#C0392B',
    prompt: persona.prompt || '',
    is_moderator: !!persona.isModerator,
    position: persona.position || 0,
    model: persona.model || null,
    identity: persona.identity || '',
    expertise: persona.expertise || [],
    canon: persona.canon || [],
    voice: persona.voice || '',
    blind_spots: persona.blindSpots || '',
    never_says: persona.never || [],
    domain_notes: persona.domainNotes || {},
    sliders: persona.sliders || [],
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
    fromPersona({ ...persona, defaultId: persona.id, position: index })
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

/**
 * Remplace tous les personas par les profils par défaut.
 * Utilisé par « Mettre à jour vers les nouveaux profils » : la migration
 * laisse les anciens personas intacts, c'est un geste explicite.
 */
export async function resetPersonas(defaults) {
  unwrap(await db().from('studio_personas').delete().neq('id', ZERO_UUID));
  const rows = defaults.map((persona, index) =>
    fromPersona({ ...persona, defaultId: persona.id, position: index })
  );
  unwrap(await db().from('studio_personas').insert(rows));
  return listPersonas();
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function deletePersona(id) {
  return unwrap(await db().from('studio_personas').delete().eq('id', id));
}
