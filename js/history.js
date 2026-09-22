// Débats passés : liste, actions (archiver, supprimer) et relecture d'un fil.

import * as db from './supabase.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import { showMessage, showSynthesis } from './thread.js';

const { $, show, toast } = ui;

export async function openHistory() {
  await refreshHistory();
  screen('history');
}

export async function refreshHistory() {
  try {
    const archived = $('history-archived').checked;
    const debates = await db.listDebates(state.projectId, { archived });
    ui.renderHistory($('history-list'), debates, {
      open: openDebate,
      resume: openDebate,
      archive: async (debate, value) => {
        try {
          await db.setArchived(debate.id, value);
          toast(value ? 'Débat archivé.' : 'Débat désarchivé.');
          await refreshHistory();
        } catch (error) { fail(error); }
      },
      remove: async (debate) => {
        const name = debate.title || 'ce débat';
        const sure = await ui.confirmDialog({
          title: 'Supprimer ce débat ?',
          message: `« ${name} » et toutes ses interventions seront effacés. C'est définitif.`,
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!sure) return;
        try {
          await db.deleteDebate(debate.id);
          if (state.debateId === debate.id) state.debateId = null;
          toast('Débat supprimé.');
          await refreshHistory();
        } catch (error) { fail(error); }
      },
    });
  } catch (error) {
    fail(error);
  }
}

async function openDebate(debate) {
  try {
    const rows = await db.listMessages(debate.id);
    const byId = new Map(state.personas.map((p) => [p.id, p]));

    state.debateId = debate.id;
    state.synthesis = debate.synthesis || '';
    state.title = debate.title || '';
    state.contextSent = '';

    // Reprendre avec le casting d'origine, pas celui affiché par hasard.
    const cast = Array.isArray(debate.participants) ? debate.participants : null;
    if (cast && cast.length) {
      const known = new Set(state.personas.map((p) => p.id));
      const kept = cast.filter((id) => known.has(id));
      if (kept.length) state.selected = new Set(kept);
    }
    state.messages = rows.map((row) => {
      const persona = byId.get(row.agent_id) || {};
      return {
        agentId: row.agent_id,
        authorType: row.author_type,
        content: row.content,
        round: row.round,
        name: persona.name || null,
        role: persona.role || null,
        color: persona.color || null,
        emoji: persona.emoji || null,
      };
    });

    $('debate-brief').textContent = debate.brief || 'Débat';
    $('messages').replaceChildren();
    const shownRound = { value: null };
    for (const message of state.messages) showMessage(message, shownRound);
    if (state.synthesis) showSynthesis(state.synthesis);

    show($('btn-stop'), false);
    show($('remark-box'), false);
    show($('debate-actions'), true);
    $('debate-status').hidden = true;
    screen('debate');
  } catch (error) {
    fail(error);
  }
}
