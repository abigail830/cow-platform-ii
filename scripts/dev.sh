#!/usr/bin/env bash
# Agent platform dev orchestration: start / stop / restart / status
#
# Usage:
#   ./scripts/dev.sh start [all|backend|frontend]
#   ./scripts/dev.sh stop  [all|backend|frontend]
#   ./scripts/dev.sh restart [all|backend|frontend]
#   ./scripts/dev.sh status
#   ./scripts/dev.sh logs [backend|frontend]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/dev-common.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [target]

Commands:
  start    Start backend and/or frontend (default: all)
  stop     Stop backend and/or frontend (default: all)
  restart  Restart backend and/or frontend (default: all)
  status   Show running state and URLs
  logs     Tail log file (default: backend)

Targets: all | backend | frontend

Environment:
  BACKEND_PORT   default 8787
  FRONTEND_PORT  default 5180

Examples:
  $(basename "$0") start
  $(basename "$0") stop backend
  $(basename "$0") logs frontend
EOF
}

start_backend() {
  ensure_run_dir
  use_node_22

  if is_running "$BACKEND_PID_FILE" "$BACKEND_PORT"; then
    echo "Backend already running on port $BACKEND_PORT"
    return 0
  fi

  migrate_backend_db
  ensure_openkms_cli
  ensure_evaluate_cli

  echo "Starting backend on :$BACKEND_PORT ..."
  (
    cd "$BACKEND_DIR"
    load_nvm && [[ -f .nvmrc ]] && nvm use >/dev/null
    exec npm run dev
  ) >>"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"
  wait_for_url "http://127.0.0.1:$BACKEND_PORT/health" "Backend" 60 '"ok":true' || true
  record_listener_pid "$BACKEND_PORT" "$BACKEND_PID_FILE"
}

start_frontend() {
  ensure_run_dir

  if is_running "$FRONTEND_PID_FILE" "$FRONTEND_PORT"; then
    echo "Frontend already running on port $FRONTEND_PORT"
    return 0
  fi

  echo "Starting frontend on :$FRONTEND_PORT ..."
  (
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
  ) >>"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
  wait_for_url "http://127.0.0.1:$FRONTEND_PORT" "Frontend" 30 || true
  record_listener_pid "$FRONTEND_PORT" "$FRONTEND_PID_FILE"
}

cmd_start() {
  local target=${1:-all}
  case "$target" in
    all)
      start_backend
      start_frontend
      ;;
    backend) start_backend ;;
    frontend) start_frontend ;;
    *) echo "Unknown target: $target" >&2; usage; exit 1 ;;
  esac
}

cmd_stop() {
  local target=${1:-all}
  case "$target" in
    all)
      stop_service "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_PORT"
      stop_service "backend" "$BACKEND_PID_FILE" "$BACKEND_PORT"
      ;;
    backend) stop_service "backend" "$BACKEND_PID_FILE" "$BACKEND_PORT" ;;
    frontend) stop_service "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_PORT" ;;
    *) echo "Unknown target: $target" >&2; usage; exit 1 ;;
  esac
}

cmd_restart() {
  local target=${1:-all}
  cmd_stop "$target"
  sleep 1
  cmd_start "$target"
}

cmd_status() {
  ensure_run_dir
  echo "Agent platform status"
  echo "  run dir: $RUN_DIR"
  echo

  if is_running "$BACKEND_PID_FILE" "$BACKEND_PORT"; then
    local pid="?"
    [[ -f "$BACKEND_PID_FILE" ]] && pid="$(cat "$BACKEND_PID_FILE")"
    echo "  backend  RUNNING  pid=$pid  http://127.0.0.1:$BACKEND_PORT"
  else
    echo "  backend  stopped"
  fi

  if is_running "$FRONTEND_PID_FILE" "$FRONTEND_PORT"; then
    local pid="?"
    [[ -f "$FRONTEND_PID_FILE" ]] && pid="$(cat "$FRONTEND_PID_FILE")"
    echo "  frontend RUNNING  pid=$pid  http://127.0.0.1:$FRONTEND_PORT"
  else
    echo "  frontend stopped"
  fi

  echo
  echo "Logs:"
  echo "  backend:  $BACKEND_LOG"
  echo "  frontend: $FRONTEND_LOG"
}

cmd_logs() {
  local target=${1:-backend}
  ensure_run_dir
  case "$target" in
    backend) tail -n 80 -f "$BACKEND_LOG" ;;
    frontend) tail -n 80 -f "$FRONTEND_LOG" ;;
    *) echo "Unknown target: $target" >&2; exit 1 ;;
  esac
}

main() {
  local cmd=${1:-}
  shift || true

  case "$cmd" in
    start) cmd_start "${1:-all}" ;;
    stop) cmd_stop "${1:-all}" ;;
    restart) cmd_restart "${1:-all}" ;;
    status) cmd_status ;;
    logs) cmd_logs "${1:-backend}" ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown command: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
