// Écran d'édition des personas : liste, ajout, modification, suppression.
//
// Les couleurs proposées viennent des six paires de statut de Source, déjà
// accordées entre elles et éprouvées en clair comme en sombre. La couleur
// n'est qu'un repère graphique (filet, pastille) : le nom prend la couleur de
// texte du thème, parce que ces teintes échouent au contraste AA en texte.

import * as db from './supabase.js';
import * as ui from './ui.js';
import { state, screen, fail } from './state.js';
import { DEFAULT_AGENTS } from './agents.js';
import { buildSystemPrompt } from './prompt.js';
import { renderSliders, renderPresets, applyPreset, defaultValues } from './sliders.js';
import * as api from './api.js';

const { $, show, setMsg, toast } = ui;

export const PALETTE = [
  { value: '#C0392B', label: 'Cramoisi' },
  { value: '#185FA5', label: 'Bleu' },
  { value: '#854F0B', label: 'Ambre' },
  { value: '#993356', label: 'Framboise' },
  { value: '#3B6D11', label: 'Vert' },
  { value: '#5F5E5A', label: 'Gris' },
];

let editing = null;          // le persona en cours d'édition, null si nouveau
let chosenColor = PALETTE[0].value;
let draftSliders = [];       // copie de travail : annuler ne doit rien altérer

/* ══════════════ Liste ══════════════ */

export async function openAgents() {
  try {
    state.personas = await db.listPersonas();
    renderList();
    screen('agents');
  } catch (error) {
    fail(error);
  }
}

function renderList() {
  const box = $('agents-list');
  box.replaceChildren();

  for (const persona of state.personas) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item persona-row';

    const dot = document.createElement('span');
    dot.className = 'persona-dot';
    dot.style.background = persona.color || 'var(--accent)';

    const emoji = document.createElement('span');
    emoji.className = 'persona-emoji';
    emoji.textContent = persona.emoji || '•';

    const text = document.createElement('div');
    text.className = 'persona-text';
    const name = document.createElement('div');
    name.className = 'persona-name';
    name.textContent = persona.isModerator ? `${persona.name} — anime` : persona.name;
    const role = document.createElement('div');
    role.className = 'persona-role';
    // Le modèle n'apparaît que s'il diffère du réglage général : sinon la
    // liste répéterait dix fois la même information.
    const model = api.MODELS.find((m) => m.id === persona.model);
    role.textContent = model
      ? `${persona.role || ''} — ${model.label.split(' — ')[0]}`
      : persona.role || '';
    text.append(name, role);

    item.append(emoji, text, dot);
    item.addEventListener('click', () => openDialog(persona));
    box.append(item);
  }

  if (!state.personas.length) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'Aucun persona. Recharge la page pour retrouver les personas par défaut.';
    box.append(empty);
  }
}

/* ══════════════ Feuille d'édition ══════════════ */

function renderSwatches() {
  const box = $('agent-colors');
  box.replaceChildren();
  for (const color of PALETTE) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = color.value;
    swatch.title = color.label;
    swatch.setAttribute('aria-label', color.label);
    swatch.setAttribute('aria-pressed', String(color.value === chosenColor));
    swatch.addEventListener('click', () => {
      chosenColor = color.value;
      renderSwatches();
    });
    box.append(swatch);
  }
}

/**
 * Chaque persona peut avoir son propre modèle. Sans choix, il prend celui des
 * réglages : un lecteur de plus ne justifie pas forcément le modèle le plus
 * cher, et la modératrice mérite parfois mieux que les autres.
 */
function fillModelChoice(current) {
  ui.fillSelect(
    $('agent-model'),
    api.MODELS.map((model) => ({ value: model.id, label: model.label })),
    current,
    'Celui des réglages'
  );
}

function drawSliders() {
  renderSliders($('agent-sliders'), draftSliders, () => {});
}

function openDialog(persona) {
  editing = persona || null;
  chosenColor = (persona && persona.color) || PALETTE[0].value;

  $('agent-dialog-title').textContent = persona ? 'Modifier le persona' : 'Nouveau persona';
  $('agent-name').value = persona ? persona.name : '';
  $('agent-role').value = persona ? persona.role || '' : '';
  $('agent-emoji').value = persona ? persona.emoji || '' : '';
  $('agent-prompt').value = persona ? persona.prompt || '' : '';
  $('agent-moderator').checked = persona ? !!persona.isModerator : false;
  fillModelChoice(persona && persona.model);

  // Copie profonde : tant qu'on n'a pas enregistré, le persona d'origine
  // reste intact, y compris si on bouge tous les curseurs puis qu'on annule.
  draftSliders = JSON.parse(JSON.stringify((persona && persona.sliders) || []));
  drawSliders();
  renderPresets($('agent-presets'), (preset) => {
    applyPreset(draftSliders, preset, editing && editing.defaultId);
    drawSliders();
  });

  show($('agent-delete'), !!persona);
  show($('agent-prompt-preview'), false);
  setMsg($('agent-msg'), '');
  renderSwatches();
  $('agent-dialog').showModal();
}

