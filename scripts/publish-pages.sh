#!/usr/bin/env bash
# Build the frontend against a backend URL and publish it to the gh-pages branch.
# Usage: scripts/publish-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
TMP="$(mktemp -d)"
cp -R dist/. "$TMP/" && touch "$TMP/.nojekyll"
REMOTE="$(git remote get-url origin)"
( cd "$TMP" && git init -q -b gh-pages && git add -A && git commit -qm "Deploy dist" && git remote add origin "$REMOTE" && git push -q -f origin gh-pages )
echo "Published. Live in about a minute: https://rishi-creator-11.github.io/voice-agent-quality-lab/"
