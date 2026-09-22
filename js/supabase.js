// Le seul point d'entrée de l'app vers Supabase.
//
// Le corps de l'accès aux données vit dans js/db/, découpé par domaine pour
// tenir la limite de longueur des fichiers. Aucun module hors js/db/ ne touche
// au client : tout le reste de l'app importe ce fichier, et lui seul.
//
// Les tables de Source — projects, subprojects, notes — sont en LECTURE SEULE.
// Nos tables sont toutes préfixées studio_.

export {
  signIn,
  signUp,
  sendPasswordReset,
  updatePassword,
  signOut,
  getCurrentUser,
  onAuthChange,
  isPasswordRecovery,
} from './db/auth.js';

export {
  listProjects,
  getProjectContext,
  getProjectSettings,
  saveProjectSettings,
} from './db/projects.js';

export {
  listPersonas,
  seedPersonasIfEmpty,
  savePersona,
  resetPersonas,
  deletePersona,
} from './db/personas.js';

export {
  createDebate,
  saveSynthesis,
  listDebates,
  saveTitle,
  setArchived,
  deleteDebate,
  getDebate,
  addMessage,
  listMessages,
} from './db/debates.js';
