#!/usr/bin/env bash
# Builds the site into docs/, which GitHub Pages serves from the main branch, and pushes it.
set -e
cd "$(dirname "$0")"
node build.mjs
rm -rf docs
cp -r site docs
touch docs/.nojekyll
git add -A
git commit -q -m "Publish site" || true
git push -q origin main
