#!/usr/bin/env bash
exec "$(dirname "$0")/dev.sh" stop "${1:-all}"
