#!/usr/bin/env bash
exec "$(dirname "$0")/dev.sh" logs "${1:-backend}"
