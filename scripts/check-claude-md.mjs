#!/usr/bin/env node
// Vérifie que CLAUDE.md dit la vérité sur le code.
//
// Une doc fausse est pire qu'une doc absente : elle fait travailler la
// prochaine session sur des faits périmés. Ce script compare ce que CLAUDE.md
// affirme à ce que le dépôt contient réellement.
//
//   node scripts/check-claude-md.mjs
//
// Sort en erreur au premier écart, pour être utilisable dans un enchaînement.

import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
const md = lire('CLAUDE.md');

let ecarts = 0;
const verifie = (libelle, ok, detail = '') => {
  if (ok) { console.log('  ok    ' + libelle); return; }
  ecarts += 1;
  console.log('  ÉCART ' + libelle + (detail ? '\n        ' + detail : ''));
};

/* ── Le bloc Structure liste-t-il exactement les fichiers du dépôt ? ── */

const bloc = md.split('## Structure')[1].split('```')[1];
const listes = new Set(
  [...bloc.matchAll(/^([\w./-]+)\s/gm)].map((m) => m[1]).filter((p) => !p.endsWith('/'))
);

const reels = [];
const parcours = (dossier) => {
  for (const e of fs.readdirSync(path.join(racine, dossier || '.'), { withFileTypes: true })) {
    if (['.git', 'node_modules', '.github'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = dossier ? dossier + '/' + e.name : e.name;
    if (e.isDirectory()) parcours(p);
    else reels.push(p);
  }
};
parcours('');

// Les migrations sont couvertes par la ligne « supabase/migrations/ », et les
// scripts de publication par leur propre ligne.
const suivis = reels.filter(
  (p) => /\.(js|mjs|css|html|json|sh|sql)$/.test(p) && !p.startsWith('supabase/migrations/')
);
const absents = suivis.filter((p) => !listes.has(p));
const fantomes = [...listes].filter((p) => !fs.existsSync(path.join(racine, p)));

verifie('tout fichier du dépôt est listé dans Structure', !absents.length, absents.join(', '));
verifie('aucune ligne de Structure ne pointe dans le vide', !fantomes.length, fantomes.join(', '));

/* ── Les colonnes des tables studio_ sont-elles toutes décrites ? ── */

const sql = fs
  .readdirSync(path.join(racine, 'supabase/migrations'))
  .sort()
  .map((f) => lire('supabase/migrations/' + f))
  .join('\n');

const colonnes = {};
for (const m of sql.matchAll(/create table(?: if not exists)? public\.(studio_\w+)\s*\(([\s\S]*?)\n\);/g)) {
  colonnes[m[1]] = [...m[2].matchAll(/^ {2}(\w+)\s/gm)].map((x) => x[1]);
}
for (const m of sql.matchAll(/alter table public\.(studio_\w+)\s+add column if not exists (\w+)/g)) {
  (colonnes[m[1]] ||= []).push(m[2]);
}

// Horodatages et contraintes : présents partout, sans intérêt documentaire.
const BANALES = new Set(['created_at', 'updated_at', 'primary']);

for (const [table, liste] of Object.entries(colonnes)) {
  const ligne = md.split('\n').find((l) => l.includes('`' + table + '`') && l.startsWith('- '));
  const manquantes = liste.filter((c) => !BANALES.has(c) && (!ligne || !ligne.includes(c)));
  verifie(`${table} : toutes ses colonnes sont décrites`, !!ligne && !manquantes.length,
    !ligne ? 'la table n\'est pas décrite du tout' : 'absentes : ' + manquantes.join(', '));
}

/* ── Les affirmations factuelles tiennent-elles ? ── */

const html = lire('index.html');
const css = lire('css/style.css');
// Les commentaires citent les règles qu'ils interdisent : les analyser
// reviendrait à se faire piéger par sa propre documentation.
const cssNu = css.replace(/\/\*[\s\S]*?\*\//g, '');
const api = lire('js/api.js');

const rounds = html.match(/id="rounds"[^>]*min="(\d)"[^>]*max="(\d)"[^>]*value="(\d)"/);
const annonce = md.match(/nombre de tours \((\d) à (\d), défaut (\d)/i);
verifie('le nombre de tours annoncé correspond au curseur',
  !!rounds && !!annonce && annonce[1] === rounds[1] && annonce[2] === rounds[2] && annonce[3] === rounds[3],
  rounds ? `curseur : ${rounds[1]} à ${rounds[2]}, défaut ${rounds[3]}` : 'curseur introuvable');

verifie('supabase-js est épinglé, sans @2 flottant',
  html.includes('supabase-js@2.45.0') && !/supabase-js@2\//.test(html));

// Les commentaires qui interdisent innerHTML ne comptent pas comme usage.
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const modules = [];
const collecte = (d) => { for (const e of fs.readdirSync(path.join(racine, d), { withFileTypes: true })) {
  if (e.isDirectory()) collecte(d + '/' + e.name); else if (e.name.endsWith('.js')) modules.push(d + '/' + e.name); } };
collecte('js');
const coupables = modules.filter((f) => /innerHTML/.test(sansCommentaires(lire(f))));
verifie('aucun innerHTML dans js/', !coupables.length, coupables.join(', '));

verifie('les trois en-têtes Anthropic sont bien envoyés',
  ['x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access']
    .every((h) => api.includes(h)));
verifie('verifyApiKey existe', /export async function verifyApiKey/.test(api));
verifie('MODELS porte les tarifs', /price:\s*\{\s*input:/.test(api));
verifie('buildSystemPrompt assemble le prompt', /export function buildSystemPrompt/.test(lire('js/prompt.js')));
const prompt = lire('js/prompt.js');
verifie('les règles anti-invention des références partent dans chaque prompt',
  /const REFERENCE_RULES = \[/.test(prompt) && /\.\.\.REFERENCE_RULES/.test(prompt));
verifie('la synthèse est demandée en titres hiérarchisés',
  ['## Les pistes', '## Les désaccords', '## Prochaine étape', '## Sources et références']
    .every((t) => lire('js/debate.js').includes(t)));
verifie('les profils ajoutés après coup existent parmi les défauts',
  [...lire('js/agents.js').matchAll(/ADDED_DEFAULTS = \[([^\]]*)\]/g)].flatMap((m) => m[1].match(/'[\w-]+'/g) || [])
    .every((id) => modules.some((f) => f.startsWith('js/agents') && lire(f).includes(`id: ${id}`))));
verifie('accent cramoisi fixe', css.includes('#C0392B') && css.includes('#9B2D22'));
verifie('largeur de contenu 680px', /--content-max:\s*680px/.test(css));
verifie('[hidden] est déclaré avant toute règle display',
  cssNu.indexOf('[hidden]') >= 0 &&
  cssNu.indexOf('[hidden]') < cssNu.search(/display:\s*(flex|grid|block)/));
verifie('aucune règle display sur une feuille sans [open]',
  ![...cssNu.matchAll(/([^{}]+)\{([^}]*)\}/g)].some(([, sel, corps]) =>
    /(^|[;\s])display\s*:/.test(corps) && /\.(drawer|sheet)(?![\w-])/.test(sel) &&
    !sel.includes('[open]') && !sel.includes('::backdrop') &&
    !/\.(drawer|sheet)(?![\w-])[^,]*[>\s]\S/.test(sel)));

// Seul js/db/ parle au client Supabase.
const horsDb = modules.filter((f) => !f.startsWith('js/db/') && /from '\.\/(db\/)?client\.js'/.test(lire(f)));
verifie('aucun module hors js/db/ ne touche au client', !horsDb.length, horsDb.join(', '));

// Les tables de Source restent en lecture seule.
const SOURCE = ['projects', 'subprojects', 'notes'];
const ecritures = [];
for (const f of modules) {
  for (const m of lire(f).matchAll(/\.from\('([^']+)'\)([\s\S]{0,120})/g)) {
    if (SOURCE.includes(m[1]) && /\.(insert|update|upsert|delete)\s*\(/.test(m[2])) ecritures.push(f + ' → ' + m[1]);
  }
}
verifie('aucune écriture dans les tables de Source', !ecritures.length, ecritures.join(', '));

// Fichiers courts.
const longs = modules
  .map((f) => [f, lire(f).split('\n').filter((l) => !/^\s*($|\/\/|\/\*|\*)/.test(l)).length])
  .filter(([, n]) => n > 320);
verifie('aucun module au-delà de ~300 lignes de code', !longs.length,
  longs.map(([f, n]) => `${f} (${n})`).join(', '));

console.log(ecarts ? `\n${ecarts} écart(s) entre CLAUDE.md et le code.` : '\nCLAUDE.md est à jour.');
process.exit(ecarts ? 1 : 0);
