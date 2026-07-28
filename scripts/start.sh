#!/usr/bin/env bash
exec "$(dirname "$0")/dev.sh" start "${1:-all}"
