#!/usr/bin/env bash
# Publishes ebd.html to the ebd.iel.pt site (GitHub repo patr0cini/iel-ebd,
# served by GitHub Pages). ebd.html in this repo is the only source: run this
# after every change to it (and after `git push` here).
#
#   scripts/publish-ebd.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone -q https://github.com/patr0cini/iel-ebd.git "$WORK/site"
cd "$WORK/site"
git checkout -q -B main

cp "$ROOT/ebd.html" index.html
echo "ebd.iel.pt" > CNAME
touch .nojekyll   # serve the files as they are

git add index.html CNAME .nojekyll
if git diff --cached --quiet; then
  echo "ebd.iel.pt já está atualizado."
  exit 0
fi
git commit -q -m "Atualiza a página da EBD ($(git -C "$ROOT" rev-parse --short HEAD))"
git push -q -u origin main
echo "Publicado. ebd.iel.pt atualiza em 1–2 minutos."
