#!/usr/bin/env bash
# Publie une nouvelle version : incrémente version.json, commit, push.
#
# version.json est la seule source de vérité du numéro — l'app le relit toutes
# les cinq minutes et se recharge quand il a changé. Rien à modifier ailleurs.
#
#   ./scripts/release.sh              → 1.0.0 devient 1.0.1
#   ./scripts/release.sh mineure      → 1.0.3 devient 1.1.0
#   ./scripts/release.sh majeure      → 1.4.2 devient 2.0.0
#   ./scripts/release.sh 2.1.0        → exactement 2.1.0

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f version.json ] || { echo "version.json est introuvable." >&2; exit 1; }

actuelle=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json)
[ -n "$actuelle" ] || { echo "Aucun numéro lisible dans version.json." >&2; exit 1; }

IFS=. read -r majeur mineur patch <<< "$actuelle"
case "${1:-patch}" in
  majeure|major)  nouvelle="$((majeur + 1)).0.0" ;;
  mineure|minor)  nouvelle="$majeur.$((mineur + 1)).0" ;;
  patch|'')       nouvelle="$majeur.$mineur.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) nouvelle="$1" ;;
  *) echo "Usage : $0 [patch|mineure|majeure|X.Y.Z]" >&2; exit 1 ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Des modifications ne sont pas commitées. Commit-les d'abord." >&2
  exit 1
fi

printf '{\n  "version": "%s",\n  "date": "%s"\n}\n' "$nouvelle" "$(date +%F)" > version.json
git add version.json
git commit -q -m "Publier la version $nouvelle"
git push -q -u origin main

echo "$actuelle → $nouvelle poussée. Les appareils ouverts se rechargeront d'ici cinq minutes."
