#!/usr/bin/env bash
# drift-check.sh — compares committed config against live railway config
# usage: drift-check.sh <committed-config> <live-config>
# outputs drift summary to stdout; empty output = no drift

set -euo pipefail

COMMITTED="${1:?Usage: drift-check.sh <committed-config> <live-config>}"
LIVE="${2:?Usage: drift-check.sh <committed-config> <live-config>}"

if [ ! -f "$COMMITTED" ]; then
  echo "ERROR: committed config not found: $COMMITTED"
  exit 1
fi

if [ ! -f "$LIVE" ]; then
  echo "ERROR: live config not found: $LIVE"
  exit 1
fi

# normalize both configs (sort keys, strip volatile fields)
normalize() {
  # remove volatile fields that change on every deploy
  jq 'del(.id, .created_at, .updated_at, .active_deployment, .last_deployment_active_at)' "$1" | jq -S '.'
}

NORM_COMMITTED=$(normalize "$COMMITTED")
NORM_LIVE=$(normalize "$LIVE")

# compare
DIFF=$(diff <(echo "$NORM_COMMITTED") <(echo "$NORM_LIVE") || true)

if [ -z "$DIFF" ]; then
  # no drift — output nothing
  exit 0
fi

echo "### Drift Summary"
echo ""
echo "Committed config: \`$COMMITTED\`"
echo "Live config: exported via \`railway status --json\`"
echo ""
echo "\`\`\`diff"
echo "$DIFF"
echo "\`\`\`"
echo ""
echo "### Recommended Actions"
echo ""
echo "1. If committed config is correct: \`railway up\` to apply"
echo "2. If live config is correct: update \`railway.json\` to match and commit"
echo "3. If intentional console change: document in runbook §10.4"
