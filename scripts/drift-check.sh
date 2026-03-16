#!/usr/bin/env bash
# drift-check.sh — compares committed app spec against live DO spec
# usage: drift-check.sh <committed-spec> <live-spec>
# outputs drift summary to stdout; empty output = no drift

set -euo pipefail

COMMITTED="${1:?Usage: drift-check.sh <committed-spec> <live-spec>}"
LIVE="${2:?Usage: drift-check.sh <committed-spec> <live-spec>}"

if [ ! -f "$COMMITTED" ]; then
  echo "ERROR: committed spec not found: $COMMITTED"
  exit 1
fi

if [ ! -f "$LIVE" ]; then
  echo "ERROR: live spec not found: $LIVE"
  exit 1
fi

# normalize both specs (sort keys, strip timestamps/ids)
normalize() {
  # remove volatile fields that change on every deploy
  yq 'del(.id, .created_at, .updated_at, .active_deployment, .last_deployment_active_at, .default_ingress, .live_url, .live_domain, .pending_deployment)' "$1" | yq 'sort_keys(..)'
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
echo "Committed spec: \`$COMMITTED\`"
echo "Live spec: exported via \`doctl apps spec get\`"
echo ""
echo "\`\`\`diff"
echo "$DIFF"
echo "\`\`\`"
echo ""
echo "### Recommended Actions"
echo ""
echo "1. If committed spec is correct: \`doctl apps update \$APP_ID --spec .do/app.yaml\`"
echo "2. If live config is correct: update \`.do/app.yaml\` to match and commit"
echo "3. If intentional console change: document in runbook §10.4"
