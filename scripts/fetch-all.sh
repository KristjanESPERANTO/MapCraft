#!/usr/bin/env bash
set -euo pipefail
# Convenience wrapper to fetch all ADM0 (and optionally ADM1) boundaries
# Usage:
#   ./scripts/fetch-all.sh              # ADM0 only
#   ./scripts/fetch-all.sh ADM1         # ADM1 using iso3-adm0.txt list
ADM=${1:-ADM0}
node scripts/fetch-geo-all.js scripts/iso3-adm0.txt "$ADM"
