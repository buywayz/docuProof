#!/usr/bin/env bash
set -euo pipefail

# Patterns (extended POSIX grep syntax)
PATTERN='(AIza[0-9A-Za-z_\-]{10,})|(AKIA[0-9A-Z]{16})|(^|[^A-Za-z0-9])(sk_(live|test)_[A-Za-z0-9]{24,})|(^|[^A-Za-z0-9])(rk_(live|test)_[A-Za-z0-9]{24,})|(^|[^A-Za-z0-9])(pk_(live|test)_[A-Za-z0-9]{24,})|([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})|(NETLIFY_[A-Z_]*[[:space:]]*=[[:space:]]*["'\''][^"'\'']{8,}["'\''])|(POSTMARK_[A-Z_]*[[:space:]]*=[[:space:]]*["'\''][^"'\'']{8,}["'\''])|(BLOBS?_TOKEN|NETLIFY_API_TOKEN|NETLIFY_BLOBS_TOKEN)'

have_rg=0
command -v rg >/dev/null 2>&1 && have_rg=1

echo "== Working tree scan (HEAD) =="
if [ $have_rg -eq 1 ]; then
  # ripgrep path (fast)
  rg --line-number --hidden --glob '!.git' --ignore-case -e "$PATTERN" || true
else
  # portable grep path (BSD grep on macOS)
  # -R recursive, -I ignore binary, -n line numbers, --exclude-dir to skip .git
  grep -RInE --exclude-dir='.git' "$PATTERN" . || true
fi

echo
echo "== History scan (all reachable blobs) =="
# Iterate one blob at a time to avoid ARG_MAX issues
git rev-list --objects --all \
| awk '$1 ~ /^[0-9a-f]{40}$/ {print $1}' \
| while read -r oid; do
    # Print matching lines with file-ish header
    if git cat-file -p "$oid" | grep -En "($PATTERN)" >/dev/null 2>&1; then
      echo "----"
      echo "BLOB=$oid flagged"
      # Show first few matching lines (context-light)
      git cat-file -p "$oid" | grep -En "($PATTERN)" | head -n 5
    fi
  done
echo "== Scan complete =="
