#!/bin/bash
set -euo pipefail
if [ -z "${BUCKET:-}" ]; then
    echo "Error: BUCKET environment variable is not set."
    exit 1
fi

# Determine the absolute path to the data directory based on script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Optional profile: AWS_PROFILE=thirstcast bash upload_s3.sh (unset = default credential chain)
PROFILE_ARGS=()
if [ -n "${AWS_PROFILE:-}" ]; then PROFILE_ARGS=(--profile "$AWS_PROFILE"); fi

aws s3 sync "$PROJECT_ROOT/data/raw" "s3://$BUCKET/raw/" "${PROFILE_ARGS[@]}"
aws s3 sync "$PROJECT_ROOT/data/out/replay" "s3://$BUCKET/replay/" "${PROFILE_ARGS[@]}"
aws s3 cp "$PROJECT_ROOT/frontend/data/pilot_districts.geojson" "s3://$BUCKET/geo/pilot_districts.geojson" "${PROFILE_ARGS[@]}"