async function save(event) {
  event.preventDefault();
  const name = $('agent-name').value.trim();
  if (!name) return setMsg($('agent-msg'), 'Le nom est vide.');

  const payload = {
    id: editing ? editing.id : undefined,
    name,
    role: $('agent-role').value.trim(),
    emoji: $('agent-emoji').value.trim(),
    color: chosenColor,
    prompt: $('agent-prompt').value.trim(),
    isModerator: $('agent-moderator').checked,
    position: editing ? editing.position : state.personas.length,
    sliders: draftSliders,
    // Champs du profil que la fiche n'édite pas : on les conserve tels quels,
    // sinon enregistrer un changement de nom effacerait l'identité et les
    // références du persona.
    defaultId: editing ? editing.defaultId : null,
    identity: editing ? editing.identity : '',
    expertise: editing ? editing.expertise : [],
    canon: editing ? editing.canon : [],
    voice: editing ? editing.voice : '',
    blindSpots: editing ? editing.blindSpots : '',
    never: editing ? editing.never : [],
    domainNotes: editing ? editing.domainNotes : {},
    model: $('agent-model').value || null,
  };

  try {
    const saved = await db.savePersona(payload);
    // Un seul animateur : les autres sont dégradés en participants.
    if (saved.isModerator) {
      for (const other of state.personas) {
        if (other.id !== saved.id && other.isModerator) {
          await db.savePersona({ ...other, isModerator: false });
        }
      }
    }
    $('agent-dialog').close();
    await refresh(saved.id, true);
    toast(editing ? 'Persona modifié.' : 'Persona ajouté.');
  } catch (error) {
    fail(error, $('agent-msg'));
  }
}

async function remove() {
  if (!editing) return;
  try {
    await db.deletePersona(editing.id);
    $('agent-dialog').close();
    await refresh(editing.id, false);
    toast('Persona supprimé.');
  } catch (error) {
    fail(error, $('agent-msg'));
  }
}

/**
 * Recharge la liste et tient à jour la sélection de l'écran de débat :
 * un persona ajouté est coché, un persona supprimé est retiré.
 */
async function refresh(id, selected) {
  state.personas = await db.listPersonas();
  if (selected) state.selected.add(id);
  else state.selected.delete(id);
  renderList();
  ui.renderPersonas($('participants'), state.personas, state.selected, (pid, on) => {
    if (on) state.selected.add(pid); else state.selected.delete(pid);
  });
}

/** Le prompt réellement envoyé, pour comprendre l'effet des réglages. */
function showAssembledPrompt() {
  const preview = $('agent-prompt-preview');
  if (!preview.hidden) { show(preview, false); return; }

  const draft = {
    ...(editing || {}),
    name: $('agent-name').value.trim() || 'Sans nom',
    role: $('agent-role').value.trim(),
    emoji: $('agent-emoji').value.trim(),
    color: chosenColor,
    prompt: $('agent-prompt').value.trim(),
    isModerator: $('agent-moderator').checked,
    sliders: draftSliders,
  };
  preview.textContent = buildSystemPrompt(draft, {
    brief: $('brief').value.trim() || '(le sujet du débat)',
    projectType: state.projectType,
    audience: state.audience,
    axes: state.axes,
    sensitivity: state.sensitivity,
    globalSliders: state.globalSliders,
  });
  show(preview, true);
}

async function resetToDefaults() {
  const sure = await ui.confirmDialog({
    title: 'Mettre à jour les profils ?',
    message: 'Tes dix personas seront remplacés par les profils par défaut. Les modifications que tu leur as apportées seront perdues.',
    confirmLabel: 'Mettre à jour',
    danger: true,
  });
  if (!sure) return;
  try {
    state.personas = await db.resetPersonas(DEFAULT_AGENTS);
    state.selected = new Set(state.personas.map((p) => p.id));
    renderList();
    toast('Profils mis à jour.');
  } catch (error) {
    fail(error);
  }
}

export function wirePersonas() {
  $('agents-reset').addEventListener('click', resetToDefaults);
  $('agent-show-prompt').addEventListener('click', showAssembledPrompt);
  $('btn-agents').addEventListener('click', openAgents);
  $('agents-back').addEventListener('click', () => screen('setup'));
  $('agent-add').addEventListener('click', () => openDialog(null));
  $('agent-form').addEventListener('submit', save);
  $('agent-delete').addEventListener('click', remove);
  $('agent-cancel').addEventListener('click', () => $('agent-dialog').close());
}
