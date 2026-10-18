#!/usr/bin/env bash
# ==============================================================================
# TeamGuard Point-in-Time Database Restore Script (TASK-601)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DUMP_FILE="${1:-}"

echo "[TeamGuard Restore] Starting database restore procedure..."
node "${SCRIPT_DIR}/restore-backup.js" ${DUMP_FILE:+"$DUMP_FILE"}
echo "[TeamGuard Restore] Complete."
