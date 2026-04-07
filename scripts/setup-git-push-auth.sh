#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN is required in environment"
  exit 1
fi

GITHUB_USER="${GITHUB_USER:-Samwelabuyeka}"

# Persist credentials so future pushes don't require re-entering PAT.
git config --global credential.helper store

cat <<CREDS > "${HOME}/.git-credentials"
https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com
CREDS

chmod 600 "${HOME}/.git-credentials"

echo "✅ GitHub credential store configured for ${GITHUB_USER}."
