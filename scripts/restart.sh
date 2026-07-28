#!/usr/bin/env bash
exec "$(dirname "$0")/dev.sh" restart "${1:-all}"
