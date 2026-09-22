#!/usr/bin/env bash
set -euo pipefail
# Récupère les valeurs partagées depuis la source de vérité canonique.
# Ne jamais éditer design-tokens.json ni css/mobile.css à la main :
# les modifier dans supershivas/design-system, puis relancer ce script.
BASE="https://raw.githubusercontent.com/supershivas/design-system/main"
curl -fsSL "$BASE/design-tokens.json" -o design-tokens.json
curl -fsSL "$BASE/mobile.css"         -o css/mobile.css
echo "design-tokens.json et css/mobile.css mis à jour depuis supershivas/design-system"
