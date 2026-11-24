#!/usr/bin/env bash
# Rebuild the themed stylesheets from the pre-theme originals.
# Usage (from the jyotish folder): bash design-reference/theme_rebuild.sh
set -euo pipefail
cd "$(dirname "$0")/.."
B=design-reference/pre-theme-backup
S=server/static
cp "$B/experience.css" "$B/account.css" "$B/reports.css" "$B/index.html" "$S/"
.venv/Scripts/python design-reference/theme_convert.py "$S"
.venv/Scripts/python design-reference/theme_wire.py "$S/index.html"
