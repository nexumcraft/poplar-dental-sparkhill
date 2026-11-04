#!/usr/bin/env bash
# Builds the site and pushes the finished files to the gh-pages branch, which GitHub Pages serves.
set -e
cd "$(dirname "$0")"
node build.mjs
remote=$(git remote get-url origin)
out=$(mktemp -d)
cp -r site/. "$out"
touch "$out/.nojekyll"
cd "$out"
git init -q -b gh-pages
git add -A
git -c core.autocrlf=false commit -q -m "Publish site"
git push -q -f "$remote" gh-pages
rm -rf "$out"
