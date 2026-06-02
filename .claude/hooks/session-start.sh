#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions; local dev manages its
# own dependencies.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Install dependencies so tests, typecheck, and build work out of the box.
# `npm install` (not `npm ci`) plays nicely with the cached container state and
# is idempotent.
npm install
