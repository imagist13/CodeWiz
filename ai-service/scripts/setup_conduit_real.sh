#!/usr/bin/env bash
# 真 Conduit fixture: clone + npm install + 设 fork remote (v3 §E Task 19).
#
# 必填 env: CONDUIT_FORK_URL (team fork, 没设时 fallback 到官方 upstream 只读)
# 默认 clone 到 ai-service/external/conduit_real/ (gitignored)
#
# 用法:
#   export CONDUIT_FORK_URL=https://github.com/<team>/conduit-realworld-example-app.git
#   bash ai-service/scripts/setup_conduit_real.sh
#
# 后续 ExploreEditAgent / PrCreator 都在 external/conduit_real/ 工作:
#   - 沙箱里跑 npm test / npm run build -w frontend
#   - PrCreator git push origin → 团队 fork

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${HERE}/external/conduit_real"

FORK_URL="${CONDUIT_FORK_URL:-}"
UPSTREAM_URL="https://github.com/TonyMckes/conduit-realworld-example-app.git"

if [ -z "${FORK_URL}" ]; then
    echo "[setup] WARN: CONDUIT_FORK_URL not set — falling back to upstream (read-only)"
    echo "[setup]       set CONDUIT_FORK_URL=<your-team-fork> to enable PR pushes"
    FORK_URL="${UPSTREAM_URL}"
fi

mkdir -p "${HERE}/external"

if [ -d "${TARGET}/.git" ]; then
    echo "[setup] resetting conduit_real to clean state"
    git -C "${TARGET}" reset --hard HEAD
    git -C "${TARGET}" clean -fdx -e node_modules
    # 确保 origin 指向 fork
    git -C "${TARGET}" remote set-url origin "${FORK_URL}"
else
    echo "[setup] cloning Conduit from ${FORK_URL}"
    rm -rf "${TARGET}"
    git clone --depth=1 "${FORK_URL}" "${TARGET}"
fi

# upstream 用于将来 rebase (不强制)
if ! git -C "${TARGET}" remote | grep -q upstream; then
    git -C "${TARGET}" remote add upstream "${UPSTREAM_URL}" || true
fi

# root + workspaces 一次 install (Conduit root 无 build/lint, 只有 test + 嵌套 dev)
if [ ! -d "${TARGET}/node_modules" ]; then
    echo "[setup] npm install (root + workspaces, may take a few minutes)"
    (cd "${TARGET}" && npm install --no-audit --no-fund)
fi

echo "[setup] done: ${TARGET}"
echo "[setup] origin   = $(git -C "${TARGET}" remote get-url origin)"
echo "[setup] upstream = $(git -C "${TARGET}" remote get-url upstream 2>/dev/null || echo '(none)')"
echo
echo "Next: export CODEWIZ_HEAD_REPO=<team>/conduit-realworld-example-app"
echo "      then run smoke / integration tests"
