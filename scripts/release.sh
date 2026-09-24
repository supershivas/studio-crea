#!/usr/bin/env bash
# Publie une nouvelle version : incrémente version.json, ajoute l'entrée de
# CHANGELOG.md, commit, push.
#
# version.json est la seule source de vérité du numéro — l'app le relit toutes
# les cinq minutes et se recharge quand il a changé. Rien à modifier ailleurs.
#
#   ./scripts/release.sh              → 1.0.0 devient 1.0.1
#   ./scripts/release.sh mineure      → 1.0.3 devient 1.1.0
#   ./scripts/release.sh majeure      → 1.4.2 devient 2.0.0
#   ./scripts/release.sh 2.1.0        → exactement 2.1.0
#
# Les arguments suivants sont les nouveautés, en 1 à 3 lignes lisibles par un
# non-développeur (obligatoires) :
#   ./scripts/release.sh mineure "Ajoute l'export JSON" "Corrige le toast"

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f version.json ] || { echo "version.json est introuvable." >&2; exit 1; }

actuelle=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json)
[ -n "$actuelle" ] || { echo "Aucun numéro lisible dans version.json." >&2; exit 1; }

IFS=. read -r majeur mineur patch <<< "$actuelle"
niveau="${1:-patch}"
shift || true
[ "$#" -ge 1 ] || { echo "Indique les nouveautés : $0 [niveau] \"ligne 1\" [\"ligne 2\"]…" >&2; exit 1; }

case "$niveau" in
  majeure|major)  nouvelle="$((majeur + 1)).0.0" ;;
  mineure|minor)  nouvelle="$majeur.$((mineur + 1)).0" ;;
  patch|'')       nouvelle="$majeur.$mineur.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) nouvelle="$niveau" ;;
  *) echo "Usage : $0 [patch|mineure|majeure|X.Y.Z]" >&2; exit 1 ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Des modifications ne sont pas commitées. Commit-les d'abord." >&2
  exit 1
fi

jour=$(date +%F)
# JSON écrit par node (déjà requis par scripts/check-claude-md.mjs) : les
# nouveautés peuvent contenir guillemets et virgules.
node -e 'const [version, date, ...changes] = process.argv.slice(1);
require("fs").writeFileSync("version.json", JSON.stringify({ version, date, changes }, null, 2) + "\n")' \
  "$nouvelle" "$jour" "$@"

# Nouvelle entrée en tête de CHANGELOG.md, sous le titre.
{
  sed -n 1p CHANGELOG.md
  echo
  printf '## %s — %s\n' "$nouvelle" "$jour"
  printf -- '- %s\n' "$@"
  echo
  tail -n +3 CHANGELOG.md
} > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
git add version.json CHANGELOG.md
git commit -q -m "Publier la version $nouvelle"
git push -q -u origin main

echo "$actuelle → $nouvelle poussée. Les appareils ouverts se rechargeront d'ici cinq minutes."
