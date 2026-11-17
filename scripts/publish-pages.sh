#!/usr/bin/env bash
# Build the frontend against a backend URL and publish it to the gh-pages branch.
# Usage: scripts/publish-pages.sh https://<service>.onrender.com
set -euo pipefail
API_URL="${1:-}"
[ -n "$API_URL" ] || { echo "usage: $0 <api-base-url>" >&2; exit 2; }
cd "$(dirname "$0")/.."
VITE_API_URL="$API_URL" npm run build
TMP="$(mktemp -d)"
cp -R dist/. "$TMP/" && touch "$TMP/.nojekyll"
REMOTE="$(git remote get-url origin)"
( cd "$TMP" && git init -q -b gh-pages && git add -A && git commit -qm "Deploy dist (API: $API_URL)" && git remote add origin "$REMOTE" && git push -q -f origin gh-pages )
echo "Published. Live in about a minute: https://rishi-creator-11.github.io/voice-agent-quality-lab/"
