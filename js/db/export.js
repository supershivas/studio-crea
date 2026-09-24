// Export complet des données du studio (tables studio_ de l'utilisateur),
// pour la sauvegarde JSON des réglages. La RLS limite déjà chaque lecture aux
// lignes de l'utilisateur connecté. Les tables de Source n'en font pas partie :
// elles s'exportent depuis Source.

import { db, unwrap } from './client.js';

const TABLES = ['studio_personas', 'studio_sessions', 'studio_messages', 'studio_project_settings'];

/** Toutes les lignes des tables du studio, par table. */
export async function exportAllData() {
  const data = {};
  for (const table of TABLES) {
    data[table] = unwrap(await db().from(table).select('*')) || [];
  }
  return data;
}
