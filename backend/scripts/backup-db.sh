#!/usr/bin/env bash
# ==============================================================================
# TeamGuard Point-in-Time Database Backup Script (TASK-601)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[TeamGuard Backup] Starting point-in-time snapshot dump..."
node "${SCRIPT_DIR}/backup-db.js"
echo "[TeamGuard Backup] Complete."
