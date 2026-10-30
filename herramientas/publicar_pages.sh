#!/usr/bin/env bash
# Publica web/ en la rama gh-pages (GitHub Pages).
# En claude.ai la página se envuelve en un documento completo al publicarse; en GitHub Pages se sirve tal cual,
# así que aquí se añade el esqueleto (doctype, charset y viewport para móvil).
#   uso: herramientas/publicar_pages.sh   (desde la raíz del repositorio)
set -euo pipefail
raiz=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
git -C "$raiz" worktree add -f "$tmp" gh-pages >/dev/null
find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$raiz"/web/. "$tmp"/
{
  printf '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  cat "$raiz/web/index.html"
  printf '\n</html>\n'
} > "$tmp/index.html"
touch "$tmp/.nojekyll"
git -C "$tmp" add -A
git -C "$tmp" commit -qm "Publicar web/ en GitHub Pages ($(git -C "$raiz" rev-parse --short HEAD))" || echo "sin cambios"
git -C "$tmp" push origin gh-pages
git -C "$raiz" worktree remove --force "$tmp"
