// Curseurs de comportement : rendu, presets, persistance des réglages globaux.
//
// Un curseur n'est pas un nombre pour l'utilisateur : c'est une phrase. La
// valeur sert au stockage, le libellé du niveau sert à comprendre, et c'est
// cette phrase-là — jamais le chiffre — qui part dans le prompt.

import { levelFor, GLOBAL_SLIDERS } from './prompt.js';
import { DEFAULT_AGENTS } from './agents.js';

const GLOBAL_STORAGE = 'studio-global-sliders';

/** Presets : « Doux » et « Poussé à fond » sont absolus, « Défaut » restaure
 *  les valeurs d'origine du persona, qui diffèrent d'un curseur à l'autre. */
export const PRESETS = [
  { id: 'doux', label: 'Doux', value: 20 },
  { id: 'defaut', label: 'Défaut', value: null },
  { id: 'fort', label: 'Poussé à fond', value: 90 },
];

/** Valeurs d'origine d'un persona par défaut, par identifiant de curseur. */
export function defaultValues(defaultId) {
  const source = DEFAULT_AGENTS.find((agent) => agent.id === defaultId);
  const map = new Map();
  for (const slider of (source && source.sliders) || []) map.set(slider.id, slider.value);
  return map;
}

/**
 * Rend une liste de curseurs. `onChange` reçoit la liste à jour à chaque
 * mouvement — l'appelant décide s'il enregistre.
 */
export function renderSliders(container, sliders, onChange) {
  container.replaceChildren();
  if (!sliders.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Ce persona n\'a pas encore de curseurs. Mets à jour les profils pour en avoir.';
    container.append(empty);
    return;
  }

  for (const slider of sliders) {
    const field = document.createElement('div');
    field.className = 'slider';

    const head = document.createElement('div');
    head.className = 'slider-head';
    const label = document.createElement('span');
    label.className = 'slider-label';
    label.textContent = slider.label;
    head.append(label);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(slider.value ?? 50);
    input.setAttribute('aria-label', slider.label);

    const level = document.createElement('p');
    level.className = 'slider-level';
    level.textContent = levelFor(slider);

    input.addEventListener('input', () => {
      slider.value = Number(input.value);
      level.textContent = levelFor(slider);
      onChange(sliders);
    });

    field.append(head, input, level);
    container.append(field);
  }
}

/** Applique un preset et redessine. Renvoie la liste modifiée. */
export function applyPreset(sliders, preset, defaultId) {
  const originals = preset.value === null ? defaultValues(defaultId) : null;
  for (const slider of sliders) {
    slider.value = originals
      ? (originals.get(slider.id) ?? slider.value)
      : preset.value;
  }
  return sliders;
}

export function renderPresets(container, onPick) {
  container.replaceChildren();
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = preset.label;
    button.addEventListener('click', () => onPick(preset));
    container.append(button);
  }
}

/* ══════════════ Réglages globaux de la session ══════════════ */

/** Copie neuve des curseurs globaux, valeurs mémorisées sur cet appareil. */
export function loadGlobalSliders() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(GLOBAL_STORAGE) || '{}');
  } catch (_) {
    stored = {};
  }
  return GLOBAL_SLIDERS.map((slider) => ({
    ...slider,
    value: typeof stored[slider.id] === 'number' ? stored[slider.id] : slider.value,
  }));
}

export function saveGlobalSliders(sliders) {
  const values = {};
  for (const slider of sliders) values[slider.id] = slider.value;
  try {
    localStorage.setItem(GLOBAL_STORAGE, JSON.stringify(values));
    return true;
  } catch (_) {
    return false;
  }
}
