#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
exec ./restart.sh stop
