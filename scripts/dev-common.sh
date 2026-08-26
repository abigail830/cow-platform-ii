#!/usr/bin/env bash
# Shared helpers for agent-platform dev scripts.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/agent-backend"
FRONTEND_DIR="$ROOT_DIR/agent-frontend"
OPENKMS_CLI_DIR="$ROOT_DIR/openkms-cli"
EVALUATE_CLI_DIR="$ROOT_DIR/evaluate-cli"
RUN_DIR="$ROOT_DIR/.run/agent-platform"

BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-5180}"

BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$NVM_DIR/nvm.sh"
    return 0
  fi
  return 1
}

use_node_22() {
  if load_nvm && [[ -f "$BACKEND_DIR/.nvmrc" ]]; then
    (cd "$BACKEND_DIR" && nvm use >/dev/null)
    return 0
  fi
  local major
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [[ "$major" -lt 22 ]]; then
    echo "Error: Node.js >= 22.18 required (24 recommended). Install nvm and run: cd agent-backend && nvm use" >&2
    return 1
  fi
}

ensure_run_dir() {
  mkdir -p "$RUN_DIR"
}

is_running() {
  local pid_file=$1
  local port=${2:-}
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if [[ -n "$port" ]] && port_in_use "$port"; then
    return 0
  fi
  return 1
}

record_listener_pid() {
  local port=$1
  local pid_file=$2
  local pid
  pid="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    echo "$pid" >"$pid_file"
  fi
}

port_in_use() {
  local port=$1
  lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1
}

kill_port() {
  local port=$1
  local pids
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0
  echo "$pids" | xargs kill -TERM 2>/dev/null || true
  sleep 1
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0
  echo "$pids" | xargs kill -KILL 2>/dev/null || true
}

stop_service() {
  local name=$1
  local pid_file=$2
  local port=$3

  if is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    echo "Stopping $name (pid $pid)..."
  pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    echo "$name stopped."
    return 0
  fi

  if port_in_use "$port"; then
    echo "Stopping $name on port $port..."
    kill_port "$port"
    rm -f "$pid_file"
    echo "$name stopped."
    return 0
  fi

  rm -f "$pid_file"
  echo "$name is not running."
}

wait_for_url() {
  local url=$1
  local label=$2
  local tries=${3:-30}
  local body_pattern=${4:-}
  local i
  for ((i = 1; i <= tries; i++)); do
    local body
    body=$(curl -fsS "$url" 2>/dev/null) || { sleep 1; continue; }
    if [[ -n "$body_pattern" ]] && ! echo "$body" | grep -q "$body_pattern"; then
      sleep 1
      continue
    fi
    echo "$label ready: $url"
    return 0
  done
  echo "Warning: $label did not become ready in ${tries}s (check logs)" >&2
  return 1
}

migrate_backend_db() {
  use_node_22
  echo "Applying database migrations..."
  (
    cd "$BACKEND_DIR"
    load_nvm && [[ -f .nvmrc ]] && nvm use >/dev/null
    npm run db:migrate
  )
}

ensure_openkms_cli() {
  local python_bin="$OPENKMS_CLI_DIR/.venv/bin/python"
  if [[ ! -x "$python_bin" ]]; then
    echo "Warning: openkms-cli venv missing ($OPENKMS_CLI_DIR/.venv). Pipeline runs will fail." >&2
    return 0
  fi

  local need_install=0
  if ! "$python_bin" -c "import importlib.util; import sys; sys.exit(0 if importlib.util.find_spec('boto3') and importlib.util.find_spec('baidubce') and importlib.util.find_spec('pydantic_ai') else 1)" >/dev/null 2>&1; then
    need_install=1
  fi
  if ! "$python_bin" -c "import importlib.util; import sys; sys.exit(0 if importlib.util.find_spec('alibabacloud_docmind_api20220711') else 1)" >/dev/null 2>&1; then
    need_install=1
  fi
  if [[ "$need_install" -eq 0 ]]; then
    return 0
  fi

  if ! command -v uv >/dev/null 2>&1; then
    echo "Warning: openkms-cli extras missing and uv not installed. Run: cd openkms-cli && uv pip install -e \".[pipeline,baidu,metadata,aliyun]\" --python .venv/bin/python" >&2
    return 0
  fi
  echo "Installing openkms-cli[pipeline,baidu,metadata,aliyun]..."
  (
    cd "$OPENKMS_CLI_DIR"
    uv pip install -e ".[pipeline,baidu,metadata,aliyun]" --python .venv/bin/python
  )
}

ensure_evaluate_cli() {
  local python_bin="$EVALUATE_CLI_DIR/.venv/bin/python"
  if [[ ! -x "$python_bin" ]]; then
    echo "Warning: evaluate-cli venv missing ($EVALUATE_CLI_DIR/.venv). Eval runs will fail." >&2
    return 0
  fi

  if "$python_bin" -c "import importlib.util; import sys; sys.exit(0 if importlib.util.find_spec('openkms_cli') else 1)" >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v uv >/dev/null 2>&1; then
    echo "Warning: evaluate-cli deps missing and uv not installed. Run: cd evaluate-cli && uv sync --extra dev" >&2
    return 0
  fi
  echo "Installing evaluate-cli (dev extras)..."
  (
    cd "$EVALUATE_CLI_DIR"
    uv sync --extra dev
  )
}
